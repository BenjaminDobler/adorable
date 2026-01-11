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
    const files = this.projectService.allFiles();
    if (!files) return { content: '', path: '', success: false, error: 'No files loaded' };

    let componentFile;
    if (fingerprint.componentName) {
       componentFile = this.findComponentFile(files, fingerprint.componentName);
    } 
    
    if (!componentFile && fingerprint.hostTag) {
       console.log(`[TemplateService] Fallback: Searching for component by selector: ${fingerprint.hostTag}`);
       componentFile = this.findComponentFileBySelector(files, fingerprint.hostTag);
    }

    if (!componentFile) {
       return { content: '', path: '', success: false, error: `Could not locate component file for ${fingerprint.componentName || fingerprint.hostTag}` };
    }

    const templateInfo = this.resolveTemplate(componentFile.path, componentFile.content, files);
    if (!templateInfo) {
       return { content: '', path: '', success: false, error: `Could not locate template for ${fingerprint.componentName || fingerprint.hostTag}` };
    }

    const { path: templatePath, content: templateContent, isInline, offset: templateOffset } = templateInfo;

    // 2. Parse AST
    const { rootNodes } = parse(templateContent);

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
     
     // Match Class
     if (fingerprint.classes) {
        const classAttr = node.attrs.find((a: any) => a.name === 'class');
        if (classAttr) {
           const templateClasses = classAttr.value.split(/\s+/);
           const fingerprintClasses = fingerprint.classes.split(/\s+/);
           
           // Check if any significant class matches (relaxed)
           const intersection = templateClasses.filter((c: string) => fingerprintClasses.includes(c));
           
           if (intersection.length > 0) {
              // Match found by class intersection
              // If text/id are not present/matching, we consider this a match
              if (!fingerprint.text && !fingerprint.id) {
                 return true;
              }
           } else if (templateClasses.length > 0 && fingerprintClasses.length > 0) {
              // Strong mismatch in static classes -> different element
              return false;
           }
        }
     }

     if (fingerprint.text) {
        const textContent = (node.children || [])
           .filter((c: any) => c.value) // Text nodes have value
           .map((c: any) => c.value)
           .join('')
           .trim();
        
        // Check for exact match
        if (fingerprint.text.trim() === textContent) {
           console.log(`[TemplateService] Match found by exact text: "${textContent}"`);
           return true;
        }
        
        // Relaxed match: Contains
        if (textContent.includes(fingerprint.text.trim()) || fingerprint.text.trim().includes(textContent)) {
           console.log(`[TemplateService] Match found by partial text. Node: "${textContent}"`);
           return true;
        }
        
        console.log(`[TemplateService] Tag match <${node.name}> but text mismatch. Node: "${textContent}" vs Fingerprint: "${fingerprint.text.trim()}"`);
     }
     
     // ID Match (Strong fallback)
     if (fingerprint.id) {
        const idAttr = node.attrs.find((a: any) => a.name === 'id');
        if (idAttr && idAttr.value === fingerprint.id) {
           console.log(`[TemplateService] Match found by ID: #${fingerprint.id}`);
           return true;
        }
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
      // Search for @Component({ selector: 'app-foo' })
      // Use simple string matching or regex
      const result = this.searchFiles(files, (path, content) => {
         if (!path.endsWith('.ts')) return false;
         
         // Simple check first
         if (!content.includes('selector')) return false;
         
         // Regex for selector
         // selector: 'app-foo' or selector: "app-foo"
         const selectorRegex = new RegExp(`selector\\s*:\\s*['"\`]${selector}['"\`]`);
         if (selectorRegex.test(content)) {
            console.log(`[TemplateService] Found match by selector in: ${path}`);
            return true;
         }
         return false;
      });
      return result;
  }

  private resolveTemplate(tsPath: string, tsContent: string, files: any): { path: string, content: string, isInline: boolean, offset?: number } | null {
     // 1. Check templateUrl (supports ' " and `)
     const urlMatch = tsContent.match(/templateUrl\s*:\s*(['"`])(.+?)\1/);
     if (urlMatch) {
        const currentDir = tsPath.substring(0, tsPath.lastIndexOf('/'));
        const resolvedPath = this.normalizePath(`${currentDir}/${urlMatch[2]}`);
        const content = this.getFileContent(files, resolvedPath);
        if (content !== null) {
           console.log(`[TemplateService] Resolved external template: ${resolvedPath}`);
           return { path: resolvedPath, content, isInline: false };
        }
     }
     
     // 2. Check inline template
     const inlineMatch = tsContent.match(/template\s*:\s*(['"`])([\s\S]+?)\1/);
     if (inlineMatch) {
        const templateContent = inlineMatch[2];
        const offset = inlineMatch.index! + inlineMatch[0].indexOf(templateContent);
        console.log(`[TemplateService] Resolved inline template in ${tsPath} at offset ${offset}`);
        return { path: tsPath, content: templateContent, isInline: true, offset };
     }

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
