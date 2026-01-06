import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfileComponent {
  @Input() user: any;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<{ name: string }>();

  name = signal('');

  ngOnInit() {
    if (this.user) {
      this.name.set(this.user.name || '');
    }
  }

  saveProfile() {
    this.save.emit({ name: this.name() });
  }
}