# Roadmap: Universal Agent Skills System

**Status:** Completed
**Goal:** Empower users to "teach" the AI specialized behaviors using declarative Markdown files. This system is provider-agnostic but fully compatible with the Anthropic `SKILL.md` standard.

---

## 1. Core Concept
...
## 5. Implementation Roadmap

### Phase 1: Registry & Discovery
- [x] Implement `SkillRegistry` service in `apps/server`.
- [x] Implement YAML/Markdown parser.
- [x] Add basic unit tests for discovery across project and user paths.

### Phase 2: Provider Refactoring
- [x] Add `activate_skill` to the global `TOOLS` list (dynamic).
- [x] Implement tool execution logic in `BaseLLMProvider` (or specific providers) to handle content injection.
- [x] Verify functionality with Anthropic (Claude 3.5).

### Phase 3: Gemini Parity
- [x] Port the injection logic to `GeminiProvider`.
- [x] Test cross-provider skill activation.

### Phase 4: User Interface
- [x] Create a "Skills" explorer in the Dashboard.
- [x] Allow users to add/delete their "Global Skills" through the UI.
- [x] Add visual indicator in the Chat when a skill is "Active".

---

## 6. Security Considerations
- **Sandboxing:** Instructions are injected as strings. The AI still uses our existing toolset (`read_file`, `exec`) which are already isolated within the user's Docker container.
- **Path Traversal:** Ensure the `SkillRegistry` cannot be tricked into reading files outside the designated `/skills` directories.