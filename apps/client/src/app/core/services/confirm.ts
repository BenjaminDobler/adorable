import { Injectable, signal } from '@angular/core';

export interface ConfirmDialog {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (result: boolean) => void;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmService {
  dialog = signal<ConfirmDialog | null>(null);

  confirm(message: string, confirmLabel = 'Confirm', cancelLabel = 'Cancel'): Promise<boolean> {
    return new Promise(resolve => {
      this.dialog.set({ message, confirmLabel, cancelLabel, resolve });
    });
  }

  accept() {
    const d = this.dialog();
    if (d) {
      d.resolve(true);
      this.dialog.set(null);
    }
  }

  cancel() {
    const d = this.dialog();
    if (d) {
      d.resolve(false);
      this.dialog.set(null);
    }
  }
}
