import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  afterNextRender,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ContainerEngine } from '../../../core/services/container-engine';
import { TerminalFormatterPipe } from '../../../shared/pipes/terminal-formatter.pipe';

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [DatePipe, TerminalFormatterPipe],
  templateUrl: './terminal.html',
  styleUrls: ['./terminal.scss']
})
export class TerminalComponent implements OnDestroy {
  public containerEngine = inject(ContainerEngine);

  terminalTab = signal<'server' | 'shell' | 'console'>('server');

  toggleDebug = output<void>();

  restarting = signal(false);

  @ViewChild('xtermHost', { static: false })
  private xtermHost?: ElementRef<HTMLDivElement>;

  private term?: Terminal;
  private fit?: FitAddon;
  private dataSub?: Subscription;
  private resizeObserver?: ResizeObserver;

  constructor() {
    void this.containerEngine.startShell();

    afterNextRender(() => this.initXterm());

    // Refit when the user switches to the shell tab — xterm needs a sized
    // container, and tab switches can change layout.
    effect(() => {
      if (this.terminalTab() === 'shell') {
        queueMicrotask(() => this.refit());
      }
    });
  }

  private initXterm() {
    if (this.term || !this.xtermHost) return;

    this.term = new Terminal({
      fontFamily: '"JetBrains Mono", "Menlo", monospace',
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      theme: {
        background: '#000000',
        foreground: '#e5e7eb',
        cursor: '#3ecf8e',
        cursorAccent: '#000000',
      },
    });
    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.open(this.xtermHost.nativeElement);
    this.refit();

    // Forward keystrokes to the PTY
    this.term.onData((data) => {
      void this.containerEngine.writeToShell(data);
    });

    // Pipe PTY output into xterm
    this.dataSub = this.containerEngine.shellData$.subscribe((chunk) => {
      this.term?.write(chunk);
    });

    // Keep PTY size in sync with the rendered grid
    this.resizeObserver = new ResizeObserver(() => this.refit());
    this.resizeObserver.observe(this.xtermHost.nativeElement);
  }

  private refit() {
    if (!this.term || !this.fit || !this.xtermHost) return;
    if (!this.xtermHost.nativeElement.isConnected) return;
    if (this.xtermHost.nativeElement.clientWidth === 0) return;
    try {
      this.fit.fit();
      void this.containerEngine.resizeShell(this.term.cols, this.term.rows);
    } catch { /* container not ready yet */ }
  }

  clearShell() {
    this.term?.clear();
    this.containerEngine.clearShellOutput();
  }

  async restartDevServer() {
    this.restarting.set(true);
    try {
      await this.containerEngine.stopDevServer();
      await new Promise((r) => setTimeout(r, 1000));
      await this.containerEngine.startDevServer();
    } finally {
      this.restarting.set(false);
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.dataSub?.unsubscribe();
    this.term?.dispose();
  }
}
