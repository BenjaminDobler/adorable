import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-cloud-blocked',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './cloud-blocked.html',
  styleUrl: './cloud-blocked.scss',
})
export class CloudBlockedComponent {
  githubReleasesUrl = 'https://github.com/BenjaminDobler/adorable/releases/latest';
}
