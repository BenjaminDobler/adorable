import { Component, inject, signal, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContainerEngine } from '../../../core/services/container-engine';
import { TerminalFormatterPipe } from '../../../shared/pipes/terminal-formatter.pipe';

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [DatePipe, FormsModule, TerminalFormatterPipe],
  templateUrl: './terminal.html',
  styleUrls: ['./terminal.scss']
})
export class TerminalComponent {
  public containerEngine = inject(ContainerEngine);

  terminalTab = signal<'server' | 'shell' | 'console'>('server');
  terminalInput = '';

  toggleDebug = output<void>();

  restarting = signal(false);

  async restartDevServer() {
    this.restarting.set(true);
    try {
      await this.containerEngine.stopDevServer();
      await new Promise(r => setTimeout(r, 1000));
      await this.containerEngine.startDevServer();
    } finally {
      this.restarting.set(false);
    }
  }

  sendTerminalCommand() {
    if (!this.terminalInput) return;
    this.containerEngine.writeToShell(this.terminalInput + '\n');
    this.terminalInput = '';
  }
}

