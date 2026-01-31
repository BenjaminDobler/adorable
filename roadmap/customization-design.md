# Company Customization & Tailoring Design

## Vision
Transform "Adorable" from a generic prototyping tool into a specialized enterprise platform that enforces company standards, accelerates development with pre-approved building blocks, and integrates with internal ecosystems.

## Core Pillars

### 1. Context Injection (The "Brain" Customization)
We need to teach the AI about the company's specific environment.

*   **Mechanism**: Enhance the `GenerateOptions` in the backend to accept a merged system prompt.
*   **Data Sources**:
    *   **Style Guide**: "We use Tailwind CSS with these specific hex codes for primary/secondary colors..."
    *   **Component Library**: "Always use our internal `acme-ui` library. Here is the documentation for `<acme-button>`..."
    *   **Coding Standards**: "Use functional components, prefer Signals, no explicit `any` types."
*   **Implementation**:
    *   Create a `CompanyContext` entity (DB or Config).
    *   In `BaseLLMProvider` or specific providers, inject this context into the `system` message before the user's prompt.
    *   **Smart Retrieval**: If the context is huge (e.g., full API docs), use RAG (Retrieval-Augmented Generation) to only inject relevant parts based on the user's query.

### 2. Template System (The "Starting Point" Customization)
Companies rarely start from `ng new`. They have boilerplate.

*   **Mechanism**: "Blueprints" or "Starter Kits".
*   **Implementation**:
    *   Flag specific `Projects` in the DB as `isTemplate: true` and `visibility: 'organization'`.
    *   When creating a new project, allow selecting a `sourceProjectId`.
    *   Backend simply clones the `files` JSON from the source project to the new project.

### 3. API Integration & Mocking
Prototyping against real APIs is hard (CORS, auth, privacy).

*   **Approach A: Interface Injection (Safe)**
    *   Inject TypeScript interfaces of the company's core data models (e.g., `User`, `Order`, `Product`) into the AI context.
    *   Instruct the AI to generate *mock services* that return fake data matching these interfaces.
*   **Approach B: Proxy / Tunneling (Advanced)**
    *   If the company has a dev/sandbox environment, allow configuring a proxy in `setupProxy.js` (or Angular equivalent) to forward requests.

### 4. Organization Management
*   **Multi-tenancy**:
    *   Add `Organization` model to Prisma.
    *   `User` belongs to `Organization`.
    *   `Project` belongs to `Organization` (optional).
    *   `Settings` (Context, Templates) are attached to `Organization`.

## Architecture Roadmap

### Phase 1: Context Injection (MVP)
1.  **DB**: Add `systemPrompt` field to `User` (or a simplified `Organization` table).
2.  **Backend**: Update `ProviderFactory` or `GenerateOptions` to read this field.
3.  **Prompt Engineering**: Append this prompt to `ANGULAR_KNOWLEDGE_BASE`.

### Phase 2: Template Library
1.  **DB**: Add `isTemplate` boolean to `Project`.
2.  **Frontend**: "New Project" modal fetches list of templates.
3.  **Backend**: `createProject` endpoint accepts `templateId`.

### Phase 3: RAG for Documentation
1.  **Vector DB**: Use a simple vector store (or pgvector/sqlite-vss) to index company documentation.
2.  **Pipeline**: When user asks "How do I use the date picker?", retrieve the relevant `acme-datepicker` docs and inject them.

## Example "Company Config" Payload
```json
{
  "name": "Acme Corp",
  "style": {
    "framework": "Tailwind",
    "theme": { "primary": "#ff0000" }
  },
  "rules": [
    "Always use 'standalone: true'",
    "Use 'inject()' instead of constructor injection"
  ],
  "imports": {
    "@acme/ui": ["ButtonComponent", "CardComponent"]
  }
}
```
