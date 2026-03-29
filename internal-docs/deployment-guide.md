# Deployment Guide: From Zero to Production

Step-by-step instructions to get Adorable running in production on Hetzner, then progressively add cloud container providers.

---

## Phase 1: Hetzner Server Setup

### Step 1.1 — Create a Hetzner Account

1. Go to https://www.hetzner.com/cloud
2. Create an account (needs email + payment method)
3. Open the **Cloud Console** at https://console.hetzner.cloud

### Step 1.2 — Generate an SSH Key (if you don't have one)

On your Mac:

```bash
# Check if you already have one
ls ~/.ssh/id_ed25519.pub

# If not, generate one
ssh-keygen -t ed25519 -C "your@email.com"
cat ~/.ssh/id_ed25519.pub
# Copy the output — you'll paste this into Hetzner
```

### Step 1.3 — Create the Server

1. In Hetzner Cloud Console → **Servers** → **Add Server**
2. Configure:
   - **Location:** Falkenstein (cheapest EU) or Nuremberg
   - **Image:** Ubuntu 24.04
   - **Type:** CX32 (4 vCPU, 8 GB RAM, 80 GB disk) — ~7 EUR/month
   - **SSH Key:** paste your public key from Step 1.2
   - **Name:** `adorable-prod` (or whatever you like)
3. Click **Create & Buy Now**
4. Note the **IP address** shown after creation (e.g. `65.108.xxx.xxx`)

### Step 1.4 — First SSH Login & Security Basics

```bash
# SSH into the server
ssh root@<your-server-ip>

# Update packages
apt update && apt upgrade -y

# Set timezone
timedatectl set-timezone Europe/Berlin

# Enable automatic security updates
apt install unattended-upgrades -y
dpkg-reconfigure -plow unattended-upgrades
# Select "Yes" when prompted
```

### Step 1.5 — Create a Deploy User (Don't Run as Root)

```bash
# On the server (as root):
adduser deploy
# Set a strong password, skip the rest with Enter

usermod -aG sudo deploy

# Copy your SSH key to the deploy user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Test: open a NEW terminal and verify
ssh deploy@<your-server-ip>
```

### Step 1.6 — Configure Firewall

```bash
# On the server (as deploy):
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
# Type "y" to confirm

sudo ufw status
# Should show SSH, 80, 443 allowed
```

---

## Phase 2: Install Dependencies

### Step 2.1 — Install Node.js 20

```bash
# On the server (as deploy):
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version   # should show v20.x
npm --version    # should show 10.x
```

### Step 2.2 — Install Docker

```bash
# On the server:
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Allow deploy user to use Docker without sudo
sudo usermod -aG docker deploy

# IMPORTANT: log out and back in for group change to take effect
exit
ssh deploy@<your-server-ip>

# Verify
docker run hello-world
```

### Step 2.3 — Install Nginx

```bash
sudo apt install -y nginx

# Verify it's running
sudo systemctl status nginx
# Visit http://<your-server-ip> in browser — should show Nginx welcome page
```

### Step 2.4 — Pull the Node.js Base Image

```bash
# Pre-pull so the first user doesn't wait
docker pull node:20
```

---

## Phase 3: Domain & SSL

### Step 3.1 — Buy a Domain

Cheapest options:
- **Cloudflare Registrar** (~8–10 EUR/year, great DNS management)
- **INWX** (~7 EUR/year for .de domains)
- **Namecheap** (~10 EUR/year)

### Step 3.2 — Point DNS to Server

In your registrar's DNS settings, create:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` | `<your-server-ip>` | 300 |
| A | `www` | `<your-server-ip>` | 300 |

Wait for propagation (usually minutes, sometimes up to an hour):

```bash
# Check from your Mac
dig +short yourdomain.com
# Should return your server IP
```

### Step 3.3 — Configure Nginx (HTTP First)

```bash
# On the server:
sudo nano /etc/nginx/sites-available/adorable
```

Paste this initial config (HTTP only — SSL comes next):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # API → Express backend
    location /api/ {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;  # SSE streams need long timeout
    }

    # Admin app
    location /admin {
        alias /opt/adorable/dist/apps/admin/browser;
        try_files $uri $uri/ /admin/index.html;
    }

    # Client app (default)
    location / {
        root /opt/adorable/dist/apps/client/browser;
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/adorable /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t              # should say "syntax is ok"
sudo systemctl reload nginx
```

### Step 3.4 — Install SSL with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
# Follow prompts: enter email, agree to ToS, choose redirect HTTP→HTTPS

# Verify auto-renewal
sudo certbot renew --dry-run
```

Certbot automatically modifies the Nginx config to add SSL and redirect HTTP to HTTPS.

---

## Phase 4: Deploy Adorable

### Step 4.1 — Create the App Directory

```bash
# On the server (as deploy):
sudo mkdir -p /opt/adorable
sudo chown deploy:deploy /opt/adorable
```

### Step 4.2 — Build Locally (On Your Mac)

```bash
# In the adorable repo on your Mac:
npx nx build server --configuration=production
npx nx build client --configuration=production
npx nx build admin --configuration=production
```

### Step 4.3 — Deploy to Server

```bash
# From your Mac:
rsync -avz --delete \
  dist/ prisma/ package.json package-lock.json \
  deploy@<your-server-ip>:/opt/adorable/
```

### Step 4.4 — Configure Environment

```bash
# On the server:
cd /opt/adorable

# Create .env from template
nano .env
```

Paste and fill in:

```env
ANTHROPIC_API_KEY=sk-ant-...your-real-key...
PORT=3333
DOCKER_SOCKET_PATH=/var/run/docker.sock
DATABASE_URL=file:./dev.db
JWT_SECRET=<generate-with: openssl rand -hex 32>
ENCRYPTION_KEY=<generate-with: openssl rand -hex 16>

# SMTP (optional — skip for now, configure later via admin panel)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@yourdomain.com
```

Generate the secrets:

```bash
# Run these and paste the output into .env
openssl rand -hex 32   # for JWT_SECRET
openssl rand -hex 16   # for ENCRYPTION_KEY
```

### Step 4.5 — Install Dependencies & Migrate Database

```bash
cd /opt/adorable
npm install --production
npx prisma migrate deploy
npx prisma generate
```

### Step 4.6 — Test Manually

```bash
cd /opt/adorable
node dist/apps/server/main.js
# Should see "Server running on port 3333" or similar
# Ctrl+C to stop
```

Visit `https://yourdomain.com` — should show the Adorable login page.

### Step 4.7 — Create Systemd Service

```bash
sudo nano /etc/systemd/system/adorable.service
```

Paste:

```ini
[Unit]
Description=Adorable Server
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/adorable
ExecStart=/usr/bin/node dist/apps/server/main.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/adorable/.env

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=adorable

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable adorable
sudo systemctl start adorable

# Check it's running
sudo systemctl status adorable

# View logs
sudo journalctl -u adorable -f
```

### Step 4.8 — Create a Deploy Script

On your Mac, create `deploy.sh` in the repo root (don't commit — add to `.gitignore`):

```bash
#!/bin/bash
set -e

SERVER="deploy@<your-server-ip>"

echo "Building..."
npx nx build server --configuration=production
npx nx build client --configuration=production
npx nx build admin --configuration=production

echo "Deploying..."
rsync -avz --delete \
  dist/ prisma/ package.json package-lock.json \
  $SERVER:/opt/adorable/

echo "Restarting..."
ssh $SERVER "cd /opt/adorable && npm install --production && npx prisma migrate deploy && sudo systemctl restart adorable"

echo "Done! Check https://yourdomain.com"
```

```bash
chmod +x deploy.sh
```

---

## Phase 5: Post-Deploy Setup

### Step 5.1 — Create Admin Account

1. Visit `https://yourdomain.com`
2. Register the first account — this automatically becomes the admin
3. Visit `https://yourdomain.com/admin/` — should load the admin panel

### Step 5.2 — Configure via Admin Panel

1. **Settings → Max Containers:** set to 5 (or whatever the CX32 can handle)
2. **Settings → Registration Mode:** choose "open" or "invite-only"
3. **Invites:** generate invite codes if using invite-only mode
4. Optional: configure SMTP for email verification

### Step 5.3 — Verify Everything Works

| Test | How | Expected |
|------|-----|----------|
| Register first user | Sign up at `/` | Auto-promoted to admin |
| Admin panel loads | Visit `/admin/` | Stats page with user count, system info |
| Create a project | Start a new project, send a prompt | AI generates code, files appear |
| Container starts | Check after first AI generation | Preview loads in iframe |
| Container limit | Start max containers (different users) | Next user gets 503 error |
| Rate limiting | Attempt 11 logins in 15 min | 429 response |
| Invite-only mode | Switch in admin, try registering | Requires invite code |

### Step 5.4 — Set Up Monitoring (Optional but Recommended)

```bash
# Simple uptime check — add to crontab
crontab -e

# Add this line (checks every 5 min, logs failures):
*/5 * * * * curl -sf https://yourdomain.com/api/auth/config > /dev/null || echo "$(date) Adorable is DOWN" >> /home/deploy/monitoring.log
```

For more robust monitoring, consider https://uptime.betterstack.com (free tier: 10 monitors).

---

## Phase 6: Extract ContainerManager Interface (Code Change)

This is the foundational refactor that enables swapping providers later.

### Step 6.1 — Define the Interface

Create `apps/server/src/providers/container/container-engine.interface.ts`:

```typescript
import { EventEmitter } from 'events';

export interface ContainerEngineInterface {
  // Lifecycle
  start(projectId: string, userId: string): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isRunning(): boolean;

  // File operations
  copyFiles(files: Record<string, string>): Promise<void>;

  // Execution
  exec(cmd: string[], workDir?: string, env?: Record<string, string>): Promise<{ output: string; exitCode: number }>;
  execStream(cmd: string[], workDir: string | undefined, onData: (chunk: string) => void, env?: Record<string, string>): Promise<number>;

  // Info
  getPreviewUrl(): Promise<string>;
  getProjectPath(): string | null;

  // File watching
  startWatcher(): void;
  stopWatcher(): void;
  readonly events: EventEmitter;
}
```

### Step 6.2 — Adapt DockerManager

Make `DockerManager` implement `ContainerEngineInterface`:
- Add `implements ContainerEngineInterface` to class declaration
- Rename `createContainer()` to `start()` (keep old name as alias if needed)
- Add `getPreviewUrl()` wrapping existing `getContainerUrl()`
- Add `getProjectPath()` returning the host project path
- Add no-op `resume()` (Docker `unpause` serves this purpose)

### Step 6.3 — Adapt NativeManager

Make `NativeManager` implement `ContainerEngineInterface`:
- Rename `createProject()` to `start()`
- Add `pause()` / `resume()` as no-ops (native doesn't need pausing)
- Add `getPreviewUrl()` returning `http://localhost:4200`

### Step 6.4 — Refactor ai.routes.ts

Replace the manual if/else chain with a single call:

```typescript
// Before:
const manager = containerRegistry.getManager(user.id);
if (manager && manager.isRunning()) { ... }
const nativeManager = nativeRegistry.getManager(user.id);
if (nativeManager && nativeManager.isRunning()) { ... }

// After:
const engine = engineRegistry.getEngine(user.id);
if (engine && engine.isRunning()) {
  execDelegate = async (command: string) => {
    const { output, exitCode } = await engine.exec(['sh', '-c', command]);
    return { stdout: output, stderr: '', exitCode };
  };
  projectPath = engine.getProjectPath();
}
```

### Step 6.5 — Create EngineRegistry

Unify `ContainerRegistry` and `NativeRegistry` into a single `EngineRegistry` that:
- Maps `userId → ContainerEngineInterface`
- Resolves which engine to use based on provider config
- Keeps the existing reaper/lifecycle logic for Docker engines

### Step 6.6 — Test

Run the existing test suite and manually verify:
- Docker containers still work as before
- Native/desktop mode still works
- AI generation writes files and runs commands correctly

---

## Phase 7: Prototype Freestyle Integration

### Step 7.1 — Create Freestyle Account

1. Go to https://dash.freestyle.sh
2. Sign up (free tier: 10 concurrent VMs)
3. Get your API key from the dashboard
4. Add `FREESTYLE_API_KEY` to your `.env`

### Step 7.2 — Install SDK

```bash
npm install freestyle-sandboxes
```

### Step 7.3 — Create an Angular Template Repo

Create a GitHub repo with a minimal Angular 21 project that Freestyle can clone:
- `package.json` with Angular 21 dependencies
- `angular.json`, `tsconfig.json`
- Minimal `src/` structure
- This becomes the base that every user project starts from

### Step 7.4 — Implement FreestyleContainerEngine

Create `apps/server/src/providers/container/freestyle-engine.ts`:

Implements `ContainerEngineInterface` using the Freestyle SDK:
- `start()` → `freestyle.createGitRepository()` + `freestyle.requestDevServer()`
- `exec()` → `devServer.process.exec()`
- `copyFiles()` → iterate with `devServer.fs.writeFile()`
- `getPreviewUrl()` → return `devServer.ephemeralUrl`
- `stop()` → `devServer.shutdown()`
- `pause()` / `resume()` → Freestyle auto-manages this
- Configure custom dev server: `dev_command: "npx ng serve --host 0.0.0.0"`, `install_command: "npm install"`, `ports: { 443: 4200 }`

### Step 7.5 — Test with a Simple Project

1. Set `CONTAINER_PROVIDER=freestyle` in `.env`
2. Create a project, send an AI prompt
3. Verify: files are written, preview loads from Freestyle URL, commands execute
4. Measure: cold start time, file write latency, preview refresh speed

### Step 7.6 — Compare with Docker

| Metric | Docker (local) | Freestyle | Notes |
|--------|---------------|-----------|-------|
| Cold start | Measure | Measure | Time from "start" to preview ready |
| File write latency | Measure | Measure | Time for AI write to appear in preview |
| npm install | Measure | Measure | First project setup time |
| Preview refresh | Measure | Measure | Time after file change to see update |

Document results and decide if Freestyle meets UX requirements.

---

## Phase 8: Add Provider Routing

### Step 8.1 — Add Provider Config

Add to `ServerConfig` defaults in `server-config.service.ts`:
- `containers.defaultProvider`: `"docker"` (default, safest)

### Step 8.2 — Update EngineRegistry

Add factory logic:

```typescript
getOrCreateEngine(userId: string, projectId: string): ContainerEngineInterface {
  const existing = this.engines.get(userId);
  if (existing?.isRunning()) return existing;

  const provider = this.resolveProvider(userId);
  switch (provider) {
    case 'freestyle': return new FreestyleContainerEngine(userId, projectId);
    case 'docker': return new DockerContainerEngine(userId, projectId);
    case 'e2b': return new E2BContainerEngine(userId, projectId);
    default: return new DockerContainerEngine(userId, projectId);
  }
}

resolveProvider(userId: string): string {
  // 1. Per-user override (from User model)
  // 2. Overflow: if Docker at capacity, use freestyle
  // 3. Global default from server config
}
```

### Step 8.3 — Add Admin UI

In the admin panel:
- **Settings page:** dropdown for default provider
- **Users page:** per-user provider override column
- **Dashboard:** show provider breakdown (how many users on Docker vs Freestyle)

---

## Phase 9: Production Hardening

### Step 9.1 — Server Backups

```bash
# On the server: daily SQLite backup
sudo nano /etc/cron.daily/adorable-backup

# Paste:
#!/bin/bash
cp /opt/adorable/dev.db /opt/adorable/backups/db-$(date +%Y%m%d).db
find /opt/adorable/backups -mtime +30 -delete

sudo chmod +x /etc/cron.daily/adorable-backup
mkdir -p /opt/adorable/backups
```

### Step 9.2 — Log Rotation

Systemd journal handles this, but verify:

```bash
sudo journalctl --disk-usage
# If too large:
sudo journalctl --vacuum-size=500M
```

### Step 9.3 — Docker Cleanup

```bash
# Weekly cleanup of old Docker images/containers
crontab -e
# Add:
0 3 * * 0 docker system prune -f >> /home/deploy/docker-cleanup.log 2>&1
```

---

## Quick Reference: Redeployment

After making code changes:

```bash
# From your Mac:
./deploy.sh

# Or manually:
npx nx build server --configuration=production && \
npx nx build client --configuration=production && \
npx nx build admin --configuration=production && \
rsync -avz --delete dist/ prisma/ package.json package-lock.json deploy@<your-server-ip>:/opt/adorable/ && \
ssh deploy@<your-server-ip> "cd /opt/adorable && npm install --production && npx prisma migrate deploy && sudo systemctl restart adorable"
```

## Quick Reference: Debugging on Server

```bash
# Check service status
sudo systemctl status adorable

# View live logs
sudo journalctl -u adorable -f

# Check Docker containers
docker ps -a

# Check Nginx errors
sudo tail -f /var/log/nginx/error.log

# Check disk space
df -h

# Check memory
free -h

# Restart everything
sudo systemctl restart adorable && sudo systemctl reload nginx
```
