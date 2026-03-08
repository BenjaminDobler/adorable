import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-debug-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './debug-overlay.component.html',
  styleUrl: './debug-overlay.component.scss',
})
export class DebugOverlayComponent {
  logs = input<any[]>([]);
  visible = input(false);
  closed = output<void>();
}
