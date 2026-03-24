import { Component, input, output, signal, effect, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface MultiAnnotationItem {
  index: number;
  elementId: string | null;
  tagName: string;
  text: string;
  classes: string;
  componentName: string | null;
  ongAnnotation: any | null;
  note: string;
}

@Component({
  selector: 'app-multi-annotation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './multi-annotation-panel.html',
  styleUrls: ['./multi-annotation-panel.scss']
})
export class MultiAnnotationPanelComponent {
  items = input.required<MultiAnnotationItem[]>();

  removeItem = output<number>();
  clearAll = output<void>();
  closePanel = output<void>();
  aiChangeRequested = output<string>();
  previewRequested = output<string>();
  noteChanged = output<{ index: number; note: string }>();

  @ViewChildren('noteTextarea') noteTextareas!: QueryList<ElementRef<HTMLTextAreaElement>>;

  globalInstruction = '';
  focusIndex = signal<number | null>(null);

  constructor() {
    // Auto-focus textarea of most recently added item
    effect(() => {
      const idx = this.focusIndex();
      if (idx === null) return;
      // Defer to next microtask so the DOM has rendered
      setTimeout(() => {
        const textareas = this.noteTextareas?.toArray();
        if (!textareas) return;
        const match = textareas.find(ref => {
          return ref.nativeElement.dataset['index'] === String(idx);
        });
        if (match) {
          match.nativeElement.focus();
          match.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    });
  }

  scrollToAndFocus(index: number) {
    this.focusIndex.set(null); // Reset to re-trigger effect
    setTimeout(() => this.focusIndex.set(index), 0);
  }

  onNoteInput(item: MultiAnnotationItem, value: string) {
    item.note = value;
    this.noteChanged.emit({ index: item.index, note: value });
  }

  onSubmitClick(event: MouseEvent) {
    const prompt = this.compileBatchPrompt();
    if (!prompt) return;

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      this.previewRequested.emit(prompt);
    } else {
      this.aiChangeRequested.emit(prompt);
    }
  }

  compileBatchPrompt(): string {
    const currentItems = this.items();
    if (!currentItems.length) return '';

    const parts: string[] = ['Multi-Element Visual Edit Request:\n'];

    for (const item of currentItems) {
      let section = `Element ${item.index}: \`<${item.tagName}>\``;
      if (item.classes) section += ` class="${item.classes}"`;
      section += '\n';

      if (item.text) {
        section += `Text: "${item.text.substring(0, 80)}"\n`;
      }

      const ann = item.ongAnnotation;
      if (ann) {
        section += `Source: \`${ann.file}\` line ${ann.line}\n`;
        section += `Component: ${ann.component} (selector: \`${ann.selector}\`, TS: \`${ann.tsFile}\`)\n`;
        if (ann.text?.type !== 'static' && ann.text?.content) {
          section += `Template expression: \`${ann.text.content}\`\n`;
        }
        if (ann.inLoop) section += `Context: element is inside a loop (@for) — change the data source, not the template literal\n`;
        if (ann.conditional) section += `Context: element is inside a conditional (@if)\n`;
        const inputs = Object.entries(ann.bindings?.inputs ?? {});
        if (inputs.length) section += `Bound inputs: ${inputs.map(([k, v]: [string, any]) => `${k}="${v}"`).join(', ')}\n`;
        const structural = ann.bindings?.structural ?? [];
        if (structural.length) section += `Structural directives: ${structural.join(', ')}\n`;
      } else if (item.componentName) {
        section += `Component: ${item.componentName}\n`;
      }

      section += `Instruction: ${item.note || '(no instruction provided)'}\n`;
      parts.push(section);
    }

    if (this.globalInstruction.trim()) {
      parts.push(`Overall instruction: ${this.globalInstruction.trim()}`);
    }

    return parts.join('\n');
  }
}
