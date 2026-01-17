import { Injectable, computed, signal } from '@angular/core';
import { FileSystemNode, WebContainerFiles } from '@adorable/shared-types';

@Injectable({
  providedIn: 'root'
})
export class FileSystemStore {
  // Core State
  private _files = signal<WebContainerFiles>({});
  
  // Readonly Signals
  public readonly files = this._files.asReadonly();
  public readonly isEmpty = computed(() => Object.keys(this.files()).length === 0);

  // Actions
  setFiles(files: WebContainerFiles) {
    this._files.set(files);
  }

  updateFile(path: string, content: string) {
    this._files.update(current => {
      const newState = structuredClone(current); // Deep clone for immutability
      this.setFileInTree(newState, path, content);
      return newState;
    });
  }

  deleteFile(path: string) {
    this._files.update(current => {
      const newState = structuredClone(current);
      this.removeFileFromTree(newState, path);
      return newState;
    });
  }

  getFileContent(path: string): string | null {
    const node = this.findNode(this.files(), path);
    return node?.file?.contents ?? null;
  }

  // --- Private Helpers ---

  private setFileInTree(root: WebContainerFiles, path: string, content: string) {
    const parts = path.split('/');
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = { directory: {} };
      } else if (!current[part].directory) {
        // If it exists but is a file, we can't create a directory over it without force
        // For now, we assume valid paths
        current[part] = { directory: {} };
      }
      current = current[part].directory!;
    }

    const fileName = parts[parts.length - 1];
    current[fileName] = { file: { contents: content } };
  }

  private removeFileFromTree(root: WebContainerFiles, path: string) {
    const parts = path.split('/');
    const fileName = parts.pop()!;
    
    let current = root;
    for (const part of parts) {
      if (!current[part] || !current[part].directory) return; // Path doesn't exist
      current = current[part].directory!;
    }
    
    delete current[fileName];
  }

  private findNode(root: WebContainerFiles, path: string): FileSystemNode | null {
    const parts = path.split('/');
    let current: any = root;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current[part]) return null;
      
      if (i === parts.length - 1) {
        return current[part];
      }
      
      if (!current[part].directory) return null;
      current = current[part].directory;
    }
    return null;
  }
}
