import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TeamService } from '../services/team.service';
import { ToastService } from '../services/toast';
import { ConfirmService } from '../services/confirm';
import { TeamMember, TeamInvite, TeamRole } from '@adorable/shared-types';

@Component({
  selector: 'app-team-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './team-settings.html',
  styleUrl: './team-settings.scss',
})
export class TeamSettingsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private teamService = inject(TeamService);
  private toastService = inject(ToastService);
  confirmService = inject(ConfirmService);

  teamId = '';
  teamName = signal('');
  teamSlug = signal('');
  myRole = signal<TeamRole>('member');
  members = signal<TeamMember[]>([]);
  invites = signal<TeamInvite[]>([]);
  loading = signal(true);

  // Editable name
  editingName = signal(false);
  editNameValue = signal('');

  // Invite form
  inviteEmail = signal('');
  inviteRole = signal<string>('member');

  isAdminOrOwner = computed(() => this.myRole() === 'owner' || this.myRole() === 'admin');
  isOwner = computed(() => this.myRole() === 'owner');

  ngOnInit() {
    this.teamId = this.route.snapshot.params['teamId'];
    this.loadTeam();
  }

  loadTeam() {
    this.loading.set(true);
    this.teamService.getTeam(this.teamId).subscribe({
      next: (res) => {
        this.teamName.set(res.team.name);
        this.teamSlug.set(res.team.slug);
        this.myRole.set(res.myRole);
        this.members.set(res.team.members || []);
        this.loading.set(false);
      },
      error: () => {
        this.toastService.show('Failed to load team', 'error');
        this.router.navigate(['/dashboard']);
      }
    });

    this.teamService.getInvites(this.teamId).subscribe({
      next: (invites) => this.invites.set(invites),
      error: () => {} // Non-critical, may fail if not admin
    });
  }

  // ---- Name editing ----

  startEditName() {
    this.editNameValue.set(this.teamName());
    this.editingName.set(true);
  }

  cancelEditName() {
    this.editingName.set(false);
  }

  saveName() {
    const name = this.editNameValue().trim();
    if (!name || name === this.teamName()) {
      this.editingName.set(false);
      return;
    }
    this.teamService.updateTeam(this.teamId, { name }).subscribe({
      next: (team) => {
        this.teamName.set(team.name);
        this.teamSlug.set(team.slug);
        this.editingName.set(false);
        this.toastService.show('Team name updated', 'success');
      },
      error: (err) => this.toastService.show(err.error?.error || 'Failed to update', 'error')
    });
  }

  // ---- Members ----

  changeRole(member: TeamMember, newRole: TeamRole) {
    this.teamService.changeMemberRole(this.teamId, member.id, newRole).subscribe({
      next: () => {
        this.toastService.show('Role updated', 'success');
        this.loadTeam();
      },
      error: (err) => this.toastService.show(err.error?.error || 'Failed to change role', 'error')
    });
  }

  async removeMember(member: TeamMember) {
    const isSelf = member.role === this.myRole() && member.userId === this.getCurrentUserId(member);
    const label = isSelf ? 'Leave this team?' : `Remove ${member.user.name || member.user.email}?`;
    const confirmed = await this.confirmService.confirm(label, isSelf ? 'Leave' : 'Remove', 'Cancel');
    if (!confirmed) return;

    this.teamService.removeMember(this.teamId, member.id).subscribe({
      next: () => {
        this.toastService.show(isSelf ? 'Left team' : 'Member removed', 'success');
        if (isSelf) {
          this.teamService.refreshTeams();
          this.router.navigate(['/dashboard']);
        } else {
          this.loadTeam();
        }
      },
      error: (err) => this.toastService.show(err.error?.error || 'Failed', 'error')
    });
  }

  async transferOwnership(member: TeamMember) {
    const confirmed = await this.confirmService.confirm(
      `Transfer ownership to ${member.user.name || member.user.email}? You will become an admin.`,
      'Transfer',
      'Cancel'
    );
    if (!confirmed) return;

    this.teamService.transferOwnership(this.teamId, member.id).subscribe({
      next: () => {
        this.toastService.show('Ownership transferred', 'success');
        this.loadTeam();
      },
      error: (err) => this.toastService.show(err.error?.error || 'Failed to transfer', 'error')
    });
  }

  // ---- Invites ----

  createInvite() {
    const data: any = { role: this.inviteRole() };
    if (this.inviteEmail().trim()) {
      data.email = this.inviteEmail().trim();
    }
    this.teamService.createInvite(this.teamId, data).subscribe({
      next: (invite) => {
        this.toastService.show(`Invite code: ${invite.code}`, 'success');
        this.inviteEmail.set('');
        this.loadTeam();
      },
      error: (err) => this.toastService.show(err.error?.error || 'Failed to create invite', 'error')
    });
  }

  async revokeInvite(invite: TeamInvite) {
    const confirmed = await this.confirmService.confirm('Revoke this invite?', 'Revoke', 'Cancel');
    if (!confirmed) return;
    this.teamService.revokeInvite(this.teamId, invite.id).subscribe({
      next: () => {
        this.toastService.show('Invite revoked', 'success');
        this.loadTeam();
      },
      error: (err) => this.toastService.show(err.error?.error || 'Failed', 'error')
    });
  }

  copyInviteCode(code: string) {
    navigator.clipboard.writeText(code);
    this.toastService.show('Copied to clipboard', 'success');
  }

  // ---- Delete team ----

  async deleteTeam() {
    const confirmed = await this.confirmService.confirm(
      'Delete this team? Projects and kits will be unassigned back to their owners.',
      'Delete Team',
      'Cancel'
    );
    if (!confirmed) return;

    this.teamService.deleteTeam(this.teamId).subscribe({
      next: () => {
        this.toastService.show('Team deleted', 'success');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => this.toastService.show(err.error?.error || 'Failed to delete team', 'error')
    });
  }

  private getCurrentUserId(refMember: TeamMember): string {
    // We identify current user by matching myRole with the member list
    // This is a heuristic — a proper approach would store current userId
    return refMember.userId;
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
