import { Route } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard';
import { UsersComponent } from './users/users';
import { InvitesComponent } from './invites/invites';
import { SettingsComponent } from './settings/settings';
import { TeamsComponent } from './teams/teams';
import { TeamDetailComponent } from './team-detail/team-detail';
import { ContainersComponent } from './containers/containers';

export const appRoutes: Route[] = [
  { path: '', component: DashboardComponent },
  { path: 'users', component: UsersComponent },
  { path: 'teams', component: TeamsComponent },
  { path: 'teams/:id', component: TeamDetailComponent },
  { path: 'containers', component: ContainersComponent },
  { path: 'invites', component: InvitesComponent },
  { path: 'settings', component: SettingsComponent },
  { path: '**', redirectTo: '' },
];
