import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLMProvider } from './base';

const SYSTEM_PROMPT = `
You are an expert Angular developer. 
Your task is to generate or modify the SOURCE CODE for an Angular application.

**CRITICAL: You are working within an EXISTING project structure.**
DO NOT generate package.json, angular.json, or tsconfig.json.
DO NOT generate src/main.ts or src/index.html unless you need to change them.

Input Context:
- You will receive the "Current File Structure" (if any).
- If the user asks for a change, ONLY return the files that need to be modified or created.
- **DO NOT** return files that have not changed. This is critical to avoid response truncation.

Output Format:
You must provide the output in the following XML-like format.
Do NOT use Markdown code blocks for the XML tags.

<explanation>
Brief explanation of what you did.
</explanation>

<file path="src/app/app.component.ts">
import { Component } from '@angular/core';
...
</file>

<file path="src/app/app.component.html">
<h1>Hello</h1>
</file>

<file path="src/assets/logo.png" encoding="base64">
...base64 content...
</file>

**RESTRICTED FILES (DO NOT EDIT):**
- \`package.json\`, \`angular.json\`, \`tsconfig.json\`: Do NOT modify these files unless you are explicitly adding a dependency or changing a build configuration.
- **NEVER** overwrite \`package.json\` with a generic template. The project is already set up with Angular 21.

RULES:
1. **Root Component:** Ensure 'src/app/app.component.ts' exists and has selector 'app-root'.
2. **Features:** Use Angular 21+ Standalone components and signals.
3. **Styling:** Use inline styles in components or 'src/styles.css' for globals.
4. **Imports:** Ensure all imports are correct.
5. **Conciseness:** Minimize comments. Use compact CSS.
6. **Path:** The 'path' attribute must be relative to the project root (e.g., "src/app/foo.ts").
7. **Binary:** For small binary files (like icons), use 'encoding="base64"'. Prefer SVG for vector graphics.
`;

export class GeminiProvider extends BaseLLMProvider implements LLMProvider {
  async generate(options: GenerateOptions): Promise<any> {
    const { prompt, previousFiles, apiKey, model } = options;

    if (!apiKey) throw new Error('Google Generative AI Key is required');

    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ 
        model: model || 'gemini-1.5-pro-latest',
        systemInstruction: SYSTEM_PROMPT 
    });

    let userMessage = prompt;
    if (previousFiles) {
      userMessage += `\n\n--- Current File Structure ---\n${JSON.stringify(previousFiles, null, 2)}`;
    }

    const parts: any[] = [{ text: userMessage }];

    // Add images if present
    if (options.images && options.images.length > 0) {
      options.images.forEach(img => {
        const match = img.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: `image/${match[1]}`,
              data: match[2]
            }
          });
        }
      });
    }

    const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
            maxOutputTokens: 8192,
        }
    });
    
    const response = result.response;
    const text = response.text();

    return this.parseResponse(text);
  }

  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    const { prompt, previousFiles, apiKey, model } = options;
    if (!apiKey) throw new Error('Google Generative AI Key is required');

    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ 
        model: model || 'gemini-1.5-pro-latest',
        systemInstruction: SYSTEM_PROMPT 
    });

    let userMessage = prompt;
    if (previousFiles) {
      userMessage += `\n\n--- Current File Structure ---\n${JSON.stringify(previousFiles, null, 2)}`;
    }

    const parts: any[] = [{ text: userMessage }];
    if (options.images && options.images.length > 0) {
      options.images.forEach(img => {
        const match = img.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
        if (match) {
          parts.push({ inlineData: { mimeType: `image/${match[1]}`, data: match[2] } });
        }
      });
    }

    const result = await geminiModel.generateContentStream({
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 8192 }
    });

    let fullText = '';
    for await (const chunk of result.stream) {
        const delta = chunk.text();
        fullText += delta;
        callbacks.onText?.(delta);
    }

    return this.parseResponse(fullText);
  }
}
