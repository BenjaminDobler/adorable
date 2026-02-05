# Deployment Readiness Plan

Preparing Adorable for production hosting with Docker container support.

## Target Architecture

- Single VPS/dedicated server (initial scale)
- Nginx/Caddy reverse proxy with TLS
- PostgreSQL database
- Docker daemon on host for per-project containers
- Express serves both API and built Angular client

---

## Phase 1: Critical Blockers

### 1.1 Client API URLs — Hardcoded to localhost

**Problem:** Every client service has `http://localhost:3333/api` hardcoded.

**Files:**
- `apps/client/src/app/services/api.ts`
- `apps/client/src/app/services/auth.ts`
- `apps/client/src/app/services/github.service.ts`
- `apps/client/src/app/services/figma.service.ts`
- `apps/client/src/app/services/skills.ts`
- `apps/client/src/app/services/local-container.engine.ts`
- `apps/client/src/app/services/native-container.engine.ts`

**Fix:** Replace all hardcoded URLs with relative paths (`/api`). Serve the Angular client from Express behind a reverse proxy so both client and API share the same origin.

### 1.2 SQLite → PostgreSQL

**Problem:** SQLite is single-file, no concurrency, can't share across instances.

**Files:**
- `prisma/schema.prisma` — change `provider = "sqlite"` to `provider = "postgresql"`
- `.env` — update `DATABASE_URL` to a Postgres connection string

**Fix:** Prisma abstracts the DB layer, so application code stays the same. Regenerate migrations with `prisma migrate dev`.

### 1.3 Serve Client from Express

**Problem:** Currently requires two servers (Angular dev server on 4200 + Express API on 3333).

**Fix:** Build Angular to `dist/apps/client/browser/`, serve static files from Express:
```typescript
app.use(express.static('dist/apps/client/browser'));
app.get('*', (req, res) => res.sendFile('index.html', { root: 'dist/apps/client/browser' }));
```
This also makes relative `/api` URLs work without CORS.

---

## Phase 2: Security

### 2.1 Lock Down CORS

**Problem:** Currently accepts all origins: `origin: (origin, callback) => callback(null, true)`.

**File:** `apps/server/src/main.ts`

**Fix:** Restrict to `CLIENT_URL` env var. When serving client from Express, CORS may not be needed at all (same origin).

### 2.2 Encrypt GitHub OAuth Tokens

**Problem:** Stored as plaintext in the database. Has a `// TODO: Encrypt this` comment.

**File:** `apps/server/src/routes/github.routes.ts`

**Fix:** Encrypt with AES-256-GCM before storing, decrypt on read. Use a `ENCRYPTION_KEY` env var.

### 2.3 Move OAuth State to Database

**Problem:** GitHub OAuth state stored in an in-memory `Map` — lost on server restart.

**File:** `apps/server/src/routes/github.routes.ts`

**Fix:** Store OAuth state in the database or Redis with TTL expiry.

### 2.4 Remove Secrets from Git

**Problem:** `.env` contains GitHub client secret and API keys.

**Fix:** Add `.env` to `.gitignore`. Use `.env.template` (already exists, needs updating) for documentation. Use environment variables or a secrets manager in production.

---

## Phase 3: Storage & Configuration

### 3.1 Make Storage Paths Configurable

**Problem:** `storage/`, `published-sites/`, `debug_logs/` all use `process.cwd()`.

**Files:**
- `apps/server/src/config/index.ts` — `SITES_DIR`, `STORAGE_DIR`
- `apps/server/src/providers/container/docker-manager.ts` — `hostAppPath`
- `apps/server/src/routes/project.routes.ts` — `userProjectPath`

**Fix:** Add `STORAGE_DIR` and `SITES_DIR` env vars with `process.cwd()` as fallback.

### 3.2 Update .env.template

Current template is incomplete. Should document all required variables:
```
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/adorable
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=<random-64-char-string>

# Server
PORT=3333
CLIENT_URL=https://your-domain.com
STORAGE_DIR=/data/storage
SITES_DIR=/data/published-sites

# Docker
DOCKER_SOCKET_PATH=/var/run/docker.sock

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=https://your-domain.com/api/github/callback

# AI Providers (optional)
GOOGLE_AI_API_KEY=
```

---

## Phase 4: Production Infrastructure

### 4.1 Dockerfile for Adorable Server

Create a multi-stage Dockerfile:
1. Stage 1: Build Angular client
2. Stage 2: Build server
3. Stage 3: Runtime with Node.js, serve both client and API

Mount Docker socket from host: `-v /var/run/docker.sock:/var/run/docker.sock`

### 4.2 Reverse Proxy Config

Nginx/Caddy in front:
- `/` → static Angular client (or Express)
- `/api` → Express API
- `/api/proxy` → container proxy (WebSocket upgrade support for HMR)

### 4.3 Container Image for Projects

Pre-build a Docker image with Angular CLI + Node.js that project containers use. Avoids `npm install` on every project load (currently re-installs each time).

---

## What Already Works

- `DATABASE_URL`, `PORT`, `CLIENT_URL`, `JWT_SECRET`, `DOCKER_SOCKET_PATH` are env-configurable
- Prisma migration system is in place
- Container lifecycle management (reaper pauses idle, hibernates after 2h)
- JWT authentication is functional
- Docker socket path is configurable

## Suggested Order

1. **Client API URLs** → relative paths (unblocks everything else)
2. **SQLite → PostgreSQL** (Prisma makes this quick)
3. **Serve client from Express** (single server deployment)
4. **CORS + secrets cleanup** (security baseline)
5. **Storage paths** (env-configurable)
6. **Dockerfile + reverse proxy** (actual deployment)
7. **OAuth hardening** (encrypt tokens, persistent state)
