# Server Architecture

The Express server (`apps/server`) handles AI orchestration, container management, authentication, project persistence, and publishing.

## Request Flow

```mermaid
flowchart TB
    REQ["Incoming Request"]

    subgraph "Middleware"
        CORS["CORS"]
        JSON["Body Parser"]
        RATE["Rate Limiter"]
        AUTH["authenticate()"]
        ADMIN["requireAdmin()"]
        CLOUD["cloudEditorAccess()"]
    end

    subgraph "Routes"
        R_AUTH["/api/auth"]
        R_ADMIN["/api/admin"]
        R_PROJ["/api/projects"]
        R_GEN["/api/generate-stream"]
        R_KITS["/api/kits"]
        R_TEAMS["/api/teams"]
        R_ANALYTICS["/api/analytics"]
        R_GITHUB["/api/github"]
        R_FIGMA["/api/figma"]
        R_MCP["/api/mcp"]
        R_SOCIAL["/api/auth/github<br/>/api/auth/google"]
    end

    REQ --> CORS --> JSON
    JSON --> R_AUTH
    JSON --> RATE --> AUTH
    AUTH --> R_PROJ
    AUTH --> R_GEN
    AUTH --> R_KITS
    AUTH --> R_TEAMS
    AUTH --> R_ANALYTICS
    AUTH --> R_GITHUB
    AUTH --> R_FIGMA
    AUTH --> R_MCP
    AUTH --> ADMIN --> R_ADMIN
    AUTH --> CLOUD --> R_GEN
    JSON --> R_SOCIAL
```

## Route Summary

| Route | Auth | Purpose |
|-------|------|---------|
| `/api/auth` | Public | Login, register, password reset, email verification |
| `/api/auth/github`, `/api/auth/google` | Public | OAuth social login flows |
| `/api/admin` | Admin | User management, invites, server config, stats |
| `/api/projects` | User | CRUD, publish/unpublish, public access |
| `/api/generate-stream` | User + Cloud | SSE AI generation (main endpoint) |
| `/api/kits` | User | Component kit discovery and lessons |
| `/api/teams` | User | Team workspaces, members, roles |
| `/api/analytics` | User | Token usage and cost tracking |
| `/api/github` | User | GitHub integration, webhooks |
| `/api/figma` | User | Figma design import |
| `/api/mcp` | User | Model Context Protocol servers |

## Server Configuration

Server-wide settings are stored in the `ServerConfig` database model and cached in memory by `ServerConfigService`. Settings include:

- `registration.mode` — `open` or `invite-only`
- `registration.emailVerification` — enable/disable email verification
- `cloudEditor.accessMode` — `open` or `allowlist`
- `cloudEditor.defaultAccess` — default access for new users

## Container Management

```mermaid
flowchart TB
    subgraph "Container Manager"
        CM["ContainerManager"]
        POOL["Container Pool"]
        HEALTH["Health Checks"]
    end

    CM --> CREATE["Create Container"]
    CM --> EXEC["Execute Command"]
    CM --> FILES["Read/Write Files"]
    CM --> DESTROY["Destroy Container"]

    CREATE --> DOCKER["Docker API"]
    EXEC --> DOCKER
    FILES --> DOCKER
    DESTROY --> DOCKER

    POOL -->|"Pre-warmed containers"| CREATE
    HEALTH -->|"Periodic checks"| POOL
```

The container manager handles Docker container lifecycle for user projects. Each project gets an isolated container with Angular CLI installed, enabling live preview and command execution.

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Server entry point, route mounting |
| `src/routes/auth.routes.ts` | Authentication endpoints |
| `src/routes/admin.routes.ts` | Admin panel API |
| `src/routes/project.routes.ts` | Project CRUD |
| `src/routes/generate.routes.ts` | AI generation SSE endpoint |
| `src/routes/social-auth.routes.ts` | GitHub/Google OAuth |
| `src/middleware/auth.ts` | JWT verification middleware |
| `src/middleware/admin.ts` | Admin role check |
| `src/middleware/rate-limit.ts` | Rate limiting config |
| `src/services/server-config.service.ts` | Cached server settings |
| `src/services/email.service.ts` | Nodemailer email sending |
| `src/services/container-manager.ts` | Docker container lifecycle |
