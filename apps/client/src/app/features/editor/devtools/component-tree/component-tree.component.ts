import { Component, inject, signal, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DevtoolsService,
  ComponentTreeNode,
  PropertyInfo,
} from '../../../../core/services/devtools.service';
import { ElementFingerprint } from '../../services/template';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';

@Component({
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, IconComponent],
  selector: 'app-component-tree',
  templateUrl: './component-tree.component.html',
  styleUrl: './component-tree.component.scss',
})
export class ComponentTreeComponent {
  devtools = inject(DevtoolsService);
  goToCode = output<ElementFingerprint>();

  editingProp = signal<string | null>(null);
  editValue = '';

  onNodeClick(node: ComponentTreeNode): void {
    this.devtools.selectNode(node);
    this.devtools.highlightElement(node.ongId);
  }

  onNodeToggle(event: Event, node: ComponentTreeNode): void {
    event.stopPropagation();
    this.devtools.toggleExpanded(node);
  }

  onNodeHover(node: ComponentTreeNode): void {
    this.devtools.highlightElement(node.ongId);
  }

  onNodeHoverEnd(): void {
    this.devtools.clearHighlight();
  }

  goToSource(): void {
    const detail = this.devtools.selectedDetail();
    if (!detail || !detail.file) return;

    const fingerprint: ElementFingerprint = {
      componentName: detail.componentName,
      tagName: detail.selector,
      ongAnnotation: {
        file: detail.file,
        line: detail.line,
        col: 0,
        tag: detail.selector,
        component: detail.componentName,
        selector: detail.selector,
        tsFile: '',
        parent: null,
        inLoop: detail.inLoop,
        conditional: detail.conditional,
        text: { hasText: false, type: 'none', content: '' },
        bindings: { inputs: {}, outputs: {}, twoWay: {}, structural: [] },
      },
    };

    this.goToCode.emit(fingerprint);
  }

  clearSelection(): void {
    this.devtools.selectedNode.set(null);
    this.devtools.selectedDetail.set(null);
    this.devtools.clearHighlight();
  }

  truncate(value: string, max = 60): string {
    if (!value) return '';
    return value.length > max ? value.slice(0, max) + '...' : value;
  }

  startEdit(prop: PropertyInfo | { name: string; value: string; type: string; editable: boolean }): void {
    if (!prop.editable) return;
    this.editingProp.set(prop.name);
    this.editValue = prop.value;
  }

  cancelEdit(): void {
    this.editingProp.set(null);
    this.editValue = '';
  }

  async commitEdit(propName: string, isSignal: boolean): Promise<void> {
    const detail = this.devtools.selectedDetail();
    if (!detail) return;

    let jsValue = this.editValue.trim();
    if (jsValue !== 'null' && jsValue !== 'undefined' && jsValue !== 'true' && jsValue !== 'false'
      && isNaN(Number(jsValue)) && !jsValue.startsWith('"') && !jsValue.startsWith("'")
      && !jsValue.startsWith('[') && !jsValue.startsWith('{')) {
      jsValue = JSON.stringify(jsValue);
    }

    const success = await this.devtools.setPropertyValue(detail.ongId, propName, jsValue, isSignal);
    if (success) {
      this.editingProp.set(null);
      this.editValue = '';
    }
  }

  onEditKeydown(event: KeyboardEvent, propName: string, isSignal: boolean): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitEdit(propName, isSignal);
    } else if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }

  async toggleBoolean(prop: PropertyInfo | { name: string; value: string; type: string; editable: boolean }): Promise<void> {
    const detail = this.devtools.selectedDetail();
    if (!detail) return;
    const newVal = prop.value === 'true' ? 'false' : 'true';
    await this.devtools.setPropertyValue(detail.ongId, prop.name, newVal, prop.type === 'signal');
  }
}
