import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-mcp-tools-panel',
  standalone: true,
  imports: [],
  templateUrl: './mcp-tools-panel.html',
  styleUrls: ['./mcp-tools-panel.scss']
})
export class McpToolsPanelComponent {
  @Input() visible = false;
  @Input() loading = false;
  @Input() servers: { id: string; name: string; url: string; enabled: boolean }[] = [];
  @Input() tools: { name: string; originalName: string; description: string; serverId: string }[] = [];

  @Output() closed = new EventEmitter<void>();

  getToolsForServer(serverId: string) {
    return this.tools.filter(t => t.serverId === serverId);
  }
}
