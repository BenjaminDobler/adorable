import { Component, Input, Output, EventEmitter, signal, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplateService } from '../../services/template';
import { ProjectService } from '../../services/project';
import { ContainerEngine } from '../../services/container-engine';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-visual-editor-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './visual-editor-panel.html',
  styleUrls: ['./visual-editor-panel.scss']
})
export class VisualEditorPanelComponent {
  private templateService = inject(TemplateService);
  private projectService = inject(ProjectService);
  private webContainerService = inject(ContainerEngine);
  private toastService = inject(ToastService);

  @Input({ required: true }) visualEditorData!: ReturnType<typeof signal<any>>;

  @Output() closeEditor = new EventEmitter<void>();
  @Output() aiChangeRequested = new EventEmitter<string>();

  // Visual Edit State
  editText = '';
  editColor = '#000000';
  editBgColor = 'transparent';
  editFontSize = '16px';
  editFontWeight = '400';
  editTextAlign = 'left';
  editMarginTop = 0;
  editMarginRight = 0;
  editMarginBottom = 0;
  editMarginLeft = 0;
  editPaddingTop = 0;
  editPaddingRight = 0;
  editPaddingBottom = 0;
  editPaddingLeft = 0;
  editBorderRadius = 0;
  editDisplay = 'block';
  editFlexDirection = 'row';
  editJustifyContent = 'flex-start';
  editAlignItems = 'stretch';
  editGap = 0;

  visualPrompt = '';

  constructor() {
    effect(() => {
      const data = this.visualEditorData();
      if (data) {
        this.editText = data.text || '';
        this.editColor = this.rgbToHex(data.styles?.color) || '#000000';
        this.editBgColor = this.rgbToHex(data.styles?.backgroundColor) || 'transparent';
        this.editFontSize = data.styles?.fontSize || '16px';
        this.editFontWeight = data.styles?.fontWeight || '400';
        this.editTextAlign = data.styles?.textAlign || 'left';
        this.editMarginTop = this.parsePixelValue(data.styles?.marginTop);
        this.editMarginRight = this.parsePixelValue(data.styles?.marginRight);
        this.editMarginBottom = this.parsePixelValue(data.styles?.marginBottom);
        this.editMarginLeft = this.parsePixelValue(data.styles?.marginLeft);
        this.editPaddingTop = this.parsePixelValue(data.styles?.paddingTop);
        this.editPaddingRight = this.parsePixelValue(data.styles?.paddingRight);
        this.editPaddingBottom = this.parsePixelValue(data.styles?.paddingBottom);
        this.editPaddingLeft = this.parsePixelValue(data.styles?.paddingLeft);
        this.editBorderRadius = this.parsePixelValue(data.styles?.borderRadius);
        this.editDisplay = data.styles?.display || 'block';
        this.editFlexDirection = data.styles?.flexDirection || 'row';
        this.editJustifyContent = data.styles?.justifyContent || 'flex-start';
        this.editAlignItems = data.styles?.alignItems || 'stretch';
        this.editGap = this.parsePixelValue(data.styles?.gap);
      }
    });
  }

  applyVisualEdit(type: 'text' | 'style', value: string, property?: string) {
    if (!this.visualEditorData()) return;

    const data = this.visualEditorData();
    const fingerprint = {
      componentName: data.componentName,
      hostTag: data.hostTag,
      tagName: data.tagName,
      text: data.text,
      classes: data.classes,
      id: data.attributes?.id,
      childIndex: data.childIndex,
      parentTag: data.parentTag
    };

    const result = this.templateService.findAndModify(fingerprint, { type, value, property });

    if (result.success) {
      this.projectService.fileStore.updateFile(result.path, result.content);
      this.webContainerService.writeFile(result.path, result.content);
      this.toastService.show('Update applied', 'success');

      if (type === 'text') {
        this.visualEditorData.update((d: any) => ({ ...d, text: value }));
      }
    } else {
      console.error('Visual Edit Failed:', result.error);
      this.toastService.show(result.error || 'Failed to apply edit', 'error');
    }
  }

  applyVisualChanges(prompt: string) {
    if (!this.visualEditorData()) return;

    const data = this.visualEditorData();
    const specificContext = data.componentName
      ? `This change likely involves ${data.componentName}.`
      : '';

    const fullPrompt = `Visual Edit Request:\nTarget Element: \`<${data.tagName}>\` class=\`"${data.classes}"\`\nOriginal Text: \`"${data.text}"\`\n${specificContext}\n\nInstruction: ${prompt}`;

    this.aiChangeRequested.emit(fullPrompt);
    this.closeEditor.emit();
  }

  selectFromBreadcrumb(item: any, index: number) {
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'SELECT_ELEMENT',
        elementId: item.elementId,
        tagName: item.tagName,
        index: index
      }, '*');
    }
  }

  setFontSize(size: string) {
    this.editFontSize = size;
    this.applyVisualEdit('style', size, 'font-size');
  }

  setFontWeight(weight: string) {
    this.editFontWeight = weight;
    this.applyVisualEdit('style', weight, 'font-weight');
  }

  setTextAlign(align: string) {
    this.editTextAlign = align;
    this.applyVisualEdit('style', align, 'text-align');
  }

  applySpacing(property: string, value: number) {
    this.applyVisualEdit('style', value + 'px', property);
  }

  setDisplay(display: string) {
    this.editDisplay = display;
    this.applyVisualEdit('style', display, 'display');
  }

  setFlexDirection(direction: string) {
    this.editFlexDirection = direction;
    this.applyVisualEdit('style', direction, 'flex-direction');
  }

  setJustifyContent(justify: string) {
    this.editJustifyContent = justify;
    this.applyVisualEdit('style', justify, 'justify-content');
  }

  setAlignItems(align: string) {
    this.editAlignItems = align;
    this.applyVisualEdit('style', align, 'align-items');
  }

  isContainerElement(): boolean {
    const data = this.visualEditorData();
    if (!data) return false;

    const containerTags = ['div', 'section', 'main', 'aside', 'article', 'nav', 'header', 'footer', 'ul', 'ol', 'form', 'fieldset'];
    return containerTags.includes(data.tagName.toLowerCase());
  }

  private parsePixelValue(value: string | undefined): number {
    if (!value) return 0;
    const match = value.match(/^(-?\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }

  private rgbToHex(rgb: string | undefined): string {
    if (!rgb) return '#000000';
    if (rgb.startsWith('#')) return rgb;
    if (rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return 'transparent';

    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return rgb;
  }
}
