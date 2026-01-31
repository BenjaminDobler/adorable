# Fullstack Evolution — Brainstorm & Roadmap

## Current State

- AI generates **Angular 21 frontend only** (system prompt is Angular-focused)
- Three container modes: Browser (WebContainer), Docker, Native — all run Node.js
- Agent mode allows AI to run commands (`npm build`, etc.) with real feedback
- Skills system extends AI knowledge via SKILL.md files
- Docker mode mounts files to host, runs real Node.js processes
- GitHub integration for push/pull/deploy to GitHub Pages

---

## Goal

Evolve Adorable from a frontend-only builder into a fullstack app builder with pluggable backend support — differentiated from Lovable by being locally-runnable, adapter-based, and vendor-neutral.

---

## Three Approaches Considered

### Option A: Supabase/BaaS Integration (like Lovable)

Connect to Supabase. AI generates client-side DB queries + SQL migrations.

**Changes needed:**
- Supabase knowledge base for the AI system prompt
- Project settings UI for Supabase URL + anon key
- Base project adds `@supabase/supabase-js`
- New AI tool: `run_sql` to create tables/RLS via Supabase Management API
- Built-in skill for auth flows, CRUD, realtime, file storage

**Pros:** Fast to ship, proven model, no backend server, scales automatically, works in all 3 container modes
**Cons:** Vendor lock-in, limited to Supabase capabilities, user needs external account

### Option B: Generate Real Backend (Express + Prisma in Docker)

AI generates a full Node.js backend alongside Angular, both in the same container.

**Changes needed:**
- Monorepo base template: `client/` (Angular) + `server/` (Express + Prisma)
- Backend knowledge base for AI
- Docker runs both dev servers; Angular proxies `/api/*` to Express
- SQLite as default DB (zero config, file-based)
- New AI tools: `run_prisma_migrate`, schema management
- Optional: Postgres via Docker Compose

**Pros:** True fullstack, user owns everything, no external dependencies, most flexible
**Cons:** Docker/Native only (no browser mode), heavier, more complex

### Option C: Hybrid — Let User Choose Per Project

Project creation offers: Frontend Only | Frontend + Supabase | Frontend + Backend. Each loads different base template + system prompt + knowledge base.

---

## Recommended Architecture: Backend Adapter System

Instead of hardcoding one backend approach, create a **pluggable adapter system**. Each adapter provides everything the AI needs to generate and run a specific type of backend.

### Core Concept

A backend adapter is a module that provides:
1. **Knowledge base** — What the AI knows about this backend
2. **Base files** — Template files added to the project when activated
3. **AI tools** — Additional tools the AI gets (e.g., `run_migration`, `run_sql`)
4. **Container setup** — How to start/configure the backend in Docker
5. **Config schema** — What the user needs to provide (API keys, etc.)

### Adapter Directory Layout

```
adapters/
  supabase/
    adapter.json          ← manifest
    knowledge-base.md     ← injected into AI system prompt
    tools.ts              ← additional AI tool definitions
    base-files/           ← files copied into new projects
      src/app/supabase.ts
    setup.ts              ← optional runtime hooks
  express-prisma/
    adapter.json
    knowledge-base.md
    tools.ts
    base-files/
      server/
        index.ts
        package.json
        prisma/
          schema.prisma
      proxy.conf.json     ← Angular proxy config for /api/*
    setup.ts
```

### Adapter Manifest (adapter.json)

**Supabase example:**
```json
{
  "name": "supabase",
  "displayName": "Supabase",
  "version": "1.0.0",
  "description": "PostgreSQL database, auth, storage, and realtime via Supabase",
  "compatibility": ["browser", "docker", "native"],
  "config": {
    "fields": [
      { "key": "supabaseUrl", "label": "Supabase URL", "type": "string", "required": true },
      { "key": "supabaseAnonKey", "label": "Anon Key", "type": "secret", "required": true }
    ]
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  },
  "containerSetup": null,
  "tools": ["run_sql"]
}
```

**Express + Prisma example:**
```json
{
  "name": "express-prisma",
  "displayName": "Express + Prisma",
  "compatibility": ["docker", "native"],
  "config": { "fields": [] },
  "dependencies": {},
  "containerSetup": {
    "installCommand": "cd server && npm install",
    "startCommand": "cd server && npx tsx watch index.ts",
    "ports": [3000],
    "healthCheck": "http://localhost:3000/health",
    "proxyRules": { "/api/*": "http://localhost:3000" }
  },
  "tools": ["run_prisma_migrate", "seed_database"]
}
```

### How Adapters Hook Into the System

**AI generation flow:**
```
Current:  User prompt → AI (Angular KB + tools) → frontend files
With adapters: User prompt → AI (Angular KB + Adapter KB + adapter tools) → frontend + backend files
```

**System prompt composition:**
```
systemPrompt = ANGULAR_KNOWLEDGE_BASE
if (adapter) systemPrompt += adapter.knowledgeBase
tools = BASE_TOOLS
if (adapter) tools.push(...adapter.tools)
```

**Project creation:**
- User picks an adapter (or "none")
- Adapter's `base-files/` merged into project
- Adapter's `dependencies` added to `package.json`

**Container startup:**
- If adapter has `containerSetup`, container engine runs it after `npm install`
- For Express: starts both Angular dev server and Express server

### Where Adapters Live in the Codebase

`apps/server/src/adapters/` folder. The server loads knowledge bases and registers tools. The client fetches adapter metadata (names, config schemas) from a server API endpoint.

---

## Shipped Adapters

### Adapter 1: Supabase
- **Config:** URL + anon key (user provides from supabase.com)
- **KB:** Supabase JS client patterns, RLS policies, auth flows, realtime, storage
- **Tools:** `run_sql` (via Supabase Management API)
- **Base files:** `src/app/supabase.ts` (client init)
- **Container setup:** none (BaaS runs externally)
- **Works in:** all 3 modes (browser, Docker, native)

### Adapter 2: Express + Prisma
- **Config:** none (self-contained)
- **KB:** Express routing, Prisma schema/queries, JWT auth, middleware
- **Tools:** `run_prisma_migrate`, `seed_database`
- **Base files:** `server/` directory with Express scaffold + Prisma + SQLite
- **Container setup:** starts Express on port 3000, Angular proxies `/api/*`
- **Works in:** Docker + Native only

### Adapter 3: Pocketbase (future)
- **Config:** none (Go binary runs in container)
- **KB:** Pocketbase JS SDK, collection definitions
- **Tools:** `create_collection`, `run_pocketbase_migrate`
- **Base files:** `pocketbase/` dir + `src/app/pocketbase.ts`
- **Container setup:** `./pocketbase serve` on port 8090
- **Works in:** Docker + Native only

---

## Deployment Story

### Current State
GitHub Pages deployment for static sites (already implemented).

### By Adapter Type

**Frontend-only (no adapter):**
- Build Angular → static files
- Deploy to: Vercel, Netlify, GitHub Pages, Cloudflare Pages
- Already partially solved with GitHub Pages integration

**Frontend + Supabase:**
- Same as frontend-only (Supabase runs externally)
- Just inject Supabase URL/key as environment variables at build time

**Frontend + Express (fullstack):**
- Need Node.js hosting: Railway, Render, Fly.io, DigitalOcean
- Generate production `Dockerfile` + `docker-compose.yml`
- Express adapter includes production configs in `base-files/`

### Deployment Adapters (future concept)

Similar to backend adapters but for deployment targets:

```
deploy-adapters/
  vercel/
    deploy.json
    files/vercel.json
  docker/
    deploy.json
    files/Dockerfile, docker-compose.yml, .dockerignore
  railway/
    deploy.json
    files/railway.toml
```

### UI Concept
A "Deploy" button in navbar that:
1. Shows compatible deployment targets for current project type
2. Guides through config (tokens, settings)
3. Builds the project
4. Deploys via API or generates deploy config files

Start simple: generate deployment files. Later, add API-based one-click deployment.

---

## Additional Ideas

### Database Visualization
Once a project has a database (via any adapter), add a sidebar panel with:
- **Schema viewer** — tables, columns, relationships
- **Data browser** — view/edit rows
- **Migration history** — track schema changes

### AI-Generated API Documentation
When AI creates backend routes, auto-generate OpenAPI spec. Preview toggle: "App View" | "API Docs."

### Testing Story
- Frontend: Angular component tests (`ng test`)
- Backend: API tests (Vitest/Jest for Express routes)
- E2E: Playwright/Cypress for full stack
- AI generates tests alongside code in agent mode

### Adapter Marketplace
- Built-in adapters ship with Adorable
- Community adapters installable from GitHub (extend existing skill/GitHub dialog)
- An adapter = folder with manifest + KB + templates

### Multi-Adapter Stacking (v2)
Allow combining adapters: Express for custom API + Supabase for auth/DB. AI prompt composed from multiple knowledge bases.

---

## Differentiation from Lovable

| | Lovable | Adorable |
|--|---------|----------|
| Backend | Supabase only | Pluggable adapters (Supabase, Express, Pocketbase, ...) |
| Frontend | React/Vite | Angular 21 |
| Runtime | Cloud only | Local (Docker/Desktop) + Browser |
| Extensibility | Closed | Open adapter + skill ecosystem |
| Privacy | Cloud-hosted | Can run entirely locally |
| Deployment | Lovable Cloud | Choose your target |

---

## Phased Implementation

### Phase 1: Adapter Infrastructure
- Define adapter interface and manifest format
- Adapter loading/registration on server
- API endpoint to list adapters + config schemas
- Project model gains `adapter` field + config storage
- System prompt composition: Angular KB + adapter KB
- Tool registration: base tools + adapter tools

### Phase 2: Supabase Adapter
- Knowledge base for Supabase patterns
- `run_sql` tool implementation
- Config UI (URL + key in project settings)
- Base files with Supabase client init
- Built-in Supabase skills

### Phase 3: Express + Prisma Adapter
- Knowledge base for Express + Prisma patterns
- Monorepo base template (client/ + server/)
- Container dual-server setup with proxy
- `run_prisma_migrate` + `seed_database` tools
- SQLite as default database

### Phase 4: Database UI Panel
- Schema viewer
- Data browser
- Works with both Supabase and Prisma adapters

### Phase 5: Deployment
- Generate deployment configs per adapter type
- Start with Dockerfile generation
- Add one-click deploy for popular platforms
