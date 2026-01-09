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
    // Supports encoding attribute: <file path="..." encoding="base64">
    const fileRegex = /<file\s+path="([^"]+)"(?:\s+encoding="([^"]+)")?>([\s\S]*?)(?:<\/file>|$)/g;
    let match;
    
    while ((match = fileRegex.exec(text)) !== null) {
      const filePath = match[1];
      const encoding = match[2]; // undefined or 'base64'
      let fileContent = match[3];
      
      // If the file content was truncated, it might still be useful but 
      // for now we just take what we have.
      fileContent = fileContent.trim();
      
      // Remove Markdown code blocks if present (only if NOT base64)
      if (encoding !== 'base64') {
        const codeBlockMatch = fileContent.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
        if (codeBlockMatch) {
          fileContent = codeBlockMatch[1];
        } else {
          fileContent = fileContent.replace(/^```[\w-]*\n/, '').replace(/\n```$/, '');
        }
      }

      if (filePath && fileContent) {
        this.addFileToStructure(files, filePath, fileContent, encoding);
      }
    }

    return { files, explanation };
  }

  protected addFileToStructure(root: any, path: string, content: string, encoding?: string) {
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
    // If encoding is base64, we store it as such. 
    // The client handles string content.
    // NOTE: WebContainer expects Uint8Array for binary.
    // If we return a JSON object here, we can't easily put Uint8Array in it (for transmission).
    // So we keep it as string, but mark it?
    // The current WebContainerFiles structure is { file: { contents: string } }.
    // My previous client-side fixes handle "data:" URI detection.
    // If I return "base64 string" here, the client needs to know it's base64?
    // Or I wrap it in "data:image/...;base64," prefix?
    
    if (encoding === 'base64') {
        // Guess mime type from extension?
        const ext = fileName.split('.').pop()?.toLowerCase() || 'bin';
        const mime = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'application/octet-stream';
        content = `data:${mime};base64,${content}`;
    }

    current[fileName] = { file: { contents: content } };
  }
}
