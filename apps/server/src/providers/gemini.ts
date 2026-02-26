import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import { GoogleGenAI, createPartFromFunctionResponse } from '@google/genai';
import { BaseLLMProvider, ANGULAR_KNOWLEDGE_BASE, AgentLoopContext } from './base';
import { sanitizeCommandOutput } from './sanitize-output';

/** Extract text from a Gemini response chunk without triggering the SDK's
 *  "non-text parts" console.warn that fires when accessing `.text` on a
 *  chunk that also contains functionCall parts. */
function extractText(chunk: any): string | undefined {
  const parts = chunk?.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) return undefined;
  let text = '';
  let found = false;
  for (const part of parts) {
    if (typeof part.text === 'string' && !part.thought) {
      found = true;
      text += part.text;
    }
  }
  return found ? text : undefined;
}

export class GeminiProvider extends BaseLLMProvider implements LLMProvider {
  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    const { apiKey, model } = options;
    if (!apiKey) throw new Error('Gemini API Key is required');

    const ai = new GoogleGenAI({ apiKey });
    const modelName = model || 'gemini-2.5-flash';

    // Prepare shared context
    const { fs, skillRegistry, availableTools, userMessage, effectiveSystemPrompt, logger, maxTurns, mcpManager, activeKitName } = await this.prepareAgentContext(options, 'gemini');
    await this.addSkillTools(availableTools, skillRegistry, fs, options.userId);

    // Convert tools to Gemini format
    const tools = availableTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }));

    logger.log('START', { model: modelName, promptLength: options.prompt.length, totalMessageLength: userMessage.length });

    // Log the full prompts for debugging
    logger.logText('SYSTEM_PROMPT', effectiveSystemPrompt);
    logger.logText('KNOWLEDGE_BASE', ANGULAR_KNOWLEDGE_BASE);
    logger.logText('USER_MESSAGE', userMessage);

    // Build initial parts
    const initialParts: any[] = [{ text: userMessage }];
    if (options.images && options.images.length > 0) {
      options.images.forEach(dataUri => {
        const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          initialParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      });
    }

    // Build tools config, optionally including built-in Gemini tools
    const geminiTools: any[] = [{ functionDeclarations: tools as any }];
    if (options.builtInTools?.webSearch) {
      geminiTools.push({ googleSearch: {} });
      console.log('[Gemini] Google Search grounding enabled');
    }
    if (options.builtInTools?.urlContext) {
      geminiTools.push({ urlContext: {} });
      console.log('[Gemini] URL Context tool enabled');
    }

    // Map reasoning effort to Gemini thinking budget
    const geminiEffort = options.reasoningEffort || 'high';
    const thinkingBudget = geminiEffort === 'low' ? 1024 : geminiEffort === 'medium' ? 8192 : -1;

    const chat = ai.chats.create({
      model: modelName,
      config: {
        tools: geminiTools,
        systemInstruction: ANGULAR_KNOWLEDGE_BASE + '\n\n' + effectiveSystemPrompt,
        thinkingConfig: { thinkingBudget },
      },
      history: []
    });

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
    let currentMessage: any = initialParts;

    while (turnCount < maxTurns) {
      logger.log('TURN_START', { turn: turnCount });
      const turnStartExplanationLength = ctx.fullExplanation.length;

      const stream = await chat.sendMessageStream({ message: currentMessage });
      const functionCalls: any[] = [];

      for await (const chunk of stream) {
        const chunkText = extractText(chunk);
        if (chunkText) {
          ctx.fullExplanation += chunkText;
          callbacks.onText?.(chunkText);
        }

        const calls = chunk.functionCalls;
        if (calls && calls.length > 0) {
          functionCalls.push(...calls);
          calls.forEach(call => {
            callbacks.onToolStart?.(0, call.name);
            callbacks.onToolDelta?.(0, JSON.stringify(call.args));
          });
        }

        if (chunk.usageMetadata) {
          totalInputTokens = chunk.usageMetadata.promptTokenCount || 0;
          totalOutputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
          callbacks.onTokenUsage?.({
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: chunk.usageMetadata.totalTokenCount || 0
          });
        }
      }

      // Log the assistant's text response for this turn
      const turnText = ctx.fullExplanation.substring(turnStartExplanationLength);
      if (turnText) {
        logger.logText('ASSISTANT_RESPONSE', turnText, { turn: turnCount });
      }

      console.log(`[AutoBuild] Turn ${turnCount}: toolUses=${functionCalls.length} [${functionCalls.map(c => c.name).join(', ')}]`);

      if (functionCalls.length === 0) {
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
            currentMessage = [{ text: buildFailMsg }];
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

      // Execute tools and build response parts
      const toolResponseParts: any[] = [];
      for (const call of functionCalls) {
        const toolArgs = call.args || {};
        callbacks.onToolCall?.(0, call.name, toolArgs);
        logger.log('EXECUTING_TOOL', { name: call.name, args: toolArgs });

        const { content, isError } = await this.executeTool(call.name, toolArgs, ctx);

        logger.log('TOOL_RESULT', { name: call.name, result: content, isError });
        callbacks.onToolResult?.(call.name, content, call.name);

        toolResponseParts.push(
          createPartFromFunctionResponse(call.id || call.name, call.name, { result: content })
        );
      }

      currentMessage = toolResponseParts;
      turnCount++;
    }

    // Post-loop build check
    await this.postLoopBuildCheck(ctx, async (userMessage) => {
      const stream = await chat.sendMessageStream({ message: [{ text: userMessage }] });
      const toolCalls: { name: string; args: any; id: string }[] = [];

      for await (const chunk of stream) {
        const chunkText = extractText(chunk);
        if (chunkText) {
          ctx.fullExplanation += chunkText;
          callbacks.onText?.(chunkText);
        }
        const calls = chunk.functionCalls;
        if (calls && calls.length > 0) {
          calls.forEach(call => {
            callbacks.onToolStart?.(0, call.name);
            toolCalls.push({ name: call.name, args: call.args || {}, id: call.id || call.name });
          });
        }
      }

      return { toolCalls, text: '' };
    });

    return { explanation: ctx.fullExplanation, files: fs.getAccumulatedFiles(), model: modelName };
  }
}
