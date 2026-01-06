# Adorable

**Adorable** is an interactive, AI-powered Angular application generator. It allows you to build, preview, and iterate on Angular applications using natural language prompts, powered by **Anthropic's Claude 3.5 Sonnet** and the **WebContainer API**.

![Adorable Interface](https://via.placeholder.com/800x450?text=Adorable+App+Preview)

## 🚀 Features

*   **Natural Language Generation:** Describe the app you want (e.g., "A todo list with a dark mode toggle"), and Adorable generates the code.
*   **Live Preview:** Runs the generated Angular application directly in your browser using WebContainers—no local setup required for the generated app.
*   **Iterative Refinement:** Ask for changes (e.g., "Make the button blue"), and Adorable updates the existing code while maintaining context.
*   **Project Persistence:** Save your projects locally and load them later to continue working.
*   **Export:** Download your generated application as a standard ZIP archive, ready to `npm install` and run locally.
*   **Smart Merging:** Automatically handles boilerplate configurations so you (and the LLM) focus only on the source code.

## 🏗 Architecture

Adorable is built as a monorepo using **Nx**:

*   **Frontend (`apps/client`):** Angular 18+ application.
    *   Uses `@webcontainer/api` to boot a Node.js environment in the browser.
    *   Manages the chat interface and code merging logic.
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
2.  **Type a prompt** in the sidebar, e.g., *"Create a calculator app with a history log."*
3.  **Wait** for the generation. The first run takes ~30-60 seconds to install Angular dependencies inside the browser.
4.  **Preview** your app in the main window.
5.  **Iterate:** Type *"Add a clear history button"* to modify the app.
6.  **Save/Load:** Use the disk icon 💾 to save your progress to the server. Use the folder icon 📂 to load previous projects.
7.  **Export:** Click the download icon ⬇️ to get a ZIP file of your code.

## 🔧 Troubleshooting

*   **500 Error / JSON Parse Error:** This usually means the LLM response was truncated or malformed. The server attempts to repair it, but if the app is too large, try asking for smaller features incrementally.
*   **Browser Error (Status 0):** Check if the Backend Server is running. Also ensure you are using a browser that supports WebContainers (Chrome, Edge, Firefox).
*   **"Installation Failed" in logs:** Sometimes `npm install` inside the WebContainer fails due to network glitches. Try clicking "Generate" again to retry the mount/install process.

## 📝 Future Improvements

See [improvements.md](./improvements.md) for the roadmap, including plans for Streaming Responses (SSE) and reduced token usage strategies.

---
Built with ❤️ using [Nx](https://nx.dev), [Angular](https://angular.io), and [Claude](https://anthropic.com).