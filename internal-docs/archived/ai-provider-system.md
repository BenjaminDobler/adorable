# AI Provider System

The AI provider system is the core of Adorable's code generation capabilities. It implements an agentic loop pattern where the AI iteratively generates code, executes tools, and refines results.

## Provider Architecture

```mermaid
classDiagram
    class ProviderFactory {
        +createProvider(type): BaseLLMProvider
    }

    class BaseLLMProvider {
        <<abstract>>
        #buildContext()
        #streamResponse()*
        +generate(request): AsyncGenerator
        #executeToolCall(tool, args)
        #agenticLoop()
    }

    class AnthropicProvider {
        -client: Anthropic
        #streamResponse()
    }

    class GeminiProvider {
        -client: GoogleAI
        #streamResponse()
    }

    ProviderFactory --> BaseLLMProvider
    BaseLLMProvider <|-- AnthropicProvider
    BaseLLMProvider <|-- GeminiProvider
```

## Agentic Loop

```mermaid
flowchart TB
    START["User Message"]
    CTX["Build Context<br/>(system prompt, files, history)"]
    STREAM["Stream LLM Response"]
    TOOL{"Tool Call?"}
    EXEC["Execute Tool"]
    RESULT["Return Tool Result"]
    MAX{"Max Turns?"}
    DONE["Final Response"]

    START --> CTX --> STREAM --> TOOL
    TOOL -->|Yes| EXEC --> RESULT --> MAX
    MAX -->|No| STREAM
    MAX -->|Yes| DONE
    TOOL -->|No| DONE
```

The agentic loop in `BaseLLMProvider`:

1. **Build Context** — Assembles system prompt with project context, file contents, chat history, and conditional skill instructions
2. **Stream Response** — Calls the LLM API with streaming enabled
3. **Tool Execution** — If the LLM calls a tool, executes it and feeds the result back
4. **Iterate** — Continues until the LLM produces a final text response or hits max turns

## Available Tools

Tools are defined in `providers/tools.ts` and `providers/kit-tools.ts`:

| Tool | Description |
|------|-------------|
| `read_files` | Read one or more project files |
| `write_files` | Write/create project files |
| `run_command` | Execute shell commands in the container |
| `search_files` | Search file contents with regex |
| `list_files` | List directory contents |
| `delete_files` | Delete project files |

Kit-specific tools extend this set with component library awareness.

## Streaming Protocol (SSE)

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant AI as AI Provider
    participant CT as Container

    C->>S: POST /api/generate-stream
    S->>AI: Start generation

    loop Agentic Loop
        AI-->>S: Text chunk
        S-->>C: SSE: {type: "stream", data: "..."}

        AI-->>S: Tool call
        S-->>C: SSE: {type: "tool_call", tool: "write_files"}
        S->>CT: Execute tool
        CT-->>S: Tool result
        S-->>C: SSE: {type: "tool_result", result: "..."}
        S-->>C: SSE: {type: "file_written", path: "..."}

        S->>AI: Continue with tool result
    end

    S-->>C: SSE: {type: "status", status: "complete"}
```

### SSE Event Types

| Event Type | Description |
|------------|-------------|
| `stream` | Text chunk from the AI |
| `tool_call` | AI is calling a tool |
| `tool_result` | Result of tool execution |
| `file_written` | A file was created or modified |
| `status` | Generation status updates |

## Skill System

Conditional system prompt additions in `providers/skills/` inject specialized instructions based on context:

- Component kit instructions (PrimeNG, Angular Material, etc.)
- Figma design-to-code instructions
- Project-type-specific patterns

## User API Keys

Users provide their own AI API keys, stored AES-256 encrypted in the database. Keys are decrypted at request time and never logged.

```mermaid
flowchart LR
    USER["User enters API key"]
    ENCRYPT["AES-256 Encrypt"]
    DB[(Database)]
    DECRYPT["AES-256 Decrypt"]
    LLM["LLM API Call"]

    USER --> ENCRYPT --> DB
    DB --> DECRYPT --> LLM
```
