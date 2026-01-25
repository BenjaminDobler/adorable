import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, input, output, effect, untracked, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressiveEditorStore } from '../services/progressive-editor.store';

declare const monaco: any;

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule],
  template: `<div #editorContainer class="editor-container"></div>`,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .editor-container {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
  `]
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorContainer') editorContainer!: ElementRef;

  private progressiveStore = inject(ProgressiveEditorStore);

  content = input.required<string>();
  fileName = input.required<string>();
  contentChange = output<string>();

  private editorInstance: any;
  private lastStreamedLength = 0;
  isStreaming = signal(false);

  constructor() {
    effect(() => {
      const value = this.content();
      if (this.editorInstance) {
        // Only update if value is different to avoid cursor jumps
        const currentValue = this.editorInstance.getValue();
        if (currentValue !== value) {
          this.editorInstance.setValue(value);
          this.lastStreamedLength = value.length;
        }
      }
    });

    effect(() => {
      const name = this.fileName();
      if (this.editorInstance) {
        this.updateLanguage();
      }
    });

    // Progressive streaming effect
    effect(() => {
      const streamingFiles = this.progressiveStore.streamingFiles();
      const currentFileName = this.fileName();

      // Check if the current file is being streamed
      const streamingFile = streamingFiles.get(currentFileName);

      if (streamingFile && this.editorInstance) {
        this.isStreaming.set(!streamingFile.isComplete);

        if (streamingFile.content.length > this.lastStreamedLength) {
          this.appendStreamingContent(streamingFile.content);
        }

        if (streamingFile.isComplete) {
          this.lastStreamedLength = 0;
        }
      } else {
        this.isStreaming.set(false);
      }
    });
  }

  private appendStreamingContent(newContent: string): void {
    if (!this.editorInstance) return;

    const model = this.editorInstance.getModel();
    if (!model) return;

    const currentContent = model.getValue();

    // Only append if new content is longer (streaming mode)
    if (newContent.length > currentContent.length) {
      const delta = newContent.substring(currentContent.length);
      const lastLine = model.getLineCount();
      const lastCol = model.getLineMaxColumn(lastLine);

      // Use pushEditOperations for smooth append without cursor disruption
      model.pushEditOperations(
        [],
        [{
          range: {
            startLineNumber: lastLine,
            startColumn: lastCol,
            endLineNumber: lastLine,
            endColumn: lastCol
          },
          text: delta
        }],
        () => null
      );

      this.lastStreamedLength = newContent.length;
    }
  }

  ngAfterViewInit() {
    this.loadMonaco().then(() => {
      this.initEditor();
    });
  }

  ngOnDestroy() {
    if (this.editorInstance) {
      this.editorInstance.dispose();
    }
  }

  private initEditor() {
    if (!this.editorContainer) return;

    // Use untracked to access signal value once without subscribing
    const initialContent = untracked(this.content);

    this.editorInstance = monaco.editor.create(this.editorContainer.nativeElement, {
      value: initialContent,
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineHeight: 24,
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      renderWhitespace: 'selection',
      tabSize: 2
    });
    
    this.editorInstance.onDidChangeModelContent(() => {
      const value = this.editorInstance.getValue();
      this.contentChange.emit(value);
    });
    
    this.updateLanguage();
  }
  
  private updateLanguage() {
      if (!this.editorInstance) return;
      
      const ext = this.fileName().split('.').pop()?.toLowerCase();
      let language = 'plaintext';
      
      switch (ext) {
          case 'ts': language = 'typescript'; break;
          case 'js': language = 'javascript'; break;
          case 'html': language = 'html'; break;
          case 'css': language = 'css'; break;
          case 'scss': language = 'scss'; break;
          case 'json': language = 'json'; break;
          case 'md': language = 'markdown'; break;
      }
      
      monaco.editor.setModelLanguage(this.editorInstance.getModel(), language);
  }

  private loadMonaco(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof monaco === 'object') {
        resolve();
        return;
      }

      const onGotAmdLoader = () => {
        try {
          (window as any).require.config({ paths: { 'vs': 'assets/monaco/vs' } });
          (window as any).require(['vs/editor/editor.main'], () => {
            resolve();
          });
        } catch (e) {
          console.error('Monaco loader error:', e);
        }
      };

      if (!(window as any).require) {
        const loaderScript = document.createElement('script');
        loaderScript.type = 'text/javascript';
        loaderScript.src = 'assets/monaco/vs/loader.js';
        loaderScript.addEventListener('load', onGotAmdLoader);
        loaderScript.addEventListener('error', (e) => console.error('Failed to load Monaco loader script', e));
        document.body.appendChild(loaderScript);
      } else {
        onGotAmdLoader();
      }
    });
  }
}
