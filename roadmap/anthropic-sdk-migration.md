# Anthropic SDK Migration Strategy

## Overview
Currently, the `AnthropicProvider` uses `@anthropic-ai/sdk` (the low-level client). We evaluated switching to `@anthropic-ai/claude-agent-sdk` (the high-level agent framework). This document outlines the trade-offs and decision criteria for future reference.

## Comparison

### Current Implementation (`@anthropic-ai/sdk`)
*   **Architecture:** Manual implementation of the "think-act-observe" loop.
*   **Context:** Operates on a **virtual file system** (in-memory `fileMap` constructed from `previousFiles`).
*   **Control:** High granularity. We manually parse tool calls, handle `jsonrepair` strategies, and strictly control the environment (e.g., forcing ephemeral cache control).

### Proposed Alternative (`@anthropic-ai/claude-agent-sdk`)
*   **Architecture:** Built-in agent loop. Automatically handles tool execution and re-prompting.
*   **Context:** Optimized for **real Operating System** interactions (direct disk I/O, shell execution).
*   **Features:**
    *   **Context Compaction:** Automatic history summarization to save tokens.
    *   **MCP Support:** Native integration with the Model Context Protocol.

## Trade-offs

| Feature | `@anthropic-ai/sdk` (Current) | `@anthropic-ai/claude-agent-sdk` |
| :--- | :--- | :--- |
| **Code Volume** | High (Manual loop, tool parsing) | Low (SDK handles the loop) |
| **Virtual FS Support** | **Excellent** (We define the boundaries) | **Poor** (Defaults to real FS; requires extensive customization to mock) |
| **Context Management** | Manual (Simple append) | Automatic (Smart compaction) |
| **Flexibility** | High (Custom error handling/retry logic) | Medium (Opinionated flow) |

## Recommendation & Future Triggers

**Decision: Maintain current `@anthropic-ai/sdk` implementation.**

### Why?
Our current use case is specialized: we generate code within a **virtual, in-memory context** passed from the client. The Agent SDK is opinionated towards acting as an autonomous agent on a *real* machine. Adapting it to work strictly within our virtual file boundaries would likely require fighting the framework, negating the benefits of its simplicity.

### When to Revisit?
1.  **Architecture Change:** If we move to an architecture where the server directly modifies the host file system instead of returning file diffs to the client.
2.  **Complexity Threshold:** If we find ourselves re-implementing complex agent behaviors like history summarization/compaction or advanced sub-agent orchestration.
3.  **Standardization:** If we decide to fully adopt the Model Context Protocol (MCP) for all tools, the Agent SDK might offer a more compliant implementation out of the box.
