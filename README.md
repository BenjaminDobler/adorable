# Adorable

**Adorable** is an interactive, AI-powered Angular application generator. It allows you to build, preview, and iterate on Angular applications using natural language prompts, powered by **Anthropic's Claude 3.5 Sonnet** and the **WebContainer API**.

<p align="center">
  <img src="apps/client/public/logo.png" alt="Adorable Logo" width="120" />
</p>

## 🚀 Features

*   **Natural Language Generation:** Describe the app you want (e.g., "A todo list with a dark mode toggle"), and Adorable generates the code.
*   **Live Preview:** Runs the generated Angular application directly in your browser using WebContainers—no local setup required for the generated app.
*   **Integrated Code Editor:** View and edit your project files directly using the built-in **Monaco Editor** (VS Code experience). Changes are synced live to the preview.
*   **Recursive File Explorer:** Browse the full structure of your generated project, including folders and assets.
*   **Chat-Based Interface:** Interact with the AI in a conversational format. See your prompt history and the AI's explanations.
*   **Time Travel:** Every step of your chat stores a snapshot of the project. You can click "Restore this version" on any message to go back in time.
*   **Iterative Refinement:** Ask for changes (e.g., "Make the button blue"), and Adorable updates the existing code while maintaining context.
*   **Project Persistence:** Save your projects locally and load them later to continue working.
*   **Export:** Download your generated application as a standard ZIP archive, ready to `npm install` and run locally.

## 🏗 Architecture

Adorable is built as a monorepo using **Nx**:

*   **Frontend (`apps/client`):** Angular 18+ application.
    *   Uses `@webcontainer/api` to boot a Node.js environment in the browser.
    *   Integrates `monaco-editor` for a rich coding experience.
    *   Manages the chat interface, file explorer, and version restoration logic.
*   **Backend (`apps/server`):** Node.js / Express application.
    *   Proxies requests to the Anthropic API to keep keys secure.
    *   Handles filesystem persistence for saved projects.
    *   Includes `jsonrepair` to handle potential LLM output truncation.
*   **Shared (`libs/shared-types`):** TypeScript interfaces shared between client and server.

## 🛠 Prerequisites

*   **Node.js** (v18 or higher)
*   **Anthropic API Key** (You need access to Claude 3.5 Sonnet models)

## 📦 Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd adorable
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Create a `.env` file in the root directory:
    ```bash
    cp .env.template .env
    ```
    Edit `.env` and add your API key:
    ```env
    ANTHROPIC_API_KEY=sk-ant-api03-...
    PORT=3333
    ```

## 🏃‍♂️ Running the Application

Since this is a full-stack application, you need to run both the backend and frontend.

1.  **Start the Backend:**
    ```bash
    npx nx serve server
    ```
    The server will start on `http://localhost:3333`.

2.  **Start the Frontend:**
    Open a new terminal and run:
    ```bash
    npx nx serve client
    ```
    The application will be available at `http://localhost:4200`.

## 📖 Usage Guide

1.  **Open** `http://localhost:4200` in Chrome (WebContainers require cross-origin isolation support, which is configured in this project).
2.  **Type a prompt** in the sidebar (Chat tab), e.g., *"Create a calculator app with a history log."*
3.  **Wait** for the generation. The first run takes ~30-60 seconds to install Angular dependencies inside the browser.
4.  **Preview** your app in the main window.
5.  **Edit Code:** Switch to the **Files** tab in the sidebar to explore the project structure. Click any file to open it in the Monaco Editor and make manual changes.
6.  **Iterate:** Go back to the **Chat** tab and ask for changes.
7.  **Restore:** If you don't like a change, scroll up in the chat and click the "Restore" button on a previous message.
8.  **Save/Load:** Use the buttons in the sidebar to save your progress or download a ZIP.

## 🔧 Troubleshooting

*   **500 Error / JSON Parse Error:** This usually means the LLM response was truncated or malformed. The server attempts to repair it, but if the app is too large, try asking for smaller features incrementally.
*   **Browser Error (Status 0):** Check if the Backend Server is running. Also ensure you are using a browser that supports WebContainers (Chrome, Edge, Firefox).
*   **"Installation Failed" in logs:** Sometimes `npm install` inside the WebContainer fails due to network glitches. Try clicking "Generate" again to retry the mount/install process.

## 📝 Future Improvements

See [improvements.md](./improvements.md) for the roadmap, including plans for Streaming Responses (SSE) and reduced token usage strategies.

---
Built with ❤️ using [Nx](https://nx.dev), [Angular](https://angular.io), and [Claude](https://anthropic.com).