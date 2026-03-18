import { Injectable, inject } from '@angular/core';
import { ProjectService } from '../../../core/services/project';
import { parse } from 'angular-html-parser';

export interface OngAnnotation {
  file: string;
  line: number;
  col: number;
  tag: string;
  component: string;
  selector: string;
  tsFile: string;
  parent: number | null;
  inLoop: boolean;
  conditional: boolean;
  text: { hasText: boolean; type: 'static' | 'interpolated' | 'mixed' | 'none'; content: string };
  bindings: {
    inputs: Record<string, string>;
    outputs: Record<string, string>;
    twoWay: Record<string, string>;
    structural: string[];
  };
}

export interface ElementFingerprint {
  componentName?: string; // Optional now
  hostTag?: string; // New fallback
  tagName: string;
  text?: string;
  classes?: string;
  id?: string;
  elementId?: string; // data-elements-id for reliable visual editing, or _ong:N format
  ongAnnotation?: OngAnnotation; // Rich metadata from ong template annotation plugin
  attributes?: Record<string, string>;
  childIndex?: number;
  parentTag?: string;
  // Element hierarchy for breadcrumb navigation
  hierarchy?: Array<{ tagName: string; elementId?: string; text?: string }>;
}

export interface ModificationResult {
  content: string;
  path: string;
  success: boolean;
  error?: string;
  isInsideLoop?: boolean;
}

export interface ElementLocation {
  path: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private projectService = inject(ProjectService);

  findAndModify(fingerprint: ElementFingerprint, modification: { type: 'text' | 'style' | 'class', value: string, property?: string }): ModificationResult {
    const files = this.projectService.files();
    console.log('[TemplateService] findAndModify called with fingerprint:', fingerprint);
    console.log('[TemplateService] Files loaded:', !!files, files ? Object.keys(files) : []);
    if (!files) return { content: '', path: '', success: false, error: 'No files loaded' };

    // Translation path: if the text comes from a translate pipe, edit the JSON file instead
    if (modification.type === 'text' && fingerprint.ongAnnotation) {
      const translationResult = this.tryModifyTranslation(files, fingerprint, modification.value);
      if (translationResult) return translationResult;
    }

    // Fast path: ong annotation provides exact source location (file:line:col)
    if (fingerprint.ongAnnotation) {
      const result = this.modifyByOngAnnotation(files, fingerprint, modification);
      if (result) return result;
      console.warn('[TemplateService] ong annotation fast path failed, falling back to standard matching');
    }

    let componentFile;

    // 1. Try finding by Component Name
    if (fingerprint.componentName) {
       componentFile = this.findComponentFile(files, fingerprint.componentName);
    } 
    
    // 2. Try finding by Selector (Fallback or primary if name missing)
    if (!componentFile && fingerprint.hostTag) {
       console.log(`[TemplateService] Searching for component by selector: ${fingerprint.hostTag}`);
       componentFile = this.findComponentFileBySelector(files, fingerprint.hostTag);
    }

    // 3. Last resort: Try common defaults if it's the root
    if (!componentFile && (fingerprint.hostTag === 'app-root' || fingerprint.componentName === 'AppComponent')) {
       console.log('[TemplateService] Root component not found by metadata, trying app.component.ts default');
       componentFile = this.findComponentFile(files, 'AppComponent');
    }

    // 4. Ultimate fallback: Search ALL template files for the matching element
    if (!componentFile) {
       console.log('[TemplateService] No component found, searching all templates...');
       const result = this.searchAllTemplates(files, fingerprint, modification);
       if (result) {
          return result;
       }
       const target = fingerprint.componentName || fingerprint.hostTag || 'unknown';
       return { content: '', path: '', success: false, error: `Could not locate component source for "${target}"` };
    }

    const templateInfo = this.resolveTemplate(componentFile.path, componentFile.content, files);
    if (!templateInfo) {
       return { content: '', path: '', success: false, error: `Could not resolve template for ${componentFile.path}` };
    }

    const { path: templatePath, content: templateContent, isInline, offset: templateOffset } = templateInfo;

    // 2. Parse AST
    let rootNodes;
    try {
       const parsed = parse(templateContent);
       rootNodes = parsed.rootNodes;
    } catch(e: any) {
       return { content: '', path: templatePath, success: false, error: `Template parsing failed: ${e.message}` };
    }

    // 3. Find the matching node
    const matchResult = this.findNodeWithContext(rootNodes, fingerprint);

    if (!matchResult || !matchResult.node) {
      return { content: '', path: templatePath, success: false, error: 'Could not find matching element in template' };
    }

    const { node: match, isInsideLoop } = matchResult;

    // Warn if element is inside a loop
    if (isInsideLoop) {
      console.warn('[TemplateService] Element is inside a @for loop - all instances will be affected');
    }

    // 4. Apply Modification
    let modifiedTemplate = templateContent;
    
    if (modification.type === 'text') {
      const textNode = match.children.find((c: any) => c.value); // Text nodes have value
      if (textNode) {
         modifiedTemplate = this.replaceRange(templateContent, textNode.sourceSpan.start.offset, textNode.sourceSpan.end.offset, modification.value);
      } else if (match.endSourceSpan) {
         // Insert text between tags
         modifiedTemplate = this.replaceRange(templateContent, match.sourceSpan.start.offset + match.startSourceSpan.end.offset - match.startSourceSpan.start.offset, match.endSourceSpan.start.offset, modification.value);
      } else {
         return { content: '', path: templatePath, success: false, error: 'Cannot edit text of self-closing element' };
      }
    } else if (modification.type === 'style') {
       const styleAttr = match.attrs.find((a: any) => a.name === 'style');
       const styleDecl = `${modification.property}: ${modification.value};`;
       
       if (styleAttr) {
          const oldStyle = styleAttr.value;
          const propRegex = new RegExp(`${modification.property}\s*:[^;]+;?`, 'gi');
          let newStyle = oldStyle;
          if (propRegex.test(oldStyle)) {
             newStyle = oldStyle.replace(propRegex, styleDecl);
          } else {
             newStyle = oldStyle + (oldStyle.trim().endsWith(';') ? ' ' : '; ') + styleDecl;
          }
          modifiedTemplate = this.replaceRange(templateContent, styleAttr.sourceSpan.start.offset, styleAttr.sourceSpan.end.offset, `style="${newStyle}"`);
       } else {
          const insertPos = match.sourceSpan.start.offset + match.name.length + 1;
          modifiedTemplate = this.insertAt(templateContent, insertPos, ` style="${styleDecl}"`);
       }
    }

    // 5. Finalize content
    let finalFileContent = modifiedTemplate;
    if (isInline && templateOffset !== undefined) {
       // We need to inject the modified template BACK into the .ts file
       const tsContent = componentFile.content;
       finalFileContent = this.replaceRange(tsContent, templateOffset, templateOffset + templateContent.length, modifiedTemplate);
    }

    return { content: finalFileContent, path: isInline ? componentFile.path : templatePath, success: true, isInsideLoop };
  }

  findElementLocation(fingerprint: ElementFingerprint): ElementLocation | null {
    const files = this.projectService.files();
    if (!files) return null;

    // Fast path: ong annotation has exact source location
    if (fingerprint.ongAnnotation) {
      const ann = fingerprint.ongAnnotation;
      return {
        path: ann.file,
        startLine: ann.line,
        startColumn: ann.col + 1,
        endLine: ann.line,
        endColumn: ann.col + 1,
      };
    }

    // 1. Try finding the component file (same chain as findAndModify)
    let componentFile: { path: string; content: string } | null = null;

    if (fingerprint.componentName) {
      componentFile = this.findComponentFile(files, fingerprint.componentName);
    }
    if (!componentFile && fingerprint.hostTag) {
      componentFile = this.findComponentFileBySelector(files, fingerprint.hostTag);
    }
    if (!componentFile && (fingerprint.hostTag === 'app-root' || fingerprint.componentName === 'AppComponent')) {
      componentFile = this.findComponentFile(files, 'AppComponent');
    }

    // 2. If found via component, resolve its template and find the node
    if (componentFile) {
      const templateInfo = this.resolveTemplate(componentFile.path, componentFile.content, files);
      if (!templateInfo) return null;

      const { path: templatePath, content: templateContent, isInline, offset: templateOffset } = templateInfo;

      try {
        const parsed = parse(templateContent);
        const matchResult = this.findNodeWithContext(parsed.rootNodes, fingerprint);
        if (!matchResult || !matchResult.node) return null;

        return this.extractLocation(matchResult.node, templatePath, isInline, templateOffset, componentFile.path);
      } catch {
        return null;
      }
    }

    // 3. Fallback: search all templates
    const templates = this.collectAllTemplates(files);
    for (const template of templates) {
      try {
        const parsed = parse(template.content);
        const matchResult = this.findNodeWithContext(parsed.rootNodes, fingerprint);
        if (matchResult && matchResult.node) {
          const filePath = template.isInline && template.tsPath ? template.tsPath : template.path;
          return this.extractLocation(matchResult.node, template.path, template.isInline, template.offset, template.tsPath);
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private extractLocation(node: any, templatePath: string, isInline: boolean, templateOffset: number | undefined, tsPath: string | undefined): ElementLocation {
    const span = node.sourceSpan;
    let startLine = span.start.line + 1; // convert 0-based to 1-based
    let startCol = span.start.col + 1;
    let endLine = span.end.line + 1;
    let endCol = span.end.col + 1;

    if (isInline && templateOffset !== undefined && tsPath) {
      // For inline templates, adjust lines by counting newlines before the template offset
      const tsContent = this.projectService.files() ? this.getFileContentFromStore(tsPath) : null;
      if (tsContent) {
        const beforeTemplate = tsContent.substring(0, templateOffset);
        const lineOffset = (beforeTemplate.match(/\n/g) || []).length;
        const lastNewline = beforeTemplate.lastIndexOf('\n');
        const colOffset = lastNewline === -1 ? templateOffset : templateOffset - lastNewline - 1;

        if (span.start.line === 0) {
          startCol += colOffset;
        }
        if (span.end.line === 0) {
          endCol += colOffset;
        }
        startLine += lineOffset;
        endLine += lineOffset;
      }
      return { path: tsPath, startLine, startColumn: startCol, endLine, endColumn: endCol };
    }

    return { path: templatePath, startLine, startColumn: startCol, endLine, endColumn: endCol };
  }

  private getFileContentFromStore(path: string): string | null {
    const files = this.projectService.files();
    if (!files) return null;
    return this.getFileContent(files, path);
  }

  /**
   * Fast path: use ong annotation to go directly to the template file and exact source position.
   * No component search, no fuzzy matching — just file:line:col.
   */
  private modifyByOngAnnotation(
    files: any,
    fingerprint: ElementFingerprint,
    modification: { type: 'text' | 'style' | 'class'; value: string; property?: string },
  ): ModificationResult | null {
    const ann = fingerprint.ongAnnotation!;
    console.log(`[TemplateService] ong fast path: ${ann.file}:${ann.line}:${ann.col}`);

    // Check if the file is a .ts file (inline template) or .html (external template)
    const isInline = ann.file.endsWith('.ts');

    let templateContent: string | null;
    let templatePath: string;
    let tsContent: string | undefined;
    let templateOffset: number | undefined;

    if (isInline) {
      // Inline template — read the .ts file and extract the template
      tsContent = this.getFileContent(files, ann.file) ?? this.getFileContent(files, ann.tsFile) ?? undefined;
      if (!tsContent) return null;

      const inlineMatch = tsContent.match(/template\s*:\s*`([\s\S]*?)`/);
      if (!inlineMatch) return null;

      templateContent = inlineMatch[1];
      templateOffset = inlineMatch.index! + inlineMatch[0].indexOf(templateContent);
      templatePath = ann.file;
    } else {
      // External template — read the .html file directly
      templateContent = this.getFileContent(files, ann.file);
      templatePath = ann.file;
    }

    if (!templateContent) {
      console.warn(`[TemplateService] ong fast path: could not read ${ann.file}`);
      return null;
    }

    // Parse template and find the node at the exact line:col
    let rootNodes;
    try {
      rootNodes = parse(templateContent).rootNodes;
    } catch {
      return null;
    }

    const match = this.findNodeAtPosition(rootNodes, ann.line, ann.col, isInline ? templateOffset : undefined, isInline ? tsContent : undefined);
    if (!match) {
      console.warn(`[TemplateService] ong fast path: no node at ${ann.line}:${ann.col}`);
      return null;
    }

    // Apply modification (same logic as findAndModify)
    let modifiedTemplate = templateContent;

    if (modification.type === 'text') {
      const textNode = match.children?.find((c: any) => c.value);
      if (textNode) {
        modifiedTemplate = this.replaceRange(templateContent, textNode.sourceSpan.start.offset, textNode.sourceSpan.end.offset, modification.value);
      } else if (match.endSourceSpan) {
        modifiedTemplate = this.replaceRange(templateContent, match.startSourceSpan.end.offset, match.endSourceSpan.start.offset, modification.value);
      } else {
        return { content: '', path: templatePath, success: false, error: 'Cannot edit text of self-closing element' };
      }
    } else if (modification.type === 'style') {
      const styleAttr = match.attrs?.find((a: any) => a.name === 'style');
      const styleDecl = `${modification.property}: ${modification.value};`;

      if (styleAttr) {
        const oldStyle = styleAttr.value;
        const propRegex = new RegExp(`${modification.property}\\s*:[^;]+;?`, 'gi');
        let newStyle = oldStyle;
        if (propRegex.test(oldStyle)) {
          newStyle = oldStyle.replace(propRegex, styleDecl);
        } else {
          newStyle = oldStyle + (oldStyle.trim().endsWith(';') ? ' ' : '; ') + styleDecl;
        }
        modifiedTemplate = this.replaceRange(templateContent, styleAttr.sourceSpan.start.offset, styleAttr.sourceSpan.end.offset, `style="${newStyle}"`);
      } else {
        const insertPos = match.sourceSpan.start.offset + match.name.length + 1;
        modifiedTemplate = this.insertAt(templateContent, insertPos, ` style="${styleDecl}"`);
      }
    }

    // Finalize
    let finalContent = modifiedTemplate;
    let finalPath = templatePath;

    if (isInline && tsContent && templateOffset !== undefined) {
      finalContent = this.replaceRange(tsContent, templateOffset, templateOffset + templateContent.length, modifiedTemplate);
      finalPath = ann.tsFile || ann.file;
    }

    return { content: finalContent, path: finalPath, success: true, isInsideLoop: ann.inLoop };
  }

  /**
   * Find a template AST node at an exact line:col position.
   */
  private findNodeAtPosition(nodes: any[], targetLine: number, targetCol: number, templateOffset?: number, tsContent?: string): any | null {
    // Calculate the line offset for inline templates
    let lineOffset = 0;
    if (templateOffset !== undefined && tsContent) {
      lineOffset = (tsContent.substring(0, templateOffset).match(/\n/g) || []).length;
    }

    for (const node of nodes) {
      if (node.name && node.sourceSpan) {
        const nodeLine = node.sourceSpan.start.line + 1 + lineOffset;
        const nodeCol = node.sourceSpan.start.col;

        if (nodeLine === targetLine && nodeCol === targetCol) {
          return node;
        }
      }

      // Recurse into children and block children
      if (node.children) {
        const found = this.findNodeAtPosition(node.children, targetLine, targetCol, templateOffset, tsContent);
        if (found) return found;
      }
    }
    return null;
  }

  private findNodeWithContext(nodes: any[], fingerprint: ElementFingerprint, depth = 0, parent: any = null, insideLoop = false): { node: any, isInsideLoop: boolean } | null {
     const result = this.findNode(nodes, fingerprint, depth, parent, insideLoop);
     return result;
  }

  private findNode(nodes: any[], fingerprint: ElementFingerprint, depth = 0, parent: any = null, insideLoop = false): { node: any, isInsideLoop: boolean } | null {
     const prefix = '  '.repeat(depth);

     const candidates: { node: any, isInsideLoop: boolean }[] = [];

     for (const node of nodes) {
        // Check if this is a @for block (angular-html-parser marks them as Block nodes)
        const isForBlock = node.type === 'block' && node.name === 'for';
        const currentInsideLoop = insideLoop || isForBlock;

        if (node.name && node.type !== 'block') { // Element (not a block)
           // Check Parent Tag if provided
           if (fingerprint.parentTag && parent) {
              if (parent.name && parent.name.toLowerCase() !== fingerprint.parentTag) {
                 // Parent check failed
              }
           }

           // Debug log the current node being checked
           const elemIdAttr = node.attrs?.find((a: any) => a.name === 'data-elements-id')?.value;
           const idAttr = node.attrs?.find((a: any) => a.name === 'id')?.value;
           const classAttr = node.attrs?.find((a: any) => a.name === 'class')?.value;
           const textContent = (node.children || [])
              .filter((c: any) => c.value) // Text nodes have value
              .map((c: any) => c.value.trim())
              .join(' ');

           console.log(`${prefix}checking <${node.name}> elemId="${elemIdAttr || ''}" id="${idAttr || ''}" class="${classAttr || ''}" text="${textContent.substring(0, 20)}..." ${currentInsideLoop ? '[IN LOOP]' : ''}`);

           if (this.isMatch(node, fingerprint)) {
              console.log(`${prefix}✅ Candidate Found ${currentInsideLoop ? '(inside @for loop)' : ''}`);
              candidates.push({ node, isInsideLoop: currentInsideLoop });
           }
        }

        // Recurse into children for Elements, Blocks (@for, @if), etc.
        if (node.children && node.children.length > 0) {
           const logicalParent = node.name && node.type !== 'block' ? node : parent;
           const childMatch = this.findNode(node.children, fingerprint, depth + 1, logicalParent, currentInsideLoop);
           if (childMatch) return childMatch;
        }
     }

     // Disambiguate
     if (candidates.length > 0) {
        if (fingerprint.childIndex !== undefined && candidates.length > 1) {
           const sameTagSiblings = nodes.filter(n => n.name === fingerprint.tagName);
           const targetNode = sameTagSiblings[fingerprint.childIndex];

           const match = candidates.find(c => c.node === targetNode);
           if (match) {
              console.log(`${prefix}✅ MATCH FOUND by Index [${fingerprint.childIndex}]`);
              return match;
           }
        }

        console.log(`${prefix}✅ MATCH FOUND (First Candidate)`);
        return candidates[0];
     }

     return null;
  }

  private isMatch(node: any, fingerprint: ElementFingerprint): boolean {
     if (node.name.toLowerCase() !== fingerprint.tagName.toLowerCase()) return false;

     // 0. Strongest Match: data-elements-id or _ong (Visual Editing ID)
     if (fingerprint.elementId) {
        // Skip _ong: prefixed IDs in AST matching — they don't exist in source templates.
        // These are handled by the ong annotation fast path (modifyByOngAnnotation) instead.
        if (fingerprint.elementId.startsWith('_ong:')) {
           // Fall through to weaker matching as a safety net
        } else {
           const elemIdAttr = node.attrs?.find((a: any) => a.name === 'data-elements-id');
           if (elemIdAttr && elemIdAttr.value === fingerprint.elementId) {
              console.log(`[TemplateService] ✅ Matched by data-elements-id: ${fingerprint.elementId}`);
              return true;
           }
           // If elementId was provided but doesn't match, this is NOT the node
           return false;
        }
     }

     // 1. Strong Match: HTML ID attribute
     if (fingerprint.id) {
        const idAttr = node.attrs?.find((a: any) => a.name === 'id');
        if (idAttr && idAttr.value === fingerprint.id) {
           return true;
        }
     }

     // Get the template text content
     const nodeText = (node.children || [])
        .filter((c: any) => c.value)
        .map((c: any) => c.value.trim())
        .join(' ')
        .trim();

     // Check if the template has Angular interpolation ({{ ... }})
     const hasInterpolation = /\{\{.*?\}\}/.test(nodeText);

     // 2. Text Match (Normalized)
     if (fingerprint.text) {
        const targetText = fingerprint.text.trim();

        // If template has interpolation, we can't match by text content directly
        // because the runtime shows rendered values like "Product Sold" but
        // the template has "{{ data().title }}"
        if (hasInterpolation) {
           // Skip strict text matching for interpolated content
           // Fall through to class matching instead
        } else if (nodeText === targetText || nodeText.includes(targetText) || targetText.includes(nodeText)) {
           // Direct text match for static content
           if (!fingerprint.classes) return true;
        } else {
           // Text doesn't match and no interpolation - not this node
           if (targetText.length > 3 && nodeText.length > 0) return false;
        }
     }

     // 3. Class Match (Fuzzy/Intersection)
     if (fingerprint.classes) {
        const classAttr = node.attrs?.find((a: any) => a.name === 'class');
        if (classAttr) {
           const templateClasses = classAttr.value.split(/\s+/).filter(Boolean);
           const fingerprintClasses = fingerprint.classes.split(/\s+/).filter(Boolean);

           const intersection = templateClasses.filter((c: string) => fingerprintClasses.includes(c));

           // If most classes match, consider it a hit
           if (intersection.length >= Math.min(fingerprintClasses.length, 1)) {
              return true;
           }
        }
     }

     // 4. For elements with interpolation but no classes, match by tag + position
     // This is a weak match but necessary for dynamic content
     if (hasInterpolation && !fingerprint.classes && fingerprint.text) {
        // We have dynamic content, tag matches, accept it as a candidate
        return true;
     }

     // 5. Fallback for structural match (Tag + Parent + Index)
     // If we reached here, and no text/classes were provided, we rely on findNode's index logic
     if (!fingerprint.text && !fingerprint.classes && !fingerprint.id) {
        return true;
     }

     return false;
  }

  /**
   * Fallback: Search ALL template files (.html and inline templates) for a matching element
   */
  private searchAllTemplates(files: any, fingerprint: ElementFingerprint, modification: { type: 'text' | 'style' | 'class', value: string, property?: string }): ModificationResult | null {
    const templates = this.collectAllTemplates(files);
    console.log(`[TemplateService] Found ${templates.length} templates to search:`, templates.map(t => t.path));

    for (const template of templates) {
      try {
        const parsed = parse(template.content);
        const matchResult = this.findNode(parsed.rootNodes, fingerprint);

        if (matchResult && matchResult.node) {
          const { node: match, isInsideLoop } = matchResult;
          console.log(`[TemplateService] Found match in: ${template.path}${isInsideLoop ? ' (inside loop)' : ''}`);

          let modifiedTemplate = template.content;

          if (modification.type === 'text') {
            const textNode = match.children?.find((c: any) => c.value);
            if (textNode) {
              modifiedTemplate = this.replaceRange(template.content, textNode.sourceSpan.start.offset, textNode.sourceSpan.end.offset, modification.value);
            } else if (match.endSourceSpan) {
              modifiedTemplate = this.replaceRange(template.content, match.startSourceSpan.end.offset, match.endSourceSpan.start.offset, modification.value);
            } else {
              continue; // Can't edit, try next template
            }
          } else if (modification.type === 'style') {
            const styleAttr = match.attrs?.find((a: any) => a.name === 'style');
            const styleDecl = `${modification.property}: ${modification.value};`;

            if (styleAttr) {
              const oldStyle = styleAttr.value;
              const propRegex = new RegExp(`${modification.property}\\s*:[^;]+;?`, 'gi');
              let newStyle = oldStyle;
              if (propRegex.test(oldStyle)) {
                newStyle = oldStyle.replace(propRegex, styleDecl);
              } else {
                newStyle = oldStyle + (oldStyle.trim().endsWith(';') ? ' ' : '; ') + styleDecl;
              }
              modifiedTemplate = this.replaceRange(template.content, styleAttr.sourceSpan.start.offset, styleAttr.sourceSpan.end.offset, `style="${newStyle}"`);
            } else {
              const insertPos = match.sourceSpan.start.offset + match.name.length + 1;
              modifiedTemplate = this.insertAt(template.content, insertPos, ` style="${styleDecl}"`);
            }
          }

          // If it's an inline template, we need to put it back in the TS file
          let finalContent = modifiedTemplate;
          let finalPath = template.path;

          if (template.isInline && template.tsPath && template.tsContent !== undefined && template.offset !== undefined) {
            finalContent = this.replaceRange(template.tsContent, template.offset, template.offset + template.content.length, modifiedTemplate);
            finalPath = template.tsPath;
          }

          return { content: finalContent, path: finalPath, success: true, isInsideLoop };
        }
      } catch (e) {
        console.warn(`[TemplateService] Failed to parse template ${template.path}:`, e);
      }
    }

    return null;
  }

  /**
   * Collect all templates from the project (both .html files and inline templates)
   */
  private collectAllTemplates(files: any, currentPath = ''): Array<{ path: string, content: string, isInline: boolean, tsPath?: string, tsContent?: string, offset?: number }> {
    const templates: Array<{ path: string, content: string, isInline: boolean, tsPath?: string, tsContent?: string, offset?: number }> = [];

    for (const key in files) {
      const node = files[key];
      const fullPath = currentPath ? `${currentPath}/${key}` : key;

      if (node.file) {
        const content = node.file.contents;

        // Check for .html template files
        if (fullPath.endsWith('.html') && !fullPath.includes('index.html')) {
          templates.push({ path: fullPath, content, isInline: false });
        }

        // Check for inline templates in .ts files
        if (fullPath.endsWith('.ts')) {
          const inlineMatch = content.match(/template\s*:\s*`([\s\S]*?)`/);
          if (inlineMatch) {
            const templateContent = inlineMatch[1];
            const offset = inlineMatch.index! + inlineMatch[0].indexOf(templateContent);
            templates.push({
              path: fullPath + ' (inline)',
              content: templateContent,
              isInline: true,
              tsPath: fullPath,
              tsContent: content,
              offset
            });
          }
        }
      } else if (node.directory) {
        templates.push(...this.collectAllTemplates(node.directory, fullPath));
      }
    }

    return templates;
  }

  private findComponentFile(files: any, componentName: string): { path: string, content: string } | null {
      console.log(`[TemplateService] Searching for component: ${componentName}`);
      const result = this.searchFiles(files, (path, content) => {
         const hasClassDef = content.includes(`class ${componentName}`);
         if (hasClassDef && path.endsWith('.ts')) {
            console.log(`[TemplateService] Found match in: ${path}`);
            return true;
         }
         return false;
      });
      
      if (!result) {
         console.warn(`[TemplateService] Failed to find file defining class ${componentName}`);
      }
      return result;
  }

  private findComponentFileBySelector(files: any, selector: string): { path: string, content: string } | null {
      console.log(`[TemplateService] Searching for component with selector: "${selector}"`);
      const result = this.searchFiles(files, (path, content) => {
         if (!path.endsWith('.ts')) return false;
         
         const selectorRegex = new RegExp(`selector\\s*:\\s*['"\`]${selector}['"\`]`, 'i');
         if (selectorRegex.test(content)) {
            console.log(`[TemplateService] Found selector match in: ${path}`);
            return true;
         }
         return false;
      });
      return result;
  }

  private resolveTemplate(tsPath: string, tsContent: string, files: any): { path: string, content: string, isInline: boolean, offset?: number } | null {
     console.log(`[TemplateService] Resolving template for: ${tsPath}`);
     
     // 1. Check templateUrl (supports ' " and `)
     const urlMatch = tsContent.match(/templateUrl\s*:\s*(['"`])(.+?)\1/);
     if (urlMatch) {
        const currentDir = tsPath.substring(0, tsPath.lastIndexOf('/'));
        const rawPath = urlMatch[2];
        
        // Handle relative paths (./ or ../)
        let resolvedPath;
        if (rawPath.startsWith('./')) {
           resolvedPath = this.normalizePath(`${currentDir}/${rawPath.substring(2)}`);
        } else if (rawPath.startsWith('../')) {
           // Simple one-level up handle
           const parentDir = currentDir.substring(0, currentDir.lastIndexOf('/'));
           resolvedPath = this.normalizePath(`${parentDir}/${rawPath.substring(3)}`);
        } else {
           resolvedPath = this.normalizePath(`${currentDir}/${rawPath}`);
        }

        console.log(`[TemplateService] Attempting to load external template: ${resolvedPath}`);
        const content = this.getFileContent(files, resolvedPath);
        if (content !== null) {
           console.log(`[TemplateService] Successfully loaded external template`);
           return { path: resolvedPath, content, isInline: false };
        } else {
           console.warn(`[TemplateService] Failed to find template file at: ${resolvedPath}`);
        }
     }
     
     // 2. Check inline template
     const inlineMatch = tsContent.match(/template\s*:\s*(['"`])([\s\S]+?)\1/);
     if (inlineMatch) {
        const templateContent = inlineMatch[2];
        const offset = inlineMatch.index! + inlineMatch[0].indexOf(templateContent);
        console.log(`[TemplateService] Resolved inline template in ${tsPath}`);
        return { path: tsPath, content: templateContent, isInline: true, offset };
     }

     console.error(`[TemplateService] No template or templateUrl found in ${tsPath}`);
     return null;
  }

  private normalizePath(path: string): string {
     return path.replace(/^\.\//, '');
  }

  private searchFiles(tree: any, predicate: (path: string, content: string) => boolean, currentPath = ''): { path: string, content: string } | null {
     for (const key in tree) {
        const node = tree[key];
        const fullPath = currentPath ? `${currentPath}/${key}` : key;
        
        if (node.file) {
           if (predicate(fullPath, node.file.contents)) {
              return { path: fullPath, content: node.file.contents };
           }
        } else if (node.directory) {
           const res = this.searchFiles(node.directory, predicate, fullPath);
           if (res) return res;
        }
     }
     return null;
  }

  private getFileContent(tree: any, path: string): string | null {
     const parts = path.split('/');
     let current = tree;
     for (const part of parts) {
        if (!current[part]) return null;
        if (current[part].file) return current[part].file.contents;
        current = current[part].directory;
     }
     return null;
  }

  private replaceRange(str: string, start: number, end: number, replacement: string): string {
     return str.substring(0, start) + replacement + str.substring(end);
  }

  private insertAt(str: string, index: number, insertion: string): string {
     return str.substring(0, index) + insertion + str.substring(index);
  }

  // --- Translation JSON editing ---

  /** Regex to detect translate/transloco/i18n pipe expressions and extract the key. */
  private static TRANSLATE_PIPE_RE = /\{\{\s*['"]([^'"]+)['"]\s*\|\s*(translate|transloco|i18n)\b/;

  /**
   * Detects if an element's text comes from a translation pipe and, if so,
   * updates the corresponding value in the translation JSON file.
   */
  private tryModifyTranslation(files: any, fingerprint: ElementFingerprint, newText: string): ModificationResult | null {
    const ann = fingerprint.ongAnnotation!;
    if (ann.text.type !== 'interpolated' && ann.text.type !== 'mixed') return null;

    const match = ann.text.content.match(TemplateService.TRANSLATE_PIPE_RE);
    if (!match) return null;

    const translationKey = match[1];
    console.log(`[TemplateService] Detected translation key: "${translationKey}" (pipe: ${match[2]})`);

    // Find all translation JSON files in the project
    const jsonFiles = this.findTranslationJsonFiles(files);
    if (jsonFiles.length === 0) {
      console.warn('[TemplateService] No translation JSON files found');
      return null;
    }

    console.log(`[TemplateService] Found ${jsonFiles.length} translation file(s):`, jsonFiles.map(f => f.path));

    // Find the file whose value for this key matches the original displayed text.
    // This gives us the currently active locale's file.
    const originalText = (fingerprint.text || '').trim();
    let targetFile: { path: string; content: string } | null = null;

    for (const jf of jsonFiles) {
      try {
        const json = JSON.parse(jf.content);
        const currentValue = this.getNestedValue(json, translationKey);
        if (currentValue !== undefined) {
          // Strip interpolation params (e.g., "Hello {{name}}" → compare base text)
          const stripped = String(currentValue).replace(/\{\{[^}]*\}\}/g, '').trim();
          const originalStripped = originalText.replace(/\{\{[^}]*\}\}/g, '').trim();
          if (currentValue === originalText || stripped === originalStripped || !targetFile) {
            targetFile = jf;
            if (currentValue === originalText) break; // exact match, stop looking
          }
        }
      } catch {
        continue;
      }
    }

    if (!targetFile) {
      console.warn(`[TemplateService] Key "${translationKey}" not found in any translation file`);
      return null;
    }

    console.log(`[TemplateService] Updating translation in: ${targetFile.path}`);

    try {
      const json = JSON.parse(targetFile.content);
      this.setNestedValue(json, translationKey, newText);
      const updatedContent = JSON.stringify(json, null, 2) + '\n';
      return { content: updatedContent, path: targetFile.path, success: true };
    } catch (e: any) {
      return { content: '', path: targetFile.path, success: false, error: `Failed to update translation: ${e.message}` };
    }
  }

  /**
   * Finds translation JSON files by scanning common i18n directory locations.
   */
  private findTranslationJsonFiles(files: any): Array<{ path: string; content: string }> {
    const results: Array<{ path: string; content: string }> = [];

    // Collect all JSON files from common i18n directories
    const i18nDirs = this.findI18nDirectories(files);

    for (const dir of i18nDirs) {
      const dirNode = this.getDirectoryNode(files, dir);
      if (!dirNode) continue;

      for (const key in dirNode) {
        const node = dirNode[key];
        if (node.file && key.endsWith('.json')) {
          results.push({ path: `${dir}/${key}`, content: node.file.contents });
        }
      }
    }

    return results;
  }

  /**
   * Scans the file tree for directories that look like i18n/translation directories.
   */
  private findI18nDirectories(files: any, currentPath = ''): string[] {
    const dirs: string[] = [];
    const i18nNames = new Set(['i18n', 'locale', 'locales', 'translations', 'lang', 'langs']);

    for (const key in files) {
      const node = files[key];
      const fullPath = currentPath ? `${currentPath}/${key}` : key;

      if (node.directory) {
        if (i18nNames.has(key.toLowerCase())) {
          dirs.push(fullPath);
        }
        // Recurse to find nested i18n dirs (e.g., src/assets/i18n/)
        dirs.push(...this.findI18nDirectories(node.directory, fullPath));
      }
    }

    return dirs;
  }

  /** Navigate the file tree to get a directory node at a given path. */
  private getDirectoryNode(tree: any, path: string): any | null {
    const parts = path.split('/');
    let current = tree;
    for (const part of parts) {
      if (!current[part]) return null;
      if (current[part].directory) {
        current = current[part].directory;
      } else {
        return null;
      }
    }
    return current;
  }

  /** Get a value from a nested object using a dot-separated key (e.g., "nav.title"). */
  private getNestedValue(obj: any, key: string): any {
    // Try flat key first (e.g., { "nav.title": "..." })
    if (key in obj) return obj[key];

    // Try nested path (e.g., { nav: { title: "..." } })
    const parts = key.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  /** Set a value in a nested object using a dot-separated key. Creates intermediate objects as needed. */
  private setNestedValue(obj: any, key: string, value: any): void {
    // If the key exists as a flat key, update it flat
    if (key in obj) {
      obj[key] = value;
      return;
    }

    // Otherwise use nested path
    const parts = key.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
}
