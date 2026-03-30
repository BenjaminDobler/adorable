import { Component, Input, Output, EventEmitter, signal, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplateService, ElementFingerprint } from '../../services/template';
import { ProjectService } from '../../../../core/services/project';
import { ContainerEngine } from '../../../../core/services/container-engine';
import { ToastService } from '../../../../core/services/toast';
import { HMRTriggerService } from '../../../../core/services/hmr-trigger.service';
import { getConflictPrefix, getPrefixedCategories, stripPrefix } from './tailwind-presets';

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
  private containerEngine = inject(ContainerEngine);
  private toastService = inject(ToastService);
  private hmrTriggerService = inject(HMRTriggerService);

  @Input({ required: true }) visualEditorData!: ReturnType<typeof signal<any>>;

  @Output() closeEditor = new EventEmitter<void>();
  @Output() aiChangeRequested = new EventEmitter<string>();
  @Output() goToCode = new EventEmitter<ElementFingerprint>();

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

  // Tailwind state
  hasTailwind = computed(() => this.projectService.detectedConfig()?.hasTailwind === true);
  activeTab = signal<'styles' | 'tailwind'>('styles');
  currentClasses = computed(() => {
    const cls = this.visualEditorData()?.classes;
    return new Set<string>(cls?.split(/\s+/).filter(Boolean) || []);
  });
  activeTailwindCategory = signal<number>(0);
  tailwindPrefix = computed(() => this.projectService.tailwindPrefixOverride() || this.projectService.detectedConfig()?.tailwindPrefix || '');
  tailwindCategories = computed(() => getPrefixedCategories(this.tailwindPrefix()));
  freeTextClass = '';
  hasDynamicClassBinding = computed(() => {
    const ann = this.visualEditorData()?.ongAnnotation;
    if (!ann?.bindings?.inputs) return false;
    return 'class' in ann.bindings.inputs || 'ngClass' in ann.bindings.inputs;
  });

  private static TRANSLATE_PIPE_RE = /\{\{\s*['"]([^'"]+)['"]\s*\|\s*(translate|transloco|i18n)\b/;

  /** Returns the content type label and optional i18n key for the selected element. */
  get textContentInfo(): { type: 'i18n' | 'expression' | 'static' | 'unknown'; key?: string } {
    const data = this.visualEditorData();
    const ann = data?.ongAnnotation;
    if (!ann) return { type: 'unknown' };

    if (ann.text.type === 'interpolated' || ann.text.type === 'mixed') {
      const match = ann.text.content?.match(VisualEditorPanelComponent.TRANSLATE_PIPE_RE);
      if (match) return { type: 'i18n', key: match[1] };
      return { type: 'expression' };
    }
    if (ann.text.type === 'static') return { type: 'static' };
    return { type: 'unknown' };
  }

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

  async applyVisualEdit(type: 'text' | 'style' | 'class', value: string, property?: string) {
    if (!this.visualEditorData()) return;

    const data = this.visualEditorData();
    const fingerprint = {
      componentName: data.componentName,
      hostTag: data.hostTag,
      tagName: data.tagName,
      text: data.text,
      classes: data.classes,
      id: data.attributes?.id,
      elementId: data.elementId,
      ongAnnotation: data.ongAnnotation,
      childIndex: data.childIndex,
      parentTag: data.parentTag
    };

    const result = await this.templateService.findAndModify(fingerprint, { type, value, property });
    console.log('[VisualEditor] result:', { success: result.success, path: result.path, error: result.error, contentLength: result.content?.length });

    if (result.success) {
      this.projectService.fileStore.updateFile(result.path, result.content);
      await this.containerEngine.writeFile(result.path, result.content);
      const isTranslation = result.path.endsWith('.json') || result.path.endsWith('.jsonc');
      if (isTranslation) this.hmrTriggerService.reloadTranslations(result.content);
      const msg = isTranslation
        ? `Translation updated in ${result.path.split('/').pop()}`
        : 'Update applied';
      this.toastService.show(msg, isTranslation ? 'info' : 'success');

      if (type === 'text') {
        this.visualEditorData.update((d: any) => ({ ...d, text: value }));
      } else if (type === 'class') {
        this.visualEditorData.update((d: any) => ({ ...d, classes: value }));
      }
    } else {
      console.error('Visual Edit Failed:', result.error);
      this.toastService.show(result.error || 'Failed to apply edit', 'error');
    }
  }

  applyVisualChanges(prompt: string) {
    if (!this.visualEditorData()) return;

    const data = this.visualEditorData();
    const ann = data.ongAnnotation;

    let context = '';
    if (ann) {
      context += `\nSource file: \`${ann.file}\` line ${ann.line}`;
      context += `\nComponent: ${ann.component} · selector: \`${ann.selector}\``;
      context += `\nComponent TS file: \`${ann.tsFile}\``;
      if (ann.text.type !== 'static' && ann.text.content) {
        context += `\nTemplate expression: \`${ann.text.content}\``;
      }
      if (ann.inLoop)      context += `\nContext: element is inside a loop (@for) — change the data source, not the template literal`;
      if (ann.conditional) context += `\nContext: element is inside a conditional (@if)`;
      const inputs = Object.entries(ann.bindings?.inputs ?? {});
      if (inputs.length)   context += `\nBound inputs: ${inputs.map(([k, v]) => `${k}="${v}"`).join(', ')}`;
      const structural = ann.bindings?.structural ?? [];
      if (structural.length) context += `\nStructural directives: ${structural.join(', ')}`;
    } else if (data.componentName) {
      context += `\nThis change likely involves ${data.componentName}.`;
    }

    const fullPrompt = `Visual Edit Request:\nTarget Element: \`<${data.tagName}>\` class=\`"${data.classes}"\`\nOriginal Text: \`"${data.text}"\`${context}\n\nInstruction: ${prompt}`;

    this.aiChangeRequested.emit(fullPrompt);
    this.closeEditor.emit();
  }

  goToSource() {
    const data = this.visualEditorData();
    if (!data) return;

    const fingerprint: ElementFingerprint = {
      componentName: data.componentName,
      hostTag: data.hostTag,
      tagName: data.tagName,
      text: data.text,
      classes: data.classes,
      id: data.attributes?.id,
      elementId: data.elementId,
      ongAnnotation: data.ongAnnotation,
      childIndex: data.childIndex,
      parentTag: data.parentTag
    };

    this.goToCode.emit(fingerprint);
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

  toggleTailwindClass(cls: string) {
    const classes = new Set(this.currentClasses());
    const twPrefix = this.tailwindPrefix();
    if (classes.has(cls)) {
      classes.delete(cls);
    } else {
      // Remove conflicting classes in the same group (strip prefix for comparison)
      const conflictGroup = getConflictPrefix(stripPrefix(cls, twPrefix));
      if (conflictGroup) {
        for (const existing of classes) {
          if (getConflictPrefix(stripPrefix(existing, twPrefix)) === conflictGroup) {
            classes.delete(existing);
          }
        }
      }
      classes.add(cls);
    }
    const newClassString = [...classes].join(' ');
    this.applyVisualEdit('class', newClassString);
  }

  addFreeTextClass() {
    const input = this.freeTextClass.trim();
    if (!input) return;
    const classes = new Set(this.currentClasses());
    for (const cls of input.split(/\s+/)) {
      if (cls) classes.add(cls);
    }
    this.freeTextClass = '';
    this.applyVisualEdit('class', [...classes].join(' '));
  }

  removeClass(cls: string) {
    const classes = new Set(this.currentClasses());
    classes.delete(cls);
    this.applyVisualEdit('class', [...classes].join(' '));
  }

  toggleCategory(index: number) {
    this.activeTailwindCategory.set(this.activeTailwindCategory() === index ? -1 : index);
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
