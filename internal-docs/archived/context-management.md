# AI Context Management

## Current Behavior

### Three Layers of Context Management

#### 1. In-Loop Pruning (`pruneMessages` in `base.ts`)

During a single AI generation (the agentic loop), messages accumulate as the AI reads files, writes code, runs builds, etc. To stay within token limits, `pruneMessages` runs before every API call:

- **First message** (original user prompt): always preserved in full
- **Last 6 messages**: always preserved in full
- **Middle messages**: aggressively truncated
  - `write_files` tool calls → file paths kept, content replaced with `[truncated]`
  - `write_file` content > 2000 chars → replaced with `[truncated]`
  - `tool_result` content > 2000 chars → cut to first 200 chars
  - `text` blocks > 2000 chars → cut to first 200 chars
  - `read_file`, `read_files`, `run_command` inputs → kept as-is (small)

#### 2. Cross-Turn History (client → server)

When the user sends a new prompt, the client assembles history from all previous messages in the chat:

- Only `role` and `text` are sent — no tool calls, file contents, or structured data
- System messages and empty messages are excluded

**Without a summary:**
- Up to the **last 20 messages** are sent

**With a summary:**
- The summary string + **last 6 messages** only

#### 3. Auto-Summarization

Triggered **once, automatically, in the background** after a generation completes.

**Conditions:**
- More than 10 text messages in the conversation
- No summary exists yet (`contextSummary` is null)

**Process:**
1. Takes messages `[0..N-6]` (everything except the last 6)
2. Sends them to Claude Haiku via `POST /api/summarize-context`
3. Haiku returns a 2-3 sentence summary (max 500 tokens)
4. Summary stored in `contextSummary` signal on the client

**How the summary is used server-side (Anthropic/Gemini providers):**
- Injected as a synthetic user message: `[Earlier conversation summary: ...]`
- Followed by a synthetic assistant ack: `Understood, I have context from our earlier conversation.`
- Then the recent history messages follow

### User Control

The only user action is the **clear context button** (trash icon in chat input toolbar):

- Sets `contextSummary` to null
- Sets `contextCleared` to true → next generation sends no history at all
- `contextCleared` resets to false after the next generation completes

### Current Limitation

The summary is generated **once** and never updated. In a 30-message conversation:

- Summary covers messages 1–4 (the first batch beyond the initial 6)
- Messages 5–24 are **lost** — never summarized, not included in history
- AI only sees: stale summary + messages 25–30

The longer the conversation, the bigger the gap between what the summary covers and what the AI actually sees.

---

## Proposed: Threshold-Based Re-Summarization

### Goal

Keep the context summary fresh as the conversation grows, so the AI always has a reasonable understanding of the full conversation history.

### Design

Track how many messages the current summary covers. When enough new messages accumulate beyond the summary, re-summarize by folding the old summary + unsummarized messages into a new summary.

**New state:**
- `summaryMessageCount: number` — how many messages the current summary covers (set when summary is created/updated)

**Trigger condition (after each generation completes):**
```
unsummarized = totalTextMessages - summaryMessageCount
if (unsummarized > threshold) → re-summarize
```

**Threshold:** ~10 messages (same as the initial trigger).

**Re-summarization input:**
- The existing summary string (representing older history)
- Messages from index `summaryMessageCount` to `totalMessages - 6` (the unsummarized middle)
- Exclude the last 6 messages (they'll be sent verbatim)

**Haiku prompt adjustment:**
- Include the previous summary as context: "Previous summary: ..."
- Ask Haiku to produce an updated summary incorporating both the previous summary and the new messages

**After re-summarization:**
- Update `contextSummary` with the new summary
- Update `summaryMessageCount` to `totalMessages - 6`

### Example Flow

| Messages | Summary covers | AI sees |
|----------|---------------|---------|
| 1–10 | (none) | Last 20 messages verbatim |
| 11th msg generated | Summary of msgs 1–5 | Summary + msgs 6–11 |
| 12–20 | msgs 1–5 | Summary + msgs 15–20 (gap: 6–14 lost) |
| 21st msg generated | Re-summarize: old summary + msgs 6–15 | Updated summary + msgs 16–21 |
| 22–30 | msgs 1–15 | Summary + msgs 25–30 (gap: 16–24 lost) |
| 31st msg generated | Re-summarize: old summary + msgs 16–25 | Updated summary + msgs 26–31 |

Each re-summarization folds ~10 more messages into the summary, keeping the gap bounded.

### Files to Change

| File | Change |
|------|--------|
| `apps/client/src/app/chat/chat.component.ts` | Add `summaryMessageCount` signal; update re-summarization trigger logic; pass previous summary to API |
| `apps/client/src/app/services/api.ts` | Update `summarizeContext` to accept optional previous summary |
| `apps/server/src/routes/ai.routes.ts` | Update `/api/summarize-context` to include previous summary in Haiku prompt |

### Open Questions

- Should there be a cap on summary length? Repeated folding could make it grow over very long sessions.
- Should the UI indicate when a re-summarization happens (e.g. subtle toast)?
- Should the user be able to manually trigger re-summarization?
