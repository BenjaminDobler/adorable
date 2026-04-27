import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ProjectService } from '../../../core/services/project';
import { ContainerEngine } from '../../../core/services/container-engine';
import { ToastService } from '../../../core/services/toast';

export interface VisualEditHistoryEntry {
  /** Source file path. */
  path: string;
  before: string;
  after: string;
  /** Stable key used for coalescing rapid edits to the same property on the same element. */
  coalesceKey: string;
  /** Human-readable description for the toast (e.g. "border-radius"). */
  label: string;
  timestamp: number;
}

const MAX_STACK = 100;
const COALESCE_WINDOW_MS = 500;

@Injectable({ providedIn: 'root' })
export class VisualEditHistoryService {
  private projectService = inject(ProjectService);
  private containerEngine = inject(ContainerEngine);
  private toast = inject(ToastService);

  private undoStack = signal<VisualEditHistoryEntry[]>([]);
  private redoStack = signal<VisualEditHistoryEntry[]>([]);

  // True while we're applying our own write so the file-watcher effect doesn't
  // misread our undo/redo as an "external" write.
  private applying = false;

  /** Tracks the most recent content this service wrote, per path. Anything that
   *  diverges from this has been written by someone else (Monaco, AI, watcher) and
   *  should invalidate that path's entries. */
  private lastWrittenByPath = new Map<string, string>();

  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);
  readonly nextUndoLabel = computed(() => {
    const stack = this.undoStack();
    return stack.length > 0 ? stack[stack.length - 1].label : null;
  });
  readonly nextRedoLabel = computed(() => {
    const stack = this.redoStack();
    return stack.length > 0 ? stack[stack.length - 1].label : null;
  });

  constructor() {
    // Detect external writes to any path that has pending undo entries —
    // Monaco, AI generation, file-watcher — and drop those entries so undo
    // can't clobber the new content.
    effect(() => {
      const files = this.projectService.fileStore.files();
      if (this.applying) return;
      // Only inspect paths we actually track to keep this O(tracked-paths)
      // rather than O(total-files).
      const tracked = new Set([
        ...this.undoStack().map((e) => e.path),
        ...this.redoStack().map((e) => e.path),
        ...this.lastWrittenByPath.keys(),
      ]);
      for (const path of tracked) {
        const current = this.projectService.fileStore.getFileContent(path);
        if (current === null) continue;
        const lastWritten = this.lastWrittenByPath.get(path);
        if (lastWritten !== undefined && current !== lastWritten) {
          this.invalidatePath(path);
        }
      }
      // Suppress the unused-files warning — the effect's purpose is the read.
      void files;
    });

    // Global Cmd/Ctrl+Z. Skip when the user is typing in an editable element
    // (text input, textarea, contentEditable, Monaco) so the native undo wins.
    document.addEventListener('keydown', this.onKeyDown);
  }

  /**
   * Push a new history entry. Coalesces with the top entry when the user is
   * dragging a slider or otherwise hammering the same property on the same
   * element within COALESCE_WINDOW_MS — the original `before` is preserved,
   * `after` advances, so undo still jumps back to the pre-drag state.
   */
  push(entry: Omit<VisualEditHistoryEntry, 'timestamp'>): void {
    const stamped: VisualEditHistoryEntry = { ...entry, timestamp: Date.now() };
    this.undoStack.update((stack) => {
      const top = stack[stack.length - 1];
      const coalesce =
        top &&
        top.path === stamped.path &&
        top.coalesceKey === stamped.coalesceKey &&
        stamped.timestamp - top.timestamp < COALESCE_WINDOW_MS;

      if (coalesce) {
        const merged: VisualEditHistoryEntry = {
          ...top,
          after: stamped.after,
          timestamp: stamped.timestamp,
          label: stamped.label,
        };
        return [...stack.slice(0, -1), merged];
      }
      const next = [...stack, stamped];
      if (next.length > MAX_STACK) next.shift();
      return next;
    });
    this.redoStack.set([]);
    this.lastWrittenByPath.set(entry.path, entry.after);
  }

  async undo(): Promise<void> {
    const top = this.undoStack()[this.undoStack().length - 1];
    if (!top) return;
    this.undoStack.update((s) => s.slice(0, -1));
    this.redoStack.update((s) => [...s, top]);
    await this.applyContent(top.path, top.before);
    this.toast.show(`Undid ${top.label}`, 'info');
  }

  async redo(): Promise<void> {
    const top = this.redoStack()[this.redoStack().length - 1];
    if (!top) return;
    this.redoStack.update((s) => s.slice(0, -1));
    this.undoStack.update((s) => [...s, top]);
    await this.applyContent(top.path, top.after);
    this.toast.show(`Redid ${top.label}`, 'info');
  }

  /** Drop every entry that touches `path`. Used when an external write appears. */
  invalidatePath(path: string): void {
    this.undoStack.update((s) => s.filter((e) => e.path !== path));
    this.redoStack.update((s) => s.filter((e) => e.path !== path));
    this.lastWrittenByPath.delete(path);
  }

  private async applyContent(path: string, content: string): Promise<void> {
    this.applying = true;
    try {
      this.projectService.fileStore.updateFile(path, content);
      await this.containerEngine.writeFile(path, content);
      this.lastWrittenByPath.set(path, content);
    } finally {
      this.applying = false;
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    const isModUndo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z';
    if (!isModUndo) return;
    if (this.isInEditableElement(e.target)) return;

    e.preventDefault();
    if (e.shiftKey) {
      void this.redo();
    } else {
      void this.undo();
    }
  };

  private isInEditableElement(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    if (target.closest('.monaco-editor')) return true;
    return false;
  }
}
