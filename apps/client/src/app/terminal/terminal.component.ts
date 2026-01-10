import { Component, inject, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebContainerService } from '../services/web-container';
import { TerminalFormatterPipe } from '../pipes/terminal-formatter.pipe';
import { ProjectService } from '../services/project';

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [CommonModule, FormsModule, TerminalFormatterPipe],
  templateUrl: './terminal.html',
  styleUrls: ['./terminal.scss']
})
export class TerminalComponent {
  public webContainerService = inject(WebContainerService);
  public projectService = inject(ProjectService); // For debugging potentially? Or maybe just webContainer is enough.

  terminalTab = signal<'server' | 'shell' | 'console'>('server');
  terminalInput = '';

  @Output() toggleDebug = new EventEmitter<void>();

  sendTerminalCommand() {
    if (!this.terminalInput) return;
    this.webContainerService.writeToShell(this.terminalInput + '\n');
    this.terminalInput = '';
  }
}

