import { Component, input, output, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface PreviewDimensions {
  width: number | null;  // null = responsive (100%)
  height: number | null; // null = responsive (100%)
  scale: number;         // 1 = 100%, 0.75 = 75%, etc. 0 = fit-to-window
}

interface DevicePreset {
  label: string;
  width: number | null;
  height: number | null;
}

const DEVICE_PRESETS: DevicePreset[] = [
  { label: 'Responsive', width: null, height: null },
  { label: 'iPhone SE', width: 375, height: 667 },
  { label: 'iPhone 14 Pro', width: 393, height: 852 },
  { label: 'iPhone 16 Pro Max', width: 440, height: 956 },
  { label: 'iPad Mini', width: 768, height: 1024 },
  { label: 'iPad Pro 12.9"', width: 1024, height: 1366 },
  { label: 'Laptop', width: 1366, height: 768 },
  { label: 'Desktop HD', width: 1920, height: 1080 },
];

@Component({
  selector: 'app-preview-toolbar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './preview-toolbar.component.html',
  styleUrl: './preview-toolbar.component.scss',
})
export class PreviewToolbarComponent {
  previewDevice = input<'desktop' | 'tablet' | 'phone'>('desktop');
  isFullscreen = input(false);
  isUndocked = input(false);
  isDesktop = input(false);

  previewDeviceChange = output<'desktop' | 'tablet' | 'phone'>();
  dimensionsChange = output<PreviewDimensions>();
  screenshotRequested = output<void>();
  fullscreenToggled = output<void>();
  reload = output<void>();
  undockToggled = output<void>();
  devtoolsRequested = output<void>();

  // Device toolbar state
  deviceToolbarOpen = signal(false);
  customWidth = signal<number | null>(null);
  customHeight = signal<number | null>(null);
  scale = signal<number>(1);
  selectedPresetLabel = signal('Responsive');
  presets = DEVICE_PRESETS;

  isCustomDimensions = computed(() => this.customWidth() !== null || this.customHeight() !== null);

  toggleDeviceToolbar() {
    this.deviceToolbarOpen.update(v => !v);
  }

  selectPreset(preset: DevicePreset) {
    this.customWidth.set(preset.width);
    this.customHeight.set(preset.height);
    this.selectedPresetLabel.set(preset.label);
    this.emitDimensions();
  }

  onWidthChange(value: string) {
    const num = parseInt(value, 10);
    this.customWidth.set(isNaN(num) || num <= 0 ? null : num);
    this.selectedPresetLabel.set('Custom');
    this.emitDimensions();
  }

  onHeightChange(value: string) {
    const num = parseInt(value, 10);
    this.customHeight.set(isNaN(num) || num <= 0 ? null : num);
    this.selectedPresetLabel.set('Custom');
    this.emitDimensions();
  }

  swapDimensions() {
    const w = this.customWidth();
    const h = this.customHeight();
    this.customWidth.set(h);
    this.customHeight.set(w);
    this.selectedPresetLabel.set('Custom');
    this.emitDimensions();
  }

  setScale(value: number) {
    this.scale.set(value);
    this.emitDimensions();
  }

  onScaleInput(value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0 && num <= 200) {
      this.scale.set(num / 100);
      this.emitDimensions();
    }
  }

  private emitDimensions() {
    this.dimensionsChange.emit({
      width: this.customWidth(),
      height: this.customHeight(),
      scale: this.scale(),
    });
  }
}
