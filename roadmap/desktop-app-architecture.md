# Desktop App — Hybrid Architecture

## Overview

The Adorable desktop app is an Electron-based wrapper that provides native OS execution for Angular projects while sharing the same cloud server as the browser app. This means all projects, chat history, settings, and AI context are accessible from both desktop and browser.

## Architecture

```mermaid
graph TB
    subgraph Browser["Browser Client"]
        BC[Angular App]
    end

    subgraph Desktop["Desktop App (Electron)"]
        DC[Angular App<br/>in BrowserWindow]
        LA[Local Agent<br/>localhost:3334]
    end

    subgraph Cloud["Cloud Server"]
        API[Express API :3333]
        DB[(SQLite / Postgres)]
        AI[AI Providers<br/>Claude · Gemini]
        Docker[Docker Manager]
        GH[GitHub Integration]
        FG[Figma Integration]
    end

    subgraph UserOS["User's OS"]
        FS[File System<br/>~/adorable-projects/]
        NG[ng serve<br/>child_process]
    end

    BC -->|All API calls| API
    DC -->|Auth, Projects, AI,<br/>GitHub, Figma| API
    DC -->|Native file/process ops| LA

    API --> DB
    API --> AI
    API --> Docker
    API --> GH
    API --> FG

    LA -->|File read/write| FS
    LA -->|spawn/exec| NG
```

## Three Runtime Modes

```mermaid
graph LR
    subgraph Modes["Runtime Modes"]
        WC["WebContainer<br/>(Browser)"]
        DK["Docker<br/>(Server)"]
        NT["Native<br/>(Desktop)"]
    end

    WC -->|"Runs in browser sandbox<br/>No install needed"| WCR[Browser Tab]
    DK -->|"Runs in Docker container<br/>Multi-tenant"| DKR[Docker Desktop]
    NT -->|"Runs on user's OS<br/>child_process"| NTR["Real filesystem<br/>~/adorable-projects/"]
```

| Mode | Runtime | Where | Use Case |
|------|---------|-------|----------|
| **WebContainer** | Browser sandbox (StackBlitz) | Browser tab | Quick demos, no install |
| **Docker** | Docker container | Server-managed | Multi-tenant deployment |
| **Native** | OS child_process | User's machine | Desktop app, full local dev |

## Component Breakdown

### Cloud Server (`apps/server/`)

The existing Express server handles everything except native execution:

- **Auth** — User registration, login, JWT sessions
- **Projects** — CRUD, file snapshots, thumbnails
- **AI** — Streaming code generation via Claude/Gemini
- **Docker** — Container lifecycle for Docker mode
- **GitHub** — OAuth, repo sync, Pages deployment
- **Figma** — API proxy for design imports
- **Database** — SQLite via Prisma ORM

### Local Agent (`apps/desktop/local-agent.ts`)

A lightweight Express server (port 3334) that runs inside the Electron app. No database, no auth — it only handles native OS operations:

```
POST   /api/native/start        → Create project directory
POST   /api/native/stop         → Kill processes, cleanup
POST   /api/native/mount        → Write files to filesystem
POST   /api/native/exec         → Run command, return output
GET    /api/native/exec-stream  → Streaming command execution (SSE)
GET    /api/native/watch        → File watcher events (SSE)
GET    /api/native/info         → Project path info
```

### Desktop Shell (`apps/desktop/main.ts`)

Electron main process responsibilities:

1. **Bootstrap Node.js** — Auto-downloads portable Node.js if not found on system
2. **Start Local Agent** — Lightweight Express on port 3334
3. **Open BrowserWindow** — Points at the cloud server URL
4. **Expose Desktop API** — `window.electronAPI` for the Angular client to detect desktop mode

### Angular Client (`apps/client/`)

The same Angular app serves both browser and desktop. Detection logic:

```typescript
// SmartContainerEngine detects desktop mode
function getDefaultMode(): ContainerMode {
  if (window.electronAPI?.isDesktop) return 'native';
  return localStorage.getItem('container_mode') || 'browser';
}
```

In desktop mode:
- Mode selector is hidden (always native)
- Native API calls → `localhost:3334` (local agent)
- All other API calls → cloud server URL

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Electron as Desktop App
    participant Agent as Local Agent :3334
    participant Cloud as Cloud Server :3333
    participant FS as File System
    participant AI as AI Provider

    User->>Electron: Opens app
    Electron->>Agent: Start local agent
    Electron->>Cloud: Load Angular client

    User->>Cloud: Create/open project
    Cloud-->>User: Project data + files

    User->>Cloud: Send chat prompt
    Cloud->>AI: Stream code generation
    AI-->>Cloud: Generated code
    Cloud-->>User: Streaming response

    User->>Agent: Mount files (write to disk)
    Agent->>FS: Write project files
    Agent-->>User: Success

    User->>Agent: Start dev server
    Agent->>FS: npm install + ng serve
    FS-->>Agent: Dev server on localhost:4200
    Agent-->>User: Preview URL

    FS->>Agent: File changed (chokidar)
    Agent-->>User: SSE file update
```

## Node.js Bootstrap

The desktop app needs Node.js for running `npm install` and `ng serve`. On first launch:

1. Check if `node` is on PATH
2. If not, check for previously downloaded bundled Node
3. If neither, prompt user to download Node.js (~50MB one-time)
4. Downloads to `app.getPath('userData')/node/`
5. Prepends to PATH for all child processes

## Configuration

| Setting | Env Variable | Default |
|---------|-------------|---------|
| Cloud server URL | `ADORABLE_SERVER_URL` | `http://localhost:3333` |
| Local agent port | `ADORABLE_AGENT_PORT` | `3334` |
| Projects directory | `ADORABLE_PROJECTS_DIR` | `~/adorable-projects/` |

## File Structure

```
apps/desktop/
├── main.ts              # Electron main process
├── preload.ts           # Exposes electronAPI to renderer
├── local-agent.ts       # Standalone Express for native ops
├── node-bootstrap.ts    # Auto-download Node.js
├── package.json         # Electron app manifest + builder config
├── project.json         # Nx project targets
└── tsconfig.json        # TypeScript config

apps/server/src/
├── providers/container/
│   ├── native-manager.ts    # NativeManager (reusable)
│   └── native-registry.ts   # Multi-user registry (server-side)
└── routes/
    └── native.routes.ts      # Native routes (reusable)

apps/client/src/app/services/
├── native-container.engine.ts  # Client-side native engine
├── smart-container.engine.ts   # Mode switcher (browser/docker/native)
└── container-engine.ts         # Abstract base class
```

## Build & Run

```bash
# Development (all local)
npx nx serve server          # Cloud server on :3333
npx nx serve client          # Angular dev server on :4200
npx tsc -p apps/desktop/tsconfig.json && npx electron dist/apps/desktop/main.js

# Production packaging
npx nx build desktop         # Compiles desktop TypeScript
npx nx package desktop       # Packages with electron-builder
```

## Cross-Platform Targets

| Platform | Format | Tool |
|----------|--------|------|
| macOS | `.dmg` | electron-builder |
| Windows | `.exe` (NSIS) | electron-builder |
| Linux | `.AppImage` | electron-builder |
