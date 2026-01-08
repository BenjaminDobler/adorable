import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'terminalFormat',
  standalone: true
})
export class TerminalFormatterPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(value: string): SafeHtml {
    if (!value) return '';
    
    // Escape HTML entities to prevent XSS
    let text = value.replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');

    // Handle common codes
    text = text.replace(/\x1B\[2K/g, ''); // Clear line
    text = text.replace(/\x1B\[1G/g, ''); // Move to start (cr)
    text = text.replace(/\x1B\[0K/g, ''); // Clear line to end
    
    // Remove spinner noise
    text = text.replace(/[\\|/-]{2,}/g, ''); // Sequence of spinner chars
    text = text.replace(/\s[\\|/-]\s/g, ''); // Single spinner char with spaces

    const colors: {[key: number]: string} = {
      30: '#000000', 31: '#ef4444', 32: '#22c55e', 33: '#eab308', 34: '#3b82f6', 35: '#a855f7', 36: '#06b6d4', 37: '#ffffff',
      90: '#737373', 91: '#f87171', 92: '#4ade80', 93: '#facc15', 94: '#60a5fa', 95: '#c084fc', 96: '#22d3ee', 97: '#ffffff'
    };

    // Split by ANSI escape sequences \x1B[...m
    const parts = text.split(/\x1B\[(\d+)m/);
    let html = '';
    let currentSpan = false;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i % 2 === 1) { // It's a code
        const code = parseInt(part, 10);
        if (code === 0) {
          if (currentSpan) { html += '</span>'; currentSpan = false; }
        } else if (code === 1) {
          if (currentSpan) html += '</span>'; 
          html += '<span style="font-weight:bold">';
          currentSpan = true;
        } else if (colors[code]) {
          if (currentSpan) html += '</span>';
          html += `<span style="color:${colors[code]}">`;
          currentSpan = true;
        }
      } else {
        html += part;
      }
    }
    
    if (currentSpan) html += '</span>';

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
