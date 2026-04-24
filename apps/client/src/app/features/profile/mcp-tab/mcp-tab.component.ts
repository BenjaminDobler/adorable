import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { MCPServerConfig } from '../profile.types';

@Component({
  selector: 'app-mcp-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './mcp-tab.component.html',
  styleUrl: './mcp-tab.component.scss',
})
export class McpTabComponent {
  private apiService = inject(ApiService);
  private destroyRef = inject(DestroyRef);

  mcpServers = input<MCPServerConfig[]>([]);
  angularMcpEnabled = input(true);
  kitLessonsEnabled = input(true);
  researchAgentEnabled = input(true);
  reviewAgentEnabled = input(true);
  isDesktopMode = input(false);

  serversChange = output<MCPServerConfig[]>();
  angularMcpToggle = output<boolean>();
  kitLessonsToggle = output<boolean>();
  researchAgentToggle = output<boolean>();
  reviewAgentToggle = output<boolean>();

  editingMcpServer = signal<MCPServerConfig | null>(null);
  testingConnection = signal(false);
  connectionTestResult = signal<{success: boolean; error?: string; toolCount?: number} | null>(null);

  addMcpServer() {
    this.editingMcpServer.set({
      id: crypto.randomUUID(),
      name: 'New Server',
      transport: 'http',
      url: '',
      authType: 'none',
      enabled: true
    });
    this.connectionTestResult.set(null);
  }

  editMcpServer(server: MCPServerConfig) {
    this.editingMcpServer.set({ ...server });
    this.connectionTestResult.set(null);
  }

  cancelMcpEdit() {
    this.editingMcpServer.set(null);
    this.connectionTestResult.set(null);
  }

  testMcpConnection() {
    const server = this.editingMcpServer();
    if (!server) return;

    this.testingConnection.set(true);
    this.connectionTestResult.set(null);

    this.apiService.testMcpConnection({
      transport: server.transport || 'http',
      url: server.url,
      authType: server.authType,
      apiKey: server.apiKey,
      name: server.name,
      command: server.command,
      args: server.args,
      env: server.env
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.connectionTestResult.set(result);
        this.testingConnection.set(false);
      },
      error: (err) => {
        this.connectionTestResult.set({
          success: false,
          error: err.error?.error || err.message || 'Connection failed'
        });
        this.testingConnection.set(false);
      }
    });
  }

  saveMcpServer() {
    const server = this.editingMcpServer();
    if (!server) return;

    const currentServers = this.mcpServers();
    const existingIndex = currentServers.findIndex(s => s.id === server.id);

    let updatedServers: MCPServerConfig[];
    if (existingIndex >= 0) {
      updatedServers = [...currentServers];
      updatedServers[existingIndex] = server;
    } else {
      updatedServers = [...currentServers, server];
    }

    this.editingMcpServer.set(null);
    this.connectionTestResult.set(null);
    this.serversChange.emit(updatedServers);
  }

  deleteMcpServer(id: string) {
    const updated = this.mcpServers().filter(s => s.id !== id);
    this.serversChange.emit(updated);
  }

  toggleMcpServer(id: string) {
    const updated = this.mcpServers().map(s =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    this.serversChange.emit(updated);
  }

  updateEditingMcpServer(updates: Partial<MCPServerConfig>) {
    const current = this.editingMcpServer();
    if (current) {
      this.editingMcpServer.set({ ...current, ...updates });
    }
  }

  formatEnvVars(env?: Record<string, string>): string {
    if (!env) return '';
    return Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
  }

  parseEnvVars(text: string): Record<string, string> {
    if (!text.trim()) return {};
    const result: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1);
        if (key) result[key] = value;
      }
    }
    return result;
  }

  formatArgs(args?: string[]): string {
    return args?.join(' ') || '';
  }

  parseArgs(text: string): string[] {
    return text ? text.split(' ').filter(a => a.trim()) : [];
  }
}
