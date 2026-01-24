# Adorable

**Adorable** is a next-generation, AI-powered IDE for Angular. It allows you to build, preview, and deploy full-stack Angular applications using natural language, powered by **Claude 3.5 Sonnet**, **Google Gemini**, and a flexible execution engine supporting both **WebContainers** and **Docker**.

<p align="center">
  <img src="apps/client/public/logo.png" alt="Adorable Logo" width="120" />
</p>

## 🚀 Key Features

*   **Natural Language IDE:** Describe your app and watch Adorable build the file structure, logic, and styles in real-time.
*   **Figma Integration 🎨:** Import designs directly from Figma and let AI generate Angular components.
    *   **API Import:** Connect with your Figma Personal Access Token to browse and select frames.
    *   **Plugin Export:** Use the Adorable Figma Plugin for local exports without API rate limits.
    *   **Layer Selection:** Browse imported design layers, preview highlights on hover, and select individual layers to use in chat.
    *   **Persistent Imports:** Figma imports are saved with your project for future reference.
*   **Dual Runtime Engines:**
    *   **Browser-based:** Powered by **WebContainer API** for zero-setup, instant booting.
    *   **Local Docker:** Multi-tenant containerized execution for persistent, high-performance development.
*   **Smart Lifecycle Management 🧠:** (Local Mode) Background reaper automatically pauses idle containers (15m) and hibernates them (2h) to save CPU/RAM.
*   **Streaming XML Protocol:** Ultra-fast, token-efficient code generation using a custom streaming protocol.
*   **Visual Inspector 🔍:** Click elements in your live app to identify their Angular components and ask the AI for targeted visual edits.
*   **Interactive Terminal 💻:** Subdivided terminal with dedicated tabs for **Server Logs**, **Interactive Shell**, and **Browser Console**.
*   **One-Click Publishing 📤:** Build your app and publish it to a live, shareable URL instantly.
*   **GitHub Integration 🐙:** Full GitHub sync and deployment support:
    *   **Connect Repositories:** Link projects to new or existing GitHub repos.
    *   **Push/Pull Sync:** Two-way sync between Adorable and GitHub.
    *   **GitHub Pages Deployment:** One-click deploy to GitHub Pages with automatic workflow generation.
*   **Monaco Editor:** A VS Code-powered editing experience with live sync to the preview.
*   **Time Travel Snapshots:** Restore your project to any previous state in the chat history.

## 🏗 Architecture

Adorable is built as an **Nx monorepo**:

*   **Frontend (`apps/client`):**
    *   **Angular 21** (Signals-based).
    *   `SmartContainerEngine` for switching between Browser and Local runtimes.
    *   `monaco-editor` integration.
    *   Figma panel for importing and browsing designs.
*   **Backend (`apps/server`):**
    *   Node.js / Express proxy for AI providers and Docker management.
    *   **Unified Proxy Middleware:** Handles dynamic routing for both HTTP and WebSockets (HMR).
    *   Prisma + SQLite for project persistence.
    *   Figma API proxy with PAT authentication.
*   **Figma Plugin (`apps/figma-plugin`):**
    *   Standalone Figma plugin for exporting designs without API rate limits.
    *   Exports JSON structure + rendered images as base64.
*   **AI Providers:**
    *   **Anthropic:** Claude 3.5 Sonnet (Optimized for code).
    *   **Google:** Gemini 1.5 Pro / Flash.

## 🛠 Setup & Installation

### Prerequisites
- **Node.js 20+**
- **Docker Desktop** (Optional, required for Local Docker mode)

### 1. Clone & Install
```bash
git clone <repository-url>
cd adorable
npm install
```

### 2. Environment
Create a `.env` file:
```bash
cp .env.template .env
```
Add your AI API keys and an `ENCRYPTION_KEY` (used for securing API keys in the DB).

### 3. Run
```bash
# Start Backend (API & Docker Manager)
npx nx serve server

# Start Frontend
npx nx serve client
```

## 📖 Usage Guide

1.  **Configure Keys:** Click on **Profile** to set your preferred AI provider and API keys. Keys are encrypted and stored in your profile.
2.  **Choose Engine:** In the IDE header, toggle between **Browser** (WebContainer) and **Local Docker** mode.
3.  **Generate:** Type a prompt like *"Create a project management dashboard with signals"* in the Chat tab.
4.  **Visual Edit:** Use the **Inspect** icon in the preview toolbar, click a UI element, and tell the AI what to change.
5.  **Persistence:** In Local Docker mode, your code is persisted in `./storage/projects/${userId}` on your host machine, ensuring it survives container restarts.

### GitHub Integration

1.  **Connect GitHub:** Go to **Profile** and click **Connect GitHub** to authorize Adorable.
2.  **Link a Repository:** In the editor, click the **GitHub** icon in the navbar.
    *   Select an existing repository, or
    *   Click **Create New Repository** to create one automatically.
3.  **Sync Changes:**
    *   **Push:** Send your project files to GitHub.
    *   **Pull:** Fetch the latest changes from GitHub.
4.  **Deploy to GitHub Pages:**
    *   Click **Deploy to Pages** in the GitHub panel.
    *   Adorable automatically:
        *   Makes the repo public (required for free GitHub Pages)
        *   Creates a GitHub Actions workflow with correct `--base-href`
        *   Enables GitHub Pages
    *   Your site will be live at `https://<username>.github.io/<repo-name>/`

### Figma Integration

**Option A: API Import (requires Figma PAT)**
1.  Go to **Profile** and add your Figma Personal Access Token.
2.  Switch to the **Figma** tab in the sidebar.
3.  Paste a Figma file URL and click **Load File**.
4.  Browse pages and frames, select the designs you want, and click **Import to Chat**.

**Option B: Plugin Export (no API needed)**
1.  Build the Figma plugin: `npx nx run figma-plugin:build`
2.  In Figma Desktop, go to **Plugins > Development > Import plugin from manifest** and select `dist/apps/figma-plugin/manifest.json`.
3.  Select frames in Figma and run the plugin to export.
4.  Drag the exported `.json` file into the Figma panel in Adorable.

**Working with Imports:**
*   Previous imports are saved with your project and shown in the Figma panel.
*   Click an import to browse its layers with preview thumbnails.
*   Hover over layers to highlight them on the preview image.
*   Click **Use** on any layer to send just that layer (with cropped image) to chat.

## ⚡ Performance & Efficiency

- **Container Re-use:** Adorable automatically identifies and resumes your existing containers based on your User ID.
- **Resource Reaper:** Idle containers are paused to free up CPU. If you return within 2 hours, they unpause instantly.
- **Dependency Caching:** In Docker mode, `node_modules` are persisted on the host, making project switching and `npm install` nearly instantaneous.

---
Built with ❤️ using [Nx](https://nx.dev), [Angular](https://angular.io), [WebContainers](https://webcontainers.io), and [Docker](https://docker.com).