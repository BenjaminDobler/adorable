import {
  Component, input, output, signal, ViewChild, ElementRef,
  afterNextRender, OnDestroy, effect
} from '@angular/core';
import { FormsModule } from '@angular/forms';

type Point = { x: number; y: number };

type Stroke =
  | { type: 'pen'; color: string; width: number; points: Point[] }
  | { type: 'arrow'; color: string; width: number; start: Point; end: Point }
  | { type: 'rect'; color: string; width: number; start: Point; end: Point }
  | { type: 'text'; color: string; position: Point; text: string; fontSize: number };

export interface AnnotationResult {
  imageDataUrl: string;
  annotations: {
    texts: string[];
    hasArrows: boolean;
    hasRectangles: boolean;
    hasFreehand: boolean;
  };
}

@Component({
  selector: 'app-annotation-overlay',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './annotation-overlay.html',
  styleUrl: './annotation-overlay.scss',
})
export class AnnotationOverlayComponent implements OnDestroy {
  active = input<boolean>(false);
  done = output<AnnotationResult>();
  cancelled = output<void>();

  @ViewChild('annotationCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('textInput') textInputRef?: ElementRef<HTMLInputElement>;

  currentTool = signal<'pen' | 'arrow' | 'rect' | 'text'>('pen');
  currentColor = signal('#ef4444');
  strokes = signal<Stroke[]>([]);
  isDrawing = signal(false);

  showTextInput = signal(false);
  textInputPosition = signal<Point>({ x: 0, y: 0 });
  textValue = '';
  isDraggingText = false;
  private textDragOffset: Point = { x: 0, y: 0 };

  // Offset from popup CSS left/top to where input text content starts
  // drag handle: 20px content + 2px border-left = 22px, input padding-left: 10px → 32px
  // border-top: 2px, input padding-top: 6px → 8px
  private readonly POPUP_OFFSET_X = 32;
  private readonly POPUP_OFFSET_Y = 8;

  // Selection state for editing committed text strokes
  selectedStrokeIndex = signal(-1);
  private isDraggingSelected = false;
  private selectedDragOffset: Point = { x: 0, y: 0 };
  private editingStrokeIndex = -1; // index of stroke being re-edited

  colors = ['#ef4444', '#eab308', '#3b82f6', '#22c55e', '#ffffff'];

  private ctx: CanvasRenderingContext2D | null = null;
  private currentStroke: Stroke | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private dpr = 1;

  private keyHandler = (e: KeyboardEvent) => this.onKeyDown(e);

  constructor() {
    afterNextRender(() => this.setupCanvas());
    effect(() => {
      if (this.active()) {
        window.addEventListener('keydown', this.keyHandler);
        // Re-setup canvas when becoming active in case size changed
        setTimeout(() => this.setupCanvas(), 0);
      } else {
        window.removeEventListener('keydown', this.keyHandler);
        this.resetState();
      }
    });
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    window.removeEventListener('keydown', this.keyHandler);
  }

  private setupCanvas() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width * this.dpr;
      canvas.height = rect.height * this.dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      this.ctx!.scale(this.dpr, this.dpr);
      this.redrawCanvas();
    };

    resize();
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => resize());
    this.resizeObserver.observe(canvas.parentElement!);
  }

  private resetState() {
    this.strokes.set([]);
    this.currentStroke = null;
    this.isDrawing.set(false);
    this.showTextInput.set(false);
    this.textValue = '';
    this.selectedStrokeIndex.set(-1);
    this.editingStrokeIndex = -1;
    if (this.ctx) {
      const canvas = this.canvasRef?.nativeElement;
      if (canvas) {
        this.ctx.clearRect(0, 0, canvas.width / this.dpr, canvas.height / this.dpr);
      }
    }
  }

  // --- Mouse Handlers ---

  onMouseDown(e: MouseEvent) {
    // If text input is open, commit it first then continue
    if (this.showTextInput()) {
      this.commitText();
    }

    const p = this.getPoint(e);
    const tool = this.currentTool();

    // Check if clicking on an existing text stroke
    const hitIdx = this.hitTestText(p);
    if (hitIdx >= 0) {
      this.selectedStrokeIndex.set(hitIdx);
      this.isDraggingSelected = true;
      const stroke = this.strokes()[hitIdx] as Extract<Stroke, { type: 'text' }>;
      this.selectedDragOffset = { x: p.x - stroke.position.x, y: p.y - stroke.position.y };
      this.redrawCanvas();
      return;
    }

    // Clicked on empty space — deselect
    this.selectedStrokeIndex.set(-1);
    this.redrawCanvas();

    if (tool === 'text') {
      this.textInputPosition.set(p);
      this.textValue = '';
      this.showTextInput.set(true);
      setTimeout(() => this.textInputRef?.nativeElement?.focus(), 0);
      return;
    }

    this.isDrawing.set(true);
    const color = this.currentColor();

    if (tool === 'pen') {
      this.currentStroke = { type: 'pen', color, width: 3, points: [p] };
    } else if (tool === 'arrow') {
      this.currentStroke = { type: 'arrow', color, width: 3, start: p, end: p };
    } else if (tool === 'rect') {
      this.currentStroke = { type: 'rect', color, width: 2, start: p, end: p };
    }
  }

  onMouseMove(e: MouseEvent) {
    if (this.isDraggingText) {
      const p = this.getPoint(e);
      this.textInputPosition.set({
        x: p.x - this.textDragOffset.x,
        y: p.y - this.textDragOffset.y,
      });
      return;
    }

    if (this.isDraggingSelected) {
      const p = this.getPoint(e);
      const idx = this.selectedStrokeIndex();
      if (idx >= 0) {
        this.strokes.update(strokes => strokes.map((s, i) => {
          if (i !== idx || s.type !== 'text') return s;
          return { ...s, position: { x: p.x - this.selectedDragOffset.x, y: p.y - this.selectedDragOffset.y } };
        }));
        this.redrawCanvas();
      }
      return;
    }

    if (!this.isDrawing() || !this.currentStroke) return;
    const p = this.getPoint(e);

    if (this.currentStroke.type === 'pen') {
      this.currentStroke.points.push(p);
    } else if (this.currentStroke.type === 'arrow' || this.currentStroke.type === 'rect') {
      this.currentStroke.end = p;
    }

    this.redrawCanvas();
  }

  onMouseUp() {
    if (this.isDraggingText) {
      this.isDraggingText = false;
      return;
    }
    if (this.isDraggingSelected) {
      this.isDraggingSelected = false;
      return;
    }
    if (!this.isDrawing() || !this.currentStroke) return;
    this.isDrawing.set(false);

    // Only commit if the stroke has meaningful content
    if (this.currentStroke.type === 'pen' && this.currentStroke.points.length > 1) {
      this.strokes.update(s => [...s, this.currentStroke!]);
    } else if (this.currentStroke.type === 'arrow' || this.currentStroke.type === 'rect') {
      const s = this.currentStroke;
      const dx = s.end.x - s.start.x;
      const dy = s.end.y - s.start.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        this.strokes.update(s => [...s, this.currentStroke!]);
      }
    }

    this.currentStroke = null;
    this.redrawCanvas();
  }

  // --- Text Tool ---

  onTextDragStart(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const p = this.getPoint(e);
    const pos = this.textInputPosition();
    this.isDraggingText = true;
    this.textDragOffset = { x: p.x - pos.x, y: p.y - pos.y };

    const onMove = (ev: MouseEvent) => {
      const pt = this.getPoint(ev);
      this.textInputPosition.set({
        x: pt.x - this.textDragOffset.x,
        y: pt.y - this.textDragOffset.y,
      });
    };

    const onUp = () => {
      this.isDraggingText = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onDoubleClick(e: MouseEvent) {
    const p = this.getPoint(e);
    const hitIdx = this.hitTestText(p);
    if (hitIdx >= 0) {
      this.editSelectedText(hitIdx);
    }
  }

  editSelectedText(idx: number) {
    const stroke = this.strokes()[idx];
    if (stroke.type !== 'text') return;

    // Open text input at the stroke's position with its current value
    this.editingStrokeIndex = idx;
    this.selectedStrokeIndex.set(-1);
    this.textInputPosition.set({ ...stroke.position });
    this.redrawCanvas(); // hide the stroke being edited
    this.textValue = stroke.text;
    this.showTextInput.set(true);
    setTimeout(() => {
      const input = this.textInputRef?.nativeElement;
      if (input) {
        input.value = stroke.text;
        input.focus();
        input.select();
      }
    }, 0);
  }

  commitText() {
    // Read directly from DOM — ngModel may not sync reliably in zoneless mode
    const val = (this.textInputRef?.nativeElement?.value ?? this.textValue).trim();
    const wasEditing = this.editingStrokeIndex;
    this.editingStrokeIndex = -1; // reset before redraw so the stroke isn't skipped

    if (val) {
      const stroke: Stroke = {
        type: 'text',
        color: this.currentColor(),
        position: { ...this.textInputPosition() },
        text: val,
        fontSize: 16,
      };

      if (wasEditing >= 0) {
        this.strokes.update(s => s.map((existing, i) =>
          i === wasEditing ? stroke : existing
        ));
      } else {
        this.strokes.update(s => [...s, stroke]);
      }
      this.redrawCanvas();
    } else if (wasEditing >= 0) {
      // Empty text while editing = delete the stroke
      this.strokes.update(s => s.filter((_, i) => i !== wasEditing));
      this.redrawCanvas();
    }
    this.showTextInput.set(false);
    this.textValue = '';
  }

  cancelText() {
    this.editingStrokeIndex = -1;
    this.showTextInput.set(false);
    this.textValue = '';
    this.redrawCanvas();
  }

  // --- Actions ---

  deleteSelected() {
    const idx = this.selectedStrokeIndex();
    if (idx < 0) return;
    this.strokes.update(s => s.filter((_, i) => i !== idx));
    this.selectedStrokeIndex.set(-1);
    this.redrawCanvas();
  }

  undo() {
    this.selectedStrokeIndex.set(-1);
    this.strokes.update(s => s.slice(0, -1));
    this.redrawCanvas();
  }

  clearAll() {
    this.selectedStrokeIndex.set(-1);
    this.strokes.set([]);
    this.redrawCanvas();
  }

  finish() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    // Clear selection indicator before exporting
    this.selectedStrokeIndex.set(-1);
    this.redrawCanvas();

    const allStrokes = this.strokes();
    this.done.emit({
      imageDataUrl: canvas.toDataURL('image/png'),
      annotations: {
        texts: allStrokes.filter(s => s.type === 'text').map(s => (s as Extract<Stroke, { type: 'text' }>).text),
        hasArrows: allStrokes.some(s => s.type === 'arrow'),
        hasRectangles: allStrokes.some(s => s.type === 'rect'),
        hasFreehand: allStrokes.some(s => s.type === 'pen'),
      },
    });
  }

  cancel() {
    this.cancelled.emit();
  }

  // --- Drawing ---

  private redrawCanvas() {
    const ctx = this.ctx;
    const canvas = this.canvasRef?.nativeElement;
    if (!ctx || !canvas) return;

    const w = canvas.width / this.dpr;
    const h = canvas.height / this.dpr;
    ctx.clearRect(0, 0, w, h);

    // Draw committed strokes (skip the one being edited)
    const allStrokes = this.strokes();
    const selectedIdx = this.selectedStrokeIndex();
    for (let i = 0; i < allStrokes.length; i++) {
      if (i === this.editingStrokeIndex) continue;
      this.drawStroke(ctx, allStrokes[i]);
    }

    // Draw selection indicator
    if (selectedIdx >= 0 && selectedIdx < allStrokes.length) {
      const sel = allStrokes[selectedIdx];
      if (sel.type === 'text') {
        const b = this.getTextBounds(sel);
        ctx.save();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
        ctx.restore();
      }
    }

    // Draw in-progress stroke
    if (this.currentStroke) {
      this.drawStroke(ctx, this.currentStroke);
    }
  }

  private drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    ctx.save();

    if (stroke.type === 'pen') {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const pts = stroke.points;
      if (pts.length > 0) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
      }
      ctx.stroke();
    } else if (stroke.type === 'arrow') {
      this.drawArrow(ctx, stroke.start, stroke.end, stroke.color, stroke.width);
    } else if (stroke.type === 'rect') {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      const x = Math.min(stroke.start.x, stroke.end.x);
      const y = Math.min(stroke.start.y, stroke.end.y);
      const w = Math.abs(stroke.end.x - stroke.start.x);
      const h = Math.abs(stroke.end.y - stroke.start.y);
      ctx.strokeRect(x, y, w, h);
    } else if (stroke.type === 'text') {
      ctx.font = `bold ${stroke.fontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      // Draw text with dark background for readability
      const metrics = ctx.measureText(stroke.text);
      const padding = 4;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(
        stroke.position.x - padding,
        stroke.position.y - padding,
        metrics.width + padding * 2,
        stroke.fontSize + padding * 2
      );
      ctx.fillStyle = stroke.color;
      ctx.fillText(stroke.text, stroke.position.x, stroke.position.y);
    }

    ctx.restore();
  }

  private drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, width: number) {
    const headLen = 14;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';

    // Shaft
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  // --- Hit Testing ---

  private getTextBounds(stroke: Extract<Stroke, { type: 'text' }>): { x: number; y: number; w: number; h: number } {
    const ctx = this.ctx;
    if (!ctx) return { x: 0, y: 0, w: 0, h: 0 };
    ctx.save();
    ctx.font = `bold ${stroke.fontSize}px sans-serif`;
    const metrics = ctx.measureText(stroke.text);
    ctx.restore();
    const padding = 4;
    return {
      x: stroke.position.x - padding,
      y: stroke.position.y - padding,
      w: metrics.width + padding * 2,
      h: stroke.fontSize + padding * 2,
    };
  }

  private hitTestText(p: Point): number {
    const strokes = this.strokes();
    // Search in reverse so topmost (last drawn) is hit first
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (s.type !== 'text') continue;
      const b = this.getTextBounds(s);
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        return i;
      }
    }
    return -1;
  }

  // --- Helpers ---

  private getPoint(e: MouseEvent): Point {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onKeyDown(e: KeyboardEvent) {
    if (!this.active()) return;

    // Don't handle keys while text input is focused
    if (this.showTextInput()) {
      if (e.key === 'Escape') this.cancelText();
      return;
    }

    if (e.key === 'Escape') {
      if (this.selectedStrokeIndex() >= 0) {
        this.selectedStrokeIndex.set(-1);
        this.redrawCanvas();
      } else {
        this.cancel();
      }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedStrokeIndex() >= 0) {
      e.preventDefault();
      this.deleteSelected();
    }
    if (e.key === 'Enter' && this.selectedStrokeIndex() >= 0) {
      e.preventDefault();
      this.editSelectedText(this.selectedStrokeIndex());
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      this.undo();
    }
  }

  // Popup CSS position: offset so input text content aligns with textInputPosition
  get popupLeft(): number {
    return this.textInputPosition().x - this.POPUP_OFFSET_X;
  }

  get popupTop(): number {
    return this.textInputPosition().y - this.POPUP_OFFSET_Y;
  }

  getCursor(): string {
    if (this.selectedStrokeIndex() >= 0) return 'move';
    switch (this.currentTool()) {
      case 'pen': return 'crosshair';
      case 'arrow': return 'crosshair';
      case 'rect': return 'crosshair';
      case 'text': return 'text';
      default: return 'crosshair';
    }
  }
}
