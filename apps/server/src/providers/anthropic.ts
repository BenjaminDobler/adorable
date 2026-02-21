import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider, SYSTEM_PROMPT, ANGULAR_KNOWLEDGE_BASE, AgentLoopContext } from './base';
import { MemoryFileSystem } from './filesystem/memory-filesystem';

export class AnthropicProvider extends BaseLLMProvider implements LLMProvider {
  async generate(options: GenerateOptions): Promise<any> {
    const { prompt, previousFiles, apiKey, model, baseUrl } = options;
    if (!apiKey) throw new Error('Anthropic API Key is required');

    let modelToUse = model || 'claude-3-5-sonnet-20240620';
    if (modelToUse === 'claude-3-5-sonnet-20241022') {
      modelToUse = 'claude-3-5-sonnet-20240620';
    }

    const anthropic = new Anthropic({
      apiKey,
      ...(baseUrl && { baseURL: baseUrl })
    });
    const fs = options.fileSystem || new MemoryFileSystem(this.flattenFiles(previousFiles || {}));

    let userMessage = prompt;
    if (previousFiles) {
      const treeSummary = this.generateTreeSummary(previousFiles);
      userMessage += `\n\n--- Current File Structure ---\n${treeSummary}`;
    }

    const messages: any[] = [{ role: 'user', content: [{ type: 'text', text: userMessage, cache_control: { type: 'ephemeral' } }] }];

    if (options.images && options.images.length > 0) {
      options.images.forEach(img => {
        const match = img.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
        if (match) {
          messages[0].content.push({
            type: 'image',
            source: { type: 'base64', media_type: `image/${match[1]}` as any, data: match[2] }
          });
        }
      });
    }

    const response = await anthropic.messages.create({
      model: modelToUse,
      max_tokens: 16384,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }] as any,
      messages: messages as any,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return this.parseResponse(content.text);
    } else {
      throw new Error('Unexpected response format from Anthropic');
    }
  }

  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    const { apiKey, model, baseUrl } = options;
    if (!apiKey) throw new Error('Anthropic API Key is required');

    let modelToUse = model || 'claude-3-5-sonnet-20240620';
    if (modelToUse === 'claude-3-5-sonnet-20241022') {
      modelToUse = 'claude-3-5-sonnet-20240620';
    }

    const anthropic = new Anthropic({
      apiKey,
      defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25' },
      ...(baseUrl && { baseURL: baseUrl })
    });

    // Prepare shared context
    const { fs, skillRegistry, availableTools, userMessage, effectiveSystemPrompt, logger, maxTurns, mcpManager, activeKitName } = await this.prepareAgentContext(options, 'anthropic');
    const skills = await this.addSkillTools(availableTools, skillRegistry, fs, options.userId);

    logger.log('START', { model: modelToUse, promptLength: options.prompt.length, totalMessageLength: userMessage.length });

    // Log the full prompts for debugging
    logger.logText('SYSTEM_PROMPT', effectiveSystemPrompt);
    logger.logText('KNOWLEDGE_BASE', ANGULAR_KNOWLEDGE_BASE);
    logger.logText('USER_MESSAGE', userMessage);

    // Build initial messages
    const messages: any[] = [{
      role: 'user',
      content: [{
        type: 'text',
        text: userMessage,
        cache_control: { type: 'ephemeral' }
      }]
    }];

    // Handle Attachments
    if (options.images && options.images.length > 0) {
      options.images.forEach(dataUri => {
        const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const data = match[2];
          if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
            messages[0].content.push({
              type: 'image',
              source: { type: 'base64', media_type: mimeType as any, data }
            });
          } else if (mimeType === 'application/pdf') {
            messages[0].content.push({
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data }
            });
          } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
            try {
              const textContent = Buffer.from(data, 'base64').toString('utf-8');
              messages[0].content.push({
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

    const ctx: AgentLoopContext = {
      fs, callbacks, skillRegistry, availableTools, logger,
      hasRunBuild: false, hasWrittenFiles: false, buildNudgeSent: false, fullExplanation: '',
      mcpManager,
      failedBuildCount: 0,
      activeKitName
    };

    let turnCount = 0;

    while (turnCount < maxTurns) {
      logger.log('TURN_START', { turn: turnCount });
      this.pruneMessages(messages);
      const stream = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 16384,
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
          callbacks.onTokenUsage?.({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens });
        }
        if (event.type === 'message_delta' && event.usage) {
          totalOutputTokens += event.usage.output_tokens;
          callbacks.onTokenUsage?.({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens });
        }
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = { id: event.content_block.id, name: event.content_block.name, input: '' };
            toolUses.push(currentToolUse);
            assistantMessageContent.push(event.content_block);
            callbacks.onToolStart?.(assistantMessageContent.length - 1, event.content_block.name);
          } else if (event.content_block.type === 'text') {
            assistantMessageContent.push({ type: 'text', text: '' });
          }
        }
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
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
      for (const tool of toolUses) {
        if (!tool.input || !tool.input.trim()) {
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
            const errorOutput = (buildResult.stderr || '') + '\n' + (buildResult.stdout || '');
            const buildFailMsg = `The build failed with the following errors. You MUST fix ALL errors and then run \`npm run build\` again to verify.\n\n\`\`\`\n${errorOutput.slice(0, 4000)}\n\`\`\``;
            logger.logText('INJECTED_USER_MESSAGE', buildFailMsg, { reason: 'auto_build_failure' });
            messages.push({ role: 'user', content: [{ type: 'text', text: buildFailMsg }] });
            ctx.hasRunBuild = false;
            turnCount++;
            continue;
          } else {
            callbacks.onText?.('Build successful.\n');
            ctx.hasRunBuild = true;
          }
        }
        break;
      }

      // Execute tools
      const toolResults: any[] = [];
      for (const tool of toolUses) {
        const toolArgs = this.parseToolInput(tool.input);
        callbacks.onToolCall?.(0, tool.name, toolArgs);
        logger.log('EXECUTING_TOOL', { name: tool.name, args: toolArgs });

        const { content, isError } = await this.executeTool(tool.name, toolArgs, ctx);

        logger.logText('TOOL_RESULT', content, { id: tool.id, isError });

        // Check if this is a screenshot result with embedded image data
        const screenshotMatch = content.match(/^\[SCREENSHOT:(data:image\/[^;]+;base64,(.+))\]$/);
        if (screenshotMatch && !isError) {
          const dataUri = screenshotMatch[1];
          const mimeMatch = dataUri.match(/^data:image\/([^;]+);base64,(.+)$/);
          if (mimeMatch) {
            // Return image content for the AI to analyze
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tool.id,
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
            callbacks.onToolResult?.(tool.id, 'Screenshot captured (image attached)', tool.name);
            continue;
          }
        }

        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content, is_error: isError });
        callbacks.onToolResult?.(tool.id, content, tool.name);
      }

      messages.push({ role: 'user', content: toolResults });
      turnCount++;
    }

    // Post-loop build check
    await this.postLoopBuildCheck(ctx, async (userMessage) => {
      messages.push({ role: 'user', content: [{ type: 'text', text: userMessage }] });
      this.pruneMessages(messages);
      const stream = await anthropic.messages.create({
        model: modelToUse, max_tokens: 16384,
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
          if (event.content_block.type === 'tool_use') {
            currentTool = { id: event.content_block.id, name: event.content_block.name, input: '' };
            toolUsesRaw.push(currentTool);
            assistantContent.push(event.content_block);
            callbacks.onToolStart?.(assistantContent.length - 1, event.content_block.name);
          } else if (event.content_block.type === 'text') {
            assistantContent.push({ type: 'text', text: '' });
          }
        }
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
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
      for (const t of toolUsesRaw) {
        if (!t.input || !t.input.trim()) {
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
    });

    return { explanation: ctx.fullExplanation, files: fs.getAccumulatedFiles(), model: modelToUse };
  }
}
