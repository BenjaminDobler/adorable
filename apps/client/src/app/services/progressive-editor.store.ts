import { Injectable, signal, computed } from '@angular/core';

export interface StreamingFile {
  path: string;
  content: string;
  isComplete: boolean;
  lastUpdate: Date;
}

@Injectable({ providedIn: 'root' })
export class ProgressiveEditorStore {
  private _streamingFiles = signal<Map<string, StreamingFile>>(new Map());

  readonly streamingFiles = this._streamingFiles.asReadonly();

  readonly activeStreamingFile = computed(() => {
    const files = this._streamingFiles();
    for (const [, file] of files) {
      if (!file.isComplete) return file;
    }
    return null;
  });

  readonly streamingFilePaths = computed(() => {
    return Array.from(this._streamingFiles().keys());
  });

  updateProgress(path: string, content: string, isComplete: boolean): void {
    this._streamingFiles.update(files => {
      const newMap = new Map(files);
      newMap.set(path, {
        path,
        content,
        isComplete,
        lastUpdate: new Date()
      });
      return newMap;
    });
  }

  getStreamingContent(path: string): string | null {
    return this._streamingFiles().get(path)?.content ?? null;
  }

  isFileStreaming(path: string): boolean {
    const file = this._streamingFiles().get(path);
    return file ? !file.isComplete : false;
  }

  clear(): void {
    this._streamingFiles.set(new Map());
  }

  markAllComplete(): void {
    this._streamingFiles.update(files => {
      const newMap = new Map(files);
      for (const [path, file] of newMap) {
        newMap.set(path, { ...file, isComplete: true });
      }
      return newMap;
    });
  }
}
