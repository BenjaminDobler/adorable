# AI Integration Improvements Roadmap

This document outlines advanced strategies to elevate Adorable from a "Code Generator" to a true "AI Developer Agent".

## 1. 🛠️ Tool Use & Function Calling (High Priority)

Moving from "XML Prompt Engineering" to **Native Function Calling** is the single biggest upgrade for reliability.

### The Concept
Instead of asking the AI to output `<file>` tags in a text stream, we define explicit tools in the API request (Anthropic Tools / Gemini Function Calling).

**Proposed Tools:**
*   `write_file(path: string, content: string)`: Precise file creation.
*   `read_file(path: string)`: Allows the AI to "peek" at existing code before editing, reducing hallucinations.
*   `list_dir(path: string)`: Helps the AI understand the project structure.
*   `run_shell(command: string)`: Safely execute commands like `ng generate`.

### Benefits
*   **Type Safety:** The LLM provider validates arguments (JSON). No more broken XML tags.
*   **Two-Way Interaction:** The AI can ask questions back to the system (e.g., "Read app.component.ts") before deciding how to edit it.
*   **Structured Streaming:** We can stream file content as a specific argument flow, separating "Thought" (reasoning) from "Action" (code).

---

## 2. 🧠 Context Optimization (RAG & Smart Selection)

Sending the entire codebase (or large parts of it) is expensive and can confuse the model with irrelevant details.

### A. "Smart Context" (Client-Side RAG)
*   **Mechanism:** When the user types a prompt (e.g., "Update the login button"), we use a lightweight keyword or embedding search to find relevant files (`login.component.ts`, `auth.service.ts`).
*   **Action:** Only inject these relevant files into the prompt, plus a "Tree Summary" of the rest of the project.
*   **Result:** Faster generation, lower token costs, higher accuracy.

### B. "Tree Summary" Protocol
*   Instead of full file contents, always maintain a **compressed representation** of the project in the system prompt:
    ```
    /src
      /app
        app.component.ts (Components: AppComponent)
        auth.service.ts (Methods: login, logout)
    ```
*   The AI uses this map to *request* full file contents (via `read_file` tool) only when needed.

---

## 3. 🤖 Agentic Workflow: "Architect -> Builder" Loop

Move from "One-Shot Generation" to a multi-step reasoning loop.

### The Flow
1.  **User Request:** "Create a dashboard with charts."
2.  **Phase 1 (Architect):** AI analyzes the request and outputs a **Plan**:
    *   "1. Install `chart.js`."
    *   "2. Create `dashboard.component.ts`."
    *   "3. Update routes."
3.  **Phase 2 (Builder):** The system iterates through the plan. The AI executes step 1, we feedback the result (success/error), then it executes step 2.
4.  **Result:** A complex feature built robustly, step-by-step, rather than a giant fragile blob of code.

---

## 4. 👁️ Visual Feedback Loop (Self-Healing UI)

We currently send user-uploaded images. We can take this further by giving the AI **eyes on its own work**.

### The Workflow
1.  **Generate:** AI builds the app.
2.  **Capture:** System automatically takes a screenshot of the Preview Iframe.
3.  **Verify:** System sends the screenshot *back* to the AI with the prompt: "Does this look correct? Fix any layout issues."
4.  **Iterate:** AI spots that the button is misaligned (visually) and issues a CSS fix.

This mimics a human developer: Write code -> Look at screen -> Fix visual bugs.

---

## 5. ⚡ Speculative Decoding & Cache

*   **Prompt Caching:** Both Anthropic and Gemini now support **Prompt Caching**.
    *   We can cache the `BASE_FILES` and common system instructions.
    *   This reduces input token costs by up to 90% and significantly speeds up "Time to First Token" for long conversations.

### Implementation Status: ✅ Done
We implemented a **Knowledge Base Injection** strategy:
1.  Created `knowledge-base.ts` with static Angular 21 documentation.
2.  Injected this block into the System Prompt with `cache_control: { type: 'ephemeral' }`.
3.  This ensures the heavy context is cached across requests, while the dynamic user prompt remains fast.

## 🏁 Recommended Next Steps

1.  **Switch to Tool Use:** Refactor the backend to support `tools` definition alongside text streaming.
2.  **Visual Feedback Experiment:** Create a "Fix Visuals" button that screenshots the iframe and asks AI to repair CSS.
