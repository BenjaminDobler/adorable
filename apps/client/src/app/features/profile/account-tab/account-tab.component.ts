import { Component, input, output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ThemeService, ThemeType, ThemeMode } from '../../../core/services/theme';
import { FileExplorerState } from '../../editor/file-explorer/file-explorer';
import { AppSettings } from '../profile.types';

@Component({
  selector: 'app-account-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './account-tab.component.html',
  styleUrl: './account-tab.component.scss',
})
export class AccountTabComponent {
  themeService = inject(ThemeService);
  fileExplorerState = inject(FileExplorerState);

  user = input<any>(null);
  name = input('');
  settings = input.required<AppSettings>();

  nameChange = output<string>();
  themeTypeChange = output<ThemeType>();
  themeModeChange = output<ThemeMode>();
}
