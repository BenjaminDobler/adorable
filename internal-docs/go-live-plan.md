# Go-Live Plan: Production Readiness

## Context

Adorable needs to go from local dev tool to publicly hosted service. This covers: auth hardening, admin panel, container limits, and deployment. Budget: ~100 EUR/year (Hetzner CX32).

---

## Part A: Code Changes

### Phase 1 — Database Schema

**File:** `prisma/schema.prisma`

**User model** — add fields:
- `role String @default("user")` — "user" | "admin"
- `isActive Boolean @default(true)` — admin can disable accounts
- `emailVerified Boolean @default(false)`
- `emailVerificationToken String?`

**New model — InviteCode:**
```prisma
model InviteCode {
  id        String    @id @default(cuid())
  code      String    @unique
  createdBy String
  usedBy    String?
  usedAt    DateTime?
  expiresAt DateTime?
  createdAt DateTime  @default(now())
}
```

**New model — ServerConfig** (key-value store):
```prisma
model ServerConfig {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}
```

Run: `npx prisma migrate dev --name add_admin_auth_system` then `npx prisma generate`

**Existing user migration note:** All existing users get `role: "user"`, `isActive: true`, `emailVerified: false`. During `serverConfigService.initialize()`, if no admin exists, promote the earliest user to admin and set their `emailVerified: true`.

---

### Phase 2 — Server Config Service

**New file:** `apps/server/src/services/server-config.service.ts`

- Loads all `ServerConfig` rows into memory on startup
- `get(key)` / `set(key, value)` — set writes to DB + updates cache
- Defaults:
  - `registration.mode`: `"open"` (or `"invite-only"`)
  - `registration.emailVerification`: `false`
  - `containers.maxActive`: `5`
  - `smtp.host/port/user/pass/from`: empty strings

**Modify:** `apps/server/src/providers/container/container-registry.ts`
- `isAtCapacity()` reads max from `serverConfigService.get('containers.maxActive')` instead of static env var

**Modify:** `apps/server/src/main.ts`
- Call `serverConfigService.initialize()` on startup
- If no admin user exists, promote earliest user

---

### Phase 3 — Auth Hardening

**New dependency:** `npm install express-rate-limit nodemailer && npm install -D @types/nodemailer`

**New file:** `apps/server/src/middleware/rate-limit.ts`
- `authRateLimit`: 10 attempts per 15 min on login
- `registerRateLimit`: 5 attempts per hour on register

**New file:** `apps/server/src/middleware/admin.ts`
- `requireAdmin`: checks `req.user.role === 'admin'`, returns 403 otherwise

**New file:** `apps/server/src/services/email.service.ts`
- Uses `nodemailer`, reads SMTP config from serverConfigService
- `sendVerificationEmail(email, token, baseUrl)` method
- `isConfigured()` check

**Modify:** `apps/server/src/routes/auth.routes.ts`
- Apply rate limiters to login/register
- **Register changes:**
  - Password validation: min 8 chars, require `confirmPassword` match
  - Check `serverConfigService.get('registration.mode')` — if `"invite-only"`, require valid invite code
  - First user (count === 0) → auto-admin, skip email verification
  - If email verification enabled + SMTP configured → generate token, send email, respond with "check your email"
  - If verification disabled → set `emailVerified: true`
- **Login changes:**
  - Check `user.isActive` → 403 if disabled
  - Check `user.emailVerified` → 403 with message if not verified
  - Include `role` in JWT and response
- **New endpoints:**
  - `GET /config` (public) — returns registration mode and email verification status
  - `GET /verify-email?token=...` — verifies email, redirects to `/login?verified=true`
  - `POST /resend-verification` (authenticated) — resends verification email

**Modify:** `apps/server/src/middleware/auth.ts`
- After finding user, check `!user.isActive` → return 403

---

### Phase 4 — Admin API Routes

**New file:** `apps/server/src/routes/admin.routes.ts`

Uses `authenticate` + `requireAdmin` middleware at router level.

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/users` | List users (email, name, role, isActive, emailVerified, createdAt, project count) |
| `PATCH` | `/api/admin/users/:id` | Toggle isActive, change role (cannot deactivate/demote self) |
| `DELETE` | `/api/admin/users/:id` | Delete user + cascade (cannot delete self) |
| `GET` | `/api/admin/invites` | List invite codes |
| `POST` | `/api/admin/invites` | Generate invite code (8-char hex) |
| `DELETE` | `/api/admin/invites/:id` | Delete unused invite |
| `GET` | `/api/admin/config` | Get all server config (mask SMTP pass) |
| `PATCH` | `/api/admin/config` | Update config values |
| `GET` | `/api/admin/stats` | Server stats: user count, container count/status, CPU/RAM/disk, uptime |

**Modify:** `apps/server/src/providers/container/container-registry.ts`
- Add `getContainerStatuses()` method returning per-user running/activity state

**Modify:** `apps/server/src/main.ts`
- Register `app.use('/api/admin', adminRouter)`

---

### Phase 5 — Client Auth Updates

**Modify:** `apps/client/src/app/services/auth.ts`
- Expand user model with `role`, `emailVerified`
- Add `isAdmin = computed(() => this.currentUser()?.role === 'admin')`
- Add `getRegistrationConfig()` method

**Modify:** `apps/client/src/app/auth/register/register.ts` + `register.html`
- Add `confirmPassword` field, `inviteCode` field
- Fetch registration config on init → show invite code field if invite-only
- Password rules (min 8 chars, match confirmation)
- Show "check your email" message when email verification is enabled

**Modify:** `apps/client/src/app/auth/login/login.ts` + `login.html`
- Handle `?verified=true` query param → show success message
- Better error messages for disabled accounts / unverified email

**Modify:** `apps/client/src/app/navbar/navbar.html`
- Add admin link for admins — links to `/admin/` (the separate app, served by nginx)
- Conditionally shown when `authService.isAdmin()`

No admin API methods in the client's `api.ts` — that stays clean. Admin API calls live entirely in the admin app.

---

### Phase 6 — Admin Dashboard (Separate Nx App)

The admin panel is a **separate Angular app** (`apps/admin`) in the Nx monorepo. This keeps it out of the client bundle and the Electron desktop app.

**Generate the app:**
```bash
npx nx g @nx/angular:application admin --standalone --style=scss --routing
```

This creates `apps/admin/` with its own `main.ts`, `app.routes.ts`, `app.ts`, etc.

**App structure:**
```
apps/admin/
├── src/
│   ├── app/
│   │   ├── app.ts                # Root component
│   │   ├── app.html
│   │   ├── app.routes.ts         # Admin routing
│   │   ├── services/
│   │   │   ├── auth.ts           # Admin auth service (JWT from localStorage, login redirect)
│   │   │   └── admin-api.ts      # All admin API calls
│   │   ├── dashboard/            # Stats overview
│   │   ├── users/                # User management
│   │   ├── invites/              # Invite codes + registration mode
│   │   └── settings/             # Server config (containers, SMTP, etc.)
│   ├── styles.scss               # Can import shared CSS variables from client
│   └── main.ts
├── project.json                  # Nx project config
└── tsconfig.app.json
```

**Shared code via `@adorable/shared-types`:**
- Admin app imports shared interfaces (user model types, etc.) from `libs/shared-types`
- No code sharing with `apps/client` directly — keeps them fully independent

**Auth flow in admin app:**
- On load, check for JWT in localStorage (same key as client app — `token`)
- If no token or user is not admin → redirect to main app's `/login` page
- JWT is the same — both apps talk to the same Express backend

**Tabs / pages (each a route in admin app):**
1. **Dashboard** (`/`) — stats cards (users, containers, system CPU/RAM/disk, uptime), auto-refresh
2. **Users** (`/users`) — user list with toggle active/disabled, change role, delete actions
3. **Invites** (`/invites`) — registration mode selector (open/invite-only), invite code list, generate/copy/delete codes
4. **Settings** (`/settings`) — max containers, email verification toggle, SMTP configuration

**Styling:** The admin app gets its own SCSS but can import the shared CSS variables (colors, fonts) from a shared file or just define its own minimal theme. It doesn't need to look identical to the client — a clean, functional admin UI is fine.

**Build & Serve:**
- `npx nx build admin --configuration=production` → outputs to `dist/apps/admin/`
- Nginx serves admin build at `/admin/` path
- Dev: `npx nx serve admin` on a different port (e.g., 4201)

**Nginx config (production):**
```nginx
location /admin {
    alias /opt/adorable/dist/apps/admin/browser;
    try_files $uri $uri/ /admin/index.html;
}
```

---

### Phase 7 — Environment & Config

**Modify:** `.env.template` — add SMTP vars and document them:
```
# SMTP (optional - for email verification)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@example.com
```

---

## Part B: Deployment Guide (Hetzner + Domain)

### Deployment Strategy

**Do NOT clone the full monorepo to the server.** Build locally (or in CI) and deploy only the compiled output. The server only needs:

```
/opt/adorable/
├── dist/apps/server/          # Compiled Express app
├── dist/apps/client/browser/  # Static client SPA
├── dist/apps/admin/browser/   # Static admin SPA
├── prisma/                    # Schema + migrations
├── package.json
├── package-lock.json
└── .env                       # Secrets (not in repo)
```

### Deploy Script (from dev machine or CI)

```bash
# 1. Build all apps
npx nx build server --configuration=production
npx nx build client --configuration=production
npx nx build admin --configuration=production

# 2. Sync to server
rsync -avz --delete \
  dist/ prisma/ package.json package-lock.json \
  user@server:/opt/adorable/

# 3. On the server: install deps, migrate DB, restart
ssh user@server "cd /opt/adorable && npm install --production && npx prisma migrate deploy && sudo systemctl restart adorable"
```

### Hetzner Setup
1. Create account at hetzner.com → Cloud Console
2. Create CX32 server (4 vCPU, 8GB RAM, 80GB disk, ~7 EUR/month)
   - Location: Nuremberg or Falkenstein (cheapest)
   - OS: Ubuntu 24.04
   - Add your SSH key during creation
3. SSH in and install:
   - Docker + Docker Compose
   - Node.js 20 (via nvm or nodesource)
   - Nginx
4. Create `/opt/adorable/`, copy `.env.template` to `.env`, fill in secrets
5. Run the deploy script above (or first deploy manually)
6. Set up systemd service for the Express server
7. Configure nginx (see below)

### Domain Setup
1. Buy a domain — cheapest options:
   - **Cloudflare Registrar** (~8–10 EUR/year, at-cost pricing, great DNS)
   - **Namecheap** (~10 EUR/year)
   - German option: **INWX** (~7 EUR/year for .de domains)
2. In your registrar's DNS settings, point to Hetzner server:
   - A record: `@` → `<your-server-ip>`
   - A record: `www` → `<your-server-ip>`
   - (DNS propagation takes minutes to a few hours)
3. On the server, install Certbot for free SSL:
   ```bash
   apt install certbot python3-certbot-nginx
   certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```
   Certbot auto-renews. Free forever.

### Nginx Config
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com www.yourdomain.com;

    # SSL (managed by certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # API → Express backend
    location /api/ {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
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

### Post-deploy checklist
- Set strong random `JWT_SECRET` and `ENCRYPTION_KEY` in .env
- Register first account → automatically becomes admin
- Visit `/admin/` → configure max containers and registration mode
- Set up SMTP in admin settings if you want email verification (optional)
- Test Docker container creation as a regular user
- Verify container limit works (start max containers, next user gets friendly error)

---

## Verification

1. Register first user → verify they become admin automatically
2. Open admin panel → check stats load (users, containers, system)
3. Switch registration to invite-only → generate code → register second user with code
4. Switch back to open → register without code
5. Disable a user from admin → verify they can't log in
6. Start containers up to max → verify next user gets 503 with desktop app message
7. Login rate limiting: attempt 11 logins in 15 min → verify 429 response
8. If SMTP configured: register with email verification → check email arrives → click link → verify login works

---

## Part C: Desktop ↔ Cloud Sync

### Overview

The desktop app is **local-first** — it works fully offline with its own SQLite DB and project files on disk. Cloud sync is **opt-in and manual** (push/pull per project, no auto-sync). Git commits (already created on every save) serve as the sync backbone.

### How It Works

#### 1. Connect Cloud Account (Desktop Settings)

The desktop app currently auto-creates a local user (`local@adorable.desktop`) with no login. To enable sync:

- Add a "Connect Cloud Account" option in desktop settings/profile
- User enters email + password → authenticates against the cloud API (`POST /api/auth/login`)
- Desktop stores the **cloud JWT** alongside the local one (separate storage key, e.g. `adorable_cloud_token`)
- Cloud user ID stored locally for project association
- Local anonymous user continues to work as before — cloud connection is additive

#### 2. Dashboard: Local + Cloud Projects

Once connected, the dashboard shows two project sources:

- **Local projects** — read from local DB/disk as today
- **Cloud projects** — fetched from `GET /api/projects` using the cloud JWT

Each cloud project shows a **"Download"** button to pull it to local disk. Once downloaded, the project exists in both places and is "linked" (shares the same project ID or has a `cloudProjectId` mapping).

Each local project shows an **"Upload to Cloud"** button to push it to the user's cloud account.

#### 3. Sync Status Indicators

Since every save creates a git commit, we can use commit SHAs to detect changes:

**New field on Project model:**
- `cloudCommitSha String?` — the commit SHA at the time of last push/pull

**New lightweight endpoint:**
- `GET /api/projects/sync-status` — returns `[{ projectId, lastCommitSha }]` for all the user's cloud projects

**Sync check (on dashboard open):**
1. Desktop fetches `/api/projects/sync-status` using cloud JWT
2. For each linked project, compare:
   - Local HEAD SHA vs local `cloudCommitSha` → **local has unpushed changes** if different
   - Cloud `lastCommitSha` vs local `cloudCommitSha` → **cloud has updates to pull** if different
   - Both diverged → **both sides have changes** (show push + pull options)
3. Display per-project indicators:
   - ↑ "Push available" — local changes not yet on cloud
   - ↓ "Pull available" — cloud has newer version
   - ↑↓ "Both changed" — diverged, user picks direction

No background polling — check happens when user opens the dashboard.

#### 4. Push to Cloud

User clicks "Push" on a linked project:

1. Read project files from local disk (`projectFsService.readProjectFiles()`)
2. Get current git HEAD SHA
3. Upload to cloud: `PUT /api/projects/{id}/files` with files + commitSha
4. Update local `cloudCommitSha` to current HEAD SHA
5. Cloud stores files on server disk + updates its `lastCommitSha`

#### 5. Pull from Cloud

User clicks "Pull" on a linked project:

1. Fetch project files from cloud: `GET /api/projects/{id}` (already returns files)
2. Write to local disk (`projectFsService.writeProjectFiles()`)
3. Create local git commit: `"Pull from cloud"`
4. Update local `cloudCommitSha` to the cloud's `lastCommitSha`

#### 6. Conflict Handling

No automatic merge. If both sides diverged:
- Show both options: "Push (overwrite cloud)" / "Pull (overwrite local)"
- User decides which version wins
- Could add "Keep both" later (creates a copy) but not needed for v1

#### 7. Offline Behavior

- Desktop works fully offline as today (AI generation still needs network)
- Changes accumulate as local git commits
- When user reconnects and opens dashboard, sync status indicators appear
- User pushes when ready

#### 8. What Gets Synced

- Project source files (the file tree)
- Project metadata (name, thumbnail, selected kit)
- Chat messages (already stored per project)
- NOT: `node_modules`, `.git`, build output, container state

#### 9. Schema Changes Needed

**Project model — add field:**
- `cloudCommitSha String?` — last synced commit SHA

**New endpoint:**
- `GET /api/projects/sync-status` — lightweight SHA list for sync detection

**New endpoint:**
- `PUT /api/projects/:id/files` — upload/overwrite project files from desktop

#### 10. Desktop App Changes

- **Settings page**: "Connect Cloud Account" login form
- **Auth service**: manage cloud JWT separately from local JWT
- **Dashboard**: fetch cloud projects, show sync indicators
- **Project card**: push/pull buttons with status icons

---

## Implementation Status

- [x] Phase 1 (schema) + Phase 7 (env) + install dependencies
- [x] Phase 2 (server config service)
- [x] Phase 3 (auth hardening)
- [x] Phase 4 (admin API routes)
- [x] Phase 5 (client auth updates — minimal, no admin code in client)
- [x] Phase 6 (admin app — separate Nx app, own build)
- [ ] Part B (deployment) — Hetzner, domain, nginx, deploy script
- [ ] Part C (desktop ↔ cloud sync) — cloud account connect, push/pull, sync indicators
