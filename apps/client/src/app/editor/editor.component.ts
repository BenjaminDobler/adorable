import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  
  @Input() set content(value: string) {
    this._content = value;
    if (this.editorInstance) {
      // Only update if value is different to avoid cursor jumps if we were binding back
      if (this.editorInstance.getValue() !== value) {
        this.editorInstance.setValue(value);
      }
    }
  }
  
  @Input() set fileName(value: string) {
      this._fileName = value;
      this.updateLanguage();
  }

  @Output() contentChange = new EventEmitter<string>();

  private _content = '';
  private _fileName = '';
  private editorInstance: any;

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

    this.editorInstance = monaco.editor.create(this.editorContainer.nativeElement, {
      value: this._content,
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
      if (!this.editorInstance || !this._fileName) return;
      
      const ext = this._fileName.split('.').pop()?.toLowerCase();
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
