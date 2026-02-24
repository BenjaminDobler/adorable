import { Route } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard';
import { UsersComponent } from './users/users';
import { InvitesComponent } from './invites/invites';
import { SettingsComponent } from './settings/settings';

export const appRoutes: Route[] = [
  { path: '', component: DashboardComponent },
  { path: 'users', component: UsersComponent },
  { path: 'invites', component: InvitesComponent },
  { path: 'settings', component: SettingsComponent },
  { path: '**', redirectTo: '' },
];
