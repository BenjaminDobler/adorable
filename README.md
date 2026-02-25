# Adorable

**Adorable** is a next-generation, AI-powered IDE for Angular. Build, preview, and deploy full-stack Angular applications using natural language. Available as a **web app** or a **standalone desktop app** (Electron), powered by **Anthropic Claude** and **Google Gemini**, with flexible execution engines including **WebContainers**, **Docker**, and **native** (desktop).

<p align="center">
  <img src="apps/client/public/logo.png" alt="Adorable Logo" width="120" />
</p>

## Key Features

### AI-Powered Development
*   **Natural Language IDE:** Describe your app and watch Adorable build the file structure, logic, and styles in real-time via a streaming agentic loop.
*   **Multiple AI Providers:** Choose between Anthropic Claude and Google Gemini models. Configure API keys per-user with AES-256 encryption.
*   **Skills System:** Extend the AI with custom instructions. Create your own skills, upload SKILL.md files, or install from GitHub repositories. Skills inject conditional system prompt additions to specialize the AI for specific tasks.
*   **MCP Server Support:** Connect external Model Context Protocol servers (HTTP or stdio transport) to give the AI access to additional tools. Configure per-user or per-kit.

### Runtime Engines
*   **Browser (WebContainer):** Zero-setup, instant booting in the browser. No Docker required.
*   **Local Docker:** Multi-tenant containerized execution for persistent, high-performance development. Background reaper pauses idle containers (15m) and hibernates them (2h) to save resources.
*   **Native (Desktop):** Direct filesystem execution in the Electron desktop app without Docker or WebContainers.

### Kit Builder
*   **Component Kits:** Create reusable starter kits with custom templates, npm packages, component libraries, and AI instructions.
*   **Storybook & NPM Discovery:** Automatically discover components from Storybook URLs or npm packages with metadata extraction.
*   **Component Documentation:** Auto-generated `.adorable/` documentation files that teach the AI how to use your component library.
*   **Custom System Prompts:** Override or extend the AI system prompt per-kit for specialized behavior.
*   **Kit Cloud Sync:** Publish kits to your cloud server and download them on other instances. Kits auto-sync when importing projects that reference them.

### Design & Visual Tools
*   **Figma Integration:** Import designs directly from Figma via API (with Personal Access Token) or via the Adorable Figma Plugin for local exports. Browse layers, preview on hover, and send individual layers to chat.
*   **Visual Inspector:** Click elements in the live preview to identify Angular components and ask the AI for targeted edits.
*   **Annotation Overlay:** Draw freehand, arrows, rectangles, and text labels directly on the preview to communicate design intent to the AI.

### Editor & Preview
*   **Monaco Editor:** VS Code-powered editing with live sync to the preview.
*   **Interactive Terminal:** Dedicated tabs for server logs, interactive shell, and browser console.
*   **Open in VS Code:** (Docker mode) Open projects as a local folder or attach to the running container via Dev Containers. File changes sync back in real-time.
*   **Time Travel:** Restore your project to any previous state in the chat history.

### Deployment & Sync
*   **One-Click Publishing:** Build and publish to a live, shareable URL instantly.
*   **GitHub Integration:** Connect repositories, push/pull sync, and one-click deploy to GitHub Pages with automatic workflow generation.
*   **Cloud Sync (Desktop):** Connect your desktop app to a cloud Adorable server. Push, pull, and import projects with full sync status tracking. Kits and skills sync automatically alongside projects.

### Desktop App
*   **Standalone Electron App:** Bundles the server and client into a native macOS/Windows/Linux application.
*   **Native Execution:** Run Angular projects directly on your machine without Docker.
*   **Offline-First:** Works without an internet connection (bring your own API keys).
*   **Cloud Connect:** Link to a remote Adorable server for cross-device project sync.

### Administration
*   **Admin Panel:** Separate dashboard for user management, invite codes, server configuration, and usage statistics.
*   **Invite-Only Mode:** Optionally restrict registration to invite codes.
*   **Email Verification:** Optional email verification via SMTP.
*   **Usage Analytics:** Track token usage and costs by model, project, and time range.

## Architecture

Adorable is an **Nx monorepo**:

| App | Description |
|-----|-------------|
| `apps/client` | Angular 21 SPA (standalone components, signals, SCSS) |
| `apps/server` | Express API server (AI orchestration, Docker management, auth) |
| `apps/admin` | Admin dashboard (separate Angular app, served at `/admin/`) |
| `apps/desktop` | Electron main process (wraps client + server for desktop) |
| `apps/figma-plugin` | Figma plugin for design export |
| `libs/shared-types` | Shared TypeScript interfaces between client and server |
| `prisma/` | SQLite schema and migrations |

### AI Provider System
1. `ProviderFactory` / `SmartRouter` selects a provider (Anthropic or Gemini)
2. `BaseLLMProvider` implements the shared agentic loop: builds context, streams responses, executes tool calls (`read_files`, `write_files`, `run_command`), and iterates until success or max turns
3. Tool definitions in `providers/tools.ts`; kit-specific tools in `providers/kit-tools.ts`
4. Skill instructions in `providers/skills/` inject conditional system prompt additions

### Streaming Protocol
AI generation uses Server-Sent Events (SSE). The client POSTs to `/api/generate-stream` and receives streamed events: `file_written`, `stream`, `tool_call`, `tool_result`, `status`.

### Database
Prisma with SQLite. Key models: `User`, `Project`, `ChatMessage` (with file snapshots for time-travel), `GitHubWebhook`, `InviteCode`, `ServerConfig`.

## Setup & Installation

### Prerequisites
- **Node.js 20+**
- **Docker Desktop** (optional, for Local Docker mode)

### 1. Clone & Install
```bash
git clone <repository-url>
cd adorable
npm install
```

### 2. Environment
```bash
cp .env.template .env
```

Key variables:
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | For server-side AI calls |
| `PORT` | Backend port (default 3333) |
| `JWT_SECRET` | JWT signing secret |
| `ENCRYPTION_KEY` | AES-256 key for API key encryption |
| `DATABASE_URL` | Prisma SQLite path (default `file:./dev.db`) |
| `DOCKER_SOCKET_PATH` | Docker socket for local container mode |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Optional, for email verification |

### 3. Run

```bash
# Start backend (API & Docker Manager)
npx nx serve server

# Start frontend (separate terminal)
npx nx serve client

# Start admin panel (optional, separate terminal)
npx nx serve admin
```

### Desktop App
```bash
# Development
npm run start:desktop

# Package for macOS
npm run package:desktop:mac
```

## Usage Guide

1.  **Configure Keys:** Go to **Profile** to set your AI provider and API keys. Keys are encrypted in the database.
2.  **Choose Engine:** Toggle between **Browser** (WebContainer), **Local Docker**, or **Native** (desktop) mode.
3.  **Select a Kit:** When creating a project, choose a starter kit to bootstrap with specific templates and component libraries.
4.  **Generate:** Type a prompt like *"Create a project management dashboard with signals"* in the Chat tab.
5.  **Visual Edit:** Use the **Inspect** icon in the preview toolbar, click a UI element, and tell the AI what to change.
6.  **Annotate:** Click the **pencil** icon to draw on the preview — freehand, arrows, rectangles, text labels — then send the annotated screenshot to the AI.
7.  **Time Travel:** Click any previous message in the chat to restore the project to that point.

### Skills

Skills extend the AI with custom instructions for specialized tasks.

*   **Create:** Go to the **Skills** tab in the dashboard and click **New Skill**.
*   **Upload:** Import a `SKILL.md` file with YAML frontmatter (`name`, `description`, `triggers`).
*   **Install from GitHub:** Click the GitHub icon to browse and install skill repositories.
*   **Cloud Sync:** Publish skills to your cloud server or download skills from it.

### Kit Builder

Kits are reusable project starters with custom templates, component libraries, and AI instructions.

1.  Go to the **Kits** tab in the dashboard and click **Create Kit**.
2.  Configure the kit: name, template files, npm packages, Storybook URL, system prompt overrides.
3.  Adorable auto-discovers components and generates documentation the AI uses to write correct code.
4.  Select the kit when creating a new project.

### Cloud Sync (Desktop)

1.  Go to **Profile > Cloud Sync** and log in to your cloud Adorable server.
2.  The **Cloud** tab appears in the dashboard showing all cloud projects, kits, and skills.
3.  **Download** cloud projects to your desktop (referenced kits auto-download).
4.  **Publish** local projects to the cloud (referenced kits auto-publish).
5.  **Push/Pull** to sync changes between desktop and cloud.
6.  Publish/download kits and skills independently via upload icons on their cards.

### GitHub Integration

1.  Go to **Profile** and click **Connect GitHub**.
2.  In the editor, click the **GitHub** icon to link a repository (new or existing).
3.  **Push/Pull** to sync changes with GitHub.
4.  **Deploy to GitHub Pages** with one click — Adorable creates the workflow and enables Pages automatically.

### Figma Integration

**Option A: API Import**
1.  Add your Figma Personal Access Token in **Profile**.
2.  Open the **Figma** tab in the sidebar, paste a file URL, and import frames.

**Option B: Plugin Export**
1.  Build the plugin: `npx nx run figma-plugin:build`
2.  Load in Figma Desktop via **Plugins > Development > Import plugin from manifest**.
3.  Export frames and drag the `.json` file into Adorable.

Browse imported layers, hover to preview, and click **Use** to send individual layers to chat.

### MCP Servers

1.  Go to **Profile > MCP Servers**.
2.  Add servers via HTTP URL or stdio command.
3.  Test the connection and view available tools.
4.  Enable/disable servers globally or assign them to specific kits.

## Development Commands

```bash
# Build
npx nx build client --configuration=production
npx nx build server --configuration=production
npx nx build admin --configuration=production

# Testing
npx nx test client           # Vitest (Angular)
npx nx test server           # Vitest
npx nx e2e client-e2e        # Playwright

# Linting
npx nx lint client
npx nx lint server

# Database
npx prisma generate          # After schema changes
npx prisma migrate dev       # Create migration
npx prisma studio            # GUI inspector (port 5555)
```

---
Built with [Nx](https://nx.dev), [Angular](https://angular.dev), [WebContainers](https://webcontainers.io), [Docker](https://docker.com), and [Electron](https://www.electronjs.org).
