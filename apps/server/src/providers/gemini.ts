import { GenerateOptions, GenerationResult, LLMProvider, StreamCallbacks } from './types';
import { GoogleGenAI, createPartFromFunctionResponse } from '@google/genai';
import { BaseLLMProvider, ANGULAR_KNOWLEDGE_BASE, REVIEW_SYSTEM_PROMPT, RESEARCH_SYSTEM_PROMPT, AgentLoopContext } from './base';
import { sanitizeCommandOutput } from './sanitize-output';
import {
  PLAN_BEFORE_EXECUTE_INSTRUCTION,
  buildFailureMessage,
  CDP_POST_BUILD_VERIFICATION_MESSAGE,
  sessionFileTrackerMessage,
  turnBudgetWarning,
} from './agent-loop-messages';

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
  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<GenerationResult> {
    const { apiKey, model } = options;
    if (!apiKey) throw new Error('Gemini API Key is required');

    const ai = new GoogleGenAI({ apiKey });
    const modelName = model || 'gemini-2.5-flash';

    // Prepare shared context
    const { fs, skillRegistry, availableTools, userMessage, effectiveSystemPrompt, logger, maxTurns, mcpManager, activeKitName, activeKitId, userId, projectId, history, contextSummary, buildCommand } = await this.prepareAgentContext(options, 'gemini');
    const skills = await this.addSkillTools(availableTools, skillRegistry, fs, options.userId);

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
      logger.info('Google Search grounding enabled');
    }
    if (options.builtInTools?.urlContext) {
      geminiTools.push({ urlContext: {} });
      logger.info('URL Context tool enabled');
    }

    // Preflight router: lightweight LLM call to decide how to handle this request
    const availableSkills = skills.map(s => s.name);
    const preflightDecision = await this.runPreflight(
      options.prompt, history, contextSummary, availableSkills,
      async (systemPrompt, userMsg) => {
        const result = await ai.models.generateContent({
          model: 'gemini-2.0-flash-lite',
          config: { systemInstruction: systemPrompt, maxOutputTokens: 256 },
          contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        });
        return result.text || '';
      }
    );

    // Notify client of preflight decision
    callbacks.onPreflightDecision?.(preflightDecision);

    // Apply skill hint from preflight (only if no explicit forced skill)
    if (preflightDecision.skillHint && !options.forcedSkill) {
      const hintedSkill = skillRegistry.getSkill(preflightDecision.skillHint);
      if (hintedSkill) {
        enrichedUserMessage += `\n\n[SYSTEM INJECTION] The preflight router detected that the '${hintedSkill.name}' skill is relevant. You MUST follow these instructions:\n${hintedSkill.instructions}`;
        if (initialParts[0]?.text) initialParts[0].text = enrichedUserMessage;
      }
    }

    // Map reasoning effort to Gemini thinking budget (user override takes precedence)
    const geminiEffort = options.reasoningEffort || preflightDecision.reasoningEffort || 'high';
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

    // When combining built-in tools (googleSearch, urlContext) with function declarations,
    // Gemini requires includeServerSideToolInvocations to be enabled.
    const hasBuiltInTools = geminiTools.length > 1; // >1 means we have more than just functionDeclarations
    const chat = ai.chats.create({
      model: modelName,
      config: {
        tools: geminiTools,
        ...(hasBuiltInTools ? { toolConfig: { includeServerSideToolInvocations: true } } : {}),
        systemInstruction: ANGULAR_KNOWLEDGE_BASE + '\n\n' + effectiveSystemPrompt,
        thinkingConfig: { thinkingBudget },
      },
      history: geminiHistory
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

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

    // Research phase: LLM-based agent reads relevant files before main loop
    if (options.previousFiles && options.researchAgentEnabled !== false && preflightDecision.runResearch) {
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

    // Plan-before-execute — for complex prompts
    if (preflightDecision.requiresPlan) {
      enrichedUserMessage += PLAN_BEFORE_EXECUTE_INSTRUCTION;
      if (initialParts[0]?.text) initialParts[0].text = enrichedUserMessage;
      logger.info('Injected plan-before-execute instruction (preflight detected complex prompt)');
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

      logger.info(`Turn ${turnCount}: toolUses=${functionCalls.length} [${functionCalls.map(c => c.name).join(', ')}]`);

      if (functionCalls.length === 0) {
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
            const buildFailMsg = buildFailureMessage(sanitizedBuildOutput);
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
              logger.logText('INJECTED_USER_MESSAGE', CDP_POST_BUILD_VERIFICATION_MESSAGE, { reason: 'cdp_post_build_verification' });
              currentMessage = [{ text: CDP_POST_BUILD_VERIFICATION_MESSAGE }];
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
        onToolCall: (name, args, activityDescription) => {
          callbacks.onToolCall?.(0, name, args, activityDescription);
          logger.log('EXECUTING_TOOL', { name, args, activityDescription });
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

      // Session file tracker + turn-budget nudges, appended to the function-response
      // parts so the model sees them alongside the tool results.
      const filesWrittenThisTurn = ctx.modifiedFiles.length - ctx.modifiedFilesAtTurnStart;
      const sessionMsg = sessionFileTrackerMessage(ctx.modifiedFiles, filesWrittenThisTurn);
      if (sessionMsg) toolResponseParts.push({ text: sessionMsg });

      const budgetMsg = turnBudgetWarning(turnCount + 1, maxTurns, ctx.modifiedFiles.length);
      if (budgetMsg) toolResponseParts.push({ text: budgetMsg });

      currentMessage = toolResponseParts;
      turnCount++;
      ctx.modifiedFilesAtTurnStart = ctx.modifiedFiles.length;
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
      logger.info('Calling review agent...');
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
        logger.error('Review agent failed', { error: err.message });
        return '';
      }
    } : undefined);

    return { explanation: ctx.fullExplanation, files: fs.getAccumulatedFiles(), model: modelName };
  }
}
