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
  private static tsConfigured = false;
  private get tsConfigured() { return EditorComponent.tsConfigured; }
  private set tsConfigured(v: boolean) { EditorComponent.tsConfigured = v; }
  isStreaming = signal(false);

  constructor() {
    effect(() => {
      const value = this.content();
      if (this.editorInstance) {
        const model = this.editorInstance.getModel();
        if (model && model.getValue() !== value) {
          model.setValue(value);
          this.lastStreamedLength = value.length;
        }
      }
    });

    effect(() => {
      const name = this.fileName();
      const value = this.content();
      if (this.editorInstance) {
        const model = this.getOrCreateModel(name, value);
        if (this.editorInstance.getModel() !== model) {
          this.editorInstance.setModel(model);
        }
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

    this.configureTypeScript();

    const initialContent = untracked(this.content);
    const initialFileName = untracked(this.fileName);
    const model = this.getOrCreateModel(initialFileName, initialContent);

    this.editorInstance = monaco.editor.create(this.editorContainer.nativeElement, {
      model,
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineHeight: 24,
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      renderWhitespace: 'selection',
      tabSize: 2,
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      parameterHints: { enabled: true },
      wordBasedSuggestions: 'currentDocument'
    });

    this.editorInstance.onDidChangeModelContent(() => {
      const value = this.editorInstance.getValue();
      this.contentChange.emit(value);
    });
  }

  private getOrCreateModel(fileName: string, content: string) {
    const uri = monaco.Uri.parse('file:///' + fileName);
    let model = monaco.editor.getModel(uri);
    if (model) {
      if (model.getValue() !== content) {
        model.setValue(content);
      }
    } else {
      const language = this.getLanguage(fileName);
      model = monaco.editor.createModel(content, language, uri);
    }
    return model;
  }

  private getLanguage(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts': return 'typescript';
      case 'js': return 'javascript';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'scss': return 'scss';
      case 'json': return 'json';
      case 'md': return 'markdown';
      default: return 'plaintext';
    }
  }

  private configureTypeScript() {
    if (this.tsConfigured) return;
    this.tsConfigured = true;

    const tsDefaults = monaco.languages.typescript?.typescriptDefaults;
    const jsDefaults = monaco.languages.typescript?.javascriptDefaults;

    if (tsDefaults) {
      tsDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        allowJs: true,
        strict: false,
        jsx: monaco.languages.typescript.JsxEmit.React,
        experimentalDecorators: true,
        noEmit: true
      });
      tsDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false
      });
      tsDefaults.setEagerModelSync(true);
    }

    if (jsDefaults) {
      jsDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false
      });
      jsDefaults.setEagerModelSync(true);
    }

    // Register HTML completion for Angular template syntax
    if (!monaco.languages._angularRegistered) {
      monaco.languages._angularRegistered = true;
      monaco.languages.registerCompletionItemProvider('html', {
        triggerCharacters: ['@', '(', '[', '*', '#'],
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn
          };
          const lineContent = model.getLineContent(position.lineNumber);
          const charBefore = lineContent[position.column - 2];

          const suggestions: any[] = [];
          const Kind = monaco.languages.CompletionItemKind;

          if (charBefore === '@') {
            for (const kw of ['if', 'else', 'for', 'switch', 'case', 'default', 'defer', 'placeholder', 'loading', 'empty']) {
              suggestions.push({ label: kw, kind: Kind.Keyword, insertText: kw, range });
            }
          } else {
            // Common Angular directives and bindings
            const directives = [
              { label: 'ngIf', insertText: '*ngIf="$1"', kind: Kind.Snippet },
              { label: 'ngFor', insertText: '*ngFor="let $1 of $2"', kind: Kind.Snippet },
              { label: 'ngClass', insertText: '[ngClass]="$1"', kind: Kind.Snippet },
              { label: 'ngStyle', insertText: '[ngStyle]="$1"', kind: Kind.Snippet },
              { label: 'ngModel', insertText: '[(ngModel)]="$1"', kind: Kind.Snippet },
              { label: 'routerLink', insertText: '[routerLink]="[\'$1\']"', kind: Kind.Snippet },
              { label: 'click', insertText: '(click)="$1"', kind: Kind.Snippet },
              { label: 'ngSubmit', insertText: '(ngSubmit)="$1"', kind: Kind.Snippet },
            ];
            for (const d of directives) {
              suggestions.push({ ...d, range, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet });
            }
          }
          return { suggestions };
        }
      });
    }
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
