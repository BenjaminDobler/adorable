# Scaling Investigation: Container Provider Options

## Context

Adorable currently manages Docker containers per user on a single Hetzner server. Each container runs Node.js 20 with an Angular dev server, handles npm install, file watching, and preview serving. This investigation evaluates Freestyle.sh as a managed alternative that could eliminate the Docker dependency and simplify scaling.

Freestyle.sh positions itself as "the cloud for agent and customer code" — infrastructure purpose-built for AI-powered app builders. They have their own open-source AI app builder called "Adorable" (different codebase, Next.js-based) which validates that the platform is designed for exactly this use case.

---

## What Freestyle.sh Offers

### Dev Servers (Most Relevant Feature)

Dev Servers are the standout feature for Adorable. They are managed development environments that handle everything our Docker containers currently do:

| What Adorable manages today (Docker) | What Freestyle handles automatically |
|--------------------------------------|--------------------------------------|
| Docker container creation | VM provisioned in <800ms |
| `npm install` inside container | Auto-runs install command on start |
| `ng serve` process management | Auto-runs dev command, restarts on crash |
| File watching + hot reload | Auto-syncs on git push, live reload |
| Preview proxy routing | Provides HTTPS preview URL automatically |
| Idle timeout / pause / reap | Auto-shuts down when not in use |
| File read/write via Docker exec | SDK provides `fs.readFile()`, `fs.writeFile()` |
| Command execution | SDK provides `process.exec()` |

**How it works:**

```typescript
import { Freestyle } from "freestyle-sandboxes";
const freestyle = new Freestyle();

// 1. Create a git repo for the project
const { repoId } = await freestyle.createGitRepository({
  name: "user-project",
  public: false,
  source: { url: "https://github.com/template-repo" },
  devServers: { preset: "auto" }  // or custom config
});

// 2. Request a dev server (provisions in <800ms)
const devServer = await freestyle.requestDevServer({ repoId });

// Now you have:
// devServer.ephemeralUrl     → live preview URL (replaces our proxy)
// devServer.mcpEphemeralUrl  → MCP tools for AI agent
// devServer.codeServerUrl    → browser-based VSCode
// devServer.fs               → file system API
// devServer.process          → command execution API
```

**Dev server presets:**

| Preset | Dev Command | Install Command | Default Port |
|--------|-------------|-----------------|--------------|
| NextJs | `npm run dev` | `npm install --force` | 3000 |
| Vite | `npm run dev` | `npm install --force` | 5173 |
| Expo | `npx expo start` | `npm install --force` | 8081 |
| Auto | `npm run dev` | `npm install --force` | 3000 |

No built-in Angular preset, but custom configuration is supported via `dev_command`, `install_command`, and `ports` parameters.

### Built-in MCP Tools

Dev servers automatically expose MCP tools that AI agents can call:
- `readFile` — read file contents
- `writeFile` — create/modify files
- `editFile` — search-and-replace operations
- `ls` — list directory contents
- `exec` — run commands
- `commitAndPush` — git version control
- `npmInstall` — package management
- `npmLint` — code quality checks

This maps almost directly to Adorable's existing tool definitions in `providers/tools.ts` (`read_files`, `write_files`, `run_command`).

### Freestyle VMs (Lower-Level Alternative)

If more control is needed than Dev Servers provide:
- Full Linux VMs provisioned in <800ms via memory snapshots
- SSH access, systemd services, custom integrations
- Fork running VMs in <50ms (full memory + state copy)
- Pause/resume with auto-wake on request
- Pay only for storage when paused

### Freestyle Git

- Multi-tenant git hosting with per-project repositories
- Built-in version history (replaces Adorable's git-on-disk approach)
- Webhook triggers for automation
- GitHub sync (bidirectional)

---

## Pricing

### Plans

| Plan | Monthly | Concurrent VMs | Repos | Runs |
|------|---------|-----------------|-------|------|
| **Free** | $0 | 10 | 500 | 500/mo |
| **Hobby** | $50 | 40 | 5,000 | 5,000/mo |
| **Pro** | $500 | 400 | 50,000 | 500,000/mo |
| **Enterprise** | Custom | Custom | Custom | Custom |

### Usage-Based (Beyond Plan Limits)

| Resource | Cost/hour | Free daily allowance |
|----------|-----------|---------------------|
| vCPU | $0.04032 | 20 hrs |
| Memory (GiB) | $0.0129 | 40 GiB-hrs |
| Storage (GiB) | $0.000086 | 16,800 GiB-hrs |

### Cost Analysis for Adorable (Hetzner + Freestyle)

**Per-user dev server specs** (Angular): 1 vCPU, 2 GB RAM

**Free daily compute allowance** (all plans): 20 vCPU-hours + 40 GiB-memory-hours = **20 user-hours/day included free**

**Overage per user-hour** beyond the free 20: $0.04032 (vCPU) + $0.0258 (2GB RAM) = **$0.066/hr**

**Hetzner cost:** Without Docker containers, the Hetzner server only runs the Express API + static files. Could downgrade to CX22 (~$4/mo), but CX32 ($7/mo) provides comfortable headroom.

#### Projected Monthly Costs

| Registered users | Daily active (est.) | Avg session | User-hrs/day | Overage hrs/day | Peak concurrent | Freestyle plan | Freestyle cost | Hetzner | **Total/mo** |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 5 | 2 hrs | 10 | 0 | ~3 | Free | $0 | $7 | **$7** |
| 25 | 10 | 2 hrs | 20 | 0 | ~5 | Free | $0 | $7 | **$7** |
| 50 | 15 | 1.5 hrs | 22 | 2 | ~8 | Free | ~$4 | $7 | **$11** |
| 100 | 25 | 1.5 hrs | 37 | 17 | ~12 | Hobby | $50 + $34 | $7 | **$91** |
| 250 | 60 | 1 hr | 60 | 40 | ~20 | Hobby | $50 + $79 | $7 | **$136** |
| 500 | 100 | 1 hr | 100 | 80 | ~35 | Hobby | $50 + $158 | $7 | **$215** |

*(Assumes ~30-40% of registered users are daily active, ~30% concurrency at peak)*

#### Compared to Pure Hetzner (Current Docker Approach)

| Registered users | Freestyle + Hetzner | Pure Hetzner (Docker) | Difference |
|---|---|---|---|
| 10-25 | **$7/mo** | $7-12/mo | Same or cheaper |
| 50 | **$11/mo** | $12-20/mo | Cheaper |
| 100 | **$91/mo** | $20-40/mo | ~2-4x more |
| 250 | **$136/mo** | $40-60/mo | ~2-3x more |
| 500 | **$215/mo** | $60-100/mo | ~2-3x more |

#### Key Takeaway

**Up to ~50 registered users, Freestyle is essentially free** — the daily compute allowance covers the usage. Beyond that, it's roughly 2-3x more expensive than managing Docker yourself on Hetzner, but you're paying for zero ops burden, no Docker management, sub-second cold starts, and elastic scaling.

Note: These estimates do **not** include AI API costs (Anthropic/Gemini), which are independent of the container provider and typically the largest cost factor.

---

## How Integration Would Work

### Architecture Change

```
CURRENT:
┌─────────────────────────────────────┐
│  Hetzner Server                     │
│  Express API                        │
│    └── ContainerRegistry            │
│          └── DockerManager per user  │
│               └── Docker container  │
│                    └── ng serve     │
└─────────────────────────────────────┘

WITH FREESTYLE:
┌─────────────────────────────┐      ┌──────────────────────────┐
│  Hetzner CX32 (~7 EUR/mo)  │      │  Freestyle.sh            │
│                             │      │                          │
│  Express API                │ SDK  │  Dev Server (User A)     │
│  SQLite Database            │─────▶│  Dev Server (User B)     │
│  Auth / JWT                 │      │  Dev Server (User C)     │
│  AI Generation (SSE)        │      │  ...                     │
│  Static files (client SPA)  │      │  (auto-managed,          │
│  Nginx reverse proxy        │      │   scale-to-zero)         │
│  Project file storage       │      │                          │
└─────────────────────────────┘      └──────────────────────────┘
```

**What stays on Hetzner** (always-on, cheap, you control it):
- Express backend + all API routes
- SQLite database (users, projects, chat messages)
- AI generation streaming (Anthropic/Gemini API calls)
- Serving the client SPA + admin panel
- Auth, rate limiting, admin functionality
- Project file storage (source of truth on disk)

**What moves to Freestyle** (on-demand, per-user):
- Running `npm install` + `ng serve` for each user's project
- Providing the live preview URL
- File system operations during AI generation (write file → see it in preview)
- Auto-shutdown when idle

The Hetzner server stays lightweight — just an API server + static file host. The heavy compute (Node.js compilation, Angular dev server, npm install) moves to Freestyle. That's exactly the expensive part that currently limits capacity to 5 concurrent containers on the CX32.

### Code Changes Required

**1. New dependency:**
```bash
npm install freestyle-sandboxes
```

**2. Replace `DockerManager` with `FreestyleManager`:**

The new manager would wrap the Freestyle SDK:
- `createContainer()` → `freestyle.createGitRepository()` + `freestyle.requestDevServer()`
- `writeFile()` → `devServer.fs.writeFile()`
- `readFile()` → `devServer.fs.readFile()`
- `executeCommand()` → `devServer.process.exec()`
- `getPreviewUrl()` → return `devServer.ephemeralUrl`
- `pauseContainer()` → `devServer.shutdown()` (auto-managed by Freestyle)
- `removeContainer()` → delete git repo

**3. Modify `ContainerRegistry`:**
- Replace Docker-specific lifecycle management with Freestyle API calls
- Remove reaper (Freestyle handles idle shutdown)
- Remove capacity checks (Freestyle handles scaling)

**4. Modify preview proxy (`proxy.ts`):**
- Instead of proxying to local Docker port, redirect to Freestyle's `ephemeralUrl`
- Or embed the Freestyle preview URL directly in the client

**5. Adapt AI tool calls:**
- Current tools in `providers/tools.ts` call `DockerManager` methods
- Remap to Freestyle SDK equivalents (almost 1:1 mapping)

**6. Angular-specific configuration:**
- Freestyle has no built-in Angular preset
- Need custom dev server config: `dev_command: "npx ng serve --host 0.0.0.0"`, `install_command: "npm install"`, `ports: { 443: 4200 }`
- Or create an Angular template repository that Freestyle clones

### What Gets Simpler

- **No Docker dependency** — eliminates Docker installation, socket management, image pulls
- **No container lifecycle code** — remove reaper, pause/unpause logic, activity tracking
- **No preview proxy** — Freestyle provides HTTPS URLs directly
- **No file watching code** — Freestyle handles git-based sync
- **No npm install management** — Freestyle runs install automatically
- **No process restart logic** — Freestyle auto-restarts crashed dev servers

### What Gets More Complex

- **Network dependency** — all container operations go over the internet (latency)
- **Freestyle API availability** — adds external dependency (vendor lock-in)
- **Angular support** — no built-in preset, needs custom configuration
- **Git-based file model** — Freestyle uses git repos; Adorable currently uses direct file writes. Would need to adapt to commit-based workflow or use the direct `fs` API
- **Preview URL management** — ephemeral URLs need re-requesting; adds state management

---

## Comparison: Freestyle vs E2B vs Fly.io vs Hetzner

### E2B Overview

E2B is an open-source sandbox platform for AI agents, powered by Firecracker microVMs. It provides isolated execution environments with file system, command execution, and networking APIs. Key characteristics:

- **Sandboxes start in <200ms** (~80ms same-region)
- **Custom templates** via Dockerfile or SDK — pre-install `node_modules`, set start commands (e.g. `npm run dev`), wait for port readiness
- **Pause/resume** — preserves full state (filesystem + memory + running processes), resumes in ~1 second. Paused sandboxes persist indefinitely. Currently free during beta.
- **Auto-pause** — sandboxes auto-pause after 10 min inactivity (configurable)
- **Public URLs** — each sandbox gets a public URL per port via `sandbox.getHost(port)`, with optional auth token restriction
- **File system API** — `readFile()`, `writeFile()`, `ls()`, `watch()` + upload/download
- **Command execution** — `exec()` with streaming output, background commands
- **SDK** — `npm i e2b` (TypeScript) or `pip install e2b` (Python)
- **Open source** — self-hosting possible (reduces vendor lock-in)
- **No built-in MCP tools** — you wire the SDK into your own tool definitions (same as Docker/Fly.io)
- **No built-in git** — you manage version control yourself
- **No built-in dev server management** — you configure start commands in templates, but no auto-restart or health monitoring like Freestyle

#### E2B Pricing

| Plan | Monthly | Max session | Concurrent sandboxes | Storage |
|------|---------|-------------|---------------------|---------|
| **Hobby** | $0 (one-time $100 credit) | 1 hour | 20 | 10 GiB |
| **Pro** | $150 | 24 hours | 100 | 20 GiB |

**Per-second billing (all plans):**

| Resource | Per second | Per hour | Per hour (1 vCPU + 2GB) |
|----------|-----------|---------|------------------------|
| 1 vCPU | $0.000014 | $0.0504 | $0.0504 |
| 1 GiB RAM | $0.0000045 | $0.0162 | $0.0324 (2 GiB) |
| **Total** | | | **$0.083/hr** |

#### E2B Cost Projection for Adorable

| Registered users | Daily active | Avg session | User-hrs/day | Monthly compute | E2B plan | **Total/mo** |
|---|---|---|---|---|---|---|
| 10 | 5 | 2 hrs | 10 | $25 | Hobby (credit) | **$25** (from credit) |
| 25 | 10 | 2 hrs | 20 | $50 | Hobby (credit) | **$50** (from credit) |
| 50 | 15 | 1.5 hrs | 22 | $55 | Pro | **$150 + $55 = $205** |
| 100 | 25 | 1.5 hrs | 37 | $92 | Pro | **$150 + $92 = $242** |
| 250 | 60 | 1 hr | 60 | $149 | Pro | **$150 + $149 = $299** |

*(E2B has no free daily compute allowance — all usage is billed per-second. Hobby plan only has a one-time $100 credit.)*

### Full Comparison Table

| Factor | Hetzner (current) | Fly.io | Freestyle.sh | E2B |
|--------|-------------------|--------|-------------|-----|
| **Purpose** | General server | General containers | Built for AI app builders | Sandboxes for AI agents |
| **What you manage** | Everything (Docker, nginx, etc.) | Container images, volumes | Almost nothing | Templates + tool wiring |
| **Cold start** | None (containers stay alive) | ~15s with pre-baked image | <800ms (memory snapshots) | <200ms (Firecracker) |
| **Pause/resume** | Your code (Docker pause) | Not built-in | Auto-managed | Built-in, ~1s resume |
| **npm install** | You handle it | You handle it | Automatic | Pre-bake in template |
| **Preview URLs** | You proxy it | You configure routing | Automatic HTTPS URL | `sandbox.getHost(port)` |
| **Dev server lifecycle** | Your reaper code | Your code + Fly auto-stop | Fully managed (auto-restart) | Start command in template (no auto-restart) |
| **AI tool integration** | Custom tools | Custom tools | Built-in MCP tools | Custom tools (SDK is clean) |
| **Git integration** | You manage it | You manage it | Built-in (Freestyle Git) | You manage it |
| **Free tier** | None | Legacy only | 10 concurrent VMs + 20 free compute-hrs/day | One-time $100 credit |
| **Cost per user-hour** | ~$0 (fixed server) | ~$0.066 | ~$0.066 (overage only) | ~$0.083 |
| **Cost at 10 users** | ~$7/mo | ~$30/mo | **$0** (free tier) | ~$25/mo (from credit) |
| **Cost at 50 users** | ~$12-20/mo | ~$116/mo | **~$11/mo** | ~$205/mo |
| **Cost at 250 users** | ~$40-60/mo | ~$136/mo | **~$136/mo** | ~$299/mo |
| **Angular support** | Full (you control it) | Full (you control it) | Custom config needed | Custom template needed |
| **Vendor lock-in** | None | Low | Low (with engine abstraction) | Low (open source, self-hostable) |
| **Self-hosting** | Yes (it's your server) | No | No | Yes (open source) |
| **Offline/Desktop** | Works (native mode) | N/A | N/A | N/A |
| **Max session** | Unlimited | Unlimited | Auto-managed | 1 hr (Hobby) / 24 hr (Pro) |

---

## Key Risks & Considerations

### Advantages
1. **Free tier covers current needs** — 10 concurrent VMs > current 5 container limit, at $0
2. **Massive simplification** — removes Docker, container lifecycle, proxy, file watching code
3. **Purpose-built** — designed specifically for AI app builders (their own product is the same concept)
4. **Sub-second provisioning** — <800ms via memory snapshots vs minutes for Docker
5. **Built-in MCP tools** — AI agent integration is first-class
6. **Git-native** — version history comes free

### Risks
1. **Vendor lock-in** — manageable, see detailed analysis below
2. **Angular support** — no built-in preset; may hit edge cases with Angular CLI specifics
3. **Latency** — all file operations go over the network instead of local Docker exec
4. **Early-stage company** — less established than AWS/GCP/Fly.io; risk of service changes or shutdown
5. **Pricing changes** — free tier could be reduced or removed
6. **Desktop app** — Freestyle doesn't help with Electron/native mode; need to maintain two code paths
7. **Ephemeral URLs** — preview URLs need re-requesting, adding complexity

### Vendor Lock-In Analysis

**Short answer: No, integrating Freestyle does NOT prevent other deployment strategies.**

Adorable already has an engine abstraction — `SmartContainerEngine` routes between `LocalContainerEngine` (Docker) and `NativeContainerEngine` (Electron). Adding Freestyle would be a third engine behind the same interface:

```
SmartContainerEngine
  ├── LocalContainerEngine      → Docker (self-hosted / Hetzner)
  ├── NativeContainerEngine     → Electron desktop
  └── FreestyleContainerEngine  → Freestyle.sh cloud (new)
```

Selected by configuration, not by code structure:

```
CONTAINER_PROVIDER=docker      → self-hosted Hetzner
CONTAINER_PROVIDER=freestyle   → Freestyle.sh cloud
CONTAINER_PROVIDER=native      → Electron desktop (auto-detected)
```

**What stays untouched regardless of provider:**

| Layer | Changes? | Why |
|-------|----------|-----|
| AI provider system (Anthropic/Gemini) | No | Completely independent |
| Tool definitions (`read_files`, `write_files`, `run_command`) | No | Call engine interface, not Docker/Freestyle directly |
| Auth, projects, database | No | Unrelated to container backend |
| Client UI | Minimal | Preview URL source changes, but the iframe stays the same |
| Desktop/Electron mode | No | Keeps using `NativeContainerEngine` |

**Where lock-in WOULD happen (and how to avoid it):**

1. **Using Freestyle Git as primary storage** — If project files are stored exclusively in Freestyle Git repos, migrating means exporting every repo. **Avoid:** Keep existing file storage on disk/database as source of truth. Sync *to* Freestyle, don't make it the origin.

2. **Calling Freestyle MCP tools directly from the AI agent** — Freestyle dev servers expose MCP tools that the AI could call directly, bypassing our tool layer. **Avoid:** Keep existing tool definitions in `providers/tools.ts`. They call the engine interface, which calls Freestyle under the hood.

3. **Hardcoding Freestyle preview URLs in the client** — If the client depends on Freestyle URL patterns, switching providers breaks the UI. **Avoid:** The engine returns a generic `previewUrl` string. The client puts it in an iframe — doesn't matter if it's `localhost:4200` or `abc123.freestyle.sh`.

**Bottom line:** If Freestyle disappears tomorrow, you delete the one `FreestyleContainerEngine` file, set `CONTAINER_PROVIDER=docker`, and everything works as before. The rest of Adorable doesn't care which engine is active.

### Unified Adapter Architecture

The architecture supports seamlessly switching between **all four providers** — Docker, Freestyle, E2B, and Fly.io — through a single `ContainerEngine` interface. All providers offer the same fundamental operations:

```typescript
interface ContainerEngine {
  start(projectId: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  listFiles(path: string): Promise<string[]>;
  executeCommand(cmd: string): Promise<{ stdout: string; stderr: string }>;
  getPreviewUrl(): string;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}
```

**Each provider maps cleanly to this interface:**

| Method | Docker | Freestyle | E2B | Fly.io |
|--------|--------|-----------|-----|--------|
| `start()` | `docker create` + `start` | `requestDevServer()` | `Sandbox.create()` | Machines API `create` |
| `writeFile()` | `docker exec` | `devServer.fs.writeFile()` | `sandbox.files.write()` | SSH / API |
| `readFile()` | `docker exec` | `devServer.fs.readFile()` | `sandbox.files.read()` | SSH / API |
| `listFiles()` | `docker exec ls` | `devServer.fs.ls()` | `sandbox.files.list()` | SSH / API |
| `executeCommand()` | `docker exec` | `devServer.process.exec()` | `sandbox.commands.run()` | SSH / API |
| `getPreviewUrl()` | `localhost:{port}` | `ephemeralUrl` | `sandbox.getHost(port)` | `{app}.fly.dev` |
| `pause()` | `docker pause` | auto-managed | `sandbox.pause()` | Machine `stop` |
| `resume()` | `docker unpause` | auto-managed | `Sandbox.connect(id)` | Machine `start` |
| `stop()` | `docker rm -f` | `shutdown()` | `sandbox.kill()` | Machine `destroy` |

**The consumer side never changes** — the AI tools call `engine.writeFile()`, the client gets `engine.getPreviewUrl()`, the lifecycle manager calls `engine.pause()`. They don't know or care which provider is active.

**Engine class structure:**

```
ContainerEngineFactory
  ├── DockerContainerEngine       implements ContainerEngine
  ├── FreestyleContainerEngine    implements ContainerEngine
  ├── E2BContainerEngine          implements ContainerEngine
  ├── FlyContainerEngine          implements ContainerEngine
  └── NativeContainerEngine       implements ContainerEngine (desktop)
```

### Per-User Provider Routing

Providers can be assigned **per user**, not just globally. The `ContainerRegistry` maps `userId → ContainerEngine`, where the engine type is resolved individually:

```
User A → freestyle  (cloud, free tier)
User B → docker     (self-hosted Hetzner)
User C → e2b        (open-source sandbox)
User D → native     (desktop app, auto-detected)
User E → fly        (Fly.io machine)
```

**Resolution strategy** (evaluated in order):
1. **Desktop always native** — auto-detected via Electron, no config needed
2. **Per-user override** — admin assigns a specific user to a specific provider (e.g. via a `containerProvider` field on the User model)
3. **Automatic overflow** — if Docker is at capacity, overflow to Freestyle/E2B
4. **Admin-configured default** — server setting: `containers.defaultProvider = "freestyle" | "docker" | "e2b"`

**Practical use cases for per-user routing:**
- Free-tier users → Freestyle (no server cost to you, free tier covers 10 concurrent)
- Paying/priority users → Docker on your own hardware (lower latency, full control)
- Overflow during peak → automatic spill to Freestyle or E2B when Docker is full
- Self-hosted customers → E2B (open source, can run on their own infrastructure)
- Global users → Fly.io (multi-region, low latency worldwide)
- Debugging/support → admin temporarily switches a user to Docker for easier inspection

**Implementation:** Minimal — a `containerProvider` column on the User model (or resolved dynamically from capacity), and a factory function in `ContainerRegistry` that instantiates the right engine class per user.

**Mid-session migration:** Since the Hetzner server holds the source of truth for project files, you can even swap a user's provider mid-session — stop on Docker, start on Freestyle, same files. The client just gets a new preview URL.

### Open Questions
- Does Freestyle support custom dev server presets for Angular 21 with SSR?
- What's the actual latency for file write operations over the network vs local Docker exec?
- Can Freestyle volumes persist `node_modules` across dev server restarts (avoid re-install)?
- What happens when Freestyle has an outage? Is there a fallback path?
- Is there a way to run Angular's custom builders and schematics inside Freestyle?
- E2B Hobby tier limits sessions to 1 hour — is that sufficient for typical user sessions?
- Can E2B's open-source version be self-hosted on Hetzner as a Docker alternative?

---

## Recommendation

### Provider Rankings for Adorable

| Priority | Provider | Role | Why |
|----------|----------|------|-----|
| 1st | **Freestyle** | Primary cloud provider | Purpose-built for this use case, free tier for first 10 concurrent users, fully managed dev servers, cheapest at scale |
| 2nd | **Docker** | Self-hosted / desktop fallback | Zero cost on existing Hetzner, full control, no vendor dependency, required for desktop/Electron |
| 3rd | **E2B** | Alternative / self-hosted option | Open source (self-hostable), excellent pause/resume, good for customers wanting on-prem |
| 4th | **Fly.io** | Multi-region option | Only if global low-latency matters, most expensive, most ops work |

### Suggested Approach

1. **Define the `ContainerEngine` interface** — formalize the abstraction that already exists informally between `DockerManager` and `NativeManager`
2. **Implement `FreestyleContainerEngine`** — test with a simple Angular project, validate custom dev server config
3. **Implement `E2BContainerEngine`** — test with a custom template that pre-bakes Angular `node_modules`
4. **Add provider routing to `ContainerRegistry`** — factory function that resolves provider per user
5. **Measure and compare** — latency, cold start, preview refresh speed across all providers
6. **Deploy hybrid** — Docker as default on Hetzner, Freestyle as overflow, E2B as self-hosted option

This gives maximum flexibility: swap providers per user, per deployment, or globally — with zero changes to the AI tools, client UI, or core business logic.

---

## Teams & Resource Sharing

### Current State

All resources are strictly isolated per user:
- **Projects** — `Project.userId`, always filtered by `req.user.id`
- **Kits** — stored as JSON in `User.settings`, per-user
- **Skills (User)** — filesystem at `storage/users/{userId}/skills/`
- **Skills (System)** — global, read-only for everyone
- **Chat Messages** — scoped to project → scoped to user

No sharing, no teams, no collaboration.

### Design: Team Workspaces

**Model:** Resources live in either a personal space or a team workspace. Users can move resources between the two.

```
┌─────────────────────┐     ┌─────────────────────────┐
│  Personal (User A)  │     │  Team "Acme Corp"       │
│                     │     │                         │
│  Project 1          │────▶│  Project 3 (moved in)   │
│  Project 2          │     │  Project 5 (created in) │
│  Kit: My Components │     │  Kit: Shared UI Kit     │
│                     │     │                         │
└─────────────────────┘     │  Members: A, B, C       │
┌─────────────────────┐     │                         │
│  Personal (User B)  │     │                         │
│                     │     │                         │
│  Project 4          │     └─────────────────────────┘
└─────────────────────┘
```

**Rules:**
- Resources are personal by default
- Teams have their own workspace — resources created in or moved into a team belong to the team
- Any team member can access team resources
- Moving a project into a team means it stays with the team (even if the user leaves)
- Users can move resources back to personal (if they have permission)

### Team Management

**Creation:** Any registered user can create a team. Server admin can also create/manage teams via admin panel.

**Roles (three-tier):**

| Role | Permissions |
|------|------------|
| **Owner** | Full control: delete team, manage roles, transfer ownership, all admin/member permissions |
| **Admin** | Invite/remove members, manage team settings, move resources in/out |
| **Member** | Access team resources (projects, kits, skills), create resources in team workspace |

**Invites (two methods):**
1. **Invite link/code** — team owner/admin generates a join code, anyone with it can join
2. **Direct invite by email** — team owner/admin invites a specific user (must have an account)

### Schema Changes

**Important: These should be added BEFORE first production deploy** to avoid complex migrations on live data.

#### New Models

```prisma
model Team {
  id          String        @id @default(cuid())
  name        String
  slug        String        @unique        // URL-friendly name
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  members     TeamMember[]
  projects    Project[]
  kits        Kit[]
  invites     TeamInvite[]
}

model TeamMember {
  id        String   @id @default(cuid())
  teamId    String
  userId    String
  role      String   @default("member")   // "owner" | "admin" | "member"
  joinedAt  DateTime @default(now())
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([teamId, userId])
}

model TeamInvite {
  id        String    @id @default(cuid())
  teamId    String
  team      Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  code      String    @unique              // Join code/link token
  email     String?                        // If direct invite, the target email
  role      String    @default("member")   // Role assigned on join
  createdBy String                         // userId of inviter
  usedBy    String?                        // userId who used it
  usedAt    DateTime?
  expiresAt DateTime?
  createdAt DateTime  @default(now())
}
```

#### New Model: Kit (Replaces JSON-in-settings)

Kits currently live as JSON inside `User.settings` — this needs to become a proper table to support team ownership:

```prisma
model Kit {
  id          String   @id @default(cuid())
  name        String
  description String?
  config      String   // JSON stringified kit configuration

  // Ownership: one of these is set, not both
  userId      String?  // Personal kit
  teamId      String?  // Team kit
  user        User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  team        Team?    @relation(fields: [teamId], references: [id], onDelete: Cascade)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

#### Modified Model: Project

```prisma
model Project {
  // ... existing fields ...

  // Ownership: one of these is set, not both
  userId    String?   // Personal project (was required, now optional)
  teamId    String?   // Team project (new)
  user      User?     @relation(fields: [userId], references: [id])
  team      Team?     @relation(fields: [teamId], references: [id])

  // ... rest unchanged ...
}
```

#### Modified Model: User

```prisma
model User {
  // ... existing fields ...
  teams     TeamMember[]
  kits      Kit[]
  // ... rest unchanged ...
}
```

### Query Pattern

```typescript
// Get all projects a user can access
const userTeamIds = (await prisma.teamMember.findMany({
  where: { userId: user.id },
  select: { teamId: true }
})).map(tm => tm.teamId);

const projects = await prisma.project.findMany({
  where: {
    OR: [
      { userId: user.id },              // personal projects
      { teamId: { in: userTeamIds } }   // team projects
    ]
  }
});
```

### Moving Resources

```typescript
// Move project from personal to team
await prisma.project.update({
  where: { id: projectId },
  data: { teamId: teamId, userId: null }
});

// Move project back to personal
await prisma.project.update({
  where: { id: projectId },
  data: { userId: userId, teamId: null }
});
```

---

## Implementation Roadmap

For detailed step-by-step instructions (server setup commands, config files, code examples), see **[deployment-guide.md](./deployment-guide.md)**.

Summary of phases:

| Phase | What | Effort |
|-------|------|--------|
| **Pre-deploy: Teams** | | |
| 0a. Schema | Add Team, TeamMember, TeamInvite, Kit models to Prisma | ~1 day |
| 0b. Kit Refactor | Move kits from User.settings JSON to Kit table, update kit routes | ~1-2 days |
| 0c. Project Ownership | Make Project.userId optional, add teamId, update project routes/queries | ~1 day |
| 0d. Team Server Routes | Team CRUD, invite/join, member management, move resources | ~2-3 days |
| 0e. Team Client UI | Team selector/switcher, team settings, invite flow, move-to-team on projects/kits | ~3-4 days |
| 0f. Admin Panel | Team overview, manage teams, see members | ~1-2 days |
| **Deploy** | | |
| 1. Hetzner Setup | Create server, SSH, firewall, deploy user | ~30 min |
| 2. Install Dependencies | Node.js 20, Docker, Nginx | ~15 min |
| 3. Domain & SSL | Buy domain, DNS, Certbot | ~30 min + propagation |
| 4. Deploy Adorable | Build, rsync, .env, systemd, deploy script | ~1 hour |
| 5. Post-Deploy Setup | Create admin, configure, verify | ~30 min |
| **Post-deploy: Scaling** | | |
| 6. Extract ContainerManager Interface | Formalize abstraction, refactor ai.routes.ts | ~1-2 days |
| 7. Prototype Freestyle | Account, SDK, implement engine, test Angular | ~2-3 days |
| 8. Provider Routing | Factory logic, per-user assignment, admin UI | ~1-2 days |
| 9. Production Hardening | Backups, log rotation, Docker cleanup | ~30 min |

**Phases 0a–0f** (~2 weeks) — full teams implementation before first deploy.
**Phases 1–5** get you live with Docker on Hetzner.
**Phases 6–8** add multi-provider flexibility (Freestyle, E2B, Fly.io).
