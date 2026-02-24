import { Component, signal, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorybookComponent, ComponentExample } from '../../../services/kit-types';

@Component({
  selector: 'app-component-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './component-editor-modal.component.html',
  styleUrl: './component-editor-modal.component.scss'
})
export class ComponentEditorModalComponent {
  component = input<StorybookComponent | null>(null);
  saved = output<StorybookComponent>();
  closed = output<void>();

  // Editing state
  editSelector = signal('');
  editUsageType = signal<'directive' | 'component' | ''>('');
  editDescription = signal('');
  editExamples = signal<ComponentExample[]>([]);
  editInputs = signal<{ name: string; type: string; required?: boolean; description?: string }[]>([]);
  editOutputs = signal<{ name: string; type?: string; description?: string }[]>([]);

  generatedBasicUsage = computed(() => {
    const selector = this.editSelector();
    const usageType = this.editUsageType();
    const inputs = this.editInputs();

    if (!selector) return null;

    const requiredInputs = inputs.filter(i => i.required);
    const inputAttrs = requiredInputs.map(i => `[${i.name}]="${this.getExampleValue(i.name, i.type)}"`).join(' ');

    if (usageType === 'directive' || selector.includes('[')) {
      const attrMatch = selector.match(/\[([^\]]+)\]/);
      const attrName = attrMatch ? attrMatch[1] : selector;
      const hostElement = selector.split('[')[0] || 'button';
      if (inputAttrs) {
        return `<${hostElement} ${attrName} ${inputAttrs}>Content</${hostElement}>`;
      }
      return `<${hostElement} ${attrName}>Content</${hostElement}>`;
    }

    if (inputAttrs) {
      return `<${selector} ${inputAttrs}></${selector}>`;
    }
    return `<${selector}></${selector}>`;
  });

  private getExampleValue(name: string, type: string): string {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('content') || nameLower.includes('text') || nameLower.includes('label')) return 'Your text';
    if (nameLower.includes('title')) return 'Title';
    if (nameLower.includes('disabled') || nameLower.includes('loading')) return 'false';
    if (nameLower.includes('visible') || nameLower.includes('show')) return 'true';
    if (type?.includes('string')) return 'value';
    if (type?.includes('number')) return '0';
    if (type?.includes('boolean')) return 'true';
    return 'value';
  }

  open(component: StorybookComponent) {
    this.editSelector.set(component.selector || '');
    this.editUsageType.set(component.usageType || '');
    this.editDescription.set(component.description || '');
    this.editExamples.set(component.examples ? [...component.examples] : []);
    this.editInputs.set(component.inputs ? [...component.inputs] : []);
    this.editOutputs.set(component.outputs ? [...component.outputs] : []);
  }

  close() {
    this.closed.emit();
  }

  addExample() {
    const examples = [...this.editExamples()];
    examples.push({ title: '', code: '', language: 'html' });
    this.editExamples.set(examples);
  }

  removeExample(index: number) {
    const examples = [...this.editExamples()];
    examples.splice(index, 1);
    this.editExamples.set(examples);
  }

  updateExample(index: number, field: 'title' | 'code' | 'language', value: string) {
    const examples = [...this.editExamples()];
    examples[index] = { ...examples[index], [field]: value };
    this.editExamples.set(examples);
  }

  addInput() {
    const inputs = [...this.editInputs()];
    inputs.push({ name: '', type: 'string', required: false });
    this.editInputs.set(inputs);
  }

  removeInput(index: number) {
    const inputs = [...this.editInputs()];
    inputs.splice(index, 1);
    this.editInputs.set(inputs);
  }

  updateInput(index: number, field: 'name' | 'type' | 'required' | 'description', value: any) {
    const inputs = [...this.editInputs()];
    inputs[index] = { ...inputs[index], [field]: value };
    this.editInputs.set(inputs);
  }

  addOutput() {
    const outputs = [...this.editOutputs()];
    outputs.push({ name: '' });
    this.editOutputs.set(outputs);
  }

  removeOutput(index: number) {
    const outputs = [...this.editOutputs()];
    outputs.splice(index, 1);
    this.editOutputs.set(outputs);
  }

  updateOutput(index: number, field: 'name' | 'description', value: string) {
    const outputs = [...this.editOutputs()];
    outputs[index] = { ...outputs[index], [field]: value };
    this.editOutputs.set(outputs);
  }

  saveEdits() {
    const comp = this.component();
    if (!comp) return;

    const updated: StorybookComponent = {
      ...comp,
      selector: this.editSelector() || undefined,
      usageType: this.editUsageType() || undefined,
      description: this.editDescription() || undefined,
      examples: this.editExamples().filter(e => e.code.trim()),
      inputs: this.editInputs().length > 0 ? this.editInputs() : undefined,
      outputs: this.editOutputs().length > 0 ? this.editOutputs() : undefined
    };
    this.saved.emit(updated);
  }
}
