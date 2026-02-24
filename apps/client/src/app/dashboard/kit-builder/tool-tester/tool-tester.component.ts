import { Component, signal, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../services/api';

@Component({
  selector: 'app-tool-tester',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tool-tester.component.html',
  styleUrl: './tool-tester.component.scss'
})
export class ToolTesterComponent {
  private apiService = inject(ApiService);

  kitId = input<string | null>(null);
  hasComponents = input(false);

  selectedTestTool = signal<string>('list_components');
  testComponentName = signal('');
  testingTool = signal(false);
  toolTestResult = signal<string | null>(null);
  toolTestError = signal(false);

  async testTool() {
    const id = this.kitId();
    if (!id) return;

    this.testingTool.set(true);
    this.toolTestResult.set(null);
    this.toolTestError.set(false);

    try {
      const tool = this.selectedTestTool();
      let args: any = {};

      if (tool === 'get_component') {
        args = { name: this.testComponentName() || 'Button' };
      }

      const result = await this.apiService.previewKitTool(id, tool, args).toPromise();

      if (result) {
        this.toolTestResult.set(result.output);
        this.toolTestError.set(result.isError);
      }
    } catch (error: any) {
      this.toolTestResult.set(error.error?.error || error.message || 'Test failed');
      this.toolTestError.set(true);
    } finally {
      this.testingTool.set(false);
    }
  }
}
