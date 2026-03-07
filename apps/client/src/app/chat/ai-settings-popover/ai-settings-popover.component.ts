import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Skill } from '../../services/skills';

@Component({
  selector: 'app-ai-settings-popover',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './ai-settings-popover.html',
  styleUrls: ['./ai-settings-popover.scss']
})
export class AiSettingsPopoverComponent {
  isOpen = input(false);
  position = input({ bottom: 0, left: 0 });
  availableModels = input<any[]>([]);
  selectedModel = input<any>(null);
  availableSkills = input<Skill[]>([]);
  selectedSkill = input<Skill | null>(null);
  reasoningEffort = input<'low' | 'medium' | 'high'>('high');

  closed = output<void>();
  modelChanged = output<any>();
  skillChanged = output<Skill | null>();
  reasoningEffortChanged = output<'low' | 'medium' | 'high'>();
}
