import type { HistoryMessage } from './types';

/**
 * Shared text strings and steering helpers used by every LLM provider's
 * agent loop. Kept here as pure functions so a tweak (e.g. wording changes,
 * threshold adjustments) lands in one place instead of needing identical
 * edits in anthropic.ts AND gemini.ts AND every future provider.
 *
 * Each provider is still responsible for *injecting* the returned strings
 * into its API-specific message format (Anthropic content blocks vs Gemini
 * parts) — only the content is shared.
 */

/**
 * Normalized prior-turn shape that providers map into their API-specific
 * message format. Decoupled from both Anthropic content blocks and Gemini
 * parts so a new provider can reuse the build logic.
 */
export interface NormalizedTurn {
  role: 'user' | 'assistant';
  text: string;
  /**
   * True for the most recent assistant turn (if any). Providers that
   * support prompt caching may use this to place a cache breakpoint
   * on the last cacheable block.
   */
  isLastAssistant: boolean;
}

/**
 * Build the conversation prelude (everything before the current user
 * message) from the optional compaction summary and recent turn history.
 *
 *   - If contextSummary is present, prepend a synthetic user/assistant
 *     pair carrying it (so the next turn is grounded but the summary
 *     doesn't masquerade as a real exchange).
 *   - Then append the recent turn history.
 *   - Finally drop a trailing user turn — the caller is about to add the
 *     current user message, and most APIs require alternating roles.
 */
export function buildHistoryTurns(
  contextSummary: string | undefined,
  history: HistoryMessage[] | undefined,
): NormalizedTurn[] {
  const turns: { role: 'user' | 'assistant'; text: string }[] = [];

  if (contextSummary) {
    turns.push({ role: 'user', text: `[Earlier conversation summary: ${contextSummary}]` });
    turns.push({ role: 'assistant', text: 'Understood, I have context from our earlier conversation.' });
  }

  if (history?.length) {
    for (const msg of history) {
      turns.push({ role: msg.role, text: msg.text });
    }
    if (turns.length > 0 && turns[turns.length - 1].role === 'user') {
      turns.pop();
    }
  }

  // Tag the most recent assistant turn so providers with prompt caching
  // can place a breakpoint there without recomputing the index.
  let lastAssistantIdx = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'assistant') { lastAssistantIdx = i; break; }
  }
  return turns.map((t, i) => ({ ...t, isLastAssistant: i === lastAssistantIdx }));
}

/**
 * Plan-before-execute steering text. Appended to the current user message
 * when the preflight router decides the prompt is complex enough to
 * benefit from a written plan first.
 */
export const PLAN_BEFORE_EXECUTE_INSTRUCTION =
  '\n\n**IMPORTANT — Plan before coding:**\n'
  + 'This is a complex task. Before writing ANY code:\n'
  + '1. Output a brief plan listing every file you will create (path + one-line purpose)\n'
  + '2. List the components/services and what each does\n'
  + '3. Note the order you will write them (dependencies first)\n'
  + '4. Then proceed to implement the plan — write each file ONCE, do NOT rewrite files from scratch\n'
  + '5. After writing all files, verify the build\n\n'
  + 'SCOPE DISCIPLINE: Only create files in your plan. Do NOT add features, components, or files not explicitly requested in the user\'s prompt.\n';

/**
 * User message injected after a failed in-loop auto-build, instructing
 * the model to fix the errors and re-verify.
 */
export function buildFailureMessage(sanitizedBuildOutput: string): string {
  return `The build failed with the following errors. You MUST fix ALL errors and then run \`npm run build\` again to verify.\n\n\`\`\`\n${sanitizedBuildOutput}\n\`\`\``;
}

/**
 * User message injected after a successful in-loop auto-build when CDP
 * is enabled, asking the model to verify the running app via browser tools.
 */
export const CDP_POST_BUILD_VERIFICATION_MESSAGE =
  'Build succeeded. Now verify the application works correctly:\n'
  + '1. Wait a moment for the dev server to reload, then use `browse_console` to check for runtime errors\n'
  + '2. Use `browse_screenshot` to capture the current state of the application\n'
  + '3. Analyze the screenshot — does the UI match what was requested?\n'
  + '4. If there are issues (errors, broken layout, missing elements), fix them and rebuild\n'
  + '5. If everything looks correct, you are done.';

/**
 * Reminder appended to the next tool-result message after the model wrote
 * one or more files this turn. Returns null when nothing was written.
 *
 * Helps the model avoid re-reading files it just authored and steers it
 * toward edit_file for follow-up changes.
 */
export function sessionFileTrackerMessage(
  modifiedFiles: readonly string[],
  filesWrittenThisTurn: number,
): string | null {
  if (filesWrittenThisTurn <= 0 || modifiedFiles.length === 0) return null;
  const fileList = modifiedFiles.map((f) => `  - ${f}`).join('\n');
  return (
    `[Session: ${modifiedFiles.length} files created/modified this session:\n${fileList}\n` +
    `Use edit_file for changes to existing files. Do NOT re-read files you just wrote unless checking specific content.]`
  );
}

/**
 * Tiered nudge based on how deep into the turn budget we are. Returns null
 * when no warning is appropriate for the current turn.
 *
 * Thresholds are deliberately mid-range (25, 35, last-5) so the warnings
 * don't fire for short turn budgets where they'd just add noise.
 */
export function turnBudgetWarning(
  turnsUsed: number,
  maxTurns: number,
  modifiedFilesCount: number,
): string | null {
  if (turnsUsed === 25 && maxTurns > 30) {
    return (
      `[Progress: ${turnsUsed} turns used, ${modifiedFilesCount} files written. ` +
      `Focus on completing the task. Use edit_file for modifications, not full rewrites.]`
    );
  }
  if (turnsUsed === 35 && maxTurns > 40) {
    return `[Progress: ${turnsUsed} turns used. Finalize your work — verify build and respond. Do NOT rewrite files from scratch.]`;
  }
  const remaining = maxTurns - turnsUsed;
  if (remaining <= 5 && remaining > 0 && maxTurns > 10) {
    return `[WARNING: Only ${remaining} turns remaining. Complete now — verify build, take a screenshot if needed, and respond.]`;
  }
  return null;
}
