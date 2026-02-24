import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Skill } from '../../services/skills';

@Component({
  selector: 'app-ai-settings-popover',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-settings-popover.html',
  styleUrls: ['./ai-settings-popover.scss']
})
export class AiSettingsPopoverComponent {
  @Input() isOpen = false;
  @Input() position = { bottom: 0, left: 0 };
  @Input() availableModels: any[] = [];
  @Input() selectedModel: any = null;
  @Input() availableSkills: Skill[] = [];
  @Input() selectedSkill: Skill | null = null;
  @Input() reasoningEffort: 'low' | 'medium' | 'high' = 'high';

  @Output() closed = new EventEmitter<void>();
  @Output() modelChanged = new EventEmitter<any>();
  @Output() skillChanged = new EventEmitter<Skill | null>();
  @Output() reasoningEffortChanged = new EventEmitter<'low' | 'medium' | 'high'>();
}
