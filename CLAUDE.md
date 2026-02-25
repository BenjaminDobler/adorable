# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Adorable is an AI-powered IDE for Angular that lets users build, preview, and deploy full-stack Angular apps via natural language. It's an **Nx monorepo** with an Angular 21 frontend, Express backend, Electron desktop shell, and Prisma/SQLite persistence.

## Common Commands

```bash
# Development (run in separate terminals)
npx nx serve server          # Express backend on port 3333
npx nx serve client          # Angular dev server on port 4200
npx nx serve admin           # Admin panel on port 4201

# Build
npx nx build client --configuration=production
npx nx build server --configuration=production
npx nx build admin --configuration=production

# Testing
npx nx test client           # Angular unit tests (vitest-angular)
npx nx test server           # Server unit tests (vitest)
npx nx e2e client-e2e        # Playwright E2E

# Linting
npx nx lint client
npx nx lint server

# Database
npx prisma generate          # Regenerate Prisma client after schema changes
npx prisma migrate dev --name <name>   # Create new migration
npx prisma studio            # GUI database inspector on port 5555

# Desktop
npm run start:desktop        # Dev build + Electron
npm run package:desktop:mac  # Package macOS app
```

## Architecture

### Monorepo Layout

- **`apps/client`** — Angular 21 SPA (standalone components, signals, SCSS)
- **`apps/server`** — Express API server (AI orchestration, Docker management, auth)
- **`apps/admin`** — Admin dashboard (separate Angular app, served at `/admin/` in production)
- **`apps/desktop`** — Electron main process (wraps client+server for desktop)
- **`apps/figma-plugin`** — Figma plugin for design export
- **`libs/shared-types`** — Shared TypeScript interfaces between client and server
- **`prisma/`** — SQLite schema and migrations

### Path Alias

`@adorable/shared-types` → `libs/shared-types/src/index.ts` (defined in `tsconfig.base.json`)

### Client Architecture

The client uses Angular standalone components with signals-based state management (no NgModules). Key services:

- **`ApiService`** (`services/api.ts`) — HTTP client for all backend calls; uses `authInterceptor` to attach JWT Bearer tokens
- **`ProjectService`** (`services/project.ts`) — RxJS-based project state: files, messages, loading state
- **`SmartContainerEngine`** (`services/smart-container.engine.ts`) — Routes between runtime engines:
  - `BrowserContainerEngine` — WebContainer API (in-browser)
  - `LocalContainerEngine` — Docker containers
  - `NativeContainerEngine` — Electron IPC

Routing is in `app.routes.ts` with auth guards. The main editor UI lives in `app.ts` (AppComponent).

### Server Architecture

**AI Provider System** — The core pattern is a provider abstraction with an agentic loop:

1. `ProviderFactory` / `SmartRouter` selects a provider (Anthropic or Gemini)
2. `BaseLLMProvider` (`providers/base.ts`) implements the shared agentic loop: builds context, streams responses, executes tool calls (read_files, write_files, run_command), and iterates until success or max turns
3. `AnthropicProvider` and `GeminiProvider` extend `BaseLLMProvider` with model-specific API calls
4. Tool definitions live in `providers/tools.ts`; kit-specific tools in `providers/kit-tools.ts`
5. Skill instructions in `providers/skills/` inject conditional system prompt additions

**Routes** — All mounted under `/api/` in `main.ts`:
- `/api/auth` — JWT login/register, email verification, registration config
- `/api/admin` — Admin panel API (users, invites, config, stats) — requires admin role
- `/api/projects` — CRUD
- `/api/generate-stream` — SSE streaming AI generation (the main endpoint)
- `/api/kits` — Component kit discovery
- `/api/github`, `/api/figma`, `/api/mcp` — Integrations

**File System Abstraction** — `MemoryFileSystem` (in-memory for agentic loop) and `ContainerFileSystem` (Docker) implement a shared `FileSystemInterface`.

**Auth** — JWT tokens validated by `middleware/auth.ts`; user API keys stored AES-256 encrypted in the database. Rate limiting via `express-rate-limit` on login/register. Role-based access (`admin`/`user`) enforced by `middleware/admin.ts`. Registration supports open or invite-only modes, optional email verification via nodemailer. Server-wide settings stored in `ServerConfig` model and cached in `server-config.service.ts`.

### Database

Prisma with SQLite. Key models: `User` (with role/isActive/emailVerified), `Project` (stores files as JSON string), `ChatMessage` (stores file snapshots per message for time-travel), `GitHubWebhook`, `InviteCode`, `ServerConfig`.

Schema is at `prisma/schema.prisma`. After modifying, run `npx prisma migrate dev` then `npx prisma generate`.

### Streaming Protocol

AI generation uses Server-Sent Events (SSE). The client POSTs to `/api/generate-stream` and receives streamed events with types: `file_written`, `stream`, `tool_call`, `tool_result`, `status`. The server requires COEP/COOP headers for WebContainer support (configured in both dev server and Express middleware).

## Environment

Copy `.env.template` to `.env`. Key variables:
- `ANTHROPIC_API_KEY` — For server-side AI calls
- `PORT` — Backend port (default 3333)
- `DOCKER_SOCKET_PATH` — Docker socket for local container mode
- `DATABASE_URL` — Prisma SQLite path (default `file:./dev.db`)
- `JWT_SECRET`, `ENCRYPTION_KEY` — Auth and API key encryption
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — Optional, for email verification
