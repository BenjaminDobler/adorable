# Adorable

**Adorable** is a next-generation, AI-powered IDE for Angular. Build, preview, and deploy full-stack Angular applications using natural language. Available as a **web app** or a **standalone desktop app** (Electron), powered by **Anthropic Claude** and **Google Gemini**, with flexible execution engines including **Docker** and **native** (desktop).

<p align="center">
  <img src="apps/client/public/logo.png" alt="Adorable Logo" width="120" />
</p>

## Key Features

### AI-Powered Development
*   **Natural Language IDE:** Describe your app and watch Adorable build the file structure, logic, and styles in real-time via a streaming agentic loop.
*   **Multiple AI Providers:** Choose between Anthropic Claude and Google Gemini models. Users bring their own API keys, stored with AES-256 encryption.
*   **Skills System:** Extend the AI with custom instructions. Create your own skills, upload SKILL.md files, or install from GitHub repositories. Skills inject conditional system prompt additions to specialize the AI for specific tasks.
*   **Kit Lessons:** The AI automatically discovers and persists component patterns, workarounds, and gotchas during generation sessions. Lessons are scoped per-user or promoted to kit-wide for the whole team.
*   **MCP Server Support:** Connect external Model Context Protocol servers (HTTP or stdio transport) to give the AI access to additional tools. Configure per-user or per-kit.

### Runtime Engines
*   **Local Docker:** Multi-tenant containerized execution for persistent, high-performance development. Background reaper pauses idle containers (15m) and hibernates them (2h) to save resources.
*   **Native (Desktop):** Direct filesystem execution in the Electron desktop app without Docker.
*   **OXC-Powered Dev Server:** Uses [ong](https://github.com/nicolo-ribaudo/ong) — an OXC/Vite-based Angular dev server written in Rust — as the default for both generated and external projects. Delivers significantly faster builds and enables compile-time template annotations for the visual editor.

### External Project Support (Desktop)
*   **Open Existing Projects:** Open any Angular CLI or Nx workspace project directly in Adorable via **File > Open Folder**.
*   **Auto-Detection:** Automatically detects project type, framework, package manager (npm/yarn/pnpm), available apps, and configurations by scanning `angular.json`, `nx.json`, and lock files.
*   **Nx Workspace Support:** Full multi-app workspace support — discover apps, select which one to work on, and scope all AI context and file operations to the selected app. Commands are automatically scoped (e.g., `ong serve --project apps/editor`).
*   **Lazy File Loading:** External projects load in structure-only mode initially; file contents are lazy-loaded on demand to handle large codebases.

### Kit Builder
*   **Component Kits:** Create reusable starter kits with custom templates, npm packages, component libraries, and AI instructions.
*   **Storybook & NPM Discovery:** Automatically discover components from Storybook URLs or npm packages with metadata extraction.
*   **Component Documentation:** Auto-generated `.adorable/` documentation files that teach the AI how to use your component library.
*   **Custom System Prompts:** Override or extend the AI system prompt per-kit for specialized behavior.
*   **Kit Cloud Sync:** Publish kits to your cloud server and download them on other instances. Kits auto-sync when importing projects that reference them.

### Design & Visual Tools
*   **Figma Integration:** Import designs directly from Figma via API (with Personal Access Token) or via the Adorable Figma Plugin for local exports. Browse layers, preview on hover, and send individual layers to chat.
*   **Visual Inspector:** Click elements in the live preview to identify Angular components and ask the AI for targeted edits.
*   **Visual Editor Panel:** Select elements in the preview to edit styles visually — colors, spacing, borders, flex layout, text, CSS classes — with a **Go to Code** button to jump directly to the source file and line.
*   **Ong Template Annotations:** For external projects, ong injects rich compile-time annotations (exact file:line:col, component metadata, bindings, loop/conditional context) so the visual editor and AI can precisely locate and modify template elements without guessing.
*   **Multi-Element Batch Edits:** Select multiple elements on the preview and add per-element instructions. Adorable compiles a structured prompt with source locations and context for each element.
*   **Annotation Overlay:** Draw freehand, arrows, rectangles, and text labels directly on the preview to communicate design intent to the AI.

### Translation Management
*   **Built-in i18n Panel:** Auto-discovers i18n directories and JSON/JSONC translation files. Edit keys and values directly in a dedicated translations panel.
*   **Multi-Locale Editing:** Key renames propagate across all locale files; value changes are scoped to the active locale.
*   **Live Preview Reload:** Translation changes trigger HMR to auto-reload the preview without a full rebuild.

### Editor & Preview
*   **Monaco Editor:** VS Code-powered editing with live sync to the preview.
*   **Interactive Terminal:** Dedicated tabs for server logs, interactive shell, and browser console.
*   **Open in VS Code:** (Docker mode) Open projects as a local folder or attach to the running container via Dev Containers. File changes sync back in real-time.
*   **Time Travel:** Restore your project to any previous state in the chat history.
*   **Project Settings:** Configure dev server port, localStorage presets, and cookie presets per project. For Nx workspaces, settings are stored per-app so each app gets its own configuration.

### CDP Browser Tools (Desktop)
The AI has access to Chrome DevTools Protocol tools for inspecting the running preview — available in both docked and undocked preview modes:
*   **`browse_screenshot`** — Capture a screenshot of the running app to visually verify UI changes.
*   **`browse_evaluate`** — Execute JavaScript in the preview to inspect DOM, read state, or debug.
*   **`browse_accessibility`** — Get the full accessibility tree for structure and ARIA analysis.
*   **`browse_console`** — Read buffered console messages (log, warn, error) from the running app.
*   **`browse_navigate`** / **`browse_click`** — Navigate to routes and click elements to test interactivity.
*   **Post-Build Verification:** After a successful build, the AI automatically uses browser tools to check for runtime errors and visually verify the result.

### Undockable Preview (Desktop)
*   **Docked Mode:** Preview renders as a `<webview>` embedded in the main editor window.
*   **Undocked Mode:** Pop out the preview into a separate floating window with its own toolbar, device frame selection, and annotation tools. Window position and size are persisted.
*   **Seamless Toggle:** Switch between docked and undocked via the preview toolbar. CDP browser tools work in both modes.

### Deployment & Sync
*   **One-Click Publishing:** Build and publish to a live, shareable URL. Supports public and password-protected private sites.
*   **GitHub Integration:** Connect repositories, push/pull sync, and one-click deploy to GitHub Pages with automatic workflow generation.
*   **Cloud Sync (Desktop):** Connect your desktop app to a cloud Adorable server. Push, pull, and import projects with full sync status tracking. Kits and skills sync automatically alongside projects.

### Teams
*   **Team Workspaces:** Create teams with shared projects, kits, and skills. Switch between personal and team workspaces in the dashboard.
*   **Role-Based Access:** Owner, admin, and member roles with appropriate permissions.
*   **Team Invites:** Generate invite codes to add members. Transfer ownership between team members.

### Desktop App
*   **Standalone Electron App:** Bundles the server and client into a native macOS/Windows/Linux application.
*   **Native Execution:** Run Angular projects directly on your machine without Docker.
*   **Open External Projects:** Work on existing Angular/Nx projects in-place without copying files.
*   **Offline-First:** Works without an internet connection (bring your own API keys).
*   **Cloud Connect:** Link to a remote Adorable server for cross-device project sync.
*   **Auto-Updates:** Built-in update checker with download progress and one-click install.

### Authentication & Administration
*   **User Auth:** Email/password registration and login with JWT tokens. Social login via GitHub and Google OAuth.
*   **Password Recovery:** Forgot password and email-based password reset flow.
*   **Admin Panel:** Separate dashboard for user management, invite codes, server configuration, and usage statistics.
*   **Invite-Only Mode:** Optionally restrict registration to invite codes.
*   **Email Verification:** Optional email verification via SMTP.
*   **Cloud Editor Access Control:** Restrict cloud editor access to an allowlist of users. Blocked users are directed to download the desktop app.
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
1. `ProviderFactory` selects a provider (Anthropic or Gemini)
2. `BaseLLMProvider` implements the shared agentic loop: builds context, streams responses, executes tool calls (`read_files`, `write_files`, `run_command`), and iterates until success or max turns
3. Tool definitions in `providers/tools.ts`; kit-specific tools in `providers/kit-tools.ts`
4. Skill instructions in `providers/skills/` inject conditional system prompt additions

### Streaming Protocol
AI generation uses Server-Sent Events (SSE). The client POSTs to `/api/generate-stream` and receives streamed events: `file_written`, `stream`, `tool_call`, `tool_result`, `status`.

### Database
Prisma with SQLite. Key models: `User`, `Project`, `ChatMessage` (with file snapshots for time-travel), `Team`, `TeamMember`, `KitLesson`, `GitHubWebhook`, `InviteCode`, `ServerConfig`.

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
| `PORT` | Backend port (default 3333) |
| `JWT_SECRET` | JWT signing secret |
| `ENCRYPTION_KEY` | AES-256 key for API key encryption |
| `DATABASE_URL` | Prisma SQLite path (default `file:./dev.db`) |
| `DOCKER_SOCKET_PATH` | Docker socket for local container mode |
| `GITHUB_CLIENT_ID/SECRET` | Optional, for GitHub OAuth login |
| `GOOGLE_CLIENT_ID/SECRET` | Optional, for Google OAuth login |
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
2.  **Choose Engine:** Toggle between **Local Docker** or **Native** (desktop) mode.
3.  **Select a Kit:** When creating a project, choose a starter kit to bootstrap with specific templates and component libraries.
4.  **Generate:** Type a prompt like *"Create a project management dashboard with signals"* in the Chat tab.
5.  **Visual Edit:** Use the **Inspect** icon in the preview toolbar, click a UI element, and tell the AI what to change — or edit styles directly in the visual editor panel.
6.  **Batch Edit:** Select multiple elements, add per-element instructions, and apply all changes in one go.
7.  **Annotate:** Click the **pencil** icon to draw on the preview — freehand, arrows, rectangles, text labels — then send the annotated screenshot to the AI.
8.  **Time Travel:** Click any previous message in the chat to restore the project to that point.
9.  **Translations:** Use the **Translations** tab to edit i18n JSON files with instant preview reload.

### External Projects (Desktop)

1.  **Open Folder:** Use **File > Open Folder** (or Cmd/Ctrl+O) to open an existing Angular or Nx project.
2.  **Select App:** For Nx workspaces with multiple apps, Adorable shows a picker to select which app to work on.
3.  **Configure Settings:** Use the **Project Settings** panel to set dev server port, localStorage presets, and cookies. Settings are stored per-app for multi-app workspaces.
4.  **Develop:** All AI generation, visual editing, and file operations are scoped to the selected app.

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

### Teams

1.  Click the **+** button in the workspace switcher to create a team.
2.  Share invite codes with teammates so they can join.
3.  Move projects and kits between personal and team workspaces.
4.  Manage members and roles in **Team Settings**.

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
Built with [Nx](https://nx.dev), [Angular](https://angular.dev), [Docker](https://docker.com), and [Electron](https://www.electronjs.org).
