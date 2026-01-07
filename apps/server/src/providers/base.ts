export abstract class BaseLLMProvider {
  protected parseResponse(text: string): any {
    const files: any = {};
    let explanation = '';

    // Extract explanation
    const explanationMatch = text.match(/<explanation>([\s\S]*?)<\/explanation>/);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    }

    // Extract files - robust regex to catch files even if the closing tag is missing (truncation)
    const fileRegex = /<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g;
    let match;
    
    while ((match = fileRegex.exec(text)) !== null) {
      const filePath = match[1];
      let fileContent = match[2];
      
      // If the file content was truncated, it might still be useful but 
      // for now we just take what we have.
      fileContent = fileContent.trim();
      
      // Remove Markdown code blocks if present (common LLM hallucination)
      // Matches ```language\n content \n``` or just ```\n content \n```
      const codeBlockMatch = fileContent.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
      if (codeBlockMatch) {
        fileContent = codeBlockMatch[1];
      } else {
        // Handle case where closing backticks might be missing or different spacing
        fileContent = fileContent.replace(/^```[\w-]*\n/, '').replace(/\n```$/, '');
      }

      if (filePath && fileContent) {
        this.addFileToStructure(files, filePath, fileContent);
      }
    }

    return { files, explanation };
  }

  private addFileToStructure(root: any, path: string, content: string) {
    const parts = path.split('/');
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = { directory: {} };
      }
      if (!current[part].directory) {
         current[part].directory = {};
      }
      current = current[part].directory;
    }

    const fileName = parts[parts.length - 1];
    current[fileName] = { file: { contents: content } };
  }
}
