import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api';
import { WebContainerService } from './web-container';
import { ToastService } from './toast';
import { Router } from '@angular/router';
import { BASE_FILES } from '../base-project';
import { RUNTIME_SCRIPTS } from '../runtime-scripts';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  files?: any;
  usage?: { inputTokens: number, outputTokens: number, totalTokens: number };
  status?: string;
  updatedFiles?: string[];
  isExpanded?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private apiService = inject(ApiService);
  private webContainerService = inject(WebContainerService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  // State
  projectId = signal<string | null>(null);
  projectName = signal<string>('');
  currentFiles = signal<any>(null);
  allFiles = signal<any>(null);
  messages = signal<ChatMessage[]>([
    { role: 'assistant', text: 'Hi! I can help you build an Angular app. Describe what you want to create.', timestamp: new Date() }
  ]);
  loading = signal(false);
  buildError = signal<string | null>(null);
  debugLogs = signal<any[]>([]);

  // Computed
  hasProject = computed(() => !!this.projectId() && this.projectId() !== 'new');

  async loadProject(id: string) {
    this.loading.set(true);
    this.apiService.loadProject(id).subscribe({
      next: async (project) => {
        this.projectId.set(project.id);
        this.projectName.set(project.name);
        this.currentFiles.set(project.files);
        
        if (project.messages) {
          this.messages.set(project.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          })));
        } else {
          this.messages.set([]); 
        }

        await this.reloadPreview(project.files);
      },
      error: (err) => {
        console.error(err);
        this.toastService.show('Failed to load project', 'error');
        this.router.navigate(['/dashboard']);
        this.loading.set(false);
      }
    });
  }

  saveProject(thumbnail?: string) {
    const name = this.projectName();
    const files = this.currentFiles();
    if (!name || !files) return;

    this.loading.set(true);
    const id = this.projectId();
    // Pass undefined if it's new/null so backend creates new
    const saveId = (id && id !== 'new') ? id : undefined;

    this.apiService.saveProject(name, files, this.messages(), saveId, thumbnail).subscribe({
      next: (project) => {
        this.toastService.show('Project saved successfully!', 'success');
        this.projectId.set(project.id);
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.toastService.show('Failed to save project', 'error');
        this.loading.set(false);
      }
    });
  }

  async publish() {
    const id = this.projectId();
    if (!id || id === 'new') {
      this.toastService.show('Please save the project first', 'info');
      return;
    }

    this.loading.set(true);
    this.addSystemMessage('Building and publishing your app...');

    try {
      // 1. Run build
      const exitCode = await this.webContainerService.runBuild(['--base-href', './']);
      if (exitCode !== 0) throw new Error('Build failed');

      // 2. Detect dist folder
      let distPath = 'dist';
      try {
         const foundPath = await this.findWebRoot('dist');
         if (foundPath) distPath = foundPath;
         else distPath = 'dist/app/browser';
      } catch (e) {
         distPath = 'dist/app/browser';
      }
      
      const files = await this.getFilesRecursively(distPath);

      // 3. Upload
      this.apiService.publish(id, files).subscribe({
        next: (res) => {
          this.addAssistantMessage(`Success! Your app is published at: ${res.url}`);
          window.open(res.url, '_blank');
          this.toastService.show('Site published successfully!', 'success');
          this.loading.set(false);
        },
        error: (err) => {
          throw err;
        }
      });

    } catch (err: any) {
      console.error(err);
      this.addSystemMessage(`Publishing error: ${err.message}`);
      this.toastService.show('Publishing failed', 'error');
      this.loading.set(false);
    }
  }

  async downloadZip() {
    const files = this.currentFiles();
    if (!files) return;
    
    this.loading.set(true);
    try {
      const zip = new JSZip();
      const fullProject = this.mergeFiles(BASE_FILES, files);
      
      const addFilesToZip = (fs: any, currentPath: string) => {
        for (const key in fs) {
          const node = fs[key];
          if (node.file) {
             zip.file(`${currentPath}${key}`, node.file.contents);
          } else if (node.directory) {
             addFilesToZip(node.directory, `${currentPath}${key}/`);
          }
        }
      };

      addFilesToZip(fullProject, '');
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${this.projectName() || 'adorable-app'}.zip`);
      this.toastService.show('Project exported', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      this.toastService.show('Failed to export project', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  async reloadPreview(files: any) {
    this.loading.set(true);
    try {
      await this.webContainerService.stopDevServer();
      await this.webContainerService.clean();

      this.currentFiles.set(files);
      const projectFiles = this.mergeFiles(BASE_FILES, files);
      this.allFiles.set(projectFiles);
      
      const { tree, binaries } = this.prepareFilesForMount(projectFiles);

      await this.webContainerService.mount(tree);
      
      for (const bin of binaries) {
        await this.webContainerService.writeFile(bin.path, bin.content);
      }
      
      const exitCode = await this.webContainerService.runInstall();
      
      if (exitCode === 0) {
        this.webContainerService.startDevServer();
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  async migrateProject() {
    const files = this.currentFiles();
    if (!files) return;
    
    this.loading.set(true);
    try {
      // 1. Ensure 'public' directory exists
      if (!files['public']) {
        this.updateFileInTree(files, 'public/.gitkeep', '', true);
      }

      // 2. Update angular.json
      if (files['angular.json']) {
        const content = files['angular.json'].file.contents;
        const config = JSON.parse(content);
        
        // Fix Assets
        const appArchitect = config.projects.app.architect;
        const buildOptions = appArchitect.build.options;
        
        // Ensure assets array has public
        const hasPublic = buildOptions.assets.some((a: any) => typeof a === 'object' && a.input === 'public');
        if (!hasPublic) {
           buildOptions.assets.push({ "glob": "**/*", "input": "public" });
        }

        // Fix Serve Options (Disable HMR)
        const serveOptions = appArchitect.serve.options;
        serveOptions.hmr = false;
        serveOptions.allowedHosts = ["all"];

        // Write back
        const newConfig = JSON.stringify(config, null, 2);
        this.updateFileInTree(files, 'angular.json', newConfig);
        
        // Update allFiles view state too
        const all = this.allFiles();
        if (all) {
           this.updateFileInTree(all, 'angular.json', newConfig);
        }
      }

      await this.reloadPreview(files);
      this.toastService.show('Project configuration updated', 'success');
    } catch (err) {
      console.error(err);
      this.toastService.show('Migration failed', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  // Helpers
  addSystemMessage(text: string) {
    this.messages.update(msgs => [...msgs, {
      role: 'system',
      text,
      timestamp: new Date()
    }]);
  }

  addAssistantMessage(text: string) {
    this.messages.update(msgs => [...msgs, {
      role: 'assistant',
      text,
      timestamp: new Date()
    }]);
  }

  updateFileInTree(tree: any, path: string, content: string, createIfMissing = false) {
    if (!tree) return;
    const parts = path.split('/');
    let current = tree;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        if (createIfMissing) {
          current[part] = { directory: {} };
        } else {
          return;
        }
      }
      if (!current[part].directory) {
         if (createIfMissing) current[part].directory = {};
         else return;
      }
      current = current[part].directory;
    }
    
    const fileName = parts[parts.length - 1];
    if (createIfMissing || current[fileName]) {
      current[fileName] = { file: { contents: content } };
    }
  }

  mergeFiles(base: any, generated: any): any {
    const result = { ...base };
    for (const key in generated) {
      if (generated[key].directory && result[key]?.directory) {
        result[key] = {
          directory: this.mergeFiles(result[key].directory, generated[key].directory)
        };
      } else {
        result[key] = generated[key];
      }
    }
    return result;
  }

  private prepareFilesForMount(files: any, prefix = ''): { tree: any, binaries: { path: string, content: Uint8Array }[] } {
    const tree: any = {};
    let binaries: { path: string, content: Uint8Array }[] = [];

    for (const key in files) {
      const fullPath = prefix + key;
      if (files[key].file) {
        let content = files[key].file.contents;
        const isDataUri = typeof content === 'string' && content.trim().startsWith('data:');
        
        if (isDataUri) {
           const binary = this.dataURIToUint8Array(content);
           binaries.push({ path: fullPath, content: binary });
        } else {
           if (key === 'index.html' && typeof content === 'string') {
              // Ensure we have the latest runtime scripts (modern-screenshot)
              if (!content.includes('modern-screenshot')) {
                 // Remove legacy html2canvas tag if present to avoid duplicate downloads/execution
                 content = content.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>', '');
                 
                 // Inject the full runtime scripts (which includes html2canvas + modern-screenshot)
                 content = content.replace('</head>', `${RUNTIME_SCRIPTS}\n</head>`);
              }
           }
           tree[key] = { file: { contents: content } };
        }
      } else if (files[key].directory) {
        const result = this.prepareFilesForMount(files[key].directory, fullPath + '/');
        tree[key] = { directory: result.tree };
        binaries = binaries.concat(result.binaries);
      }
    }
    return { tree, binaries };
  }

  dataURIToUint8Array(dataURI: string): Uint8Array {
    const byteString = atob(dataURI.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return ia;
  }

  private async findWebRoot(currentPath: string): Promise<string | null> {
    try {
      const entries = await this.webContainerService.readdir(currentPath, { withFileTypes: true }) as any[];
      if (entries.some(e => e.name === 'index.html')) return currentPath;
      
      const dirs = entries.filter(e => e.isDirectory());
      for (const dir of dirs) {
         const result = await this.findWebRoot(`${currentPath}/${dir.name}`);
         if (result) return result;
      }
    } catch (e) { }
    return null;
  }

  private async getFilesRecursively(dirPath: string): Promise<any> {
    const result = await this.webContainerService.readdir(dirPath, { withFileTypes: true });
    const entries = result as unknown as { name: string; isDirectory: () => boolean }[];
    const files: any = {};

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      if (entry.isDirectory()) {
        files[entry.name] = {
          directory: await this.getFilesRecursively(fullPath)
        };
      } else {
        const isBinary = /\.(png|jpg|jpeg|gif|svg|webp|ico|pdf|eot|ttf|woff|woff2)$/i.test(entry.name);
        if (isBinary) {
          const binary = await this.webContainerService.readBinaryFile(fullPath);
          files[entry.name] = {
            file: { 
              contents: this.uint8ArrayToBase64(binary),
              encoding: 'base64'
            }
          };
        } else {
          const contents = await this.webContainerService.readFile(fullPath);
          files[entry.name] = {
            file: { contents }
          };
        }
      }
    }
    return files;
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
