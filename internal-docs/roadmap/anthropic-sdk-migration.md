# Anthropic SDK & Agent Migration Strategy (Re-evaluated)

## 🔄 Status: Re-opened for "Agent Mode"

**Last Updated:** Jan 2026
**Context:** Introduction of Docker/Container Architecture (`LocalContainerEngine` & `DockerManager`).

## The Shift: Virtual vs. Real Environment
Previously, we decided against the high-level Agent SDK because our environment was purely **virtual** (in-memory file maps). We were "simulating" a file system, and adapting an OS-opinionated SDK to a virtual one was complex and brittle.

**The Game Changer:**
With the new **Docker Architecture**, we now have a **real, persistent Linux environment** for each project. This aligns perfectly with the "Computer Use" or "Agent" paradigm.

## 🚀 Proposal: The "Hybrid Agent" Option

Instead of a full migration (replacing the current fast generator), we should introduce this as an **Advanced Option**:

### 1. Standard Mode (Browser & Docker)
*   **Driver:** `@anthropic-ai/sdk` (Low-level) or `google-generative-ai`.
*   **Environment:** Virtual In-Memory Context (passed from client).
*   **Workflow:** User Prompt -> AI Generates Code -> Client Applies Changes.
*   **Pros:** Fast, stateless, safe, low latency.
*   **Best For:** "Create a component", "Add a style", "Explain this code".
*   **Supported Providers:** Anthropic, Gemini, OpenAI.

### 2. Agent Mode (Docker Exclusive)
*   **Driver:** Any LLM with Tool/Function Calling capabilities.
*   **Environment:** Real Docker Container.
*   **Workflow:** 
    1.  User Prompt ("Fix the build error").
    2.  AI Inspects Container (runs `ls`, `cat`, `ng build`).
    3.  AI Sees Error -> Edits File -> Re-runs Build.
    4.  Loop continues until success or timeout.
*   **Implementation:**
    *   Tools (`read_file`, `write_file`, `run_command`) map directly to `DockerManager.exec()`.
    *   The `FileSystemInterface` abstraction on the server allows the AI provider to switch between "Memory" and "Container" targets seamlessly.
*   **Best For:** "Fix this bug", "Refactor and verify", "Upgrade dependencies".
*   **Supported Providers:** 
    *   **Anthropic:** Excellent reasoning for complex loops.
    *   **Gemini:** Large context window is perfect for analyzing huge build logs.
    *   **OpenAI:** Robust function calling standard.

## Feasibility & Implementation Plan

This can be introduced without breaking the existing flow.

### Phase 1: Tool Abstraction (Provider Agnostic)
Refactor our `LLMProvider` interface to accept a context target.
*   **Current:** `generate(files: VirtualFileMap)`
*   **New:** `generate(target: FileSystemInterface)`
    *   `MemoryFileSystem`: Reads/writes to the JSON object.
    *   `ContainerFileSystem`: Wraps `DockerManager.exec()` and `readFile()`.

### Phase 2: "Run Command" Tool
Enable the `run_command` tool *only* when the `target` is `ContainerFileSystem`.
*   Security: This is safe(r) because it runs inside the user's isolated Docker container, not the host.

### Phase 3: The "Auto-Fix" Button
Add a UI toggle or specific button ("Agent Fix") that sends the request with the `use_container_context: true` flag.

## Conclusion
We should **NOT** replace the current implementation entirely. The in-memory generation is unbeatable for speed.
However, we **SHOULD** build the **Agent Mode** as a powerful optional feature for Docker users. This architecture is **provider-agnostic**, allowing us to use Gemini Pro's massive context window for debugging just as easily as Claude's reasoning.
