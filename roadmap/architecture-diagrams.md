# Architecture Diagrams

## 1. Software Component Architecture (Today)

This diagram shows the relationship between UI components, core services, and external dependencies in the current codebase.

```mermaid
graph LR
    subgraph UI_Layer [Angular Components]
        Chat[ChatComponent]
        Editor[EditorComponent]
        Terminal[TerminalComponent]
        Explorer[FileExplorer]
        Dash[Dashboard]
    end

    subgraph Service_Layer [Core Services]
        Proj[ProjectService]
        WC[WebContainerService]
        API[ApiService]
        Tpl[TemplateService]
    end

    subgraph External_Runtime [Runtime]
        WCApi[["@webcontainer/api"]]
        ServerProxy[[Express Backend]]
    end

    %% Component to Service
    Chat -- "manages project" --> Proj
    Editor -- "updates files" --> Proj
    Dash -- "loads/saves" --> Proj
    Explorer -- "selects files" --> Proj
    
    %% Service to Service
    Proj -- "coordinates" --> WC
    Proj -- "calls" --> API
    Chat -- "visual edits" --> Tpl
    
    %% Service to External
    WC -- "mounts/execs" --> WCApi
    API -- "HTTPS" --> ServerProxy
```

---

## 2. Infrastructure Architecture (Monolith / Local)

This represents the current state of the application running on your local machine.

```mermaid
graph TD
    subgraph Local_Machine [Developer Machine]
        Browser[Browser]
        Server[Node.js Server :3333]
        DB[(SQLite DB)]
        LLM[LLM Providers]
    end

    Browser -- "HTTP / API" --> Server
    Browser -- "WebContainer (In-Browser Node.js)" --> BrowserFS[Virtual File System]
    
    Server -- "Prisma" --> DB
    Server -- "HTTP" --> LLM
    
    LLM -.-> |Gemini/Anthropic| Server
```

---

## 2. Proposed Split Deployment (Production)

The target architecture for deployment on Render and GitHub Pages.

```mermaid
graph TD
    subgraph Client_Side [User's Browser]
        AngularApp[Angular App (GitHub Pages)]
        WC[WebContainer Runtime]
    end

    subgraph Backend [Render.com]
        APIServer[Node.js API Service]
        Postgres[(PostgreSQL DB)]
    end

    subgraph External
        Anthropic[Anthropic API]
        Google[Google Gemini API]
    end

    AngularApp -- "HTTPS (API)" --> APIServer
    AngularApp -- "Executes Code" --> WC
    
    APIServer -- "Read/Write" --> Postgres
    APIServer -- "Prompt" --> Anthropic
    APIServer -- "Prompt" --> Google
```

---

## 3. Future Container Abstraction (Hybrid Engine)

The proposed architecture to support both in-browser and server-side execution.

```mermaid
classDiagram
    class ProjectService {
        +loadProject()
        +saveProject()
        +engine: ContainerEngine
    }

    class ContainerEngine {
        <<Interface>>
        +boot()
        +mount()
        +exec()
    }

    class BrowserContainerEngine {
        -webcontainer: WebContainer
        +boot()
        +mount()
        +exec()
    }

    class RemoteContainerEngine {
        -apiEndpoint: string
        +boot()
        +mount()
        +exec()
    }
    
    class LocalContainerEngine {
        -dockerSocket: string
        +boot()
        +mount()
        +exec()
    }

    ProjectService --> ContainerEngine
    ContainerEngine <|-- BrowserContainerEngine : Implements
    ContainerEngine <|-- RemoteContainerEngine : Implements
    ContainerEngine <|-- LocalContainerEngine : Implements

    note for BrowserContainerEngine "Uses @webcontainer/api\n(Current Implementation)"
    note for RemoteContainerEngine "Uses Fly.io / Firecracker\n(Future - Phase 1)"
    note for LocalContainerEngine "Uses Local Docker/Podman\n(Future - Dev Mode)"
```

---

## 4. Remote Execution Flow (Sequence)

How the frontend interacts with a remote MicroVM backend.

```mermaid
sequenceDiagram
    participant User
    participant Angular as Angular Client
    participant API as Backend API
    participant Fly as Fly.io / Firecracker

    User->>Angular: Opens Project
    Angular->>API: POST /session/start
    API->>Fly: Spawn Machine (VM)
    Fly-->>API: Machine Ready (IP: 10.x.x.x)
    API-->>Angular: Session Token + WebSocket URL

    Angular->>API: WS Connect (via Proxy)
    API->>Fly: Proxy WS Stream
    
    Note over Angular, Fly: Real-time Terminal Stream

    User->>Angular: "npm start"
    Angular->>API: Exec "npm start"
    API->>Fly: Run Command
    Fly-->>API: Logs...
    API-->>Angular: Logs...
```
