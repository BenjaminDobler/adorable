# Adorable: Technical Presentation Guide

## 🧱 High-Level Overview
**Concept:** A "Text-to-App" workspace that allows users to describe, build, and deploy full-stack Angular applications entirely in the browser.

### The Stack:
*   **AI:** Anthropic Claude 3.5 Sonnet & Google Gemini 1.5 Pro.
*   **Frontend:** Angular 21 (Signals-based), Monaco Editor.
*   **Runtime:** WebContainer API (WebAssembly-based Node.js environment).
*   **Backend:** Node.js/Express (Secure proxy & project persistence).

---

## 🧠 AI Provider Integration: The "Streaming XML" Protocol

### The Problem:
LLMs usually output JSON. JSON is fragile for code generation because:
1.  **Overhead:** Escaping quotes and newlines wastes ~20% of the token budget.
2.  **Fragility:** If the response is truncated (max tokens), the JSON becomes invalid and the whole build fails.

### Our Solution:
We implemented a custom **Streaming XML-tag protocol**:
*   **Format:** The AI wraps the explanation in `<explanation>` and each file in `<file path="...">` tags.
*   **Efficiency:** No string escaping needed. We fit significantly more code into a single response.
*   **Real-time UX:** We parse the stream on the frontend. The user sees the explanation "typing" in the chat while the files are extracted and mounted in the background.
*   **Resilience:** Even if the response cuts off mid-stream, the parser recovers all completed file blocks.

---

## 📦 WebContainer API: Node.js in the Browser

### Why WebContainers?
*   **Zero Infrastructure:** The user's own browser handles the heavy lifting (compilation, bundling).
*   **Security:** Code runs in a sandboxed Wasm environment.
*   **Developer Experience:** Instant startup and local-like file system performance.

### Key Implementation Details:
1.  **Optimized Lifecycle:**
    *   **Dependency Caching:** We track `package.json`. If switching projects with the same dependencies, we **skip `npm install`**, making the switch almost instant.
    *   **Clean Mounting:** We explicitly wipe the `src` directory before mounting a new project to prevent "ghost files" from previous sessions.
2.  **The Connectivity Breakthrough:**
    *   **The Problem:** Modern Vite-based HMR (Hot Module Replacement) often fails in virtualized networks due to WebSocket port/protocol mismatches.
    *   **The Solution:** We explicitly **disabled HMR** (`--no-hmr`) and configured the server to bind to `0.0.0.0`.
    *   **Result:** The system uses standard **Live Reloading**. It is 100% stable, handles CSS/Template updates perfectly, and provides a predictable developer experience.

---

## 🕵️‍♂️ The Visual Inspector & Auto-Repair

### 1. Angular Visual Inspector:
Leveraging Angular's **Dev Mode**, we inject a probe into the preview iframe.
*   **Mechanism:** Uses `window.ng.getComponent(element)` to identify the exact TypeScript class responsible for a piece of UI.
*   **Workflow:** User clicks a button in the preview -> We capture the Component name and HTML context -> AI performs "surgery" on that specific component.

### 2. Auto-Repair Loop:
*   We monitor the terminal output for the `✘ [ERROR]` signature.
*   **Self-Healing:** When a build error is detected, the system can automatically feed the error log back to the AI with a request to fix it, creating a self-correcting development loop.

---

## 📸 Smart Screenshots & Thumbnails

### The Challenge:
How to show a preview of the project in the dashboard when the project only exists as code in a database?

### The Solution: "In-Container" Capture
*   **Injection:** We inject a hidden capture script (using `html2canvas`) into the preview iframe via `base-project.ts`.
*   **The Trigger:** When the user clicks "Save", the parent app sends a `CAPTURE_REQ` message to the iframe.
*   **Smart Sizing:** The capture logic dynamically detects the *actual* rendered viewport size (avoiding white bars or cut-off content).
*   **Data Flow:** The iframe generates a Base64 PNG and `postMessage`s it back to the parent, which saves it to the database alongside the project source.

---

## 📤 Distribution: "In-Browser" Publishing
*   We don't just generate code; we host it.
*   **The Build:** The user's browser runs `ng build --base-href ./`.
*   **The Upload:** We recursively read the `dist/` directory from the WebContainer and upload the static artifacts to the server.
*   **The Result:** A production-ready, static website served at a shareable public URL.

---

## 🚀 Summary Points for Demo:
1.  **Start:** Generate a complex app and show the XML stream parsing.
2.  **Status:** Point out the granular status badge (*Installing*, *Building*, *Ready*).
3.  **HMR:** Edit a style in Monaco and show the immediate Live Reload in the preview.
4.  **Inspect:** Use the Visual Inspector to change a button color via natural language.
5.  **Time Travel:** Scroll back in chat and "Restore" an older version of the project.
