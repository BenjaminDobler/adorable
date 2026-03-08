import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-about-tab',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './about-tab.component.html',
  styleUrl: './about-tab.component.scss',
})
export class AboutTabComponent {
  isDesktopMode = input(false);
  legalBaseUrl = input('');
}
