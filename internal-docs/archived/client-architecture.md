# Client Architecture

The main Angular client (`apps/client`) is the IDE frontend — a single-page application built with Angular 21, standalone components, and signals-based state management.

## Component Hierarchy

```mermaid
graph TB
    APP["AppComponent<br/>(app.ts)"]

    subgraph "Layout"
        NAV["NavbarComponent<br/>Top navigation + settings dialog"]
    end

    subgraph "Routes"
        DASH["DashboardComponent<br/>Project list"]
        EDITOR["EditorComponent<br/>Main IDE workspace"]
        PROFILE["ProfileComponent<br/>User settings"]
        LOGIN["LoginComponent"]
        REGISTER["RegisterComponent"]
    end

    subgraph "Editor Features"
        WORKSPACE["WorkspaceComponent<br/>Code editor + preview"]
        CHAT["ChatComponent<br/>AI conversation"]
        FILETREE["FileTreeComponent<br/>Project files"]
        PREVIEW["PreviewComponent<br/>Live app preview"]
        FIGPANEL["FigmaPanelComponent<br/>Figma import"]
    end

    subgraph "Profile Tabs"
        ACCT["AccountTabComponent"]
        PROV["ProvidersTabComponent"]
        INTEG["IntegrationsTabComponent"]
        MCP["McpTabComponent"]
        ABOUT["AboutTabComponent"]
    end

    APP --> NAV
    APP --> DASH
    APP --> EDITOR
    APP --> PROFILE
    APP --> LOGIN
    APP --> REGISTER
    EDITOR --> WORKSPACE
    EDITOR --> CHAT
    EDITOR --> FILETREE
    EDITOR --> PREVIEW
    EDITOR --> FIGPANEL
    PROFILE --> ACCT
    PROFILE --> PROV
    PROFILE --> INTEG
    PROFILE --> MCP
    PROFILE --> ABOUT
    NAV -->|"Settings Dialog"| ACCT
    NAV -->|"Settings Dialog"| PROV
    NAV -->|"Settings Dialog"| INTEG
    NAV -->|"Settings Dialog"| MCP
    NAV -->|"Settings Dialog"| ABOUT
```

## Routing

```mermaid
graph LR
    ROOT["/"] --> DASH["Dashboard<br/>(authGuard)"]
    ROOT --> ED["/editor/:id<br/>(authGuard + cloudEditorGuard)"]
    ROOT --> PROF["/profile<br/>(authGuard)"]
    ROOT --> LOGIN["/login"]
    ROOT --> REG["/register"]
    ROOT --> RESET["/reset-password"]
    ROOT --> PUB["/public/:slug<br/>(no auth)"]
```

Routes are defined in `app.routes.ts`. Protected routes use `authGuard` (checks JWT token) and `cloudEditorGuard` (checks cloud editor access).

## Core Services

```mermaid
graph TB
    subgraph "Services"
        API["ApiService<br/>HTTP client for all backend calls"]
        PROJ["ProjectService<br/>RxJS project state management"]
        AUTH["AuthService<br/>JWT token + user state"]
        THEME["ThemeService<br/>Light/dark/system theme"]
        ENGINE["SmartContainerEngine<br/>Routes to container backend"]
    end

    subgraph "Container Engines"
        LOCAL["LocalContainerEngine<br/>Docker via API"]
        NATIVE["NativeContainerEngine<br/>Electron IPC"]
    end

    ENGINE --> LOCAL
    ENGINE --> NATIVE
    API -->|"authInterceptor<br/>attaches JWT"| SERVER["Express Server"]
```

### Key Services

| Service | Purpose |
|---------|---------|
| `ApiService` | HTTP client wrapping all backend endpoints. Uses Angular's `HttpClient` with `authInterceptor` for JWT. |
| `ProjectService` | Manages active project state (files, messages, loading) via RxJS BehaviorSubjects. |
| `AuthService` | Handles login/register/logout, stores JWT in localStorage, exposes `isAuthenticated()` signal. |
| `ThemeService` | Manages theme (light/dark/system) with CSS variable swapping. |
| `SmartContainerEngine` | Detects environment and routes container operations to Docker (web) or Electron IPC (desktop). |
| `CloudSyncService` | Desktop-only service for syncing projects to a remote Adorable server. Uses raw `fetch()` instead of Angular HttpClient. |

## State Management

The app uses Angular signals for component-level state and RxJS for service-level state. There is no global store (NgRx/etc).

```mermaid
flowchart LR
    SIGNAL["Component Signals<br/>signal(), computed()"]
    RXJS["Service State<br/>BehaviorSubject, Observable"]
    API["API Calls<br/>HttpClient"]

    API --> RXJS
    RXJS -->|"toSignal()"| SIGNAL
    SIGNAL -->|"User actions"| API
```

## In-Editor Settings Dialog

The navbar includes a settings dialog that embeds all profile tab components, allowing users to change AI provider settings, account details, integrations, and MCP configuration without leaving the editor. The dialog is rendered outside the `<nav>` element to avoid CSS stacking context issues caused by `backdrop-filter`.
