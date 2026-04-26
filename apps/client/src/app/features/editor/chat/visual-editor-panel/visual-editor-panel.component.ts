import { Component, Input, Output, EventEmitter, signal, computed, effect, inject } from '@angular/core';
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
  imports: [FormsModule],
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
  @Output() selectBreadcrumb = new EventEmitter<{ elementId: string; tagName: string; index: number }>();

  // Visual Edit State
  editText = '';
  editColor = '#000000';
  editBgColor = 'transparent';
  editFontSize = '16px';
  editFontSizePx = 16;
  editFontWeight = '400';
  editTextAlign = 'left';
  editLineHeight = 1.5;
  editLetterSpacing = 0;
  editTextTransform = 'none';
  editFontStyle = 'normal';
  editUnderline = false;
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
  editFlexWrap = 'nowrap';
  editJustifyContent = 'flex-start';
  editAlignItems = 'stretch';
  editAlignContent = 'stretch';
  editGap = 0;
  editGridTemplateColumns = '';
  editGridTemplateRows = '';
  editGridAutoFlow = 'row';
  editJustifyItems = 'stretch';

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
        this.editFontSizePx = this.parsePixelValue(data.styles?.fontSize) || 16;
        this.editFontWeight = data.styles?.fontWeight || '400';
        this.editTextAlign = data.styles?.textAlign || 'left';
        this.editLineHeight = this.parseLineHeight(data.styles?.lineHeight, this.editFontSizePx);
        this.editLetterSpacing = this.parseLetterSpacing(data.styles?.letterSpacing);
        this.editTextTransform = data.styles?.textTransform || 'none';
        this.editFontStyle = data.styles?.fontStyle || 'normal';
        this.editUnderline = (data.styles?.textDecorationLine || '').includes('underline');
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
        this.editFlexWrap = data.styles?.flexWrap || 'nowrap';
        this.editJustifyContent = data.styles?.justifyContent || 'flex-start';
        this.editAlignItems = data.styles?.alignItems || 'stretch';
        this.editAlignContent = data.styles?.alignContent || 'stretch';
        this.editGap = this.parsePixelValue(data.styles?.gap);
        this.editGridTemplateColumns = data.styles?.gridTemplateColumns || '';
        this.editGridTemplateRows = data.styles?.gridTemplateRows || '';
        this.editGridAutoFlow = data.styles?.gridAutoFlow || 'row';
        this.editJustifyItems = data.styles?.justifyItems || 'stretch';
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
    this.selectBreadcrumb.emit({
      elementId: item.elementId,
      tagName: item.tagName,
      index,
    });
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

  setCustomFontSize(px: number) {
    if (!Number.isFinite(px) || px <= 0) return;
    this.editFontSizePx = px;
    const value = `${px}px`;
    this.editFontSize = value;
    this.applyVisualEdit('style', value, 'font-size');
  }

  setLineHeight(value: number) {
    this.editLineHeight = value;
    this.applyVisualEdit('style', String(value), 'line-height');
  }

  setLetterSpacing(value: number) {
    this.editLetterSpacing = value;
    const cssValue = value === 0 ? 'normal' : `${value}px`;
    this.applyVisualEdit('style', cssValue, 'letter-spacing');
  }

  setTextTransform(value: string) {
    this.editTextTransform = value;
    this.applyVisualEdit('style', value, 'text-transform');
  }

  toggleItalic() {
    const next = this.editFontStyle === 'italic' ? 'normal' : 'italic';
    this.editFontStyle = next;
    this.applyVisualEdit('style', next, 'font-style');
  }

  toggleUnderline() {
    const next = !this.editUnderline;
    this.editUnderline = next;
    this.applyVisualEdit('style', next ? 'underline' : 'none', 'text-decoration');
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

  setFlexWrap(wrap: string) {
    this.editFlexWrap = wrap;
    this.applyVisualEdit('style', wrap, 'flex-wrap');
  }

  setAlignContent(align: string) {
    this.editAlignContent = align;
    this.applyVisualEdit('style', align, 'align-content');
  }

  setGridTemplateColumns(value: string) {
    this.editGridTemplateColumns = value;
    this.applyVisualEdit('style', value, 'grid-template-columns');
  }

  setGridTemplateRows(value: string) {
    this.editGridTemplateRows = value;
    this.applyVisualEdit('style', value, 'grid-template-rows');
  }

  setGridAutoFlow(flow: string) {
    this.editGridAutoFlow = flow;
    this.applyVisualEdit('style', flow, 'grid-auto-flow');
  }

  setJustifyItems(justify: string) {
    this.editJustifyItems = justify;
    this.applyVisualEdit('style', justify, 'justify-items');
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

  private parseLineHeight(value: string | undefined, fontSizePx: number): number {
    if (!value || value === 'normal') return 1.5;
    const num = parseFloat(value);
    if (!Number.isFinite(num)) return 1.5;
    // computed line-height comes back in px; convert to unitless multiplier
    if (value.endsWith('px') && fontSizePx > 0) {
      return Math.round((num / fontSizePx) * 100) / 100;
    }
    return num;
  }

  private parseLetterSpacing(value: string | undefined): number {
    if (!value || value === 'normal') return 0;
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : 0;
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
