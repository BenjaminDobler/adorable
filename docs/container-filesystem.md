# Container & File System

Adorable uses a container abstraction to provide isolated environments for building and previewing Angular projects. The file system layer provides a unified interface across different storage backends.

## Container Architecture

```mermaid
flowchart TB
    subgraph "Client"
        SCE["SmartContainerEngine"]
    end

    subgraph "Engines"
        LCE["LocalContainerEngine<br/>(Docker)"]
        NCE["NativeContainerEngine<br/>(Electron IPC)"]
    end

    subgraph "Server"
        CM["ContainerManager"]
        POOL["Container Pool"]
    end

    subgraph "Runtime"
        DOCKER["Docker Containers"]
        NATIVE["Native Filesystem"]
    end

    SCE -->|"Web mode"| LCE --> CM --> DOCKER
    SCE -->|"Desktop mode"| NCE --> NATIVE
    CM --> POOL
```

### SmartContainerEngine

The `SmartContainerEngine` on the client detects the runtime environment and routes operations:

- **Web/Cloud mode** → `LocalContainerEngine` → Docker containers via server API
- **Desktop mode** → `NativeContainerEngine` → Direct filesystem access via Electron IPC

## File System Abstraction

```mermaid
classDiagram
    class FileSystemInterface {
        <<interface>>
        +readFile(path): string
        +writeFile(path, content)
        +deleteFile(path)
        +listFiles(dir): string[]
        +exists(path): boolean
    }

    class DiskFileSystem {
        -basePath: string
        +readFile()
        +writeFile()
    }

    class MemoryFileSystem {
        -files: Map
        +readFile()
        +writeFile()
    }

    class ContainerFileSystem {
        -containerId: string
        +readFile()
        +writeFile()
    }

    FileSystemInterface <|-- DiskFileSystem
    FileSystemInterface <|-- MemoryFileSystem
    FileSystemInterface <|-- ContainerFileSystem
```

| Implementation | Backend | Use Case |
|---------------|---------|----------|
| `DiskFileSystem` | Local disk | Desktop mode, server-side file ops |
| `MemoryFileSystem` | In-memory Map | Fallback, testing, temporary storage |
| `ContainerFileSystem` | Docker/Native | Active project editing |

## Container Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Creating: User opens project
    Creating --> Running: Container ready
    Running --> Executing: Run command
    Executing --> Running: Command complete
    Running --> WritingFiles: AI writes code
    WritingFiles --> Running: Files synced
    Running --> Destroyed: User closes project
    Destroyed --> [*]

    Running --> HealthCheck: Periodic check
    HealthCheck --> Running: Healthy
    HealthCheck --> Creating: Unhealthy (recreate)
```

## Container Operations

Each container provides:

- **File I/O**: Read/write project files inside the container
- **Command Execution**: Run Angular CLI commands (`ng serve`, `ng build`, etc.)
- **Live Preview**: Forward dev server port for iframe preview
- **Package Management**: Install npm dependencies
- **File Watching**: Detect changes for hot reload

## Docker Container Setup

When a new project container is created:

1. Pull/use base image with Node.js + Angular CLI
2. Initialize Angular project scaffold
3. Install dependencies
4. Start dev server
5. Expose preview port
6. Container is ready for AI code generation

## File Write Debouncing

Container file writes are debounced to avoid preview churn while the AI is actively writing multiple files. This prevents the Angular dev server from recompiling after every individual file change during a generation cycle.
