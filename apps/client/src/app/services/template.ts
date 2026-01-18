import { Injectable, inject } from '@angular/core';
import { ProjectService } from './project';
import { parse } from 'angular-html-parser';

export interface ElementFingerprint {
  componentName?: string; // Optional now
  hostTag?: string; // New fallback
  tagName: string;
  text?: string;
  classes?: string;
  id?: string;
  attributes?: Record<string, string>;
  childIndex?: number;
  parentTag?: string;
}

export interface ModificationResult {
  content: string;
  path: string;
  success: boolean;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private projectService = inject(ProjectService);

  findAndModify(fingerprint: ElementFingerprint, modification: { type: 'text' | 'style' | 'class', value: string, property?: string }): ModificationResult {
    const files = this.projectService.files();
    if (!files) return { content: '', path: '', success: false, error: 'No files loaded' };

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

    if (!componentFile) {
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
    const match = this.findNode(rootNodes, fingerprint);
    
    if (!match) {
      return { content: '', path: templatePath, success: false, error: 'Could not find matching element in template' };
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

    return { content: finalFileContent, path: isInline ? componentFile.path : templatePath, success: true };
  }

  private findNode(nodes: any[], fingerprint: ElementFingerprint, depth = 0, parent: any = null): any {
     const prefix = '  '.repeat(depth);
     
     const candidates = [];
     
     for (const node of nodes) {
        if (node.name) { // Element
           // Check Parent Tag if provided
           if (fingerprint.parentTag && parent) {
              if (parent.name && parent.name.toLowerCase() !== fingerprint.parentTag) {
                 // Parent check failed
              }
           }

           // Debug log the current node being checked
           const idAttr = node.attrs?.find((a: any) => a.name === 'id')?.value;
           const classAttr = node.attrs?.find((a: any) => a.name === 'class')?.value;
           const textContent = (node.children || [])
              .filter((c: any) => c.value) // Text nodes have value
              .map((c: any) => c.value.trim())
              .join(' ');
              
           console.log(`${prefix}checking <${node.name}> id="${idAttr || ''}" class="${classAttr || ''}" text="${textContent.substring(0, 20)}..."`);

           if (this.isMatch(node, fingerprint)) {
              console.log(`${prefix}✅ Candidate Found`);
              candidates.push(node);
           }
        }
        
        // Recurse into children for Elements, Blocks (@for, @if), etc.
        if (node.children && node.children.length > 0) {
           const logicalParent = node.name ? node : parent;
           const childMatch = this.findNode(node.children, fingerprint, depth + 1, logicalParent);
           if (childMatch) return childMatch;
        }
     }
     
     // Disambiguate
     if (candidates.length > 0) {
        if (fingerprint.childIndex !== undefined && candidates.length > 1) {
           const sameTagSiblings = nodes.filter(n => n.name === fingerprint.tagName);
           const targetNode = sameTagSiblings[fingerprint.childIndex];
           
           if (targetNode && candidates.includes(targetNode)) {
              console.log(`${prefix}✅ MATCH FOUND by Index [${fingerprint.childIndex}]`);
              return targetNode;
           }
        }
        
        console.log(`${prefix}✅ MATCH FOUND (First Candidate)`);
        return candidates[0];
     }
     
     return null;
  }

  private isMatch(node: any, fingerprint: ElementFingerprint): boolean {
     if (node.name.toLowerCase() !== fingerprint.tagName.toLowerCase()) return false;
     
     // 1. Strongest Match: ID
     if (fingerprint.id) {
        const idAttr = node.attrs.find((a: any) => a.name === 'id');
        if (idAttr && idAttr.value === fingerprint.id) {
           return true;
        }
     }

     // 2. Text Match (Normalized)
     if (fingerprint.text) {
        const nodeText = (node.children || [])
           .filter((c: any) => c.value)
           .map((c: any) => c.value.trim())
           .join(' ')
           .trim();
        
        const targetText = fingerprint.text.trim();
        
        if (nodeText === targetText || nodeText.includes(targetText) || targetText.includes(nodeText)) {
           // If we have a text match, and classes also match (or aren't provided), it's a win
           if (!fingerprint.classes) return true;
        } else {
           // If text is provided but doesn't match at all, this is likely not the node
           // Unless it's a very small node where text might be dynamic
           if (targetText.length > 3) return false;
        }
     }

     // 3. Class Match (Fuzzy/Intersection)
     if (fingerprint.classes) {
        const classAttr = node.attrs.find((a: any) => a.name === 'class');
        if (classAttr) {
           const templateClasses = classAttr.value.split(/\s+/).filter(Boolean);
           const fingerprintClasses = fingerprint.classes.split(/\s+/).filter(Boolean);
           
           const intersection = templateClasses.filter((c: string) => fingerprintClasses.includes(c));
           
           // If most classes match, consider it a hit
           if (intersection.length >= Math.min(fingerprintClasses.length, 2)) {
              return true;
           }
        } else if (!fingerprint.classes) {
           // Both have no classes
           return true;
        }
     }

     // 4. Fallback for structural match (Tag + Parent + Index)
     // If we reached here, and no text/classes were provided, we rely on findNode's index logic
     if (!fingerprint.text && !fingerprint.classes && !fingerprint.id) {
        return true;
     }

     return false;
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
}
