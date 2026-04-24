import { Component, computed, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ICONS } from '../icons';

@Component({
  standalone: true,
  selector: 'app-icon',
  template: `<span [innerHTML]="safeHtml()"></span>`,
  styles: `
    :host { display: inline-flex; align-items: center; justify-content: center; }
    span { display: inline-flex; line-height: 0; }
  `,
})
export class IconComponent {
  name = input.required<string>();
  size = input(14);
  strokeWidth = input(2);
  fill = input('none');

  private sanitizer: DomSanitizer;

  constructor(sanitizer: DomSanitizer) {
    this.sanitizer = sanitizer;
  }

  safeHtml = computed(() => {
    const paths = ICONS[this.name()];
    if (!paths) return '';
    const svg = `<svg viewBox="0 0 24 24" width="${this.size()}" height="${this.size()}" stroke="currentColor" stroke-width="${this.strokeWidth()}" fill="${this.fill()}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });
}
