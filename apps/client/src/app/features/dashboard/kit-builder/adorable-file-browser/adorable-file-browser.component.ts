import { Component, signal, computed, inject, input, OnChanges, SimpleChanges, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../../core/services/api';
import { ToastService } from '../../../../core/services/toast';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

interface PendingFile {
  path: string;
  content: string;
  size: number;
}

interface TreeEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  depth: number;
  size: number;
  fullPath: string;
}

@Component({
  selector: 'app-adorable-file-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './adorable-file-browser.component.html',
  styleUrl: './adorable-file-browser.component.scss'
})
export class AdorableFileBrowserComponent implements OnChanges {
  private destroyRef = inject(DestroyRef);
  private apiService = inject(ApiService);
  private toastService = inject(ToastService);
  kitId = input<string | null>(null);
  hasDiscoveredComponents = input(false);

  adorableFiles = signal<{ path: string; size: number; modified: string }[]>([]);
  loadingAdorableFiles = signal(false);
  uploadingFiles = signal(false);
  editingAdorableFile = signal<{ path: string; content: string } | null>(null);
  savingAdorableFile = signal(false);
  expandedAdorablePaths = signal<Set<string>>(new Set());

  // Upload preview state
  pendingUploadFiles = signal<PendingFile[]>([]);
  selectedUploadPaths = signal<Set<string>>(new Set());
  expandedPreviewPaths = signal<Set<string>>(new Set());

  adorableFileTree = computed(() => {
    return this.buildTree(
      this.adorableFiles().filter(f => f.path.startsWith('.adorable/')).map(f => ({ path: f.path, size: f.size }))
    );
  });

  visibleAdorableEntries = computed(() => {
    return this.getVisibleEntries(this.adorableFileTree(), this.expandedAdorablePaths());
  });

  // Preview tree from pending upload files
  previewFileTree = computed(() => {
    const files = this.pendingUploadFiles();
    if (files.length === 0) return [];
    return this.buildTree(files.map(f => ({ path: f.path, size: f.size })));
  });

  visiblePreviewEntries = computed(() => {
    return this.getVisibleEntries(this.previewFileTree(), this.expandedPreviewPaths());
  });

  selectedUploadCount = computed(() => {
    const selected = this.selectedUploadPaths();
    return this.pendingUploadFiles().filter(f => selected.has(f.path)).length;
  });

  selectedUploadSize = computed(() => {
    const selected = this.selectedUploadPaths();
    return this.pendingUploadFiles()
      .filter(f => selected.has(f.path))
      .reduce((sum, f) => sum + f.size, 0);
  });

  adorableFileCount = computed(() => this.adorableFiles().filter(f => f.path.startsWith('.adorable/')).length);

  // Shared tree-building logic
  private buildTree(files: { path: string; size: number }[]): TreeEntry[] {
    const dirChildren = new Map<string, { dirs: Set<string>; files: { name: string; size: number; fullPath: string }[] }>();

    const ensureDir = (dirPath: string) => {
      if (!dirChildren.has(dirPath)) {
        dirChildren.set(dirPath, { dirs: new Set(), files: [] });
      }
    };

    for (const file of files) {
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

    const entries: TreeEntry[] = [];

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
  }

  private getVisibleEntries(all: TreeEntry[], expanded: Set<string>): TreeEntry[] {
    const visible: TreeEntry[] = [];
    let skipUntilDepth = Infinity;

    for (const entry of all) {
      if (entry.depth >= skipUntilDepth) continue;
      skipUntilDepth = Infinity;
      visible.push(entry);
      if (entry.isDirectory && !expanded.has(entry.path)) {
        skipUntilDepth = entry.depth + 1;
      }
    }
    return visible;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['kitId'] && this.kitId()) {
      this.loadAdorableFiles();
    }
  }

  loadAdorableFiles() {
    const id = this.kitId();
    if (!id) return;
    this.loadingAdorableFiles.set(true);
    this.apiService.getKitFiles(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    this.apiService.getKitFile(id, filePath).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    this.apiService.updateKitFile(id, file.path, file.content).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    this.apiService.deleteKitFile(id, filePath).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toastService.show('File deleted', 'success');
        this.loadAdorableFiles();
      },
      error: () => {
        this.toastService.show('Failed to delete file', 'error');
      }
    });
  }

  deleteAdorableFolder(folderPath: string) {
    const id = this.kitId();
    if (!id) return;
    this.apiService.deleteKitFolder(id, folderPath).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.toastService.show(`Deleted ${result.deletedCount} file(s)`, 'success');
        this.loadAdorableFiles();
      },
      error: () => {
        this.toastService.show('Failed to delete folder', 'error');
      }
    });
  }

  // --- Upload preview flow ---

  uploadAdorableFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || !this.kitId()) return;

    const fileArray = Array.from(input.files);
    const totalSize = fileArray.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_UPLOAD_SIZE) {
      this.toastService.show('Upload too large (max 10MB). Remove large files and try again.', 'error');
      input.value = '';
      return;
    }

    this.readFilesForPreview(fileArray, (file) => `.adorable/${file.name}`);
    input.value = '';
  }

  uploadAdorableFolder(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || !this.kitId()) return;

    const fileArray = Array.from(input.files);
    const supportedExts = ['.md', '.txt', '.json', '.yaml', '.yml'];
    const textFiles = fileArray.filter(f => supportedExts.some(ext => f.name.endsWith(ext)));

    if (textFiles.length === 0) {
      this.toastService.show('No supported files found (.md, .txt, .json, .yaml, .yml)', 'error');
      input.value = '';
      return;
    }

    const totalSize = textFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_UPLOAD_SIZE) {
      this.toastService.show('Upload too large (max 10MB). Remove large files and try again.', 'error');
      input.value = '';
      return;
    }

    this.readFilesForPreview(textFiles, (file) => {
      const parts = file.webkitRelativePath.split('/');
      const subPath = parts.slice(1).join('/');
      return `.adorable/${subPath}`;
    });
    input.value = '';
  }

  private readFilesForPreview(files: File[], pathMapper: (file: File) => string) {
    const pending: PendingFile[] = [];
    let processed = 0;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        pending.push({
          path: pathMapper(file),
          content: reader.result as string,
          size: file.size,
        });
        processed++;
        if (processed === files.length) {
          this.showUploadPreview(pending);
        }
      };
      reader.readAsText(file);
    }
  }

  private showUploadPreview(files: PendingFile[]) {
    this.pendingUploadFiles.set(files);
    // Select all by default
    this.selectedUploadPaths.set(new Set(files.map(f => f.path)));
    // Expand all directories in preview
    const allDirs = new Set<string>();
    for (const file of files) {
      const parts = file.path.split('/');
      for (let i = 1; i < parts.length; i++) {
        allDirs.add(parts.slice(0, i).join('/'));
      }
    }
    this.expandedPreviewPaths.set(allDirs);
  }

  cancelUploadPreview() {
    this.pendingUploadFiles.set([]);
    this.selectedUploadPaths.set(new Set());
  }

  togglePreviewFolder(path: string) {
    const expanded = new Set(this.expandedPreviewPaths());
    if (expanded.has(path)) {
      expanded.delete(path);
    } else {
      expanded.add(path);
    }
    this.expandedPreviewPaths.set(expanded);
  }

  toggleUploadSelection(entry: TreeEntry) {
    if (entry.isDirectory) {
      this.toggleDirectorySelection(entry.fullPath);
    } else {
      this.toggleFileSelection(entry.fullPath);
    }
  }

  private toggleFileSelection(filePath: string) {
    const selected = new Set(this.selectedUploadPaths());
    if (selected.has(filePath)) {
      selected.delete(filePath);
    } else {
      selected.add(filePath);
    }
    this.selectedUploadPaths.set(selected);
  }

  private toggleDirectorySelection(dirPath: string) {
    const selected = new Set(this.selectedUploadPaths());
    const filesInDir = this.pendingUploadFiles().filter(f => f.path.startsWith(dirPath + '/'));
    const allSelected = filesInDir.every(f => selected.has(f.path));

    for (const file of filesInDir) {
      if (allSelected) {
        selected.delete(file.path);
      } else {
        selected.add(file.path);
      }
    }
    this.selectedUploadPaths.set(selected);
  }

  isDirectorySelected(dirPath: string): boolean | null {
    const selected = this.selectedUploadPaths();
    const filesInDir = this.pendingUploadFiles().filter(f => f.path.startsWith(dirPath + '/'));
    if (filesInDir.length === 0) return false;
    const selectedCount = filesInDir.filter(f => selected.has(f.path)).length;
    if (selectedCount === 0) return false;
    if (selectedCount === filesInDir.length) return true;
    return null; // indeterminate
  }

  selectAllUpload() {
    this.selectedUploadPaths.set(new Set(this.pendingUploadFiles().map(f => f.path)));
  }

  deselectAllUpload() {
    this.selectedUploadPaths.set(new Set());
  }

  confirmUpload() {
    const id = this.kitId();
    if (!id) return;

    const selected = this.selectedUploadPaths();
    const filesToUpload = this.pendingUploadFiles()
      .filter(f => selected.has(f.path))
      .map(f => ({ path: f.path, content: f.content }));

    if (filesToUpload.length === 0) {
      this.toastService.show('No files selected', 'error');
      return;
    }

    this.uploadingFiles.set(true);
    this.pendingUploadFiles.set([]);
    this.selectedUploadPaths.set(new Set());

    this.apiService.uploadKitFiles(id, filesToUpload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toastService.show(`${filesToUpload.length} file(s) uploaded`, 'success');
        this.uploadingFiles.set(false);
        this.loadAdorableFiles();
      },
      error: () => {
        this.toastService.show('Failed to upload files', 'error');
        this.uploadingFiles.set(false);
      }
    });
  }

  regenerateDocs() {
    const id = this.kitId();
    if (!id) return;
    this.apiService.regenerateKitDocs(id, false).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
