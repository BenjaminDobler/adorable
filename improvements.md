# Adorable: Future Improvements & Scalability

This document outlines architectural improvements to handle larger applications, token limits, and enhanced developer experience.

## 1. Streaming Response for Large Token Support

**The Problem:**
Currently, we wait for Claude to generate the *entire* JSON response before parsing it. This hits two limits:
1.  **Output Token Limit:** Claude (like all LLMs) has a max output token limit (e.g., 4096 tokens). If the code exceeds this, the JSON is truncated, causing errors.
2.  **Latency:** The user stares at a spinner for 30-60 seconds until the entire file is ready.

**The Solution: Server-Sent Events (SSE) & Streaming**
Instead of a single `POST` response, we can stream the file content as it is generated.

### Implementation Strategy:
1.  **Backend (Express):**
    *   Switch `anthropic.messages.create` to `stream: true`.
    *   Use Server-Sent Events (SSE) to push chunks of text to the frontend as they arrive.
    *   *Challenge:* We need to parse a JSON stream on the fly (using a library like `json-stream` or a custom state machine) OR prompt Claude to output a custom format like `### FILE: path/to/file.ts ###` which is easier to stream-parse than a giant JSON object.

2.  **Frontend (Angular):**
    *   Consume the event stream.
    *   Update the `WebContainerService` incrementally. As soon as a file block is complete, write it to the container.
    *   Show a real-time "typing" effect or progress log.

## 2. Token Optimization Strategies

### A. "Stub & Fill" (Multi-Step Generation)
For complex requests (e.g., "Build a dashboard with charts, auth, and 5 pages"), a single prompt will fail.
*   **Step 1:** Ask Claude to generate the **File Structure Only** (a list of paths).
*   **Step 2:** Iterate through the list and ask Claude to generate the content for each file individually (or in small batches of 3-5 files).
*   **Pros:** Infinite scalability.
*   **Cons:** Slower, more API calls.

### B. "Diff" Based Updates
Currently, we ask Claude to return the changed files. We can optimize this further:
*   Use a unified diff format (like `git diff`) output instead of full files.
*   Apply the patch in the Node.js backend or Frontend.
*   *Benefit:* Extremely low token usage for small changes (e.g., changing a color or fixing a bug).

## 3. User Handling & Authentication

**The Goal:** Transition from a local-only tool to a multi-user platform where settings and projects are securely managed and accessible from anywhere.

### Implementation Strategy:
1.  **Authentication System:**
    *   Integrate **OAuth** (Google, GitHub) or **Supabase Auth/Firebase Auth** for easy user onboarding.
    *   Secure session management using JWTs.

2.  **User Profiles & Persistent Settings:**
    *   **Server-Side Settings:** Move API keys, provider preferences, and model selections from `localStorage` to a secure server-side database.
    *   **Encrypted Keys:** Store third-party API keys (Anthropic, Google) using encryption at rest.

3.  **Project Ownership:**
    *   Link saved projects to specific user IDs.
    *   Implement "Private" vs "Public/Shareable" project visibility.
    *   Enable collaborative editing (e.g., sharing a project link with another user).

## 4. Persistent & Shared Sessions
*   **Database Integration:** Store the `currentFiles` state in a database (PostgreSQL/Mongo) associated with a `sessionId`.
*   **Resume Work:** Allow users to come back to a URL (e.g., `/app/123`) and continue working.
*   **Shareable Links:** "Check out this app I built with Adorable."

## 4. Pre-installed Tech Stacks
*   **Tailwind CSS:** Pre-configure PostCSS/Tailwind in `BASE_FILES` so users can just say "Make it blue-500".
*   **UI Kits:** Pre-install Angular Material or PrimeNG.
*   **State Management:** Offer a "ngrx" or "Elf" template.

## 5. UI/UX Enhancements
*   **File Explorer:** Add a file tree view in the sidebar to let users click and inspect the generated code manually.
*   **Manual Edits:** Allow users to manually edit the code in the browser (Monaco Editor) and have those changes persist in the context for the next prompt.
