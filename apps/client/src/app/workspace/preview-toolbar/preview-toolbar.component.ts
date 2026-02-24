import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-preview-toolbar',
  standalone: true,
  templateUrl: './preview-toolbar.component.html',
  styleUrl: './preview-toolbar.component.scss',
})
export class PreviewToolbarComponent {
  previewDevice = input<'desktop' | 'tablet' | 'phone'>('desktop');
  isInspectionActive = input(false);
  isAnnotating = input(false);
  isFullscreen = input(false);

  previewDeviceChange = output<'desktop' | 'tablet' | 'phone'>();
  inspectionToggled = output<void>();
  annotationToggled = output<void>();
  screenshotRequested = output<void>();
  fullscreenToggled = output<void>();
  reload = output<void>();
}
