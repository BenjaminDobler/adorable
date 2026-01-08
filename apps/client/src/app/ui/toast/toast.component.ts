import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class]="toast.type" (click)="toastService.remove(toast.id)">
          {{ toast.message }}
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 10000;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      color: var(--text-primary);
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 0.875rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s cubic-bezier(0.2, 0, 0, 1);
      cursor: pointer;
      display: flex;
      align-items: center;
      min-width: 200px;
      
      &.success { border-left: 4px solid var(--accent-color); }
      &.error { border-left: 4px solid var(--error-color); }
      &.info { border-left: 4px solid var(--text-secondary); }
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);
}
