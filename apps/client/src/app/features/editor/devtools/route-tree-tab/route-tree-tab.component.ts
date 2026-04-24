import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DevtoolsService } from '../../../../core/services/devtools.service';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';

@Component({
  standalone: true,
  imports: [CommonModule, IconComponent],
  selector: 'app-route-tree-tab',
  templateUrl: './route-tree-tab.component.html',
  styleUrl: './route-tree-tab.component.scss',
})
export class RouteTreeTabComponent {
  devtools = inject(DevtoolsService);

  loadRoutes(): void {
    this.devtools.fetchRouteTree();
  }
}
