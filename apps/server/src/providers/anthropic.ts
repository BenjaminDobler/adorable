import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider, ANGULAR_KNOWLEDGE_BASE, REVIEW_SYSTEM_PROMPT, RESEARCH_SYSTEM_PROMPT, AgentLoopContext } from './base';
import { sanitizeCommandOutput } from './sanitize-output';
import { createSapFetch } from './sap-ai-core';

export class AnthropicProvider extends BaseLLMProvider implements LLMProvider {
  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    const { apiKey, model, baseUrl } = options;
    if (!apiKey) throw new Error('Anthropic API Key is required');

    const modelToUse = model || 'claude-sonnet-4-5-20250929';

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

    // Inject Anthropic web_search built-in tool if enabled
    if (options.builtInTools?.webSearch) {
      availableTools.push({ type: 'web_search_20250305', name: 'web_search' } as any);
      console.log('[Anthropic] Web search tool enabled');
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
            } catch (e) { console.error('Failed to decode text attachment', e); }
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
      hasRunBuild: false, hasWrittenFiles: false, modifiedFiles: [], buildNudgeSent: false, fullExplanation: '',
      mcpManager,
      failedBuildCount: 0, lastBuildOutput: '',
      activeKitName,
      activeKitId,
      userId,
      projectId,
      cdpEnabled: options.cdpEnabled,
      hasVerifiedWithBrowser: false,
      buildCommand,
    };

    const effort = options.reasoningEffort || 'high';

    // Research phase: LLM-based agent reads relevant files before main loop
    if (options.previousFiles && options.researchAgentEnabled !== false) {
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
              thinking: { type: 'enabled', budget_tokens: 1024 } as any,
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
                if (t) block.input = this.parseToolInput(t.input);
              }
            }
            researchMessages.push({ role: 'assistant', content: researchContent });

            if (researchToolUses.length === 0) return researchText;

            // Execute research tools
            const toolResultsArr: any[] = [];
            for (const t of researchToolUses) {
              const args = this.parseToolInput(t.input);
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

    let turnCount = 0;

    while (turnCount < maxTurns) {
      logger.log('TURN_START', { turn: turnCount });
      this.pruneMessages(messages);
      const stream = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 32768,
        thinking: { type: 'enabled', budget_tokens: effort === 'low' ? 1024 : effort === 'medium' ? 8192 : 16384 } as any,
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
          console.warn(`[Anthropic] Tool '${tool.name}' (id: ${tool.id}) received empty input - possible truncation or streaming interruption`);
        }
      }

      // Parse tool inputs
      for (const block of assistantMessageContent) {
        if (block.type === 'tool_use') {
          const tool = toolUses.find(t => t.id === block.id);
          if (tool) {
            block.input = this.parseToolInput(tool.input);
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

      console.log(`[AutoBuild] Turn ${turnCount}: toolUses=${toolUses.length} [${toolUses.map(t => t.name).join(', ')}]`);

      if (toolUses.length === 0) {
        // Auto-build check
        if (fs.exec && ctx.hasWrittenFiles && !ctx.hasRunBuild && !ctx.buildNudgeSent && turnCount < maxTurns - 2) {
          ctx.buildNudgeSent = true;
          console.log(`[AutoBuild] Running npm run build...`);
          callbacks.onText?.('\n\nVerifying build...\n');
          const buildResult = await fs.exec('npm run build');
          console.log(`[AutoBuild] Build result: exitCode=${buildResult.exitCode}`);
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
        args: this.parseToolInput(t.input),
        id: t.id,
      }));

      const batchedResults = await this.executeToolsBatched(parsedToolCalls, ctx, {
        onToolCall: (name, args) => {
          callbacks.onToolCall?.(0, name, args);
          logger.log('EXECUTING_TOOL', { name, args });
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
      turnCount++;
    }

    // Post-loop build check
    await this.postLoopBuildCheck(ctx, async (userMessage) => {
      messages.push({ role: 'user', content: [{ type: 'text', text: userMessage }] });
      this.pruneMessages(messages);
      const stream = await anthropic.messages.create({
        model: modelToUse, max_tokens: 32768,
        thinking: { type: 'enabled', budget_tokens: effort === 'low' ? 1024 : effort === 'medium' ? 8192 : 16384 } as any,
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
          console.warn(`[Anthropic] Tool '${t.name}' (id: ${t.id}) received empty input in build-fix loop - possible truncation`);
        }
      }

      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          const t = toolUsesRaw.find(r => r.id === block.id);
          if (t) block.input = this.parseToolInput(t.input);
        }
      }
      messages.push({ role: 'assistant', content: assistantContent });

      for (const t of toolUsesRaw) {
        toolCalls.push({ name: t.name, args: this.parseToolInput(t.input), id: t.id });
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
      console.log('[Review] Calling review agent...');
      try {
        const reviewResponse = await anthropic.messages.create({
          model: modelToUse,
          max_tokens: 4096,
          thinking: { type: 'enabled', budget_tokens: 1024 } as any,
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
        console.error('[Review] Review agent call failed:', err.message);
        return '';
      }
    } : undefined);

    return { explanation: ctx.fullExplanation, files: fs.getAccumulatedFiles(), model: modelToUse };
  }
}
