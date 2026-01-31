# Design Document: AI Tool Use & Function Calling 🛠️

## 1. Executive Summary
Currently, Adorable relies on "Prompt Engineering" to instruct the AI to output XML tags (`<file path="...">`). While effective, this is brittle. "Tool Use" (or Function Calling) allows us to define rigorous, typed functions (Tools) that the AI can invoke directly.

This shifts the interaction from **"AI guessing text formats"** to **"AI executing structured commands"**.

---

## 2. User Perspective: "The Invisible Upgrade"
From a user's point of view, the workflow remains largely the same, but significantly more robust.

*   **Before:** User asks "Update the header". AI streams text. Sometimes it hallucinates a path or writes broken XML.
*   **After:** User asks "Update the header". AI "thinks", then executes a precise `write_file` command. 
    *   **Less "I made a mistake" errors:** The AI is constrained by the tool definitions.
    *   **Better Logic:** The AI can "read" files before editing them, reducing "blind edits" that break code.
    *   **New Capabilities:** Allows for features like "Run this test" or "List files in directory" which aren't possible with just text output.

---

## 3. Technical Architecture

### A. Tool Definitions
We will define a set of tools (JSON Schema) sent to the LLM (Anthropic/Gemini).

1.  **`read_file(path: string)`**
    *   **Purpose:** Allows AI to peek at file content before editing.
    *   **Benefit:** Prevents overwriting valid code with hallucinations.
2.  **`write_file(path: string, content: string)`**
    *   **Purpose:** The primary way to generate code. Replaces `<file>` tags.
    *   **Benefit:** Guaranteed valid path and content separation.
3.  **`run_command(command: string)`**
    *   **Purpose:** Execute shell commands (e.g., `ng generate component`).
    *   **Benefit:** Native CLI integration.
4.  **`list_directory(path: string)`**
    *   **Purpose:** Explore the project structure.

### B. The "Agent Loop" (Backend vs Frontend)
Unlike the current "One-Shot" stream, Tool Use implies a loop:

**The Current Flow (Streaming):**
`User -> Proxy -> LLM -> Stream (XML) -> Frontend (Parse & Write)`

**The Tool Use Flow (Agentic):**
1.  `User -> Proxy -> LLM`
2.  `LLM -> Stop Reason: Tool Use (name: "read_file", args: "src/app.ts")`
3.  `Proxy` halts stream, executes `read_file("src/app.ts")`.
4.  `Proxy` feeds result back to LLM history: `ToolResult: "...content..."`.
5.  `LLM -> Continue Generation -> Tool Use (name: "write_file", ...)`

### C. Where do Tools Run?
*   **Challenge:** The Code/File System lives in the **Frontend (WebContainer)**. The LLM connection lives in the **Backend (Proxy)**.
*   **Solution 1 (Full Frontend Agent):** The Frontend calls the API, gets a "Tool Call" response, executes it locally in WebContainer, and calls API again.
    *   *Pros:* Direct access to WebContainer.
    *   *Cons:* Complex state management in Angular.
*   **Solution 2 (Backend Proxying):** The Backend keeps the conversation state. When AI wants to `read_file`, the Backend sends a Server-Sent Event (SSE) to Frontend: `action: read_file`. Frontend executes and `POST`s the result back.
    *   *Pros:* Keeps secrets secure.
    *   *Cons:* High latency (ping-pong).

**Hybrid Approach (Recommended):**
*   **Streaming Tools:** The LLM streams the `write_file` arguments directly to the frontend via SSE.
*   **Frontend Execution:** The Frontend parses the stream. When it sees `tool_use: write_file`, it treats it like the current XML tag—accumulating content and writing it.
*   **Read Operations:** For `read_file`, the Frontend performs the read and sends a new "System Message" context back to the AI for the *next* turn.

---

## 4. Technical Challenges & Risks

1.  **Streaming Latency:** Standard "Tool Use" APIs often buffer the *entire* argument (the whole file content) before triggering the event. This kills the "typing effect" UX.
    *   **Mitigation:** We must use **Streaming Tool Calls** (supported by Anthropic/Gemini) and parse the partial JSON arguments on the fly. This is complex but necessary.
2.  **Context Window Explosion:** If the AI reads many files, the context history grows massive.
    *   **Mitigation:** Aggressive truncation of "read" history after the turn is complete.
3.  **Token Costs:** Tool definitions consume tokens in the system prompt.
    *   **Mitigation:** Use Prompt Caching (already implemented!).

## 5. Benefits Summary

| Feature | XML Tags (Current) | Tool Use (Future) |
| :--- | :--- | :--- |
| **Robustness** | Low (Text parsing) | High (Typed JSON) |
| **Awareness** | Blind (Writes only) | Contextual (Can read/list) |
| **Capabilities** | File Gen Only | CLI, File Ops, Browsing |
| **Complexity** | Low | High (State loop required) |

## 6. Implementation Roadmap

1.  **Refactor `BaseLLMProvider`:** Support `tools` array in config.
2.  **Update Frontend Parser:** Switch from Regex XML parser to a "Streaming JSON Parser" (e.g. `best-effort-json-parser`).
3.  **Implement `read_file` support:** Allow the AI to request file content context dynamically.
