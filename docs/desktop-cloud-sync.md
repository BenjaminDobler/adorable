# Desktop & Cloud Sync

The Electron desktop app (`apps/desktop`) wraps the client and server into a standalone application. Cloud sync enables desktop users to sync projects with a remote Adorable server.

## Desktop Architecture

```mermaid
flowchart TB
    subgraph "Electron"
        MAIN["Main Process<br/>(apps/desktop/src/main.ts)"]
        RENDER["Renderer Process<br/>(Angular Client)"]
    end

    subgraph "Embedded Server"
        SERVER["Express Server<br/>(in-process)"]
        SQLITE[(SQLite DB)]
    end

    subgraph "Native"
        FS["Native File System"]
        IPC["Electron IPC"]
    end

    MAIN --> SERVER
    MAIN --> RENDER
    RENDER -->|HTTP| SERVER
    RENDER -->|IPC| MAIN
    SERVER --> SQLITE
    MAIN --> FS
    IPC --> FS
```

The desktop app:
- Bundles the Express server as an in-process module
- Uses its own SQLite database (managed by `db-init.ts`, not Prisma migrations)
- Exposes native file system access via Electron IPC
- Uses `NativeContainerEngine` instead of Docker

## Cloud Sync Flow

```mermaid
sequenceDiagram
    participant D as Desktop Client
    participant CS as CloudSyncService
    participant R as Remote Server<br/>(adorable.run)

    Note over D, R: Authentication
    D->>CS: login(email, password)
    CS->>R: POST /api/auth/login
    R-->>CS: JWT token
    CS->>CS: Store cloud token separately

    Note over D, R: Project Sync
    D->>CS: syncProject(project)
    CS->>R: POST /api/projects (with cloud token)
    R-->>CS: Remote project ID
    CS->>CS: Store local↔remote mapping

    Note over D, R: Pull Updates
    D->>CS: pullProject(remoteId)
    CS->>R: GET /api/projects/:id
    R-->>CS: Project data + files
    CS->>D: Update local project
```

### Key Implementation Details

- **Separate tokens**: Cloud sync uses its own JWT token (stored separately from the local auth token) to authenticate with the remote server
- **Raw fetch**: `CloudSyncService` uses the browser's `fetch()` API directly instead of Angular's `HttpClient`, since the requests go to a different origin than the local server
- **Token storage**: Cloud token stored in localStorage under a different key than the local JWT
- **Error handling**: Network failures are handled gracefully — offline mode continues working

## Desktop Database Sync

```mermaid
flowchart TB
    SCHEMA["prisma/schema.prisma"]
    DBINIT["apps/desktop/db-init.ts"]

    SCHEMA -->|"Must mirror"| DBINIT

    subgraph "db-init.ts"
        FRESH["createFreshSchema()"]
        MIG["migrations[]"]
        VER["LATEST_VERSION"]
    end

    DBINIT --> FRESH
    DBINIT --> MIG
    DBINIT --> VER
```

The desktop app has its own database initialization system. Schema changes in Prisma must be manually replicated in `db-init.ts`.

## IPC Communication

```mermaid
flowchart LR
    RENDER["Renderer<br/>(Angular)"] -->|"ipcRenderer.invoke()"| MAIN["Main Process"]
    MAIN -->|"ipcMain.handle()"| RENDER

    MAIN --> READ["readFile"]
    MAIN --> WRITE["writeFile"]
    MAIN --> LIST["listFiles"]
    MAIN --> EXEC["execCommand"]
    MAIN --> SHELL["openExternal"]
```

The main process exposes file system and shell operations via IPC handlers. The `NativeContainerEngine` on the client calls these instead of Docker API endpoints.
