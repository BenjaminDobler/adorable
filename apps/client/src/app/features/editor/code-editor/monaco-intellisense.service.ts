import { Injectable, inject, effect, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FileSystemStore } from '../../../core/services/file-system.store';
import { ContainerEngine } from '../../../core/services/container-engine';
import { FileTree } from '@adorable/shared-types';

declare const monaco: any;

// Node.js script that runs inside the container to collect .d.ts files
// AND package.json files for each dependency.
// Returns JSON: { files: { path: content }, entries: { packageName: entryDtsPath } }
const COLLECT_TYPES_SCRIPT = `
const fs = require('fs');
const path = require('path');

const packages = [
  '@angular/core', '@angular/common', '@angular/common/http',
  '@angular/router', '@angular/forms', '@angular/animations',
  '@angular/platform-browser',
  'rxjs', 'rxjs/operators',
  'tslib'
];

const files = {};
const entries = {};
const visited = new Set();

function resolveTypesEntry(pkgName) {
  try {
    const pkgJsonPath = require.resolve(pkgName + '/package.json');
    const pkgDir = path.dirname(pkgJsonPath);
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));

    // Also collect the package.json itself
    const nmIdx = pkgJsonPath.indexOf('node_modules/');
    if (nmIdx >= 0) {
      files[pkgJsonPath.substring(nmIdx)] = JSON.stringify(pkgJson);
    }

    const typesField = pkgJson.typings || pkgJson.types;
    if (typesField) {
      return path.resolve(pkgDir, typesField);
    }
    const indexDts = path.join(pkgDir, 'index.d.ts');
    if (fs.existsSync(indexDts)) return indexDts;
    return null;
  } catch { return null; }
}

function collectFile(filePath) {
  const resolved = filePath.endsWith('.d.ts') ? filePath
    : fs.existsSync(filePath + '.d.ts') ? filePath + '.d.ts'
    : fs.existsSync(filePath + '/index.d.ts') ? filePath + '/index.d.ts'
    : null;
  if (!resolved || visited.has(resolved)) return;
  visited.add(resolved);

  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    const nmIdx = resolved.indexOf('node_modules/');
    const key = nmIdx >= 0 ? resolved.substring(nmIdx) : resolved;
    files[key] = content;

    // Follow local imports/exports: from './foo' or from '../foo'
    const importRegex = /from\\s+['"](\\.[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = path.resolve(path.dirname(resolved), match[1]);
      collectFile(importPath);
    }
  } catch {}
}

for (const pkg of packages) {
  const entry = resolveTypesEntry(pkg);
  if (entry) {
    collectFile(entry);
    const nmIdx = entry.indexOf('node_modules/');
    if (nmIdx >= 0) {
      entries[pkg] = entry.substring(nmIdx);
    }
  }
}

process.stdout.write(JSON.stringify({ files, entries }));
`;

@Injectable({
  providedIn: 'root',
})
export class MonacoIntelliSenseService {
  private fileStore = inject(FileSystemStore);
  private containerEngine = inject(ContainerEngine);
  private monacoReady = signal(false);
  private knownPaths = new Set<string>();
  private typesLoaded = false;
  private typesLoading = false;

  constructor() {
    // Sync project files to Monaco models
    effect(() => {
      if (!this.monacoReady()) return;
      const files = this.fileStore.files();
      this.syncFiles(files);
    });

    // Load type definitions when container is ready
    effect(() => {
      if (!this.monacoReady()) return;
      const url = this.containerEngine.url();
      if (!url) {
        this.typesLoaded = false;
        this.typesLoading = false;
        return;
      }
      if (!this.typesLoaded && !this.typesLoading) {
        this.loadTypeDefinitions();
      }
    });
  }

  init() {
    this.monacoReady.set(true);
  }

  private async loadTypeDefinitions() {
    this.typesLoading = true;
    console.log('[IntelliSense] Loading type definitions from container...');

    try {
      const res = await this.containerEngine.exec(
        'node', ['-e', COLLECT_TYPES_SCRIPT]
      );
      const output = await firstValueFrom(res.stream);
      const exitCode = await res.exit;

      if (exitCode !== 0) {
        console.warn('[IntelliSense] Type collection script failed (exit code ' + exitCode + '):', output);
        this.typesLoading = false;
        return;
      }

      // The output might contain warnings before the JSON — find the JSON
      const jsonStart = output.indexOf('{');
      if (jsonStart === -1) {
        console.warn('[IntelliSense] No JSON in type collection output:', output.substring(0, 500));
        this.typesLoading = false;
        return;
      }

      const data: { files: Record<string, string>; entries: Record<string, string> } =
        JSON.parse(output.substring(jsonStart));
      const tsDefaults = monaco.languages.typescript.typescriptDefaults;

      // Register all collected .d.ts and package.json files as extra libs
      let count = 0;
      for (const [filePath, content] of Object.entries(data.files)) {
        tsDefaults.addExtraLib(content, `file:///${filePath}`);
        count++;
      }

      // Build paths mapping so TypeScript can resolve bare module specifiers
      // directly to the correct .d.ts entry files
      const paths: Record<string, string[]> = {};
      for (const [pkgName, entryPath] of Object.entries(data.entries)) {
        paths[pkgName] = [entryPath];
        // Also add wildcard for deep imports like '@angular/common/http'
        if (!pkgName.includes('/') || pkgName.startsWith('@')) {
          paths[pkgName + '/*'] = [entryPath.replace(/\/[^/]+$/, '') + '/*'];
        }
      }

      // Re-apply compiler options with the paths mapping
      tsDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        baseUrl: 'file:///',
        allowNonTsExtensions: true,
        allowJs: true,
        strict: false,
        jsx: monaco.languages.typescript.JsxEmit.React,
        experimentalDecorators: true,
        noEmit: true,
        paths
      });

      this.typesLoaded = true;
      this.typesLoading = false;
      console.log(`[IntelliSense] Loaded ${count} type definition files, ${Object.keys(paths).length} path mappings`);
    } catch (err) {
      console.warn('[IntelliSense] Failed to load type definitions:', err);
      this.typesLoading = false;
    }
  }

  private syncFiles(fileTree: FileTree) {
    if (!monaco?.editor) return;

    const flatFiles = new Map<string, string>();
    this.flattenTree(fileTree, '', flatFiles);

    const currentPaths = new Set<string>();

    for (const [path, content] of flatFiles) {
      if (!this.isRelevantFile(path)) continue;

      currentPaths.add(path);
      const uri = monaco.Uri.parse('file:///' + path);
      const existingModel = monaco.editor.getModel(uri);

      if (existingModel) {
        if (existingModel.getValue() !== content) {
          existingModel.setValue(content);
        }
      } else {
        const language = this.getLanguage(path);
        monaco.editor.createModel(content, language, uri);
      }
    }

    for (const path of this.knownPaths) {
      if (!currentPaths.has(path)) {
        const uri = monaco.Uri.parse('file:///' + path);
        const model = monaco.editor.getModel(uri);
        if (model) {
          model.dispose();
        }
      }
    }

    this.knownPaths = currentPaths;
    console.log(`[IntelliSense] Synced ${currentPaths.size} files to Monaco TS worker`);
  }

  private flattenTree(
    tree: FileTree,
    prefix: string,
    result: Map<string, string>
  ) {
    for (const [name, node] of Object.entries(tree)) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (node.file) {
        if (node.file.encoding !== 'base64') {
          result.set(path, node.file.contents);
        }
      }
      if (node.directory) {
        this.flattenTree(node.directory, path, result);
      }
    }
  }

  private isRelevantFile(path: string): boolean {
    return /\.(ts|js|tsx|jsx|json)$/.test(path);
  }

  private getLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'json':
        return 'json';
      default:
        return 'plaintext';
    }
  }
}
