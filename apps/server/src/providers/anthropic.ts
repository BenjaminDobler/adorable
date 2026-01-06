import { GenerateOptions, LLMProvider } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';

const SYSTEM_PROMPT = `
You are an expert Angular developer. 
Your task is to generate or modify the SOURCE CODE for an Angular application.

**CRITICAL: You are working within an EXISTING project structure.**
DO NOT generate package.json, angular.json, or tsconfig.json.
DO NOT generate src/main.ts or src/index.html unless you need to change them.

Input Context:
- You will receive the "Current File Structure".
- If the user asks for a change, ONLY return the files that need to be modified or created.
- **DO NOT** return files that have not changed. This is critical to avoid response truncation.

Output:
- Return a JSON object representing the 'src' directory structure.
- The structure must be:
{
  "files": {
    "src": {
      "directory": {
        "app": {
          "directory": {
             "app.component.ts": { "file": { "contents": "..." } }
          }
        }
      }
    }
  },
  "explanation": "Brief explanation..."
}

RULES:
1. **Root Component:** Ensure 'src/app/app.component.ts' exists and has selector 'app-root'.
2. **Features:** Use Angular 18+ Standalone components.
3. **Styling:** Use inline styles in components or 'src/styles.css' for globals.
4. **Imports:** Ensure all imports are correct.
5. **Robustness:** The JSON MUST be valid.
6. **Conciseness:** Minimize comments. Use compact CSS.
`;

export class AnthropicProvider implements LLMProvider {
  async generate(options: GenerateOptions): Promise<any> {
    const { prompt, previousFiles, apiKey, model } = options;

    if (!apiKey) throw new Error('Anthropic API Key is required');

    const anthropic = new Anthropic({ apiKey });

    let userMessage = prompt;
    if (previousFiles) {
      userMessage += `\n\n--- Current File Structure ---\n${JSON.stringify(previousFiles, null, 2)}`;
    }

    const messages: any[] = [{ role: 'user', content: [] }];
    
    // Add text content
    messages[0].content.push({ type: 'text', text: userMessage });

    // Add images if present
    if (options.images && options.images.length > 0) {
      options.images.forEach(img => {
        // Expecting "data:image/png;base64,..."
        const match = img.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
        if (match) {
          messages[0].content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: `image/${match[1]}` as any,
              data: match[2]
            }
          });
        }
      });
    }

    const response = await anthropic.messages.create({
      model: model || 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: messages as any,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      let jsonString = content.text;
      
      const jsonMatch = content.text.match(/```json\n([\s\S]*?)\n```/) || 
                        content.text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        jsonString = jsonMatch[1] || jsonMatch[0];
      }

      try {
        const repairedJson = jsonrepair(jsonString);
        return JSON.parse(repairedJson);
      } catch (error) {
        console.error('Anthropic JSON Parse Error:', error);
        throw new Error('Failed to parse generated code');
      }
    } else {
      throw new Error('Unexpected response format from Anthropic');
    }
  }
}
