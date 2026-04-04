# Feature Design: Dynamic & Automated Model Selection

## 1. UI/UX: The Hybrid Selector

**Goal:** Allow the user to switch models instantly from the chat interface while offering a powerful "Auto" default.

### UI Changes (`apps/client/src/app/chat/`)
*   **Location:** Add a dropdown selector in the `ChatComponent` input area (near the "Attach" or "Send" button).
*   **Dropdown Structure:**
    *   **✨ Auto (Smart)** (Default)
    *   *Divider*
    *   **Anthropic**
        *   Claude 3.5 Sonnet
        *   Claude 3 Opus
        *   Claude 3 Haiku
    *   **Google**
        *   Gemini 1.5 Pro
        *   Gemini 1.5 Flash
    *   *Other Providers...*
*   **Persistence:** Remember the last selection (or default to Auto) in `localStorage`.

### Data Flow
1.  `ChatComponent` sends the selection (e.g., `'auto'` or `'claude-3-5-sonnet'`) in the `GenerateOptions` payload.
2.  Backend `ProviderFactory` or a new `ModelRouter` class intercepts the request.

---

## 2. The "Smart Router" Architecture

**Goal:** Automatically select the best model based on task complexity, respecting user configuration and available keys.

### Concept: User-Defined Tiers
Instead of hardcoding models, we define **Complexity Tiers**. The user maps their available models to these tiers in Settings.

### Configuration (`SettingsComponent`)
Add a "Smart Routing" section where users can map Tiers to specific Models:

| Tier | Description | Default Model (if key available) |
| :--- | :--- | :--- |
| **Router** | The fast model used to *make* the decision. | `Gemini 1.5 Flash` |
| **Simple** | Typos, CSS tweaks, simple explanations. | `Gemini 1.5 Flash` / `Claude 3 Haiku` |
| **Complex** | Refactoring, new features, heavy logic. | `Claude 3.5 Sonnet` / `GPT-4o` |
| **Vision** | Tasks involving image attachments. | `Claude 3.5 Sonnet` / `Gemini 1.5 Pro` |

### Runtime Logic (When "Auto" is selected)

1.  **Input:** User Prompt + Attachments.
2.  **Vision Check:** If images are attached -> Immediately route to **Vision Tier**.
3.  **The Classifier (Router Model):**
    *   The backend calls the configured **Router** model (e.g., Flash).
    *   **System Prompt:** "Classify the user request. Output JSON: `{ classification: 'SIMPLE' | 'COMPLEX' }`. Criteria: Simple = edits, style, explain. Complex = logic, refactor, new feature."
4.  **Routing:**
    *   If `SIMPLE` -> Use **Simple Tier** model.
    *   If `COMPLEX` -> Use **Complex Tier** model.
5.  **Execution:** The backend instantiates the target provider and runs the generation.
6.  **Feedback:** The UI receives the *actual* model used in the response metadata (e.g., to display "⚡ Auto: Used Gemini Flash").

---

## 3. Technical Roadmap

### Phase 1: Manual UI & Plumbing
*   **Client:** Implement the dropdown in `ChatComponent`. Update `ProjectService` to accept `model` param.
*   **Server:** Update `ProviderFactory` to accept a specific model ID and instantiate the correct provider with that model.

### Phase 2: Settings & Configuration
*   **Client:** Create the "Smart Routing" settings UI. Save preferences to `SettingsService` / LocalStorage.
*   **Server:** Update `GenerateOptions` to include the user's Tier map (or fetch it if stored on server).

### Phase 3: The Router Logic
*   **Server:** Create a `SmartRouter` class.
    *   Implement the classification prompt.
    *   Implement the logic to fallback if the "Router" model fails.
*   **Integration:** Wire `SmartRouter` into `ProviderFactory` to handle `model: 'auto'`.

### Phase 4: Feedback Loop
*   **Server:** Ensure the `streamGenerate` response includes metadata about which model was actually selected.
*   **Client:** Display a subtle badge in the message bubble: "Auto: Claude 3.5 Sonnet".