import { Component, input, output, inject, ElementRef, HostListener } from '@angular/core';

@Component({
  selector: 'app-popover',
  standalone: true,
  template: `
    @if (open()) {
      <div class="popover-panel">
        <ng-content></ng-content>
      </div>
    }
  `,
  styleUrl: './popover.component.scss',
})
export class PopoverComponent {
  open = input(false);
  closed = output();

  private el = inject(ElementRef);

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.open()) return;
    const parent = this.el.nativeElement.parentElement;
    if (parent && !parent.contains(event.target as Node)) {
      this.closed.emit();
    }
  }
}
