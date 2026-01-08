# Adorable

**Adorable** is a next-generation, AI-powered IDE for Angular. It allows you to build, preview, and deploy full-stack Angular applications entirely in your browser using natural language, powered by **Claude 3.5 Sonnet**, **Google Gemini**, and the **WebContainer API**.

<p align="center">
  <img src="apps/client/public/logo.png" alt="Adorable Logo" width="120" />
</p>

## 🚀 Key Features

*   **Natural Language IDE:** Describe your app and watch Adorable build the file structure, logic, and styles in real-time.
*   **Streaming XML Protocol:** Ultra-fast, token-efficient code generation using a custom streaming protocol. No more broken JSON.
*   **WebContainer Runtime:** A full Node.js environment running in your browser tab. Zero local setup.
*   **Visual Inspector 🔍:** Click elements in your live app to identify their Angular components and ask the AI for targeted visual edits.
*   **Interactive Terminal 💻:** Subdivided terminal with dedicated tabs for **Server Logs** and an **Interactive Shell** (pnpm, ng-cli, etc.).
*   **One-Click Publishing 📤:** Build your app in the browser and publish it to a live, shareable URL instantly.
*   **Monaco Editor:** A VS Code-powered editing experience with live sync to the preview.
*   **Smart Auto-Repair 🔧:** Adorable monitors build logs and automatically asks the AI to fix compilation errors.
*   **Time Travel snapshots:** Restore your project to any previous state in the chat history.

## 🏗 Architecture

Adorable is built as an **Nx monorepo**:

*   **Frontend (`apps/client`):** 
    *   **Angular 21** (Signals-based).
    *   `@webcontainer/api` for the browser-based runtime.
    *   `monaco-editor` integration.
*   **Backend (`apps/server`):** 
    *   Node.js / Express proxy for AI providers.
    *   Prisma + SQLite for project persistence and site hosting.
*   **AI Providers:**
    *   **Anthropic:** Claude 3.5 Sonnet (Optimized for code).
    *   **Google:** Gemini 1.5 Pro (Vision & large context).

## 🛠 Setup & Installation

1.  **Clone & Install:**
    ```bash
    git clone <repository-url>
    cd adorable
    npm install
    ```

2.  **Environment:**
    Create a `.env` file:
    ```bash
    cp .env.template .env
    ```
    Add your API keys (optional, can also be configured in the app UI).

3.  **Run:**
    ```bash
    # Start Backend (API & Hosting)
    npx nx serve server
    
    # Start Frontend
    npx nx serve client
    ```

## 📖 Usage Guide

1.  **Configure Keys:** Click on **Profile** to set your preferred AI provider and API keys.
2.  **Generate:** Type a prompt like *"Create a project management dashboard with signals"* in the Chat tab.
3.  **Visual Edit:** Use the **Inspect** icon in the preview toolbar, click a UI element, and tell the AI what to change.
4.  **Manual Control:** Switch to the **Files** tab to edit code manually, or use the **Terminal** tab to run `pnpm` commands.
5.  **Go Live:** Click the **Publish** icon to get a permanent URL for your application.

## ⚡ Performance Tips

Adorable uses **pnpm** inside WebContainers for lightning-fast dependency installation. It automatically caches `package.json` states to skip redundant installs when switching between projects.

---
Built with ❤️ using [Nx](https://nx.dev), [Angular](https://angular.io), and [WebContainers](https://webcontainers.io).
