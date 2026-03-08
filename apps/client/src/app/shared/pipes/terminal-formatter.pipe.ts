import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
// @ts-ignore
import Convert from 'ansi-to-html';

@Pipe({
  name: 'terminalFormat',
  standalone: true
})
export class TerminalFormatterPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);
  private converter = new Convert({
    fg: '#e5e7eb',
    bg: 'transparent',
    newline: true,
    escapeXML: true,
    colors: {
      0: '#000000',
      1: '#ef4444', // red
      2: '#22c55e', // green
      3: '#eab308', // yellow
      4: '#3b82f6', // blue
      5: '#a855f7', // magenta
      6: '#06b6d4', // cyan
      7: '#ffffff',
    }
  });

  transform(value: string): SafeHtml {
    if (!value) return '';
    
    // Aggressively strip known problematic codes that ansi-to-html might miss or render as symbols
    // OSC codes (window title), Cursor hide/show, etc.
    // eslint-disable-next-line no-control-regex
    let clean = value.replace(/\x1B\][0-9];.*?\x07/g, '')
                     .replace(/\x1B\[\??\d*[a-ln-z]/gi, '');

    // Handle carriage returns that are often used for progress bars in shell
    // In a simple log view, we'll just treat them as newlines if they are followed by content, 
    // or just strip them to avoid the [0K noise.
    clean = clean.replace(/\x1B\[0K/g, '');

    const html = this.converter.toHtml(clean);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
