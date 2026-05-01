import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider, ANGULAR_KNOWLEDGE_BASE, REVIEW_SYSTEM_PROMPT, RESEARCH_SYSTEM_PROMPT, AgentLoopContext } from './base';
import { sanitizeCommandOutput } from './sanitize-output';
import { createSapFetch } from './sap-ai-core';

export class AnthropicProvider extends BaseLLMProvider implements LLMProvider {
  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    const { apiKey, model, baseUrl } = options;
    if (!apiKey) throw new Error('Anthropic API Key is required');

    const modelToUse = model || 'claude-sonnet-4-6';

    let anthropicOptions: ConstructorParameters<typeof Anthropic>[0];
    if (options.sapAiCore) {
      const sapFetch = createSapFetch(options.sapAiCore, modelToUse);
      anthropicOptions = {
        apiKey: 'sap-managed',
        fetch: sapFetch,
        baseURL: options.sapAiCore.baseUrl,
      };
    } else {
      anthropicOptions = {
        apiKey,
        ...(baseUrl && { baseURL: baseUrl }),
      };
    }
    const anthropic = new Anthropic(anthropicOptions);

    // Prepare shared context
    const { fs, skillRegistry, availableTools, userMessage, effectiveSystemPrompt, logger, maxTurns, mcpManager, activeKitName, activeKitId, userId, projectId, history, contextSummary, buildCommand } = await this.prepareAgentContext(options, 'anthropic');
    const skills = await this.addSkillTools(availableTools, skillRegistry, fs, options.userId);
    // Tools with no parameters (e.g. take_screenshot) legitimately receive empty input
    const noInputTools = new Set(availableTools.filter((t: any) => !t.input_schema?.required?.length && !Object.keys(t.input_schema?.properties || {}).length).map((t: any) => t.name));

    // Inject Anthropic web_search built-in tool if enabled.
    // The 20260209 version ships with dynamic filtering — Claude writes code that filters
    // results before they hit the context, improving accuracy and cutting tokens.
    if (options.builtInTools?.webSearch) {
      availableTools.push({ type: 'web_search_20260209', name: 'web_search' } as any);
      logger.info('Web search tool enabled');
    }

    let enrichedUserMessage = userMessage;

    // Log the full prompts for debugging
    logger.logText('SYSTEM_PROMPT', effectiveSystemPrompt);
    logger.logText('KNOWLEDGE_BASE', ANGULAR_KNOWLEDGE_BASE);
    logger.logText('USER_MESSAGE', enrichedUserMessage);

    // Build initial messages with conversation history
    const messages: any[] = [];

    // 1. Context summary (compacted older turns)
    if (contextSummary) {
      messages.push({ role: 'user', content: [{ type: 'text', text: `[Earlier conversation summary: ${contextSummary}]` }] });
      messages.push({ role: 'assistant', content: [{ type: 'text', text: 'Understood, I have context from our earlier conversation.' }] });
    }

    // 2. Recent history messages
    if (history?.length) {
      for (let i = 0; i < history.length; i++) {
        const msg = history[i];
        const isLast = i === history.length - 1;
        messages.push({
          role: msg.role,
          content: [{
            type: 'text', text: msg.text,
            ...(isLast && msg.role === 'assistant' ? { cache_control: { type: 'ephemeral' } } : {})
          }]
        });
      }
      // Ensure alternating roles: drop trailing user message since we're about to add one
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        messages.pop();
      }
    }

    const historyCount = messages.length;
    if (historyCount > 0) {
      logger.log('HISTORY_INJECTED', { messageCount: historyCount, hasSummary: !!contextSummary, totalChars: messages.reduce((sum: number, m: any) => sum + (m.content?.[0]?.text?.length || 0), 0) });
    }

    // 3. Current enriched user message (with pre-read file contents from research phase)
    const currentUserContent: any[] = [{
      type: 'text',
      text: enrichedUserMessage,
      cache_control: { type: 'ephemeral' }
    }];
    messages.push({ role: 'user', content: currentUserContent });

    // Handle Attachments — append to current user message
    if (options.images && options.images.length > 0) {
      options.images.forEach(dataUri => {
        const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const data = match[2];
          if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
            currentUserContent.push({
              type: 'image',
              source: { type: 'base64', media_type: mimeType as any, data }
            });
          } else if (mimeType === 'application/pdf') {
            currentUserContent.push({
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data }
            });
          } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
            try {
              const textContent = Buffer.from(data, 'base64').toString('utf-8');
              currentUserContent.push({
                type: 'text',
                text: `\n[Attached File Content (${mimeType})]:\n${textContent}\n`
              });
            } catch (e) { logger.error('Failed to decode text attachment', { error: (e as Error).message }); }
          }
        }
      });
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheCreationTokens = 0;
    let totalCacheReadTokens = 0;

    const ctx: AgentLoopContext = {
      fs, callbacks, skillRegistry, availableTools, logger,
      hasRunBuild: false, hasWrittenFiles: false, modifiedFiles: [], writtenFilesSet: new Set(), modifiedFilesAtTurnStart: 0,
      buildNudgeSent: false, fullExplanation: '',
      mcpManager,
      failedBuildCount: 0, lastBuildOutput: '',
      activeKitName,
      activeKitId,
      userId,
      projectId,
      cdpEnabled: options.cdpEnabled,
      hasVerifiedWithBrowser: false,
      buildCommand,
      readFileState: new Map(),
      fileHistory: new Map(),
    };

    let effort: 'low' | 'medium' | 'high' = options.reasoningEffort || 'high';

    // Preflight router: lightweight LLM call to decide how to handle this request
    // Re-use skill names from addSkillTools (called above), which already populated the registry
    const availableSkills = skills.map(s => s.name);
    const preflightDecision = await this.runPreflight(
      options.prompt, history, contextSummary, availableSkills,
      async (systemPrompt, userMsg) => {
        // Use a fast, low-cost model for routing decisions
        const routerModel = 'claude-haiku-4-5';
        const result = await anthropic.messages.create({
          model: routerModel,
          max_tokens: 256,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        });
        return (result.content[0] as any)?.text || '';
      }
    );

    // Notify client of preflight decision (topic shift, context suggestions)
    callbacks.onPreflightDecision?.(preflightDecision);

    // Apply reasoning effort from preflight (user override takes precedence)
    if (!options.reasoningEffort && preflightDecision.reasoningEffort) {
      effort = preflightDecision.reasoningEffort;
    }

    // Apply skill hint from preflight (only if no explicit forced skill)
    if (preflightDecision.skillHint && !options.forcedSkill) {
      const hintedSkill = skillRegistry.getSkill(preflightDecision.skillHint);
      if (hintedSkill) {
        enrichedUserMessage += `\n\n[SYSTEM INJECTION] The preflight router detected that the '${hintedSkill.name}' skill is relevant. You MUST follow these instructions:\n${hintedSkill.instructions}`;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'user' && lastMsg.content?.[0]?.type === 'text') {
          lastMsg.content[0].text = enrichedUserMessage;
        }
      }
    }

    // Research phase: LLM-based agent reads relevant files before main loop
    if (options.previousFiles && options.researchAgentEnabled !== false && preflightDecision.runResearch) {
      const researchContext = await this.runResearchPhase(ctx, options.prompt, userMessage,
        async (researchPrompt, researchTools) => {
          const MAX_RESEARCH_TURNS = 3;
          const researchMessages: any[] = [
            { role: 'user', content: researchPrompt },
          ];

          for (let turn = 0; turn < MAX_RESEARCH_TURNS; turn++) {
            const researchStream = await anthropic.messages.create({
              model: modelToUse,
              max_tokens: 8192,
              // Research is a scoped, bounded task — low effort keeps it fast and cheap.
              thinking: { type: 'adaptive' },
              output_config: { effort: 'low' },
              system: [{ type: 'text', text: RESEARCH_SYSTEM_PROMPT }] as any,
              messages: researchMessages as any,
              tools: researchTools as any,
              stream: true,
            });

            const researchContent: any[] = [];
            const researchToolUses: { id: string; name: string; input: string }[] = [];
            let currentResearchTool: { id: string; name: string; input: string } | null = null;
            let researchText = '';

            for await (const event of researchStream) {
              if (event.type === 'content_block_start') {
                if (event.content_block.type === 'thinking') {
                  researchContent.push({ type: 'thinking', thinking: '' });
                } else if (event.content_block.type === 'tool_use') {
                  currentResearchTool = { id: event.content_block.id, name: event.content_block.name, input: '' };
                  researchToolUses.push(currentResearchTool);
                  researchContent.push(event.content_block);
                } else if (event.content_block.type === 'text') {
                  researchContent.push({ type: 'text', text: '' });
                }
              }
              if (event.type === 'content_block_delta') {
                if (event.delta.type === 'thinking_delta') {
                  const lastBlock = researchContent[researchContent.length - 1];
                  if (lastBlock?.type === 'thinking') lastBlock.thinking += (event.delta as any).thinking;
                } else if ((event.delta as any).type === 'signature_delta') {
                  const lastBlock = researchContent[researchContent.length - 1];
                  if (lastBlock?.type === 'thinking') lastBlock.signature = (event.delta as any).signature;
                } else if (event.delta.type === 'text_delta') {
                  researchText += event.delta.text;
                  const lastBlock = researchContent[researchContent.length - 1];
                  if (lastBlock?.type === 'text') lastBlock.text += event.delta.text;
                } else if (event.delta.type === 'input_json_delta') {
                  if (currentResearchTool) currentResearchTool.input += event.delta.partial_json;
                }
              }
            }

            for (const block of researchContent) {
              if (block.type === 'tool_use') {
                const t = researchToolUses.find(r => r.id === block.id);
                if (t) block.input = this.parseToolInput(t.input, logger);
              }
            }
            researchMessages.push({ role: 'assistant', content: researchContent });

            if (researchToolUses.length === 0) return researchText;

            // Execute research tools
            const toolResultsArr: any[] = [];
            for (const t of researchToolUses) {
              const args = this.parseToolInput(t.input, logger);
              try {
                const { content } = await this.executeTool(t.name, args, ctx);
                toolResultsArr.push({ type: 'tool_result', tool_use_id: t.id, content, is_error: false });
              } catch (err: any) {
                toolResultsArr.push({ type: 'tool_result', tool_use_id: t.id, content: `Error: ${err.message}`, is_error: true });
              }
            }
            researchMessages.push({ role: 'user', content: toolResultsArr });
          }

          // Extract text from final assistant message
          for (const msg of researchMessages) {
            if (msg.role === 'assistant' && Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === 'text' && block.text) return block.text;
              }
            }
          }
          return '';
        }
      );
      if (researchContext) {
        enrichedUserMessage = userMessage + researchContext;
        // Update the user message in the messages array
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'user' && lastMsg.content?.[0]?.type === 'text') {
          lastMsg.content[0].text = enrichedUserMessage;
        }
      }
    }

    // Improvement 4: Plan-before-execute — for complex prompts, inject a plan instruction
    // so the AI outputs a file plan before writing code. This prevents scope creep and
    // rewrite cycles by giving the session a structure the AI can follow.
    if (preflightDecision.requiresPlan) {
      enrichedUserMessage += '\n\n**IMPORTANT — Plan before coding:**\n'
        + 'This is a complex task. Before writing ANY code:\n'
        + '1. Output a brief plan listing every file you will create (path + one-line purpose)\n'
        + '2. List the components/services and what each does\n'
        + '3. Note the order you will write them (dependencies first)\n'
        + '4. Then proceed to implement the plan — write each file ONCE, do NOT rewrite files from scratch\n'
        + '5. After writing all files, verify the build\n\n'
        + 'SCOPE DISCIPLINE: Only create files in your plan. Do NOT add features, components, or files not explicitly requested in the user\'s prompt.\n';
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'user' && lastMsg.content?.[0]?.type === 'text') {
        lastMsg.content[0].text = enrichedUserMessage;
      }
      logger.info('Injected plan-before-execute instruction (preflight detected complex prompt)');
    }

    let turnCount = 0;

    while (turnCount < maxTurns) {
      logger.log('TURN_START', { turn: turnCount });
      this.pruneMessages(messages);
      const stream = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 32768,
        // Adaptive thinking — Claude decides when and how much to think.
        // `effort` controls overall thinking depth and tool-call density on Sonnet 4.6 / Opus 4.6 / Opus 4.7.
        thinking: { type: 'adaptive' },
        output_config: { effort },
        system: [
          { type: 'text', text: ANGULAR_KNOWLEDGE_BASE, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: effectiveSystemPrompt, cache_control: { type: 'ephemeral' } }
        ] as any,
        messages: messages as any,
        tools: availableTools as any,
        stream: true,
      });

      const toolUses: { id: string, name: string, input: string }[] = [];
      let currentToolUse: { id: string, name: string, input: string } | null = null;
      const assistantMessageContent: any[] = [];

      for await (const event of stream) {
        if (event.type === 'message_start' && event.message.usage) {
          totalInputTokens += event.message.usage.input_tokens;
          totalCacheCreationTokens += (event.message.usage as any).cache_creation_input_tokens || 0;
          totalCacheReadTokens += (event.message.usage as any).cache_read_input_tokens || 0;
          callbacks.onTokenUsage?.({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens, cacheCreationInputTokens: totalCacheCreationTokens || undefined, cacheReadInputTokens: totalCacheReadTokens || undefined });
        }
        if (event.type === 'message_delta' && event.usage) {
          totalOutputTokens += event.usage.output_tokens;
          totalCacheCreationTokens += (event.usage as any).cache_creation_input_tokens || 0;
          totalCacheReadTokens += (event.usage as any).cache_read_input_tokens || 0;
          callbacks.onTokenUsage?.({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens, cacheCreationInputTokens: totalCacheCreationTokens || undefined, cacheReadInputTokens: totalCacheReadTokens || undefined });
        }
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'thinking') {
            // Preserve thinking blocks in message history (required by API) but don't stream to client
            assistantMessageContent.push({ type: 'thinking', thinking: '' });
          } else if (event.content_block.type === 'tool_use') {
            currentToolUse = { id: event.content_block.id, name: event.content_block.name, input: '' };
            toolUses.push(currentToolUse);
            assistantMessageContent.push(event.content_block);
            callbacks.onToolStart?.(assistantMessageContent.length - 1, event.content_block.name);
          } else if (event.content_block.type === 'text') {
            assistantMessageContent.push({ type: 'text', text: '' });
          } else if (event.content_block.type === 'server_tool_use') {
            // Anthropic server-side tool (e.g. web_search) — track but don't execute locally
            assistantMessageContent.push(event.content_block);
            callbacks.onToolStart?.(assistantMessageContent.length - 1, event.content_block.name);
          } else if (event.content_block.type === 'web_search_tool_result') {
            // Server-side tool result — pass through to message history
            assistantMessageContent.push(event.content_block);
          }
        }
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'thinking_delta') {
            // Accumulate thinking text for message history but don't stream to client
            const lastBlock = assistantMessageContent[assistantMessageContent.length - 1];
            if (lastBlock?.type === 'thinking') lastBlock.thinking += (event.delta as any).thinking;
          } else if ((event.delta as any).type === 'signature_delta') {
            // Capture the signature required when sending thinking blocks back in conversation history
            const lastBlock = assistantMessageContent[assistantMessageContent.length - 1];
            if (lastBlock?.type === 'thinking') lastBlock.signature = (event.delta as any).signature;
          } else if (event.delta.type === 'text_delta') {
            ctx.fullExplanation += event.delta.text;
            callbacks.onText?.(event.delta.text);
            const lastBlock = assistantMessageContent[assistantMessageContent.length - 1];
            if (lastBlock?.type === 'text') lastBlock.text += event.delta.text;
          } else if (event.delta.type === 'input_json_delta') {
            if (currentToolUse) {
              currentToolUse.input += event.delta.partial_json;
              callbacks.onToolDelta?.(assistantMessageContent.length - 1, event.delta.partial_json);
            }
          }
        }
      }

      // Detect tools with empty input (possible truncation or streaming interruption)
      // Skip warning for tools that take no parameters (e.g. take_screenshot)
      for (const tool of toolUses) {
        if ((!tool.input || !tool.input.trim()) && !noInputTools.has(tool.name)) {
          logger.warn(`Tool '${tool.name}' (id: ${tool.id}) received empty input - possible truncation or streaming interruption`);
        }
      }

      // Parse tool inputs
      for (const block of assistantMessageContent) {
        if (block.type === 'tool_use') {
          const tool = toolUses.find(t => t.id === block.id);
          if (tool) {
            block.input = this.parseToolInput(tool.input, logger);
          }
        }
      }

      messages.push({ role: 'assistant', content: assistantMessageContent });

      // Log the assistant's text response for this turn
      const assistantText = assistantMessageContent
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      if (assistantText) {
        logger.logText('ASSISTANT_RESPONSE', assistantText, { turn: turnCount });
      }

      logger.info(`Turn ${turnCount}: toolUses=${toolUses.length} [${toolUses.map(t => t.name).join(', ')}]`);

      if (toolUses.length === 0) {
        // Auto-build check
        if (fs.exec && ctx.hasWrittenFiles && !ctx.hasRunBuild && !ctx.buildNudgeSent && turnCount < maxTurns - 2) {
          ctx.buildNudgeSent = true;
          logger.info('Running npm run build...');
          callbacks.onText?.('\n\nVerifying build...\n');
          const buildResult = await fs.exec('npm run build');
          logger.info(`Build result: exitCode=${buildResult.exitCode}`);
          if (buildResult.exitCode !== 0) {
            callbacks.onText?.('Build failed. Fixing errors...\n');
            const sanitizedBuildOutput = sanitizeCommandOutput('npm run build', buildResult.stdout || '', buildResult.stderr || '', buildResult.exitCode);
            const buildFailMsg = `The build failed with the following errors. You MUST fix ALL errors and then run \`npm run build\` again to verify.\n\n\`\`\`\n${sanitizedBuildOutput}\n\`\`\``;
            logger.logText('INJECTED_USER_MESSAGE', buildFailMsg, { reason: 'auto_build_failure' });
            messages.push({ role: 'user', content: [{ type: 'text', text: buildFailMsg }] });
            ctx.hasRunBuild = false;
            turnCount++;
            continue;
          } else {
            callbacks.onText?.('Build successful.\n');
            ctx.hasRunBuild = true;

            // CDP verification: after successful build, ask AI to verify with browse tools
            if (ctx.cdpEnabled && !ctx.hasVerifiedWithBrowser && turnCount < maxTurns - 3) {
              ctx.hasVerifiedWithBrowser = true;
              callbacks.onText?.('Verifying with browser tools...\n');
              const verifyMsg = 'Build succeeded. Now verify the application works correctly:\n'
                + '1. Wait a moment for the dev server to reload, then use `browse_console` to check for runtime errors\n'
                + '2. Use `browse_screenshot` to capture the current state of the application\n'
                + '3. Analyze the screenshot — does the UI match what was requested?\n'
                + '4. If there are issues (errors, broken layout, missing elements), fix them and rebuild\n'
                + '5. If everything looks correct, you are done.';
              logger.logText('INJECTED_USER_MESSAGE', verifyMsg, { reason: 'cdp_post_build_verification' });
              messages.push({ role: 'user', content: [{ type: 'text', text: verifyMsg }] });
              turnCount++;
              continue;
            }
          }
        }
        break;
      }

      // Execute tools — parallel for read-only, sequential for mutations
      const parsedToolCalls = toolUses.map(t => ({
        name: t.name,
        args: this.parseToolInput(t.input, logger),
        id: t.id,
      }));

      const batchedResults = await this.executeToolsBatched(parsedToolCalls, ctx, {
        onToolCall: (name, args, activityDescription) => {
          callbacks.onToolCall?.(0, name, args, activityDescription);
          logger.log('EXECUTING_TOOL', { name, args, activityDescription });
        },
        onToolResult: (id, content, name, isError) => {
          logger.logText('TOOL_RESULT', content, { id, isError });
        },
      });

      // Build tool_result blocks for message history
      const toolResults: any[] = [];
      for (const result of batchedResults) {
        // Check if this is a screenshot result with embedded image data
        const screenshotMatch = result.content.match(/^\[SCREENSHOT:(data:image\/[^;]+;base64,(.+))\]$/);
        if (screenshotMatch && !result.isError) {
          const dataUri = screenshotMatch[1];
          const mimeMatch = dataUri.match(/^data:image\/([^;]+);base64,(.+)$/);
          if (mimeMatch) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: result.id,
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: `image/${mimeMatch[1]}` as any,
                    data: mimeMatch[2]
                  }
                },
                {
                  type: 'text',
                  text: 'Screenshot captured successfully. Analyze this image to verify the application appearance.'
                }
              ],
              is_error: false
            });
            callbacks.onToolResult?.(result.id, 'Screenshot captured (image attached)', result.name);
            continue;
          }
        }

        toolResults.push({ type: 'tool_result', tool_use_id: result.id, content: result.content, is_error: result.isError });
        callbacks.onToolResult?.(result.id, result.content, result.name);
      }

      messages.push({ role: 'user', content: toolResults });

      // ─── Session file tracker + turn budget (improvements 1 & 3) ───
      const lastMsg = messages[messages.length - 1];
      const lastContent = Array.isArray(lastMsg.content) ? lastMsg.content : [];

      // Improvement 1: Session file tracker — inject after turns that wrote files
      const filesWrittenThisTurn = ctx.modifiedFiles.length - ctx.modifiedFilesAtTurnStart;
      if (filesWrittenThisTurn > 0 && ctx.modifiedFiles.length > 0) {
        const fileList = ctx.modifiedFiles.map((f: string) => `  - ${f}`).join('\n');
        lastContent.push({ type: 'text', text:
          `[Session: ${ctx.modifiedFiles.length} files created/modified this session:\n${fileList}\n` +
          `Use edit_file for changes to existing files. Do NOT re-read files you just wrote unless checking specific content.]`
        });
      }

      // Improvement 3: Turn budget warnings
      const turnsUsed = turnCount + 1;
      if (turnsUsed === 25 && maxTurns > 30) {
        lastContent.push({ type: 'text', text:
          `[Progress: ${turnsUsed} turns used, ${ctx.modifiedFiles.length} files written. ` +
          `Focus on completing the task. Use edit_file for modifications, not full rewrites.]`
        });
      } else if (turnsUsed === 35 && maxTurns > 40) {
        lastContent.push({ type: 'text', text:
          `[Progress: ${turnsUsed} turns used. Finalize your work — verify build and respond. Do NOT rewrite files from scratch.]`
        });
      } else if (maxTurns - turnsUsed <= 5 && maxTurns - turnsUsed > 0 && maxTurns > 10) {
        lastContent.push({ type: 'text', text:
          `[WARNING: Only ${maxTurns - turnsUsed} turns remaining. Complete now — verify build, take a screenshot if needed, and respond.]`
        });
      }

      turnCount++;
      ctx.modifiedFilesAtTurnStart = ctx.modifiedFiles.length;
    }

    // Post-loop build check
    await this.postLoopBuildCheck(ctx, async (userMessage) => {
      messages.push({ role: 'user', content: [{ type: 'text', text: userMessage }] });
      this.pruneMessages(messages);
      const stream = await anthropic.messages.create({
        model: modelToUse, max_tokens: 32768,
        thinking: { type: 'adaptive' },
        output_config: { effort },
        system: [
          { type: 'text', text: ANGULAR_KNOWLEDGE_BASE, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: effectiveSystemPrompt, cache_control: { type: 'ephemeral' } }
        ] as any,
        messages: messages as any, tools: availableTools as any, stream: true,
      });

      const toolCalls: { name: string; args: any; id: string }[] = [];
      const assistantContent: any[] = [];
      const toolUsesRaw: { id: string; name: string; input: string }[] = [];
      let currentTool: { id: string; name: string; input: string } | null = null;

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'thinking') {
            assistantContent.push({ type: 'thinking', thinking: '' });
          } else if (event.content_block.type === 'tool_use') {
            currentTool = { id: event.content_block.id, name: event.content_block.name, input: '' };
            toolUsesRaw.push(currentTool);
            assistantContent.push(event.content_block);
            callbacks.onToolStart?.(assistantContent.length - 1, event.content_block.name);
          } else if (event.content_block.type === 'text') {
            assistantContent.push({ type: 'text', text: '' });
          } else if (event.content_block.type === 'server_tool_use') {
            assistantContent.push(event.content_block);
            callbacks.onToolStart?.(assistantContent.length - 1, event.content_block.name);
          } else if (event.content_block.type === 'web_search_tool_result') {
            assistantContent.push(event.content_block);
          }
        }
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'thinking_delta') {
            const lastBlock = assistantContent[assistantContent.length - 1];
            if (lastBlock?.type === 'thinking') lastBlock.thinking += (event.delta as any).thinking;
          } else if ((event.delta as any).type === 'signature_delta') {
            const lastBlock = assistantContent[assistantContent.length - 1];
            if (lastBlock?.type === 'thinking') lastBlock.signature = (event.delta as any).signature;
          } else if (event.delta.type === 'text_delta') {
            ctx.fullExplanation += event.delta.text;
            callbacks.onText?.(event.delta.text);
            const lastBlock = assistantContent[assistantContent.length - 1];
            if (lastBlock?.type === 'text') lastBlock.text += event.delta.text;
          } else if (event.delta.type === 'input_json_delta') {
            if (currentTool) {
              currentTool.input += event.delta.partial_json;
              callbacks.onToolDelta?.(assistantContent.length - 1, event.delta.partial_json);
            }
          }
        }
      }

      // Detect tools with empty input (possible truncation or streaming interruption)
      // Skip warning for tools that take no parameters (e.g. take_screenshot)
      for (const t of toolUsesRaw) {
        if ((!t.input || !t.input.trim()) && !noInputTools.has(t.name)) {
          logger.warn(`Tool '${t.name}' (id: ${t.id}) received empty input in build-fix loop - possible truncation`);
        }
      }

      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          const t = toolUsesRaw.find(r => r.id === block.id);
          if (t) block.input = this.parseToolInput(t.input, logger);
        }
      }
      messages.push({ role: 'assistant', content: assistantContent });

      for (const t of toolUsesRaw) {
        toolCalls.push({ name: t.name, args: this.parseToolInput(t.input, logger), id: t.id });
      }

      return { toolCalls, text: '' };
    }, (toolResults) => {
      // Push tool_result blocks to messages to maintain proper tool_use/tool_result pairing
      const toolResultBlocks = toolResults.map((r: any) => {
        // Handle screenshot results with image content
        const screenshotMatch = r.content.match(/^\[SCREENSHOT:data:image\/([^;]+);base64,(.+)\]$/);
        if (screenshotMatch && !r.is_error) {
          return {
            type: 'tool_result',
            tool_use_id: r.tool_use_id,
            content: [
              { type: 'image', source: { type: 'base64', media_type: `image/${screenshotMatch[1]}`, data: screenshotMatch[2] } },
              { type: 'text', text: 'Screenshot captured. Analyze it to verify the UI.' }
            ],
            is_error: false,
          };
        }
        return { type: 'tool_result', tool_use_id: r.tool_use_id, content: r.content, is_error: r.is_error };
      });
      messages.push({ role: 'user', content: toolResultBlocks });
    }, options.reviewAgentEnabled !== false ? async (reviewPrompt) => {
      // Review agent: separate LLM call with a review-focused system prompt.
      logger.info('Calling review agent...');
      try {
        const reviewResponse = await anthropic.messages.create({
          model: modelToUse,
          max_tokens: 4096,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'low' },
          system: [
            { type: 'text', text: REVIEW_SYSTEM_PROMPT },
          ] as any,
          messages: [
            { role: 'user', content: reviewPrompt },
          ],
        });

        let reviewText = '';
        for (const block of (reviewResponse as any).content || []) {
          if (block.type === 'text') {
            reviewText += block.text;
          }
        }
        return reviewText;
      } catch (err: any) {
        logger.error('Review agent call failed', { error: err.message });
        return '';
      }
    } : undefined);

    return { explanation: ctx.fullExplanation, files: fs.getAccumulatedFiles(), model: modelToUse };
  }
}
