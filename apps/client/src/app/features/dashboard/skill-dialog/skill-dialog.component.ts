import { Component, input, output, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-skill-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './skill-dialog.html',
  styleUrl: './skill-dialog.scss'
})
export class SkillDialogComponent {
  skill = input<any>(null);
  save = output<any>();
  cancel = output<void>();

  name = '';
  description = '';
  instructions = '';
  triggers = '';

  constructor() {
    effect(() => {
      const s = this.skill();
      if (s) {
        this.name = s.name || '';
        this.description = s.description || '';
        this.instructions = s.instructions || '';
        this.triggers = (s.triggers || []).join(', ');
      } else {
        this.instructions = `# Skill Name

When this skill is active...

1. Rule 1
2. Rule 2`;
      }
    });
  }

  onSubmit() {
    this.save.emit({
      name: this.name,
      description: this.description,
      instructions: this.instructions,
      triggers: this.triggers.split(',').map(t => t.trim()).filter(t => t)
    });
  }
}
