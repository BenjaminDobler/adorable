# SAP AI Core Integration Roadmap

This document outlines the steps required to integrate SAP AI Core (via the SAP Cloud SDK for AI) as a fully supported LLM provider in the Adorable application.

## 1. Prerequisites (Infrastructure & Environment)

Before implementing the code changes, the following infrastructure must be ready on SAP Business Technology Platform (BTP):

*   **SAP AI Core Instance:** A running instance with the `extended` service plan.
*   **Deployments:** At least one generative AI model (e.g., GPT-4o, Claude 3.5 Sonnet) must be deployed and active.
*   **Service Key:** A valid Service Key (JSON) containing `clientid`, `clientsecret`, `url`, and `auth_url` for the AI Core instance.
*   **Resource Group:** The target resource group ID where deployments reside (default is often `default`).

## 2. Dependency Management

Add the required SAP Cloud SDK packages to the server application.

*   **Action:** Install dependencies.
    ```bash
    npm install @sap-ai-sdk/foundation-models @sap-ai-sdk/orchestration
    ```
    *(Note: `@sap-ai-sdk/orchestration` is preferred for its unified API and support for templating/filtering).*

## 3. Server-Side Implementation (`apps/server`)

### 3.1. Create Provider Class
Create a new file `apps/server/src/providers/sap-core.ts` implementing the `LLMProvider` interface.

*   **Class Structure:**
    ```typescript
    export class SapAiCoreProvider extends BaseLLMProvider implements LLMProvider {
        // Implementation of generate() and streamGenerate()
    }
    ```
*   **Authentication:** Implement logic to parse the `apiKey` field. Since SAP requires a full JSON Service Key, we have two options:
    1.  Expect a base64 encoded JSON string in the `apiKey` field.
    2.  Use server-side environment variables (`AICORE_SERVICE_KEY`) and ignore the client-provided key (safer for enterprise).

### 3.2. Implement `streamGenerate`
The core logic will use the `OrchestrationClient`.

*   **Mapping Inputs:**
    *   Map `GenerateOptions.prompt` to the orchestration message format.
    *   Map `GenerateOptions.images` to the specific multi-modal format supported by the deployed model (e.g., GPT-4o vision format).
    *   Map `GenerateOptions.model` to the SAP AI Core **Deployment ID** or **Configuration ID**.

*   **Handling Streams:**
    *   Subscribe to the stream from `orchestrationClient.stream(...)`.
    *   Normalize SAP SDK stream events (chunks) into the application's expected callbacks (`onText`, `onTokenUsage`).
    *   **Crucial:** Verify how SAP AI Core handles *tool calling* in streams and map those events to `onToolStart`, `onToolCall`, etc.

### 3.3. Tool Use Integration
*   Verify if the deployed model supports function calling (tool use) via the Orchestration service.
*   Map the application's tool definitions (from `tools.ts`) to the SAP AI Core schema.

### 3.4. Factory Update
Update `apps/server/src/providers/factory.ts` to recognize the new provider.

*   **Action:** Add case for `'sap-ai-core'`.
    ```typescript
    case 'sap-ai-core':
        return new SapAiCoreProvider();
    ```

## 4. Client-Side Implementation (`apps/client`)

### 4.1. Settings UI
Update `apps/client/src/app/settings/settings.html` and component to support the new provider.

*   **Provider Option:** Add "SAP AI Core" to the provider dropdown.
*   **Credentials Input:**
    *   Change the "API Key" input label to "Service Key (JSON)" or "Deployment ID" when SAP is selected.
    *   Consider adding fields for `Resource Group` if it's not hardcoded.

### 4.2. Model Selection
*   Allow the user to manually input a **Deployment ID** as the "Model Name", or fetch available deployments if an API endpoint is created for it.

## 5. Verification & Testing

1.  **Connectivity Test:** Verify authentication with the Service Key.
2.  **Simple Chat:** Test basic text generation.
3.  **Streaming:** Ensure text streams smoothly without buffering issues.
4.  **Tool Use:** Test file operations (`read_file`, `write_file`) to ensure the model can drive the application logic.
5.  **Multi-modal:** Test image attachments if the deployed model supports them.

## 6. Future Enhancements

*   **RAG / Grounding:** Expose SAP AI Core's grounding capabilities (connecting to vector DBs) via the chat interface.
*   **Content Filtering:** Display warnings if SAP's content filter flags a response.
