import { Component, input, output, effect, viewChild, ElementRef, signal } from '@angular/core';
import { SlashCommandItem } from '../../../../core/services/slash-commands';

@Component({
  selector: 'app-slash-command-dropdown',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="slash-dropdown" #dropdownEl>
        @for (item of items(); track item.id; let i = $index) {
          <div
            class="slash-item"
            [class.active]="i === activeIndex()"
            (mousedown)="onItemMousedown($event, item)"
            (mouseenter)="hoveredIndex.set(i)">
            <span class="slash-label">{{ item.label }}</span>
            <span class="slash-desc">{{ item.description }}</span>
          </div>
        }
        @if (items().length === 0) {
          <div class="slash-empty">No matching commands</div>
        }
      </div>
    }
  `,
  styles: [`
    .slash-dropdown {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      margin-bottom: 4px;
      background: var(--bg-surface-2);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xl);
      max-height: 260px;
      overflow-y: auto;
      z-index: 100;
      padding: 4px;
    }

    .slash-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: background 0.1s;

      &:hover, &.active {
        background: rgba(255, 255, 255, 0.06);
      }

      &.active {
        background: var(--accent-glow);
      }
    }

    .slash-label {
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--text-primary);
      white-space: nowrap;
    }

    .slash-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .slash-empty {
      padding: 12px;
      font-size: 0.8rem;
      color: var(--text-muted);
      text-align: center;
    }
  `]
})
export class SlashCommandDropdownComponent {
  private dropdownEl = viewChild<ElementRef>('dropdownEl');

  items = input<SlashCommandItem[]>([]);
  visible = input(false);
  activeIndex = input(0);

  itemSelected = output<SlashCommandItem>();

  hoveredIndex = signal(-1);

  constructor() {
    // Auto-scroll active item into view
    effect(() => {
      const idx = this.activeIndex();
      const el = this.dropdownEl()?.nativeElement;
      if (!el) return;
      const activeEl = el.children[idx] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  onItemMousedown(event: Event, item: SlashCommandItem) {
    event.preventDefault(); // Prevent textarea blur
    this.itemSelected.emit(item);
  }
}
