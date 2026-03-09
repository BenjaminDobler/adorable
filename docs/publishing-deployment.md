# Publishing & Deployment

Adorable supports publishing projects as live web apps with unique URLs, plus a full build and deployment pipeline.

## Publishing Flow

```mermaid
flowchart TB
    USER["User clicks Publish"]
    SLUG["Generate/set unique slug"]
    BUILD["Build Angular project"]
    DEPLOY["Deploy static assets"]

    subgraph "Public Access"
        PUB_URL["Public URL<br/>/public/:slug"]
        PRIVATE["Private (auth required)"]
        PUBLIC["Public (no auth)"]
    end

    USER --> SLUG --> BUILD --> DEPLOY
    DEPLOY --> PUB_URL
    PUB_URL --> PRIVATE
    PUB_URL --> PUBLIC
```

Projects can be published with:
- **Unique slug** — Human-readable URL identifier
- **Public/Private toggle** — Public projects accessible without authentication
- **Live preview** — Published apps are served as static Angular builds

## Build Pipeline

```mermaid
flowchart LR
    subgraph "Development"
        NX_SERVE["nx serve client<br/>Port 4200"]
        NX_SERVER["nx serve server<br/>Port 3333"]
        NX_ADMIN["nx serve admin<br/>Port 4201"]
    end

    subgraph "Production Build"
        BUILD_C["nx build client --prod"]
        BUILD_S["nx build server --prod"]
        BUILD_A["nx build admin --prod"]
    end

    subgraph "Output"
        DIST_C["dist/apps/client/"]
        DIST_S["dist/apps/server/"]
        DIST_A["dist/apps/admin/"]
    end

    BUILD_C --> DIST_C
    BUILD_S --> DIST_S
    BUILD_A --> DIST_A
```

## Production Serving

In production, the Express server serves both the client and admin SPAs:

```mermaid
flowchart TB
    SERVER["Express Server"]

    SERVER -->|"/admin/*"| ADMIN["Admin SPA<br/>(dist/apps/admin)"]
    SERVER -->|"/api/*"| API["API Routes"]
    SERVER -->|"/*"| CLIENT["Client SPA<br/>(dist/apps/client)"]
    SERVER -->|"/public/:slug"| PUB["Published Projects"]
```

## Desktop Packaging

```mermaid
flowchart LR
    BUILD["Build client + server"]
    BUNDLE["Bundle into Electron"]
    PACK["electron-builder"]

    subgraph "Outputs"
        MAC["macOS .dmg"]
        WIN["Windows .exe"]
        LINUX["Linux .AppImage"]
    end

    BUILD --> BUNDLE --> PACK
    PACK --> MAC
    PACK --> WIN
    PACK --> LINUX
```

## GitHub Integration

```mermaid
sequenceDiagram
    participant U as User
    participant A as Adorable
    participant GH as GitHub

    U->>A: Connect GitHub repo
    A->>GH: Create/verify webhook

    Note over A, GH: On code change
    A->>GH: Push updated files
    GH->>A: Webhook notification
    A->>A: Sync project files
```

Projects can be linked to GitHub repositories for version control. Webhooks enable bidirectional sync.
