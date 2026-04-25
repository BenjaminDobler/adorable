import { Component, inject, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DevtoolsService } from '../../../core/services/devtools.service';

@Component({
  selector: 'app-tools-tester-panel',
  standalone: true,
  imports: [JsonPipe, FormsModule],
  templateUrl: './tools-tester-panel.component.html',
  styleUrl: './tools-tester-panel.component.scss',
})
export class ToolsTesterPanelComponent {
  devtools = inject(DevtoolsService);

  toolDefinitions = [
    // ── File Tools ──
    { category: 'File', name: 'read_file', description: 'Read a single file', params: [
      { name: 'path', type: 'string', placeholder: 'src/app/app.ts', required: true },
    ]},
    { category: 'File', name: 'read_files', description: 'Read multiple files at once', params: [
      { name: 'paths', type: 'text', placeholder: 'src/app/app.ts, src/main.ts (comma-separated)', required: true },
    ]},
    { category: 'File', name: 'write_file', description: 'Create or update a file', params: [
      { name: 'path', type: 'string', placeholder: 'src/app/new.ts', required: true },
      { name: 'content', type: 'text', placeholder: 'File content...', required: true },
    ]},
    { category: 'File', name: 'edit_file', description: 'Precise string replacement in a file', params: [
      { name: 'path', type: 'string', placeholder: 'src/app/app.ts', required: true },
      { name: 'old_str', type: 'text', placeholder: 'Old string to find', required: true },
      { name: 'new_str', type: 'text', placeholder: 'New string to replace with', required: true },
    ]},
    { category: 'File', name: 'delete_file', description: 'Delete a file', params: [
      { name: 'path', type: 'string', placeholder: 'src/app/old.ts', required: true },
    ]},
    { category: 'File', name: 'rename_file', description: 'Rename or move a file', params: [
      { name: 'old_path', type: 'string', placeholder: 'src/app/old.ts', required: true },
      { name: 'new_path', type: 'string', placeholder: 'src/app/new.ts', required: true },
    ]},
    { category: 'File', name: 'copy_file', description: 'Copy a file', params: [
      { name: 'source_path', type: 'string', placeholder: 'src/app/source.ts', required: true },
      { name: 'destination_path', type: 'string', placeholder: 'src/app/dest.ts', required: true },
    ]},
    { category: 'File', name: 'list_dir', description: 'List directory contents', params: [
      { name: 'path', type: 'string', placeholder: 'src/app', required: true },
    ]},
    { category: 'File', name: 'glob', description: 'Find files matching a pattern', params: [
      { name: 'pattern', type: 'string', placeholder: '**/*.ts', required: true },
    ]},
    { category: 'File', name: 'grep', description: 'Search for a string in files', params: [
      { name: 'pattern', type: 'string', placeholder: 'import.*Component', required: true },
      { name: 'path', type: 'string', placeholder: 'src/app (optional)', required: false },
      { name: 'case_sensitive', type: 'boolean', placeholder: '', required: false },
    ]},
    // ── Build & Run ──
    { category: 'Build', name: 'run_command', description: 'Execute a shell command', params: [
      { name: 'command', type: 'text', placeholder: 'ls -la', required: true },
    ]},
    { category: 'Build', name: 'verify_build', description: 'Run the project build command', params: [] },
    // ── CDP Browser Tools ──
    { category: 'Browser', name: 'browse_screenshot', description: 'Capture preview screenshot', params: [] },
    { category: 'Browser', name: 'browse_evaluate', description: 'Execute JS in preview', params: [
      { name: 'expression', type: 'text', placeholder: 'document.title', required: true },
    ]},
    { category: 'Browser', name: 'browse_console', description: 'Read console messages', params: [
      { name: 'clear', type: 'boolean', placeholder: '', required: false },
    ]},
    { category: 'Browser', name: 'browse_accessibility', description: 'Get accessibility tree', params: [] },
    { category: 'Browser', name: 'browse_navigate', description: 'Navigate preview to URL', params: [
      { name: 'url', type: 'string', placeholder: '/about', required: true },
    ]},
    { category: 'Browser', name: 'browse_click', description: 'Click at coordinates', params: [
      { name: 'x', type: 'number', placeholder: '100', required: true },
      { name: 'y', type: 'number', placeholder: '100', required: true },
    ]},
    // ── Angular Inspect Tools ──
    { category: 'Inspect', name: 'inspect_component', description: 'Component tree or details', params: [
      { name: 'selector', type: 'string', placeholder: 'app-root (optional)', required: false },
    ]},
    { category: 'Inspect', name: 'inspect_performance', description: 'Start/stop profiling', params: [
      { name: 'action', type: 'select', options: ['start', 'stop'], required: true },
    ]},
    { category: 'Inspect', name: 'inspect_routes', description: 'Get route configuration', params: [] },
    { category: 'Inspect', name: 'inspect_signals', description: 'Get signal graph', params: [] },
    { category: 'Inspect', name: 'inspect_errors', description: 'Parse build errors into structured data', params: [] },
    { category: 'Inspect', name: 'inspect_styles', description: 'Get computed CSS for an element', params: [
      { name: 'selector', type: 'string', placeholder: '.my-class, #id, app-root', required: true },
    ]},
    { category: 'Inspect', name: 'inspect_dom', description: 'Get HTML subtree for selector', params: [
      { name: 'selector', type: 'string', placeholder: 'main, .content', required: true },
      { name: 'depth', type: 'number', placeholder: '3 (default)', required: false },
    ]},
    { category: 'Inspect', name: 'inspect_network', description: 'Monitor HTTP requests', params: [
      { name: 'action', type: 'select', options: ['start', 'get', 'clear'], required: true },
    ]},
    { category: 'Inspect', name: 'measure_element', description: 'Get position, size, visibility', params: [
      { name: 'selector', type: 'string', placeholder: '.my-element', required: true },
    ]},
    { category: 'Inspect', name: 'get_bundle_stats', description: 'Get bundle size breakdown', params: [] },
    { category: 'Inspect', name: 'get_container_logs', description: 'Get dev server logs', params: [
      { name: 'lines', type: 'number', placeholder: '50 (default)', required: false },
    ]},
    // ── Interaction ──
    { category: 'Interact', name: 'type_text', description: 'Type text into focused element', params: [
      { name: 'text', type: 'string', placeholder: 'Hello{Enter}', required: true },
    ]},
    { category: 'Interact', name: 'inject_css', description: 'Inject temporary CSS', params: [
      { name: 'action', type: 'select', options: ['add', 'clear'], required: true },
      { name: 'css', type: 'text', placeholder: '.my-class { color: red; }', required: false },
    ]},
    { category: 'Interact', name: 'clear_build_cache', description: 'Clear Angular/Nx build caches', params: [] },
    // ── Other ──
    { category: 'Other', name: 'take_screenshot', description: 'Capture preview via iframe (cloud)', params: [] },
  ];

  categories = [...new Set(this.toolDefinitions.map(t => t.category))];

  getToolsByCategory(cat: string) {
    return this.toolDefinitions.filter(t => t.category === cat);
  }

  selectedTool = signal(this.toolDefinitions[0]);
  toolArgs: Record<string, any> = {};
  elapsedTime = signal('');
  private elapsedInterval: any = null;

  selectTool(tool: typeof this.toolDefinitions[0]): void {
    this.selectedTool.set(tool);
    this.toolArgs = {};
    this.devtools.toolResult.set('');
  }

  runTool(): void {
    const tool = this.selectedTool();
    const args: Record<string, any> = {};
    for (const p of tool.params) {
      if (this.toolArgs[p.name] !== undefined && this.toolArgs[p.name] !== '') {
        let val: any = this.toolArgs[p.name];
        if (p.type === 'number') val = Number(val);
        if (p.type === 'boolean') val = val === true || val === 'true';
        args[p.name] = val;
      }
    }

    // Start elapsed timer
    const startTime = Date.now();
    this.elapsedTime.set('0s');
    this.elapsedInterval = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      this.elapsedTime.set(`${seconds}s`);
    }, 1000);

    this.devtools.executeTool(tool.name, args).then(() => {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
      this.elapsedTime.set('');
    });
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString();
  }
}
