# Architecture Diagrams

## 1. Software Component Architecture (Frontend)

This diagram shows the relationship between UI components, core services, and the hybrid execution engines.

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
        Smart[SmartContainerEngine]
        Store[FileSystemStore]
        API[ApiService]
    end

    subgraph Engines [Hybrid Engines]
        BrowserE[BrowserContainerEngine]
        LocalE[LocalContainerEngine]
    end

    subgraph Runtimes [Execution Runtimes]
        WCApi[["@webcontainer/api"]]
        Docker[[Docker Containers]]
    end

    %% Component to Service
    Chat -- "manages project" --> Proj
    Editor -- "updates files" --> Store
    Dash -- "loads/saves" --> Proj
    Explorer -- "selects files" --> Store
    Proj -- "syncs" --> Store
    
    %% Service to Engine
    Proj -- "coordinates" --> Smart
    Smart -- "proxies" --> BrowserE
    Smart -- "proxies" --> LocalE
    
    %% Engine to Runtime
    BrowserE -- "mounts/execs" --> WCApi
    LocalE -- "HTTP/WS Proxy" --> Docker
    
    %% Service to Backend
    Proj -- "calls" --> API
    API -- "REST / SSE" --> NodeBackend[[Express Backend]]
```

---

## 2. Backend Architecture (Modular)

The current refactored state of the Express server.

```mermaid
graph TD
    subgraph Express_App [Express Server :3333]
        Main[main.ts]
        Proxy[Proxy Middleware]
        Auth[Auth Middleware]
        
        subgraph Routers
            ProjR[Project Router]
            AuthR[Auth Router]
            AIR[AI Router]
            ContR[Container Router]
        end
        
        subgraph Providers
            DockerM[Docker Manager]
            LLM[LLM Factory]
        end
    end

    subgraph Persistence
        DB[(SQLite / Prisma)]
        HostFS[Host File System]
    end

    Main --> Proxy
    Main --> Routers
    
    Proxy -- "getUserId" --> Auth
    ProjR -- "CRUD" --> DB
    ContR -- "Orchestrates" --> DockerM
    AIR -- "Prompts" --> LLM
    
    DockerM -- "Volumes" --> HostFS
    DockerM -- "pkill/fuser" --> Containers[[User Containers]]
```

---

## 3. Infrastructure Architecture (Local)

The hybrid local environment using both in-browser virtualization and Docker.

```mermaid
graph TD
    subgraph Local_Machine [Developer Machine]
        Browser[Browser]
        Server[Node.js Server :3333]
        DB[(SQLite DB)]
        
        subgraph Docker_Engine [Docker Desktop]
            C1[[User A Container]]
            C2[[User B Container]]
        end
        
        Storage[./storage/projects/]
    end

    Browser -- "WebContainer" --> VirtualFS[Virtual File System]
    Browser -- "HTTP / WS (HMR)" --> Server
    
    Server -- "Proxy" --> C1
    Server -- "Proxy" --> C2
    Server -- "Prisma" --> DB
    
    C1 -- "Mount" --> Storage
    C2 -- "Mount" --> Storage
    
    Server -- "HTTPS" --> CloudLLM[AI APIs]
```

---

## 4. Container Abstraction (Class Diagram)

The implemented abstraction for execution engines.

```mermaid
classDiagram
    class ContainerEngine {
        <<abstract>>
        +mode: Signal
        +status: Signal
        +url: Signal
        +boot()*
        +mount()*
        +exec()*
        +stopDevServer()*
    }

    class SmartContainerEngine {
        -activeEngine: Computed
        +setMode(mode)
    }

    class BrowserContainerEngine {
        -webcontainer: WebContainer
    }
    
    class LocalContainerEngine {
        -apiUrl: string
    }

    ContainerEngine <|-- SmartContainerEngine : Extends
    ContainerEngine <|-- BrowserContainerEngine : Implements
    ContainerEngine <|-- LocalContainerEngine : Implements
    
    SmartContainerEngine o-- BrowserContainerEngine : Aggregates
    SmartContainerEngine o-- LocalContainerEngine : Aggregates

    link ContainerEngine "https://github.com/BenjaminDobler/adorable/blob/main/apps/client/src/app/services/container-engine.ts"
```

---

## 5. Remote Execution Flow (Future)

Proposed flow for remote Firecracker/MicroVM execution.

```mermaid
sequenceDiagram
    participant User
    participant Angular as Angular Client
    participant API as Backend API
    participant Fly as Remote Infrastructure

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