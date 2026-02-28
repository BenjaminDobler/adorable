import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { Team, TeamMember, TeamInvite, TeamRole } from '@adorable/shared-types';
import { getServerUrl } from './server-url';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private http = inject(HttpClient);
  private apiUrl = getServerUrl() + '/api/teams';

  teams = signal<Team[]>([]);
  selectedTeamId = signal<string | null>(null);

  selectedTeam = computed(() => {
    const id = this.selectedTeamId();
    if (!id) return null;
    return this.teams().find(t => t.id === id) ?? null;
  });

  // ---- Team CRUD ----

  loadTeams(): Observable<Team[]> {
    return this.http.get<{ teams: Team[] }>(this.apiUrl).pipe(
      map(res => res.teams),
      tap(teams => this.teams.set(teams))
    );
  }

  refreshTeams(): void {
    this.loadTeams().subscribe();
  }

  createTeam(name: string): Observable<Team> {
    return this.http.post<{ success: boolean; team: Team }>(this.apiUrl, { name }).pipe(
      map(res => res.team),
      tap(() => this.refreshTeams())
    );
  }

  getTeam(teamId: string): Observable<{ team: any; myRole: TeamRole }> {
    return this.http.get<{ team: any; myRole: TeamRole }>(`${this.apiUrl}/${teamId}`);
  }

  updateTeam(teamId: string, data: { name?: string; slug?: string }): Observable<Team> {
    return this.http.put<{ success: boolean; team: Team }>(`${this.apiUrl}/${teamId}`, data).pipe(
      map(res => res.team),
      tap(() => this.refreshTeams())
    );
  }

  deleteTeam(teamId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${teamId}`).pipe(
      tap(() => {
        if (this.selectedTeamId() === teamId) {
          this.selectedTeamId.set(null);
        }
        this.refreshTeams();
      })
    );
  }

  // ---- Membership ----

  joinTeam(code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/join`, { code }).pipe(
      tap(() => this.refreshTeams())
    );
  }

  getMembers(teamId: string): Observable<TeamMember[]> {
    return this.http.get<{ members: TeamMember[] }>(`${this.apiUrl}/${teamId}/members`).pipe(
      map(res => res.members)
    );
  }

  changeMemberRole(teamId: string, memberId: string, role: TeamRole): Observable<any> {
    return this.http.put(`${this.apiUrl}/${teamId}/members/${memberId}/role`, { role });
  }

  removeMember(teamId: string, memberId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${teamId}/members/${memberId}`);
  }

  transferOwnership(teamId: string, newOwnerMemberId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${teamId}/transfer-ownership`, { newOwnerMemberId });
  }

  // ---- Invites ----

  createInvite(teamId: string, data: { email?: string; role?: string; expiresInDays?: number }): Observable<TeamInvite> {
    return this.http.post<{ success: boolean; invite: TeamInvite }>(`${this.apiUrl}/${teamId}/invites`, data).pipe(
      map(res => res.invite)
    );
  }

  getInvites(teamId: string): Observable<TeamInvite[]> {
    return this.http.get<{ invites: TeamInvite[] }>(`${this.apiUrl}/${teamId}/invites`).pipe(
      map(res => res.invites)
    );
  }

  revokeInvite(teamId: string, inviteId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${teamId}/invites/${inviteId}`);
  }

  // ---- Resource Movement ----

  moveProjectToTeam(teamId: string, projectId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${teamId}/projects/${projectId}`, {});
  }

  removeProjectFromTeam(teamId: string, projectId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${teamId}/projects/${projectId}`);
  }

  moveKitToTeam(teamId: string, kitId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${teamId}/kits/${kitId}`, {});
  }

  removeKitFromTeam(teamId: string, kitId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${teamId}/kits/${kitId}`);
  }
}
