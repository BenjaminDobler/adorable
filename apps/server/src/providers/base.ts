import { FileSystemInterface, GenerateOptions, HistoryMessage, PreflightDecision, AgentLoopContext } from './types';
import { jsonrepair } from 'jsonrepair';
import { PARALLELIZABLE_TOOLS } from './system-prompts';
import { executeToolByName, executeMCPTool, PARALLELIZABLE_TOOL_NAMES, validateToolArgs, sanitizeFileContent } from './tools/index';
import { prepareAgentContext as prepareAgentContextStandalone, addSkillTools as addSkillToolsStandalone, generateTreeSummary as generateTreeSummaryStandalone, flattenFiles as flattenFilesStandalone } from './context-builder';
import { runPreflight as runPreflightStandalone, runResearchPhase as runResearchPhaseStandalone } from './preflight';
import { SkillRegistry } from './skills/skill-registry';
import { MCPManager } from '../mcp/mcp-manager';
import { sanitizeCommandOutput } from './sanitize-output';

// Re-export for backward compatibility — consumers import these from './base'
export { PARALLELIZABLE_TOOLS, SYSTEM_PROMPT, RESEARCH_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT, VISUAL_EDITING_IDS_INSTRUCTION, ANGULAR_KNOWLEDGE_BASE } from './system-prompts';
export { AgentLoopContext } from './types';

export abstract class BaseLLMProvider {

  /**
   * Execute a list of tool calls with parallelization where safe.
   * Groups consecutive parallelizable (read-only) tools and runs them concurrently,
   * while sequential (mutation) tools run one at a time in order.
   *
   * Returns results in the same order as the input tool calls.
   */
  protected async executeToolsBatched(
    toolCalls: { name: string; args: any; id: string }[],
    ctx: AgentLoopContext,
    options?: {
      onToolCall?: (name: string, args: any) => void;
      onToolResult?: (id: string, content: string, name: string, isError: boolean) => void;
    }
  ): Promise<{ id: string; name: string; content: string; isError: boolean }[]> {
    const results: { id: string; name: string; content: string; isError: boolean }[] = [];

    // Group consecutive parallelizable tools into batches
    type Batch = { parallel: boolean; tools: typeof toolCalls };
    const batches: Batch[] = [];

    for (const tool of toolCalls) {
      const isParallel = PARALLELIZABLE_TOOL_NAMES.has(tool.name) || PARALLELIZABLE_TOOLS.has(tool.name);
      const lastBatch = batches[batches.length - 1];

      if (lastBatch && lastBatch.parallel === isParallel) {
        // Same type as current batch — add to it
        lastBatch.tools.push(tool);
      } else {
        // Start a new batch
        batches.push({ parallel: isParallel, tools: [tool] });
      }
    }

    // Execute each batch
    for (const batch of batches) {
      if (batch.parallel && batch.tools.length > 1) {
        // Fire all onToolCall callbacks immediately
        for (const tool of batch.tools) {
          options?.onToolCall?.(tool.name, tool.args);
        }

        // Execute in parallel
        const batchResults = await Promise.all(
          batch.tools.map(async (tool) => {
            const { content, isError } = await this.executeTool(tool.name, tool.args, ctx);
            options?.onToolResult?.(tool.id, content, tool.name, isError);
            return { id: tool.id, name: tool.name, content, isError };
          })
        );
        results.push(...batchResults);
      } else {
        // Execute sequentially (mutations or single-item batches)
        for (const tool of batch.tools) {
          options?.onToolCall?.(tool.name, tool.args);
          const { content, isError } = await this.executeTool(tool.name, tool.args, ctx);
          options?.onToolResult?.(tool.id, content, tool.name, isError);
          results.push({ id: tool.id, name: tool.name, content, isError });
        }
      }
    }

    return results;
  }

  /**
   * Preflight router — delegates to standalone function.
   */
  protected async runPreflight(
    userPrompt: string,
    history: HistoryMessage[] | undefined,
    contextSummary: string | undefined,
    availableSkills: string[],
    preflightLLMCall: (systemPrompt: string, userPrompt: string) => Promise<string>,
  ): Promise<PreflightDecision> {
    return runPreflightStandalone(userPrompt, history, contextSummary, availableSkills, preflightLLMCall);
  }

  /**
   * Research phase — delegates to standalone function.
   */
  protected async runResearchPhase(
    ctx: AgentLoopContext,
    userPrompt: string,
    fileStructure: string,
    researchLLMCall: (prompt: string, tools: any[], fs: FileSystemInterface) => Promise<string>,
  ): Promise<string> {
    return runResearchPhaseStandalone(ctx, userPrompt, fileStructure, researchLLMCall);
  }

  /**
   * Prepare agent context — delegates to standalone function.
   */
  protected async prepareAgentContext(options: GenerateOptions, providerName: string): Promise<{
    fs: FileSystemInterface;
    skillRegistry: SkillRegistry;
    availableTools: any[];
    userMessage: string;
    effectiveSystemPrompt: string;
    logger: import('./debug-logger').DebugLogger;
    maxTurns: number;
    mcpManager?: MCPManager;
    activeKitName?: string;
    activeKitId?: string;
    userId?: string;
    projectId?: string;
    history?: HistoryMessage[];
    contextSummary?: string;
    cdpEnabled?: boolean;
    buildCommand: string;
  }> {
    return prepareAgentContextStandalone(options, providerName);
  }

  /**
   * Add skill tools — delegates to standalone function.
   */
  protected async addSkillTools(availableTools: any[], skillRegistry: SkillRegistry, fs: FileSystemInterface, userId?: string) {
    return addSkillToolsStandalone(availableTools, skillRegistry, fs, userId);
  }

  /**
   * Execute an MCP tool — delegates to standalone function.
   */
  protected async executeMCPTool(
    toolName: string,
    toolArgs: any,
    ctx: AgentLoopContext
  ): Promise<{ content: string; isError: boolean }> {
    return executeMCPTool(toolName, toolArgs, ctx);
  }

  /**
   * Execute a tool — uses the modular tool registry (providers/tools/).
   * MCP tools (dynamic, registered at runtime by MCP servers) are handled
   * separately via the MCP manager.
   */
  protected async executeTool(
    toolName: string,
    toolArgs: any,
    ctx: AgentLoopContext
  ): Promise<{ content: string; isError: boolean }> {
    // MCP tools are dynamic (not in the static registry) — dispatch via MCP manager
    if (ctx.mcpManager && ctx.mcpManager.isMCPTool(toolName)) {
      return executeMCPTool(toolName, toolArgs, ctx);
    }

    return executeToolByName(toolName, toolArgs, ctx);
  }

  protected async postLoopBuildCheck(
    ctx: AgentLoopContext,
    sendMessageAndGetToolCalls: (userMessage: string) => Promise<{ toolCalls: { name: string; args: any; id: string }[]; text: string }>,
    pushToolResults?: (results: { tool_use_id: string; content: string; is_error: boolean }[]) => void,
    runReviewAgent?: (reviewPrompt: string) => Promise<string>,
  ): Promise<void> {
    const { fs, callbacks } = ctx;

    // Auto-build check in the no-tools-called path
    if (fs.exec && ctx.hasWrittenFiles && !ctx.hasRunBuild && !ctx.buildNudgeSent) {
      ctx.buildNudgeSent = true;
      const buildCmd = ctx.buildCommand;
      console.log(`[AutoBuild] Running ${buildCmd}...`);
      callbacks.onText?.('\n\nVerifying build...\n');
      const buildResult = await fs.exec(buildCmd);
      console.log(`[AutoBuild] Build result: exitCode=${buildResult.exitCode}`);

      if (buildResult.exitCode !== 0) {
        callbacks.onText?.('Build failed. Fixing errors...\n');
        const sanitizedBuildOutput = sanitizeCommandOutput(buildCmd, buildResult.stdout || '', buildResult.stderr || '', buildResult.exitCode);
        const fixMessage = `The build failed with the following errors. Fix ALL errors and then use \`verify_build\` again to verify.\n\n\`\`\`\n${sanitizedBuildOutput}\n\`\`\``;

        const FIX_TURNS = 5;
        let currentFixMessage = fixMessage;
        for (let fixTurn = 0; fixTurn < FIX_TURNS; fixTurn++) {
          console.log(`[AutoBuild] Fix turn ${fixTurn}`);
          const result = await sendMessageAndGetToolCalls(currentFixMessage);

          if (result.toolCalls.length === 0) break;

          const fixToolResults: { tool_use_id: string; content: string; is_error: boolean }[] = [];
          for (const call of result.toolCalls) {
            callbacks.onToolCall?.(0, call.name, call.args);
            const { content, isError } = await this.executeTool(call.name, call.args, ctx);
            callbacks.onToolResult?.(call.id, content, call.name);
            fixToolResults.push({ tool_use_id: call.id, content, is_error: isError });

            if ((call.name === 'verify_build' || (call.name === 'run_command' && call.args?.command?.includes('build'))) && !isError) {
              console.log(`[AutoBuild] Fix build succeeded on fix turn ${fixTurn}`);
              ctx.hasRunBuild = true;
            }
          }

          // Push tool_result blocks to maintain proper message pairing
          pushToolResults?.(fixToolResults);

          if (ctx.hasRunBuild) break;
          currentFixMessage = 'Continue fixing the build errors.';
        }
      } else {
        callbacks.onText?.('Build successful.\n');
        console.log(`[AutoBuild] Build succeeded`);
        ctx.hasRunBuild = true;
      }
    }

    // CDP post-loop verification: if build succeeded but no browser verification happened yet
    if (ctx.cdpEnabled && ctx.hasRunBuild && !ctx.hasVerifiedWithBrowser) {
      ctx.hasVerifiedWithBrowser = true;
      console.log('[BrowseVerify] Running post-loop browser verification...');
      callbacks.onText?.('\nVerifying with browser tools...\n');

      // Wait for dev server to reload after build
      await new Promise(resolve => setTimeout(resolve, 3000));

      const verifyMsg = 'Build succeeded. Verify the application works correctly:\n'
        + '1. Use `browse_console` to check for runtime errors\n'
        + '2. Use `browse_screenshot` to capture the current state\n'
        + '3. If there are issues, fix them. If everything looks correct, confirm and stop.';

      const VERIFY_TURNS = 3;
      let currentVerifyMsg = verifyMsg;
      for (let verifyTurn = 0; verifyTurn < VERIFY_TURNS; verifyTurn++) {
        console.log(`[BrowseVerify] Verification turn ${verifyTurn}`);
        const result = await sendMessageAndGetToolCalls(currentVerifyMsg);

        if (result.toolCalls.length === 0) break;

        const toolResultsForHistory: { tool_use_id: string; content: string; is_error: boolean }[] = [];
        for (const call of result.toolCalls) {
          callbacks.onToolCall?.(0, call.name, call.args);
          const { content, isError } = await this.executeTool(call.name, call.args, ctx);
          callbacks.onToolResult?.(call.id, content, call.name);
          toolResultsForHistory.push({ tool_use_id: call.id, content, is_error: isError });
        }

        // Push tool_result blocks to maintain proper message pairing for the API
        pushToolResults?.(toolResultsForHistory);

        currentVerifyMsg = 'Analyze the results. If there are issues, fix them. If everything looks correct, you are done.';
      }
    }

    // Post-generation review: if build succeeded and files were modified, run a review agent
    if (ctx.hasRunBuild && ctx.modifiedFiles.length > 0 && runReviewAgent) {
      console.log(`[Review] Running review agent on ${ctx.modifiedFiles.length} modified files...`);
      callbacks.onText?.('\n\nReviewing generated code...\n');

      try {
        // Read modified files to provide context to the reviewer
        const fileContents: string[] = [];
        for (const filePath of ctx.modifiedFiles) {
          try {
            const fileContent = await fs.readFile(filePath);
            fileContents.push(`### ${filePath}\n\`\`\`\n${fileContent}\n\`\`\``);
          } catch {
            // File may have been deleted or renamed — skip
          }
        }

        if (fileContents.length > 0) {
          const reviewPrompt = 'Review the following files that were just generated/modified. Report any issues:\n\n'
            + fileContents.join('\n\n');

          const reviewResult = await runReviewAgent(reviewPrompt);
          if (reviewResult && reviewResult.trim() && reviewResult.trim() !== 'No issues found.') {
            callbacks.onText?.('\n**Code Review Results:**\n' + reviewResult + '\n');
          } else {
            callbacks.onText?.('No issues found.\n');
          }
        }
      } catch (err: any) {
        console.error('[Review] Review agent failed:', err.message);
        // Don't fail the whole generation if review fails
      }
    }

    // Nudge ng serve by modifying a file inside the container via exec (not putArchive)
    // putArchive may not trigger inotify reliably, so we use shell commands directly
    if (fs.exec && ctx.hasWrittenFiles) {
      console.log('[AutoBuild] Nudging dev server via exec...');
      try {
        await fs.exec('cp src/main.ts src/main.ts.bak && echo "// nudge" >> src/main.ts && sleep 2 && mv src/main.ts.bak src/main.ts');
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Truncate older messages to stay within context limits.
   * Keeps the first message (user prompt) and last N messages intact,
   * truncates large tool inputs/results in the middle.
   */
  protected pruneMessages(messages: any[], keepRecentCount = 6): void {
    if (messages.length <= keepRecentCount + 1) return;

    const truncateThreshold = 2000; // chars
    const truncateTarget = 200;
    const pruneEndIndex = messages.length - keepRecentCount;

    // Improvement 5: Before truncating, extract a structured summary from the
    // messages that are about to lose their content. This preserves knowledge
    // about what was done (files written, tools used, key decisions) so the AI
    // doesn't need to re-read files to recover its own output.
    const summary = this.extractPruneSummary(messages, 1, pruneEndIndex);

    // Prune everything except first message and last keepRecentCount messages
    for (let i = 1; i < pruneEndIndex; i++) {
      const msg = messages[i];
      if (!msg.content || !Array.isArray(msg.content)) continue;

      // Strip image blocks from older messages — they are the biggest token consumers
      // (each 2x PNG screenshot can be 50k+ tokens). Replace with a text placeholder.
      msg.content = msg.content.filter((block: any) => {
        if (block.type === 'image') return false;
        return true;
      }).map((block: any) => {
        // Also strip images from tool_result content arrays
        if (block.type === 'tool_result' && Array.isArray(block.content)) {
          const hasImage = block.content.some((c: any) => c.type === 'image');
          if (hasImage) {
            block.content = block.content.filter((c: any) => c.type !== 'image');
            block.content.push({ type: 'text', text: '[image removed from older message to save context]' });
          }
        }
        return block;
      });

      for (const block of msg.content) {
        // Truncate tool_use inputs — keep schema-valid structure
        if (block.type === 'tool_use' && block.input) {
          if (block.name === 'write_files' && Array.isArray(block.input.files)) {
            block.input.files = block.input.files.map((f: any) => ({
              path: f.path,
              content: '[truncated]'
            }));
          } else if (block.name === 'write_file' && block.input.content?.length > truncateThreshold) {
            block.input.content = '[truncated]';
          } else if (block.name === 'read_files' || block.name === 'read_file') {
            // These are small, keep as-is
          } else if (block.name === 'run_command') {
            // Small, keep as-is
          }
        }
        // Truncate tool_result content (user messages)
        if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > truncateThreshold) {
          block.content = block.content.slice(0, truncateTarget) + `\n...[truncated ${block.content.length} chars]`;
        }
        // Truncate text blocks
        if (block.type === 'text' && typeof block.text === 'string' && block.text.length > truncateThreshold) {
          block.text = block.text.slice(0, truncateTarget) + `\n...[truncated ${block.text.length} chars]`;
        }
      }
    }

    // Inject the summary as the second message (right after the initial prompt)
    // so it's always visible and never truncated on subsequent prune passes.
    if (summary) {
      // Check if we already injected a summary — update it instead of stacking
      const existingSummaryIndex = messages.findIndex((m: any, i: number) =>
        i > 0 && i < pruneEndIndex && m.role === 'user' &&
        Array.isArray(m.content) && m.content[0]?.text?.startsWith('[Progress summary')
      );
      if (existingSummaryIndex > 0) {
        // Update existing summary in place
        messages[existingSummaryIndex].content[0].text = summary;
      } else if (messages.length > 2) {
        // Insert new summary pair after the first message
        messages.splice(1, 0,
          { role: 'user', content: [{ type: 'text', text: summary }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Understood. I have context about my earlier work and will continue from here.' }] },
        );
      }
    }
  }

  /**
   * Extract a structured summary from messages that are about to be pruned.
   * Returns null if there's nothing significant to summarize.
   */
  private extractPruneSummary(messages: any[], startIndex: number, endIndex: number): string | null {
    const filesWritten = new Set<string>();
    const filesEdited = new Set<string>();
    const filesRead = new Set<string>();
    const toolsUsed = new Map<string, number>();
    const keyResponses: string[] = [];
    let buildAttempts = 0;
    let lastBuildSuccess = false;

    for (let i = startIndex; i < endIndex; i++) {
      const msg = messages[i];
      if (!msg.content || !Array.isArray(msg.content)) continue;

      for (const block of msg.content) {
        // Extract tool usage info
        if (block.type === 'tool_use' && block.input) {
          toolsUsed.set(block.name, (toolsUsed.get(block.name) || 0) + 1);

          if (block.name === 'write_files' && Array.isArray(block.input.files)) {
            for (const f of block.input.files) {
              if (f.path) filesWritten.add(f.path);
            }
          } else if (block.name === 'write_file' && block.input.path) {
            filesWritten.add(block.input.path);
          } else if (block.name === 'edit_file' && block.input.path) {
            filesEdited.add(block.input.path);
          } else if (block.name === 'read_files' && Array.isArray(block.input.paths)) {
            for (const p of block.input.paths) filesRead.add(p);
          } else if (block.name === 'read_file' && block.input.path) {
            filesRead.add(block.input.path);
          } else if (block.name === 'verify_build') {
            buildAttempts++;
          }
        }

        // Extract key text responses (first sentence)
        if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 20 && msg.role === 'assistant') {
          const firstSentence = block.text.replace(/\s+/g, ' ').trim().split(/[.!?\n]/)[0];
          if (firstSentence && firstSentence.length > 10 && firstSentence.length < 200) {
            keyResponses.push(firstSentence);
          }
        }

        // Check build results
        if (block.type === 'tool_result' && typeof block.content === 'string') {
          if (block.content.includes('Build succeeded') || block.content.includes('exit code 0')) {
            lastBuildSuccess = true;
          } else if (block.content.includes('Build failed') || block.content.includes('exit code 1')) {
            lastBuildSuccess = false;
          }
        }
      }
    }

    // Only generate summary if there's meaningful work to summarize
    if (filesWritten.size === 0 && filesEdited.size === 0 && toolsUsed.size === 0) return null;

    const parts: string[] = ['[Progress summary of earlier turns (context was compacted):'];

    if (filesWritten.size > 0) {
      parts.push(`Files created: ${[...filesWritten].join(', ')}`);
    }
    if (filesEdited.size > 0) {
      parts.push(`Files edited: ${[...filesEdited].join(', ')}`);
    }
    if (buildAttempts > 0) {
      parts.push(`Build attempts: ${buildAttempts} (last: ${lastBuildSuccess ? 'succeeded' : 'failed'})`);
    }

    const toolSummary = [...toolsUsed.entries()]
      .filter(([name]) => name !== 'read_file' && name !== 'read_files')
      .map(([name, count]) => `${name}×${count}`)
      .join(', ');
    if (toolSummary) {
      parts.push(`Tools used: ${toolSummary}`);
    }

    if (keyResponses.length > 0) {
      parts.push(`Key decisions: ${keyResponses.slice(0, 5).map(r => `"${r}"`).join('; ')}`);
    }

    parts.push('Continue from where you left off. Do NOT re-read or rewrite files listed above — use edit_file for changes.]');

    return parts.join('\n');
  }

  protected parseToolInput(input: string): any {
    // Handle empty input gracefully - expected for no-parameter tools (e.g. take_screenshot),
    // can also happen when streaming is interrupted
    if (!input || !input.trim()) {
      return {};
    }

    try {
      return JSON.parse(input);
    } catch {
      try {
        const repaired = jsonrepair(input);
        console.log(`[ParseTool] JSON repaired (${input.length} chars)`);
        return JSON.parse(repaired);
      } catch (e: any) {
        console.error(`[ParseTool] JSON repair failed (${input.length} chars): ${e.message}`);
        console.error(`[ParseTool] Input preview: ${input.slice(0, 200)}...`);
        return {};
      }
    }
  }

  /**
   * Sanitize file content — delegates to standalone function.
   */
  protected sanitizeFileContent(content: string, filePath: string): string {
    return sanitizeFileContent(content, filePath);
  }

  /**
   * Validate tool args — delegates to standalone function.
   */
  protected validateToolArgs(toolName: string, toolArgs: any, required: string[]): string | null {
    return validateToolArgs(toolName, toolArgs, required);
  }

  /**
   * Flatten files — delegates to standalone function.
   */
  protected flattenFiles(structure: any, prefix = ''): Record<string, string> {
    return flattenFilesStandalone(structure, prefix);
  }

  /**
   * Generate tree summary — delegates to standalone function.
   */
  protected generateTreeSummary(structure: any, prefix = ''): string {
    return generateTreeSummaryStandalone(structure, prefix);
  }
}
