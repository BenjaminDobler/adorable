# Plan: SSH Access for Cloud VS Code Integration

## Context

The "Open in VS Code" feature currently offers two options — "Open Folder" (file URI) and "Attach Container" (Dev Containers URI) — both of which require the Docker daemon to be on the user's local machine. In the cloud deployment, containers run on a remote server, so neither option works. We need to add SSH access to containers so cloud users can connect via VS Code Remote SSH.

## User Flow

1. User clicks "Open in VS Code" in the navbar
2. Panel shows SSH connection details: host, port, username, password (each with copy button)
3. User clicks "Quick Connect" → VS Code opens with Remote SSH URI
4. VS Code prompts for the password → user pastes it → connected to the container at `/app`
5. If the container stops, VS Code shows a "Disconnected" banner. Files persist on the host bind mount — no data loss. User restarts from Adorable to reconnect.

Requirements: VS Code + Remote - SSH extension (50M+ installs).

## Approach

Install `openssh-server` in each Docker container at creation time, expose port 22 mapped to a random host port, generate a per-session random password, and return SSH connection details via the existing `/api/container/info` endpoint. On the client, show SSH credentials with copy-to-clipboard and a "Quick Connect" button in cloud mode, while keeping existing options for desktop mode. Treat active SSH sessions as activity to prevent the reaper from killing containers mid-session. Harden the SSH server with `MaxAuthTries 3`, `AllowUsers developer`, and `LoginGraceTime 30`.

## Security

**Risk rating: Moderate (4/10)**

- The container is already fully accessible via `/api/container/exec` — SSH doesn't grant new capabilities
- Password is 32 random hex characters (128 bits of entropy) — not brute-forceable
- Containers are ephemeral, resource-limited (1GB RAM, 1 CPU), scoped to one project directory
- The `/api/container/info` endpoint returning the password requires JWT authentication

**Hardening applied to `sshd_config`:**
- `MaxAuthTries 3` — limits brute-force attempts per connection
- `AllowUsers developer` — only the developer user can log in
- `LoginGraceTime 30` — closes idle auth connections after 30s
- `PermitRootLogin no` — no root SSH access
- `X11Forwarding no` — disable unnecessary feature

**Deployment note:** Cloud deployments behind a firewall need to allow the dynamic port range (typically 32768-60999) for the SSH ports.

## Files to Modify

### 1. `apps/server/src/providers/container/docker-manager.ts`

- Add `private sshPassword: string | null = null` field
- Add `private generateSshPassword()` helper using `crypto.randomBytes(16).toString('hex')`
- In `createContainer()` (line 118-137 and retry block 148-163): add `'22/tcp'` to both `PortBindings` and `ExposedPorts`
- Merge the `psmisc` install (line 171-172) with `openssh-server`: `apt-get update && apt-get install -y psmisc openssh-server`
- After the install, add SSH setup exec: create `developer` user with host UID/GID, set random password via `chpasswd`, configure `sshd_config` for password auth + hardening, generate host keys, start `/usr/sbin/sshd`
- Add `setupSsh()` private method that generates password, creates user, runs `chpasswd`, ensures `sshd` is running — called both from `createContainer()` and when reusing existing containers (line 82-105: after unpause/start, call `setupSsh()` to rotate the password)
- Add `getSshInfo()` public method: inspects `NetworkSettings.Ports['22/tcp']`, returns `{ host, port, username, password }` or null. Host comes from `process.env['SSH_HOST'] || 'localhost'`
- Add `hasActiveSshSessions()` public method: execs `pgrep -c "sshd:.*developer"` inside container, returns true if count > 0
- In `stop()` (line 535): add `this.sshPassword = null`

### 2. `apps/server/src/providers/container/container-registry.ts`

- In `reap()` (line 91-111): before pausing/stopping an idle container, call `manager.hasActiveSshSessions()`. If active SSH sessions exist, call `this.updateActivity(userId)` and `continue` to skip reaping

### 3. `apps/server/src/routes/container.routes.ts`

- In `GET /info` (line 76-90): after getting `info`, also call `manager.getSshInfo()` and include `ssh` field in the response

### 4. `.env.template`

- Add `SSH_HOST=localhost` with a comment explaining it should be set to the server's external hostname in cloud deployments

### 5. `apps/client/src/app/navbar/navbar.ts`

- Extend `ContainerInfo` interface (line 19-25): add optional `ssh?: { host: string; port: number; username: string; password: string }`
- Add signals: `sshInfo = signal<...>(null)`, `sshInfoLoading = signal(false)`
- Add `loadSshInfo()` method: fetches `/api/container/info`, sets `sshInfo` from `info.ssh`
- Add `copyToClipboard(text: string)` method
- Add `openInVSCodeSSH()` method: constructs `vscode://vscode-remote/ssh-remote+user%40host%3Aport/app` URI
- Update `toggleVSCodePanel()`: when opening in cloud Docker mode (`isDockerMode() && !isDesktop`), call `loadSshInfo()`

### 6. `apps/client/src/app/navbar/navbar.html`

- Restructure VS Code panel (line 79-119) with conditional:
  - **Cloud Docker mode** (`!isDesktop && isDockerMode()`): show SSH details panel with host/port/username/password fields (each with copy button), full SSH command, "Quick Connect in VS Code" button, and a warning note about session lifecycle
  - **Desktop/local mode** (else): keep existing "Open Folder" and "Attach Container" buttons unchanged

### 7. `apps/client/src/app/navbar/navbar.scss`

- Add styles for `.ssh-info-section`, `.ssh-details`, `.ssh-field`, `.ssh-value`, `.copy-btn`, `.ssh-command`, `.ssh-connect-btn`, `.ssh-warning`, `.ssh-loading`, `.ssh-unavailable` — following existing design language (var(--text-muted), var(--bg-surface-2), var(--panel-border), etc.)

## Notes

- Container startup time will increase ~10-20s for SSH server installation. This is acceptable since it's merged with the existing `psmisc` install (one `apt-get` call). Long-term optimization: use a custom Docker image with SSH pre-installed.
- Password rotates on every container restart/unpause for security.
- The `developer` user is created with the same UID/GID as the host user, so files edited via VS Code SSH have correct ownership (matching the existing bind mount setup).
- The `setupSsh()` method handles both fresh containers and reused/unpaused containers, ensuring SSH is always available with a fresh password.

## Verification

1. Start server with `npx nx serve server`, start client with `npx nx serve client`
2. Start a container via the UI (click "Start dev server")
3. Open VS Code panel in the navbar — in non-desktop mode, SSH details should appear
4. Verify the SSH command works: `ssh developer@localhost -p <port>` with the shown password
5. Verify the "Quick Connect" button opens VS Code with the Remote SSH URI
6. Verify copy-to-clipboard works for each field
7. Verify the reaper does NOT pause/stop the container while an SSH session is active
8. Verify that after container restart, a new password is generated
9. In desktop mode (Electron), verify the old "Open Folder" / "Attach Container" options still appear
