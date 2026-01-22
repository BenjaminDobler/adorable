import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-skill-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './skill-dialog.html',
  styleUrl: './skill-dialog.scss'
})
export class SkillDialogComponent implements OnInit {
  @Input() skill: any = null;
  @Output() save = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  name = '';
  description = '';
  instructions = '';
  triggers = '';

  ngOnInit() {
    if (this.skill) {
      this.name = this.skill.name || '';
      this.description = this.skill.description || '';
      // Strip frontmatter if present in instructions for editing? 
      // The API saves raw file. If we read it back, we get raw content.
      // For now, let's assume we are creating fresh or the user handles raw markdown.
      this.instructions = this.skill.instructions || '';
      this.triggers = (this.skill.triggers || []).join(', ');
    } else {
      // Template
      this.instructions = `# Skill Name

When this skill is active...

1. Rule 1
2. Rule 2`;
    }
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
