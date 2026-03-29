import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import { GoogleGenAI, createPartFromFunctionResponse } from '@google/genai';
import { BaseLLMProvider, ANGULAR_KNOWLEDGE_BASE, REVIEW_SYSTEM_PROMPT, RESEARCH_SYSTEM_PROMPT, AgentLoopContext } from './base';
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
    const { fs, skillRegistry, availableTools, userMessage, effectiveSystemPrompt, logger, maxTurns, mcpManager, activeKitName, activeKitId, userId, projectId, history, contextSummary, buildCommand } = await this.prepareAgentContext(options, 'gemini');
    await this.addSkillTools(availableTools, skillRegistry, fs, options.userId);

    // Convert tools to Gemini format
    const tools = availableTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }));

    let enrichedUserMessage = userMessage;

    logger.log('START', { model: modelName, promptLength: options.prompt.length, totalMessageLength: enrichedUserMessage.length });

    // Log the full prompts for debugging
    logger.logText('SYSTEM_PROMPT', effectiveSystemPrompt);
    logger.logText('KNOWLEDGE_BASE', ANGULAR_KNOWLEDGE_BASE);
    logger.logText('USER_MESSAGE', enrichedUserMessage);

    // Build initial parts
    const initialParts: any[] = [{ text: enrichedUserMessage }];
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

    // Build Gemini conversation history from prior turns
    const geminiHistory: any[] = [];
    if (contextSummary) {
      geminiHistory.push({ role: 'user', parts: [{ text: `[Earlier conversation summary: ${contextSummary}]` }] });
      geminiHistory.push({ role: 'model', parts: [{ text: 'Understood, I have context from our earlier conversation.' }] });
    }
    if (history?.length) {
      for (const msg of history) {
        geminiHistory.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.text }]
        });
      }
      // Gemini requires history to end with 'model' role
      if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'user') {
        geminiHistory.pop();
      }
    }

    if (geminiHistory.length > 0) {
      logger.log('HISTORY_INJECTED', { messageCount: geminiHistory.length, hasSummary: !!contextSummary, totalChars: geminiHistory.reduce((sum: number, m: any) => sum + (m.parts?.[0]?.text?.length || 0), 0) });
    }

    const chat = ai.chats.create({
      model: modelName,
      config: {
        tools: geminiTools,
        systemInstruction: ANGULAR_KNOWLEDGE_BASE + '\n\n' + effectiveSystemPrompt,
        thinkingConfig: { thinkingBudget },
      },
      history: geminiHistory
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

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

    // Research phase: LLM-based agent reads relevant files before main loop
    if (options.previousFiles && options.researchAgentEnabled !== false) {
      const researchContext = await this.runResearchPhase(ctx, options.prompt, userMessage,
        async (researchPrompt, researchTools) => {
          const MAX_RESEARCH_TURNS = 3;
          const geminiResearchTools = researchTools.map((t: any) => ({
            name: t.name, description: t.description, parameters: t.input_schema,
          }));

          const researchChat = ai.chats.create({
            model: modelName,
            config: {
              tools: [{ functionDeclarations: geminiResearchTools }],
              systemInstruction: RESEARCH_SYSTEM_PROMPT,
              thinkingConfig: { thinkingBudget: 1024 },
            },
          });

          let researchText = '';
          let researchMessage: any[] = [{ text: researchPrompt }];

          for (let turn = 0; turn < MAX_RESEARCH_TURNS; turn++) {
            const researchStream = await researchChat.sendMessageStream({ message: researchMessage });
            const researchCalls: { name: string; args: any; id: string }[] = [];

            for await (const chunk of researchStream) {
              const chunkText = extractText(chunk);
              if (chunkText) researchText += chunkText;
              const calls = chunk.functionCalls;
              if (calls && calls.length > 0) {
                calls.forEach(call => {
                  researchCalls.push({ name: call.name, args: call.args || {}, id: call.id || call.name });
                });
              }
            }

            if (researchCalls.length === 0) break;

            const responseParts: any[] = [];
            for (const call of researchCalls) {
              try {
                const { content } = await this.executeTool(call.name, call.args, ctx);
                responseParts.push(createPartFromFunctionResponse(call.id, call.name, { result: content }));
              } catch (err: any) {
                responseParts.push(createPartFromFunctionResponse(call.id, call.name, { result: `Error: ${err.message}` }));
              }
            }
            researchMessage = responseParts;
          }

          return researchText;
        }
      );
      if (researchContext) {
        enrichedUserMessage = userMessage + researchContext;
        // Update initial parts with enriched message
        if (initialParts[0]?.text) initialParts[0].text = enrichedUserMessage;
      }
    }

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
              currentMessage = [{ text: verifyMsg }];
              turnCount++;
              continue;
            }
          }
        }
        break;
      }

      // Execute tools — parallel for read-only, sequential for mutations
      const parsedToolCalls = functionCalls.map(c => ({
        name: c.name,
        args: c.args || {},
        id: c.id || c.name,
      }));

      const batchedResults = await this.executeToolsBatched(parsedToolCalls, ctx, {
        onToolCall: (name, args) => {
          callbacks.onToolCall?.(0, name, args);
          logger.log('EXECUTING_TOOL', { name, args });
        },
        onToolResult: (id, content, name, isError) => {
          logger.log('TOOL_RESULT', { name, result: content, isError });
          callbacks.onToolResult?.(name, content, name);
        },
      });

      // Build Gemini function response parts
      const toolResponseParts: any[] = batchedResults.map(r =>
        createPartFromFunctionResponse(r.id, r.name, { result: r.content })
      );

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
    }, undefined, options.reviewAgentEnabled !== false ? async (reviewPrompt) => {
      // Review agent: separate Gemini call with review-focused system prompt
      console.log('[Review] Calling Gemini review agent...');
      try {
        const reviewResponse = await ai.models.generateContent({
          model: modelName,
          contents: reviewPrompt,
          config: {
            systemInstruction: REVIEW_SYSTEM_PROMPT,
            maxOutputTokens: 4096,
          },
        });
        return reviewResponse.text || '';
      } catch (err: any) {
        console.error('[Review] Gemini review agent failed:', err.message);
        return '';
      }
    } : undefined);

    return { explanation: ctx.fullExplanation, files: fs.getAccumulatedFiles(), model: modelName };
  }
}
