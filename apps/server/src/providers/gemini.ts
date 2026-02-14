import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLMProvider, SYSTEM_PROMPT, ANGULAR_KNOWLEDGE_BASE, AgentLoopContext } from './base';

export class GeminiProvider extends BaseLLMProvider implements LLMProvider {
  async generate(options: GenerateOptions): Promise<any> {
    let text = '';
    const res = await this.streamGenerate(options, {
      onText: (t) => text += t,
      onToolResult: () => { /* noop */ },
    });
    return { explanation: text, files: res.files };
  }

  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    const { apiKey, model } = options;
    if (!apiKey) throw new Error('Gemini API Key is required');

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = model || 'gemini-2.0-flash-exp';

    // Prepare shared context
    const { fs, skillRegistry, availableTools, userMessage, logger, maxTurns, mcpManager, activeKit } = await this.prepareAgentContext(options, 'gemini');
    await this.addSkillTools(availableTools, skillRegistry, fs, options.userId);

    // Convert tools to Gemini format
    const tools = availableTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }));

    const generativeModel = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ functionDeclarations: tools as any }]
    });

    logger.log('START', { model: modelName, promptLength: options.prompt.length });

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

    const chat = generativeModel.startChat({
      history: [
        { role: 'user', parts: [{ text: ANGULAR_KNOWLEDGE_BASE + '\n\n' + SYSTEM_PROMPT }] },
        { role: 'model', parts: [{ text: 'I understand. I am an expert Angular developer and I have read the system prompt and knowledge base.' }] }
      ]
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const ctx: AgentLoopContext = {
      fs, callbacks, skillRegistry, availableTools, logger,
      hasRunBuild: false, hasWrittenFiles: false, buildNudgeSent: false, fullExplanation: '',
      mcpManager, activeKit
    };

    let turnCount = 0;
    let currentParts = initialParts;

    while (turnCount < maxTurns) {
      logger.log('TURN_START', { turn: turnCount });

      const result = await chat.sendMessageStream(currentParts);
      const functionCalls: any[] = [];

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          ctx.fullExplanation += chunkText;
          callbacks.onText?.(chunkText);
        }

        const calls = chunk.functionCalls();
        if (calls && calls.length > 0) {
          functionCalls.push(...calls);
          calls.forEach(call => {
            callbacks.onToolStart?.(0, call.name);
            callbacks.onToolDelta?.(0, JSON.stringify(call.args));
          });
        }

        if (chunk.usageMetadata) {
          totalInputTokens = chunk.usageMetadata.promptTokenCount;
          totalOutputTokens = chunk.usageMetadata.candidatesTokenCount;
          callbacks.onTokenUsage?.({
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: chunk.usageMetadata.totalTokenCount
          });
        }
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
            const errorOutput = (buildResult.stderr || '') + '\n' + (buildResult.stdout || '');
            currentParts = [{ text: `The build failed with the following errors. You MUST fix ALL errors and then run \`npm run build\` again to verify.\n\n\`\`\`\n${errorOutput.slice(0, 4000)}\n\`\`\`` }];
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
      const toolOutputs: any[] = [];
      for (const call of functionCalls) {
        const toolArgs = call.args || {};
        callbacks.onToolCall?.(0, call.name, toolArgs);
        logger.log('EXECUTING_TOOL', { name: call.name, args: toolArgs });

        const { content, isError } = await this.executeTool(call.name, toolArgs, ctx);

        logger.log('TOOL_RESULT', { name: call.name, result: content, isError });
        callbacks.onToolResult?.(call.name, content, call.name);

        toolOutputs.push({
          functionResponse: {
            name: call.name,
            response: { name: call.name, content }
          }
        });
      }

      currentParts = toolOutputs;
      turnCount++;
    }

    // Post-loop build check
    await this.postLoopBuildCheck(ctx, async (userMessage) => {
      const result = await chat.sendMessageStream([{ text: userMessage }]);
      const toolCalls: { name: string; args: any; id: string }[] = [];

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          ctx.fullExplanation += chunkText;
          callbacks.onText?.(chunkText);
        }
        const calls = chunk.functionCalls();
        if (calls && calls.length > 0) {
          calls.forEach(call => {
            callbacks.onToolStart?.(0, call.name);
            toolCalls.push({ name: call.name, args: call.args || {}, id: call.name });
          });
        }
      }

      return { toolCalls, text: '' };
    });

    return { explanation: ctx.fullExplanation, files: fs.getAccumulatedFiles(), model: modelName };
  }
}
