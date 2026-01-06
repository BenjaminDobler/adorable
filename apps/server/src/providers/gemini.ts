import { GenerateOptions, LLMProvider } from './types';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

export class GeminiProvider implements LLMProvider {
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

    // Force JSON output structure in the prompt as Gemini sometimes prefers text
    userMessage += "\n\nIMPORTANT: Return only valid JSON. Do not include markdown formatting like ```json.";

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

    const result = await geminiModel.generateContent(parts);
    const response = result.response;
    const text = response.text();

    let jsonString = text;
      
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                      text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      jsonString = jsonMatch[1] || jsonMatch[0];
    }

    try {
      const repairedJson = jsonrepair(jsonString);
      return JSON.parse(repairedJson);
    } catch (error) {
        console.error('Gemini JSON Parse Error:', error);
        console.log('Raw Gemini Output:', text);
        throw new Error('Failed to parse generated code from Gemini');
    }
  }
}
