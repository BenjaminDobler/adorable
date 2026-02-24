import { Component, signal, computed, inject, input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../services/api';
import { ToastService } from '../../../services/toast';

@Component({
  selector: 'app-adorable-file-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './adorable-file-browser.component.html',
  styleUrl: './adorable-file-browser.component.scss'
})
export class AdorableFileBrowserComponent implements OnChanges {
  private apiService = inject(ApiService);
  private toastService = inject(ToastService);

  kitId = input<string | null>(null);
  hasDiscoveredComponents = input(false);

  adorableFiles = signal<{ path: string; size: number; modified: string }[]>([]);
  loadingAdorableFiles = signal(false);
  editingAdorableFile = signal<{ path: string; content: string } | null>(null);
  savingAdorableFile = signal(false);
  expandedAdorablePaths = signal<Set<string>>(new Set());

  adorableFileTree = computed(() => {
    const files = this.adorableFiles();
    const adorable = files.filter(f => f.path.startsWith('.adorable/'));

    const dirChildren = new Map<string, { dirs: Set<string>; files: { name: string; size: number; fullPath: string }[] }>();

    const ensureDir = (dirPath: string) => {
      if (!dirChildren.has(dirPath)) {
        dirChildren.set(dirPath, { dirs: new Set(), files: [] });
      }
    };

    for (const file of adorable) {
      const parts = file.path.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dirPath = parts.slice(0, i).join('/');
        ensureDir(dirPath);
        if (i > 1) {
          const parentDir = parts.slice(0, i - 1).join('/');
          ensureDir(parentDir);
          dirChildren.get(parentDir)!.dirs.add(dirPath);
        }
      }
      const parentDir = parts.slice(0, -1).join('/');
      ensureDir(parentDir);
      dirChildren.get(parentDir)!.files.push({
        name: parts[parts.length - 1],
        size: file.size,
        fullPath: file.path,
      });
    }

    type Entry = { path: string; name: string; isDirectory: boolean; depth: number; size: number; fullPath: string };
    const entries: Entry[] = [];

    const walk = (dirPath: string, depth: number) => {
      const children = dirChildren.get(dirPath);
      if (!children) return;

      const sortedDirs = [...children.dirs].sort((a, b) => a.split('/').pop()!.localeCompare(b.split('/').pop()!));
      const sortedFiles = [...children.files].sort((a, b) => a.name.localeCompare(b.name));

      for (const subDir of sortedDirs) {
        const name = subDir.split('/').pop()!;
        entries.push({ path: subDir, name, isDirectory: true, depth, size: 0, fullPath: subDir });
        walk(subDir, depth + 1);
      }
      for (const file of sortedFiles) {
        entries.push({ path: file.fullPath, name: file.name, isDirectory: false, depth, size: file.size, fullPath: file.fullPath });
      }
    };

    if (dirChildren.has('.adorable')) {
      entries.push({ path: '.adorable', name: '.adorable', isDirectory: true, depth: 0, size: 0, fullPath: '.adorable' });
      walk('.adorable', 1);
    }

    return entries;
  });

  visibleAdorableEntries = computed(() => {
    const all = this.adorableFileTree();
    const expanded = this.expandedAdorablePaths();
    const visible: typeof all = [];
    const collapsedPrefixes: string[] = [];

    for (const entry of all) {
      const hidden = collapsedPrefixes.some(p => entry.path.startsWith(p + '/'));
      if (hidden) continue;
      visible.push(entry);
      if (entry.isDirectory && !expanded.has(entry.path)) {
        collapsedPrefixes.push(entry.path);
      }
    }
    return visible;
  });

  adorableFileCount = computed(() => this.adorableFiles().filter(f => f.path.startsWith('.adorable/')).length);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['kitId'] && this.kitId()) {
      this.loadAdorableFiles();
    }
  }

  loadAdorableFiles() {
    const id = this.kitId();
    if (!id) return;
    this.loadingAdorableFiles.set(true);
    this.apiService.getKitFiles(id).subscribe({
      next: (result) => {
        this.adorableFiles.set(result.files || []);
        const expanded = new Set<string>();
        expanded.add('.adorable');
        this.expandedAdorablePaths.set(expanded);
        this.loadingAdorableFiles.set(false);
      },
      error: () => {
        this.loadingAdorableFiles.set(false);
      }
    });
  }

  toggleAdorableFolder(path: string) {
    const expanded = new Set(this.expandedAdorablePaths());
    if (expanded.has(path)) {
      expanded.delete(path);
    } else {
      expanded.add(path);
    }
    this.expandedAdorablePaths.set(expanded);
  }

  openAdorableFile(filePath: string) {
    const id = this.kitId();
    if (!id) return;
    this.apiService.getKitFile(id, filePath).subscribe({
      next: (result) => {
        this.editingAdorableFile.set({ path: result.path, content: result.content });
      },
      error: () => {
        this.toastService.show('Failed to load file', 'error');
      }
    });
  }

  closeAdorableFileEditor() {
    this.editingAdorableFile.set(null);
  }

  saveAdorableFile() {
    const file = this.editingAdorableFile();
    const id = this.kitId();
    if (!file || !id) return;
    this.savingAdorableFile.set(true);
    this.apiService.updateKitFile(id, file.path, file.content).subscribe({
      next: () => {
        this.savingAdorableFile.set(false);
        this.editingAdorableFile.set(null);
        this.toastService.show('File saved', 'success');
        this.loadAdorableFiles();
      },
      error: () => {
        this.savingAdorableFile.set(false);
        this.toastService.show('Failed to save file', 'error');
      }
    });
  }

  updateAdorableFileContent(content: string) {
    const file = this.editingAdorableFile();
    if (file) {
      this.editingAdorableFile.set({ ...file, content });
    }
  }

  deleteAdorableFile(filePath: string) {
    const id = this.kitId();
    if (!id) return;
    this.apiService.deleteKitFile(id, filePath).subscribe({
      next: () => {
        this.toastService.show('File deleted', 'success');
        this.loadAdorableFiles();
      },
      error: () => {
        this.toastService.show('Failed to delete file', 'error');
      }
    });
  }

  uploadAdorableFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const id = this.kitId();
    if (!input.files || !id) return;

    const filesToUpload: { path: string; content: string }[] = [];
    const fileArray = Array.from(input.files);
    let processed = 0;

    for (const file of fileArray) {
      const reader = new FileReader();
      reader.onload = () => {
        filesToUpload.push({
          path: `.adorable/${file.name}`,
          content: reader.result as string,
        });
        processed++;
        if (processed === fileArray.length) {
          this.apiService.uploadKitFiles(id, filesToUpload).subscribe({
            next: () => {
              this.toastService.show(`${filesToUpload.length} file(s) uploaded`, 'success');
              this.loadAdorableFiles();
            },
            error: () => {
              this.toastService.show('Failed to upload files', 'error');
            }
          });
        }
      };
      reader.readAsText(file);
    }

    input.value = '';
  }

  regenerateDocs() {
    const id = this.kitId();
    if (!id) return;
    this.apiService.regenerateKitDocs(id, false).subscribe({
      next: (result) => {
        this.toastService.show(`Regenerated ${result.fileCount} doc files`, 'success');
        this.loadAdorableFiles();
      },
      error: () => {
        this.toastService.show('Failed to regenerate docs', 'error');
      }
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
