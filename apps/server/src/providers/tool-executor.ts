import { jsonrepair } from 'jsonrepair';
import { AgentLoopContext } from './types';
import { figmaBridge } from '../services/figma-bridge.service';
import { screenshotManager } from './screenshot-manager';
import { questionManager } from './question-manager';
import { MCPToolResult } from '../mcp/types';
import { kitLessonService } from '../services/kit-lesson.service';
import { sanitizeCommandOutput } from './sanitize-output';

/**
 * Execute an MCP tool and format the result
 */
export async function executeMCPTool(
  toolName: string,
  toolArgs: any,
  ctx: AgentLoopContext
): Promise<{ content: string; isError: boolean }> {
  if (!ctx.mcpManager) {
    return { content: 'MCP Manager not initialized', isError: true };
  }

  try {
    const result: MCPToolResult = await ctx.mcpManager.callTool(toolName, toolArgs);

    // Format MCP response for AI consumption
    const formattedContent = result.content
      .map(item => {
        if (item.type === 'text' && item.text) {
          return item.text;
        } else if (item.type === 'image' && item.data) {
          return `[Image: ${item.mimeType || 'image/png'}]`;
        } else if (item.type === 'resource') {
          return `[Resource: ${item.mimeType || 'unknown'}]`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');

    return {
      content: formattedContent || 'Tool executed successfully',
      isError: result.isError || false
    };
  } catch (error) {
    return {
      content: `MCP tool error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isError: true
    };
  }
}

/**
 * Validates that required arguments are present for a tool call.
 * Returns an error message if validation fails, or null if valid.
 */
export function validateToolArgs(toolName: string, toolArgs: any, required: string[]): string | null {
  const missing = required.filter(key => toolArgs[key] === undefined || toolArgs[key] === null || toolArgs[key] === '');
  if (missing.length > 0) {
    return `Error: Tool '${toolName}' missing required arguments: ${missing.join(', ')}. Your response may have been truncated. Try breaking the task into smaller steps.`;
  }
  return null;
}

/**
 * Sanitizes file content from write_files tool calls.
 * Fixes double-escaping issues where LLMs serialize SCSS/CSS content with
 * escaped quotes and literal \n sequences instead of actual newlines.
 */
export function sanitizeFileContent(content: string, filePath: string): string {
  // Strip leading/trailing artifact quotes from double-escaping
  // e.g. content = '":host { ... }"' → ':host { ... }'
  if (content.length > 2 && content.startsWith('"') && content.endsWith('"')) {
    const inner = content.slice(1, -1);
    // Only strip if the inner content looks like it has escaped sequences
    // (i.e., it was a double-wrapped JSON string)
    if (inner.includes('\\n') || inner.includes('\\t')) {
      content = inner;
    }
  }

  // Fix literal \n sequences (two chars: backslash + n) → actual newlines
  // This happens when content was double-escaped during LLM serialization.
  // Only apply if the content has no actual newlines but has literal \n sequences.
  if (content.length > 50 && !content.includes('\n') && content.includes('\\n')) {
    console.warn(`[WriteFiles] Fixing escaped newlines in ${filePath} (${content.length} chars)`);
    content = content
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  return content;
}

export async function executeTool(
  toolName: string,
  toolArgs: any,
  ctx: AgentLoopContext
): Promise<{ content: string; isError: boolean }> {
  // Check if this is an MCP tool
  if (ctx.mcpManager && ctx.mcpManager.isMCPTool(toolName)) {
    return executeMCPTool(toolName, toolArgs, ctx);
  }

  const { fs, callbacks, skillRegistry } = ctx;
  let content = '';
  let isError = false;

  try {
    // Validate required arguments for each tool before execution
    let validationError: string | null = null;

    switch (toolName) {
      case 'write_file':
        validationError = validateToolArgs(toolName, toolArgs, ['path', 'content']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        toolArgs.content = sanitizeFileContent(toolArgs.content, toolArgs.path);
        const isRewrite = ctx.writtenFilesSet.has(toolArgs.path);
        await fs.writeFile(toolArgs.path, toolArgs.content);
        callbacks.onFileWritten?.(toolArgs.path, toolArgs.content);
        ctx.hasWrittenFiles = true;
        if (!ctx.modifiedFiles.includes(toolArgs.path)) ctx.modifiedFiles.push(toolArgs.path);
        ctx.writtenFilesSet.add(toolArgs.path);
        content = 'File created successfully.';
        if (isRewrite) {
          content += '\n⚠ EFFICIENCY: You already wrote this file earlier in this session. For future modifications, use edit_file with targeted old_str/new_str instead of rewriting the entire file. This saves tokens and turns.';
        }
        break;
      case 'write_files':
        // LLMs sometimes send the files array as a JSON string instead of a parsed array,
        // sometimes with trailing garbage like "] }" — use jsonrepair to handle malformed JSON
        if (typeof toolArgs.files === 'string') {
          try {
            toolArgs.files = JSON.parse(jsonrepair(toolArgs.files));
          } catch {
            // Will be caught by the Array.isArray check below
          }
        }
        if (!toolArgs.files || !Array.isArray(toolArgs.files)) {
          content = 'Error: No files array provided. Your JSON may have been truncated. Try writing fewer files per call, or use write_file for individual files.';
          isError = true;
        } else {
          let written = 0;
          const skipped: string[] = [];
          const corrupted: string[] = [];
          for (const f of toolArgs.files) {
            if (!f.path || !f.content) {
              skipped.push(f.path || 'unknown');
              continue;
            }
            // Sanitize file content — fixes double-escaping issues from LLM serialization
            f.content = sanitizeFileContent(f.content, f.path);
            // Detect still-corrupted content (long single-line files are almost certainly broken)
            // Exempt XML/HTML content (e.g. SVG icons are often single-line)
            if (f.content.length > 100 && !f.content.includes('\n') && !f.content.trimStart().startsWith('<')) {
              corrupted.push(f.path);
              continue;
            }
            await fs.writeFile(f.path, f.content);
            callbacks.onFileWritten?.(f.path, f.content);
            written++;
          }
          ctx.hasWrittenFiles = true;
          const rewrittenPaths: string[] = [];
          for (const f of toolArgs.files) {
            if (f.path && f.content) {
              if (ctx.writtenFilesSet.has(f.path)) rewrittenPaths.push(f.path);
              if (!ctx.modifiedFiles.includes(f.path)) ctx.modifiedFiles.push(f.path);
              ctx.writtenFilesSet.add(f.path);
            }
          }
          if (corrupted.length > 0) {
            content = `${written} of ${toolArgs.files.length} files written. ${corrupted.length} files had corrupted content (no newlines detected, likely a serialization error) and were NOT written: ${corrupted.join(', ')}. Please re-write these files individually using write_file.`;
            isError = corrupted.length > 0 && written === 0;
          } else if (skipped.length > 0) {
            content = `${written} of ${toolArgs.files.length} files written. Skipped ${skipped.length} files with missing path or content (possible truncation): ${skipped.join(', ')}`;
          } else {
            content = `${written} of ${toolArgs.files.length} files written successfully.`;
          }
          if (rewrittenPaths.length > 0) {
            content += `\n⚠ EFFICIENCY: ${rewrittenPaths.length} file(s) were rewritten that you already created earlier: ${rewrittenPaths.join(', ')}. Use edit_file for targeted changes instead of rewriting entire files.`;
          }
        }
        break;
      case 'edit_file':
        validationError = validateToolArgs(toolName, toolArgs, ['path', 'old_str', 'new_str']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        await fs.editFile(toolArgs.path, toolArgs.old_str, toolArgs.new_str);
        {
          const updatedContent = await fs.readFile(toolArgs.path);
          callbacks.onFileWritten?.(toolArgs.path, updatedContent);
          if (!ctx.modifiedFiles.includes(toolArgs.path)) ctx.modifiedFiles.push(toolArgs.path);
        }
        content = 'File edited successfully.';
        break;
      case 'read_file':
        validationError = validateToolArgs(toolName, toolArgs, ['path']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        content = await fs.readFile(toolArgs.path);
        break;
      case 'read_files':
        if (typeof toolArgs.paths === 'string') {
          try { toolArgs.paths = JSON.parse(jsonrepair(toolArgs.paths)); } catch { /* handled below */ }
        }
        validationError = validateToolArgs(toolName, toolArgs, ['paths']);
        if (validationError || !Array.isArray(toolArgs.paths)) {
          content = validationError || "Error: Tool 'read_files' requires 'paths' to be an array. Your response may have been truncated.";
          isError = true;
          break;
        }
        {
          const readResults: string[] = [];
          for (const p of toolArgs.paths) {
            try {
              const fileContent = await fs.readFile(p);
              readResults.push(`--- ${p} ---\n${fileContent}`);
            } catch (e: any) {
              readResults.push(`--- ${p} ---\nError: ${e.message}`);
            }
          }
          content = readResults.join('\n\n');
        }
        break;
      case 'list_dir':
        validationError = validateToolArgs(toolName, toolArgs, ['path']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        {
          const items = await fs.listDir(toolArgs.path);
          content = items.length ? items.join('\n') : 'Directory is empty or not found.';
        }
        break;
      case 'glob':
        validationError = validateToolArgs(toolName, toolArgs, ['pattern']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        {
          const matches = await fs.glob(toolArgs.pattern);
          content = matches.length ? matches.join('\n') : 'No files matched the pattern.';
        }
        break;
      case 'grep':
        validationError = validateToolArgs(toolName, toolArgs, ['pattern']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        {
          const grepResults = await fs.grep(toolArgs.pattern, toolArgs.path, toolArgs.case_sensitive);
          content = grepResults.length ? grepResults.join('\n') : 'No matches found.';
        }
        break;
      case 'activate_skill':
        validationError = validateToolArgs(toolName, toolArgs, ['name']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        {
          const skill = skillRegistry.getSkill(toolArgs.name);
          if (skill) {
            let skillContent = skill.instructions;
            if (skill.references && skill.references.length > 0) {
              skillContent += '\n\n[SKILL REFERENCE FILES - available on demand]\nUse the `read_skill_reference` tool to read any of these files when needed:\n' +
                skill.references.map(r => `- ${r.name}`).join('\n');
            }
            content = `<activated_skill name="${skill.name}">\n${skillContent}\n</activated_skill>`;
          } else {
            content = `Error: Skill '${toolArgs.name}' not found.`;
            isError = true;
          }
        }
        break;
      case 'read_skill_reference':
        validationError = validateToolArgs(toolName, toolArgs, ['skill_name', 'filename']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        {
          const skill = skillRegistry.getSkill(toolArgs.skill_name);
          if (!skill) {
            content = `Error: Skill '${toolArgs.skill_name}' not found.`;
            isError = true;
            break;
          }
          const ref = skill.references?.find(r => r.name === toolArgs.filename);
          if (!ref) {
            content = `Error: Reference file '${toolArgs.filename}' not found in skill '${toolArgs.skill_name}'.`;
            isError = true;
            break;
          }
          content = `### ${ref.name}\n${ref.content}`;
        }
        break;
      case 'delete_file':
        validationError = validateToolArgs(toolName, toolArgs, ['path']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        {
          const protectedFiles = ['package.json', 'angular.json', 'tsconfig.json', 'tsconfig.app.json'];
          const fileName = toolArgs.path.split('/').pop();
          if (protectedFiles.includes(fileName)) {
            content = `Error: Cannot delete protected file: ${toolArgs.path}`;
            isError = true;
          } else {
            await fs.deleteFile(toolArgs.path);
            content = `File deleted: ${toolArgs.path}`;
          }
        }
        break;
      case 'rename_file':
        validationError = validateToolArgs(toolName, toolArgs, ['old_path', 'new_path']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        {
          const fileContent = await fs.readFile(toolArgs.old_path);
          await fs.writeFile(toolArgs.new_path, fileContent);
          callbacks.onFileWritten?.(toolArgs.new_path, fileContent);
          await fs.deleteFile(toolArgs.old_path);
          content = `File renamed from ${toolArgs.old_path} to ${toolArgs.new_path}`;
        }
        break;
      case 'copy_file':
        validationError = validateToolArgs(toolName, toolArgs, ['source_path', 'destination_path']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        {
          const fileContent = await fs.readFile(toolArgs.source_path);
          await fs.writeFile(toolArgs.destination_path, fileContent);
          callbacks.onFileWritten?.(toolArgs.destination_path, fileContent);
          content = `File copied from ${toolArgs.source_path} to ${toolArgs.destination_path}`;
        }
        break;
      case 'take_screenshot':
        {
          if (!callbacks.onScreenshotRequest) {
            content = 'Screenshot capture is not available in this environment.';
            isError = true;
          } else {
            try {
              const imageData = await screenshotManager.requestScreenshot(
                (requestId) => callbacks.onScreenshotRequest!(requestId)
              );
              // Return a special marker with the image data that the provider can parse
              // Format: [SCREENSHOT:<base64>]
              content = `[SCREENSHOT:${imageData}]`;
            } catch (err: any) {
              content = `Failed to capture screenshot: ${err.message}`;
              isError = true;
            }
          }
        }
        break;
      case 'verify_build':
        if (!fs.exec) throw new Error('verify_build is not supported in this environment.');
        {
          const buildCmd = ctx.buildCommand;
          console.log(`[VerifyBuild] Running: ${buildCmd}`);
          const res = await fs.exec(buildCmd);
          content = sanitizeCommandOutput(buildCmd, res.stdout, res.stderr, res.exitCode);
          ctx.lastBuildOutput = content;
          if (res.exitCode !== 0) isError = true;
          ctx.hasRunBuild = true;
          if (res.exitCode !== 0) {
            ctx.failedBuildCount++;
            if (ctx.activeKitName && ctx.failedBuildCount >= 2) {
              const nudge = `\n\n🚨 **BUILD FAILURE #${ctx.failedBuildCount} — STOP AND READ THE DOCS.**\nYou have had ${ctx.failedBuildCount} consecutive build failures with the ${ctx.activeKitName} component library. You MUST:\n1. Identify which components are causing errors\n2. Read their documentation: \`read_files\` → \`.adorable/components/{ComponentName}.md\`\n3. Fix the imports, selectors, and APIs based on the docs\n4. Remember: import paths and HTML tags often DO NOT match (e.g. import from \`/text-area\` but tag is \`<ui5-textarea>\`)\n5. Use \`edit_file\` to fix the specific error — do NOT rewrite entire files\n6. \`read_file\` BEFORE \`edit_file\` to get the exact current content\n**DO NOT remove or replace library components with plain HTML. DO NOT guess — read the docs.**`;
              content += nudge;
              ctx.logger.logText('BUILD_FAILURE_NUDGE', nudge, { failedBuildCount: ctx.failedBuildCount, activeKitName: ctx.activeKitName });
            }
          } else {
            const priorFailures = ctx.failedBuildCount;
            ctx.failedBuildCount = 0;
            if (priorFailures >= 2 && ctx.activeKitName && ctx.activeKitId) {
              content += `\n\n✅ **Build succeeded after ${priorFailures} failures.** You just worked through a non-trivial issue with the ${ctx.activeKitName} library. If you discovered something that isn't obvious from the docs (wrong import path, required wrapper, missing config, etc.), call \`save_lesson\` now so future sessions don't hit the same wall.`;
            }
          }
        }
        break;
      case 'run_command':
        if (!fs.exec) throw new Error('run_command is not supported in this environment.');
        validationError = validateToolArgs(toolName, toolArgs, ['command']);
        if (validationError) {
          content = validationError;
          isError = true;
          break;
        }
        {
          const res = await fs.exec(toolArgs.command);
          content = sanitizeCommandOutput(toolArgs.command, res.stdout, res.stderr, res.exitCode);
          if (res.exitCode !== 0) isError = true;
          const isBuildCmd = toolArgs.command && toolArgs.command.includes('build');
          if (isBuildCmd) {
            ctx.hasRunBuild = true;
            if (res.exitCode !== 0) {
              ctx.failedBuildCount++;
              // After repeated build failures with an active kit, remind about docs
              if (ctx.activeKitName && ctx.failedBuildCount >= 2) {
                const nudge = `\n\n🚨 **BUILD FAILURE #${ctx.failedBuildCount} — STOP AND READ THE DOCS.**\nYou have had ${ctx.failedBuildCount} consecutive build failures with the ${ctx.activeKitName} component library. You MUST:\n1. Identify which components are causing errors\n2. Read their documentation: \`read_files\` → \`.adorable/components/{ComponentName}.md\`\n3. Fix the imports, selectors, and APIs based on the docs\n4. Remember: import paths and HTML tags often DO NOT match (e.g. import from \`/text-area\` but tag is \`<ui5-textarea>\`)\n5. Use \`edit_file\` to fix the specific error — do NOT rewrite entire files\n6. \`read_file\` BEFORE \`edit_file\` to get the exact current content\n**DO NOT remove or replace library components with plain HTML. DO NOT guess — read the docs.**`;
                content += nudge;
                ctx.logger.logText('BUILD_FAILURE_NUDGE', nudge, { failedBuildCount: ctx.failedBuildCount, activeKitName: ctx.activeKitName });
              }
            } else {
              // Build succeeded — nudge to save lessons if it followed failures
              const priorFailures = ctx.failedBuildCount;
              ctx.failedBuildCount = 0;
              if (priorFailures >= 2 && ctx.activeKitName && ctx.activeKitId) {
                content += `\n\n✅ **Build succeeded after ${priorFailures} failures.** You just worked through a non-trivial issue with the ${ctx.activeKitName} library. If you discovered something that isn't obvious from the docs (wrong import path, required wrapper, missing config, etc.), call \`save_lesson\` now so future sessions don't hit the same wall.`;
              }
            }
          }
        }
        break;
      case 'save_lesson':
        {
          validationError = validateToolArgs(toolName, toolArgs, ['title', 'problem', 'solution']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          if (!ctx.activeKitId || !ctx.userId) {
            content = 'Error: save_lesson requires an active kit and authenticated user.';
            isError = true;
            break;
          }
          try {
            const lesson = await kitLessonService.create({
              kitId: ctx.activeKitId,
              userId: ctx.userId,
              title: toolArgs.title,
              problem: toolArgs.problem,
              solution: toolArgs.solution,
              component: toolArgs.component || undefined,
              codeSnippet: toolArgs.code_snippet || undefined,
              tags: toolArgs.tags || undefined,
              projectId: ctx.projectId || undefined,
            });
            content = `Lesson saved: "${lesson.title}". This will be available in future sessions with this kit.`;
          } catch (err: any) {
            content = `Failed to save lesson: ${err.message}`;
            isError = true;
          }
        }
        break;
      case 'ask_user':
        {
          if (!callbacks.onQuestionRequest) {
            content = 'Question requests are not available in this environment.';
            isError = true;
          } else {
            try {
              validationError = validateToolArgs(toolName, toolArgs, ['questions']);
              if (validationError) {
                content = validationError;
                isError = true;
                break;
              }
              const answers = await questionManager.requestAnswers(
                toolArgs.questions,
                toolArgs.context,
                (requestId, questions, context) => callbacks.onQuestionRequest!(requestId, questions, context)
              );
              content = `User provided the following answers:\n${JSON.stringify(answers, null, 2)}`;
            } catch (err: any) {
              content = `Question request failed: ${err.message}`;
              isError = true;
            }
          }
        }
        break;
      // --- CDP Browser Tools ---
      case 'browse_screenshot':
      case 'browse_evaluate':
      case 'browse_accessibility':
      case 'browse_console':
      case 'browse_navigate':
      case 'browse_click':
        {
          const cdpEndpoint = toolName.replace('browse_', '');
          const agentPort = process.env['ADORABLE_AGENT_PORT'] || '3334';
          const agentUrl = `http://localhost:${agentPort}`;

          if (process.env['ADORABLE_DESKTOP_MODE'] !== 'true') {
            content = 'CDP browser tools are only available in desktop mode with the preview running.';
            isError = true;
          } else {
            try {
              const body: Record<string, any> = {};
              if (toolName === 'browse_evaluate') body.expression = toolArgs.expression;
              if (toolName === 'browse_console') body.clear = toolArgs.clear ?? true;
              if (toolName === 'browse_navigate') body.url = toolArgs.url;
              if (toolName === 'browse_click') { body.x = toolArgs.x; body.y = toolArgs.y; }
              if (toolName === 'browse_screenshot') {
                if (toolArgs.fullResolution) body.fullResolution = true;
                if (toolArgs.quality) body.quality = toolArgs.quality;
              }

              const resp = await fetch(`${agentUrl}/api/native/cdp/${cdpEndpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              const data = await resp.json();

              if (!resp.ok) {
                content = `CDP ${cdpEndpoint} failed: ${data.error}`;
                isError = true;
              } else if (toolName === 'browse_screenshot') {
                content = `[SCREENSHOT:data:image/jpeg;base64,${data.image}]`;
              } else {
                content = JSON.stringify(data, null, 2);
              }
            } catch (err: any) {
              content = `CDP request failed: ${err.message}`;
              isError = true;
            }
          }
        }
        break;
      // --- Angular Inspection Tools (syntactic sugar over CDP evaluate) ---
      case 'inspect_component':
      case 'inspect_performance':
      case 'inspect_routes':
      case 'inspect_signals':
        {
          const agentPort = process.env['ADORABLE_AGENT_PORT'] || '3334';
          const agentUrl = `http://localhost:${agentPort}`;

          if (process.env['ADORABLE_DESKTOP_MODE'] !== 'true') {
            content = 'Inspect tools are only available in desktop mode with the preview running.';
            isError = true;
          } else {
            try {
              let expression = '';

              if (toolName === 'inspect_component') {
                const selector = toolArgs.selector;
                if (selector) {
                  expression = `(function(){var el=document.querySelector('${selector.replace(/'/g, "\\'")}');if(!el){var ongEl=document.querySelector('[_ong="${selector.replace(/"/g, '\\"')}"]');if(ongEl)el=ongEl;}if(!el)return{error:'Element not found'};var ann=(window.__ong_annotations||{})[el.getAttribute('_ong')]||{};var comp=window.ng&&window.ng.getComponent(el);var props={};if(comp){Object.keys(comp).forEach(function(k){if(!k.startsWith('_'))try{var v=comp[k];if(typeof v!=='function')props[k]=JSON.stringify(v)}catch(e){props[k]='<error>'}});}var dirs=[];try{var d=window.ng&&window.ng.getDirectives(el);if(d)d.forEach(function(x){dirs.push(x.constructor.name)});}catch(e){}return{tag:el.tagName.toLowerCase(),component:comp?comp.constructor.name:ann.component||'',file:ann.file||'',line:ann.line||0,properties:props,inputs:ann.bindings?.inputs||{},outputs:ann.bindings?.outputs?Object.keys(ann.bindings.outputs):[],directives:dirs,inLoop:!!ann.inLoop,conditional:!!ann.conditional};})()`;
                } else {
                  expression = `(function(){var els=document.querySelectorAll('[_ong]');var anns=window.__ong_annotations||{};var nodes={};var roots=[];for(var i=0;i<els.length;i++){var el=els[i];var id=el.getAttribute('_ong');if(!id)continue;var ann=anns[id]||{};var cn='';try{var c=window.ng&&window.ng.getComponent(el);if(c)cn=c.constructor.name;}catch(e){}nodes[id]={ongId:id,tag:el.tagName.toLowerCase(),component:cn||ann.component||'',selector:ann.selector||'',file:ann.file||'',line:ann.line||0,parent:ann.parent||null,children:[]};}Object.keys(nodes).forEach(function(id){var n=nodes[id];if(n.parent&&nodes[n.parent])nodes[n.parent].children.push(n);else roots.push(n);});function clean(n){delete n.parent;n.children.forEach(clean);return n;}return roots.map(clean);})()`;
                }
              } else if (toolName === 'inspect_performance') {
                if (toolArgs.action === 'start') {
                  expression = `(function(){window.__adorable_profiler_data=[];window.__adorable_profiler_cycle=0;if(window.ng&&window.ng.ɵsetProfiler){window.ng.ɵsetProfiler(function(event,context){if(event===0){window.__adorable_profiler_start=performance.now();window.__adorable_profiler_current=context?.constructor?.name||'Unknown';}if(event===1){var dur=performance.now()-(window.__adorable_profiler_start||0);var name=window.__adorable_profiler_current||'Unknown';var data=window.__adorable_profiler_data;var last=data.length>0?data[data.length-1]:null;if(!last||(performance.now()-last.timestamp)>16){window.__adorable_profiler_cycle++;data.push({id:window.__adorable_profiler_cycle,timestamp:performance.now(),duration:0,components:[]});last=data[data.length-1];}last.duration+=dur;var ex=last.components.find(function(c){return c.name===name;});if(ex)ex.duration+=dur;else last.components.push({name:name,duration:dur});}});return{status:'recording'};}return{error:'Profiler API not available'};})()`;
                } else {
                  expression = `(function(){if(window.ng&&window.ng.ɵsetProfiler)window.ng.ɵsetProfiler(null);return window.__adorable_profiler_data||[];})()`;
                }
              } else if (toolName === 'inspect_routes') {
                expression = `(function(){try{if(!window.ng)return{routes:[],activeRoute:'',debug:'no ng'};var appRoot=document.querySelector('[ng-version]')||document.querySelector('app-root')||document.querySelector('[_ong]');if(!appRoot&&window.ng.getRootComponents){try{var rc=window.ng.getRootComponents();if(rc&&rc.length>0&&window.ng.getHostElement)appRoot=window.ng.getHostElement(rc[0]);}catch(e){}}if(!appRoot){var els=document.querySelectorAll('*');for(var ei=0;ei<els.length;ei++){try{var ti=window.ng.getInjector(els[ei]);if(ti){appRoot=els[ei];break;}}catch(e){}}}if(!appRoot)return{routes:[],activeRoute:'',debug:'no root'};var inj=window.ng.getInjector(appRoot);if(!inj)return{routes:[],activeRoute:'',debug:'no injector'};var router=null;var injList=[inj];if(window.ng.ɵgetInjectorResolutionPath){try{var rpath=window.ng.ɵgetInjectorResolutionPath(inj);if(rpath)for(var ri=0;ri<rpath.length;ri++){if(rpath[ri]!==inj)injList.push(rpath[ri]);}}catch(e){}}for(var ii=0;ii<injList.length&&!router;ii++){var si=injList[ii];if(window.ng.ɵgetRouterInstance){try{router=window.ng.ɵgetRouterInstance(si);if(router)break;}catch(e){}}if(window.ng.ɵgetInjectorProviders){try{var pp=window.ng.ɵgetInjectorProviders(si);for(var pi=0;pi<pp.length;pi++){try{var v=si.get(pp[pi].token);if(v&&v.config&&typeof v.url!=='undefined'){router=v;break;}}catch(e){}}}catch(e){}}}if(!router||!router.config)return{routes:[],activeRoute:'',debug:'router not found'};var url='';try{url=router.url||'';}catch(e){}var glr=window.ng.ɵgetLoadedRoutes||function(){return undefined;};function map(cfgs){var res=[];for(var i=0;i<cfgs.length;i++){var r=cfgs[i];var path=r.path;if(path===undefined||path===null)path='';var comp='';if(r.component)comp=r.component.name||'';var guards=[];if(r.canActivate)for(var g=0;g<r.canActivate.length;g++){var gd=r.canActivate[g];guards.push(typeof gd==='function'?(gd.name||'guard'):'guard');}var lazy=!!r.loadComponent||!!r.loadChildren;var children=r.children?map(r.children):[];var lc=glr(r);if(lc&&lc.length>0)children=children.concat(map(lc));var fp='/'+path;var isActive=url===fp||(path&&url.startsWith(fp+'/'))||(path===''&&url==='/');res.push({path:path===''?'(root)':path,component:comp,active:isActive,guards:guards,lazy:lazy,children:children});}return res;}return{routes:map(router.config),activeRoute:url};}catch(e){return{routes:[],activeRoute:'',debug:'error:'+e.message};}})()`;
              } else if (toolName === 'inspect_signals') {
                expression = `(function(){if(!window.ng||!window.ng.ɵgetSignalGraph)return{available:false};try{var root=document.querySelector('app-root')||document.querySelector('[_ong]');if(!root)return{available:false};var inj=window.ng.getInjector(root);var graph=window.ng.ɵgetSignalGraph(inj);if(!graph)return{available:true,nodes:[],edges:[]};var nodes=[];var edges=[];if(graph.nodes)graph.nodes.forEach(function(n,i){var val='';try{val=JSON.stringify(n.value).substring(0,100);}catch(e){}nodes.push({id:String(n.id||i),label:n.label||n.name||'node-'+i,type:n.type||'signal',value:val});});if(graph.edges)graph.edges.forEach(function(e){edges.push({from:String(e.source||e.from),to:String(e.target||e.to)});});return{available:true,nodes:nodes,edges:edges};}catch(e){return{available:false,error:e.message};}})()`;
              }

              const resp = await fetch(`${agentUrl}/api/native/cdp/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expression }),
              });
              const data = await resp.json();

              if (!resp.ok) {
                content = `${toolName} failed: ${data.error}`;
                isError = true;
              } else {
                content = JSON.stringify(data.result?.value ?? data.result ?? data, null, 2);
              }
            } catch (err: any) {
              content = `${toolName} failed: ${err.message}`;
              isError = true;
            }
          }
        }
        break;
      // --- Additional CDP-based tools ---
      case 'inspect_errors':
        {
          // Parse the last build output into structured errors
          const lastOutput = ctx.lastBuildOutput || '';
          const errors: any[] = [];
          // Match Angular/TypeScript error patterns: file:line:col - error TSxxxx: message
          const errorRegex = /([^\s]+\.(?:ts|html|scss|css)):(\d+):(\d+)\s*-\s*(error|warning)\s*(TS\d+|NG\d+)?:?\s*(.*)/g;
          let match;
          while ((match = errorRegex.exec(lastOutput)) !== null) {
            errors.push({
              file: match[1],
              line: parseInt(match[2]),
              column: parseInt(match[3]),
              severity: match[4],
              code: match[5] || '',
              message: match[6].trim(),
            });
          }
          if (errors.length > 0) {
            content = JSON.stringify(errors, null, 2);
          } else {
            content = lastOutput ? 'No structured errors found in build output. Raw output:\n' + lastOutput.substring(0, 2000) : 'No build output available. Run verify_build first.';
          }
        }
        break;
      case 'inspect_styles':
      case 'inspect_dom':
      case 'measure_element':
      case 'inject_css':
      case 'get_bundle_stats':
        {
          const agentPort = process.env['ADORABLE_AGENT_PORT'] || '3334';
          const agentUrl = `http://localhost:${agentPort}`;

          if (process.env['ADORABLE_DESKTOP_MODE'] !== 'true') {
            content = `${toolName} is only available in desktop mode.`;
            isError = true;
          } else {
            try {
              let expression = '';

              if (toolName === 'inspect_styles') {
                const sel = String(toolArgs.selector || '').replace(/'/g, "\\'");
                expression = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Element not found: ${sel}'};var cs=getComputedStyle(el);var props=['display','position','width','height','minWidth','minHeight','maxWidth','maxHeight','margin','marginTop','marginRight','marginBottom','marginLeft','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','color','backgroundColor','opacity','visibility','overflow','overflowX','overflowY','zIndex','flexDirection','flexWrap','justifyContent','alignItems','gap','gridTemplateColumns','gridTemplateRows','fontSize','fontWeight','lineHeight','textAlign','border','borderRadius','boxShadow','transform','transition'];var result={};for(var i=0;i<props.length;i++){var v=cs.getPropertyValue(props[i].replace(/([A-Z])/g,'-$1').toLowerCase());if(v&&v!=='none'&&v!=='normal'&&v!=='auto'&&v!=='0px'&&v!=='rgba(0, 0, 0, 0)'&&v!=='transparent')result[props[i]]=v;}return{selector:'${sel}',tag:el.tagName.toLowerCase(),styles:result};})()`;
              } else if (toolName === 'inspect_dom') {
                const sel = String(toolArgs.selector || '').replace(/'/g, "\\'");
                const depth = toolArgs.depth ?? 3;
                expression = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Element not found: ${sel}'};function trim(node,d){if(d===0)return '';var clone=node.cloneNode(true);if(d>0){var children=Array.from(clone.children);for(var i=0;i<children.length;i++){var inner=trim(node.children[i],d-1);if(!inner){clone.removeChild(children[i]);}else{children[i].innerHTML=inner;}}}return clone.outerHTML;}return{selector:'${sel}',html:${depth < 0 ? 'el.outerHTML' : 'trim(el,' + depth + ')'}};})()`;
              } else if (toolName === 'measure_element') {
                const sel = String(toolArgs.selector || '').replace(/'/g, "\\'");
                expression = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Element not found: ${sel}'};var rect=el.getBoundingClientRect();var cs=getComputedStyle(el);return{selector:'${sel}',tag:el.tagName.toLowerCase(),x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height),visible:rect.width>0&&rect.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&cs.opacity!=='0',display:cs.display,visibility:cs.visibility,opacity:cs.opacity,scrollTop:el.scrollTop,scrollLeft:el.scrollLeft,scrollHeight:el.scrollHeight,scrollWidth:el.scrollWidth,viewportWidth:window.innerWidth,viewportHeight:window.innerHeight,inViewport:rect.top<window.innerHeight&&rect.bottom>0&&rect.left<window.innerWidth&&rect.right>0};})()`;
              } else if (toolName === 'inject_css') {
                if (toolArgs.action === 'clear') {
                  expression = `(function(){var el=document.getElementById('__adorable_injected_css');if(el)el.remove();return{status:'cleared'};})()`;
                } else {
                  const css = String(toolArgs.css || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
                  expression = `(function(){var el=document.getElementById('__adorable_injected_css');if(!el){el=document.createElement('style');el.id='__adorable_injected_css';document.head.appendChild(el);}el.textContent+='\n${css}';return{status:'injected',totalRules:el.sheet?el.sheet.cssRules.length:0};})()`;
                }
              } else if (toolName === 'get_bundle_stats') {
                // Parse performance entries for loaded scripts
                expression = `(function(){var entries=performance.getEntriesByType('resource').filter(function(e){return e.name.endsWith('.js');});var chunks=entries.map(function(e){var name=e.name.split('/').pop();return{name:name,size:e.transferSize||0,duration:Math.round(e.duration)};});chunks.sort(function(a,b){return b.size-a.size;});var total=chunks.reduce(function(s,c){return s+c.size;},0);return{totalSize:total,totalSizeKB:Math.round(total/1024),chunks:chunks};})()`;
              }

              const resp = await fetch(`${agentUrl}/api/native/cdp/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expression }),
              });
              const data = await resp.json();
              if (!resp.ok) {
                content = `${toolName} failed: ${data.error}`;
                isError = true;
              } else {
                content = JSON.stringify(data.result?.value ?? data.result ?? data, null, 2);
              }
            } catch (err: any) {
              content = `${toolName} failed: ${err.message}`;
              isError = true;
            }
          }
        }
        break;
      case 'inspect_network':
        {
          const agentPort = process.env['ADORABLE_AGENT_PORT'] || '3334';
          const agentUrl = `http://localhost:${agentPort}`;
          if (process.env['ADORABLE_DESKTOP_MODE'] !== 'true') {
            content = 'inspect_network is only available in desktop mode.';
            isError = true;
          } else {
            try {
              const resp = await fetch(`${agentUrl}/api/native/cdp/network`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: toolArgs.action || 'get' }),
              });
              const data = await resp.json();
              content = JSON.stringify(data, null, 2);
              isError = !resp.ok;
            } catch (err: any) {
              content = `inspect_network failed: ${err.message}`;
              isError = true;
            }
          }
        }
        break;
      case 'type_text':
        {
          const agentPort = process.env['ADORABLE_AGENT_PORT'] || '3334';
          const agentUrl = `http://localhost:${agentPort}`;
          if (process.env['ADORABLE_DESKTOP_MODE'] !== 'true') {
            content = 'type_text is only available in desktop mode.';
            isError = true;
          } else {
            try {
              const resp = await fetch(`${agentUrl}/api/native/cdp/type`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: toolArgs.text || '' }),
              });
              const data = await resp.json();
              content = JSON.stringify(data, null, 2);
              isError = !resp.ok;
            } catch (err: any) {
              content = `type_text failed: ${err.message}`;
              isError = true;
            }
          }
        }
        break;
      case 'clear_build_cache':
        {
          const agentPort = process.env['ADORABLE_AGENT_PORT'] || '3334';
          const agentUrl = `http://localhost:${agentPort}`;
          try {
            const resp = await fetch(`${agentUrl}/api/native/exec`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: 'rm -rf .angular/cache .nx/cache node_modules/.cache 2>/dev/null; echo "Build caches cleared"' }),
            });
            const data = await resp.json();
            content = data.stdout || data.output || 'Build caches cleared';
          } catch (err: any) {
            content = `clear_build_cache failed: ${err.message}`;
            isError = true;
          }
        }
        break;
      case 'get_container_logs':
        {
          const agentPort = process.env['ADORABLE_AGENT_PORT'] || '3334';
          const agentUrl = `http://localhost:${agentPort}`;
          const lines = toolArgs.lines || 50;
          try {
            // Read the dev server output from the exec-stream buffer or container logs
            const resp = await fetch(`${agentUrl}/api/native/exec`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: `tail -n ${lines} /tmp/adorable-dev-server.log 2>/dev/null || echo "No dev server log found. Try checking the terminal output."` }),
            });
            const data = await resp.json();
            content = data.stdout || data.output || 'No logs available';
          } catch (err: any) {
            content = `get_container_logs failed: ${err.message}`;
            isError = true;
          }
        }
        break;
      // --- Figma Live Bridge Tools ---
      case 'figma_get_selection':
      case 'figma_get_node':
      case 'figma_export_node':
      case 'figma_select_node':
      case 'figma_search_nodes':
      case 'figma_get_fonts':
      case 'figma_get_variables':
        {
          const userId = ctx.userId || '';
          if (!figmaBridge.isConnected(userId)) {
            content = 'Figma is not connected. The user needs to open the Adorable plugin in Figma Desktop and connect via the Live Bridge.';
            isError = true;
          } else {
            try {
              let command: any;
              switch (toolName) {
                case 'figma_get_selection':
                  command = { action: 'get_selection' };
                  break;
                case 'figma_get_node':
                  command = { action: 'get_node', nodeId: toolArgs.nodeId, depth: toolArgs.depth };
                  break;
                case 'figma_export_node':
                  command = { action: 'export_node', nodeId: toolArgs.nodeId, scale: toolArgs.scale || 1, format: toolArgs.format || 'PNG' };
                  break;
                case 'figma_select_node':
                  command = { action: 'select_node', nodeId: toolArgs.nodeId };
                  break;
                case 'figma_search_nodes':
                  command = { action: 'search_nodes', query: toolArgs.query, types: toolArgs.types };
                  break;
                case 'figma_get_fonts':
                  command = { action: 'get_fonts' };
                  break;
                case 'figma_get_variables':
                  command = { action: 'get_variables' };
                  break;
              }

              const result = await figmaBridge.sendCommand(userId, command);

              // Return structure only — no auto-image-export.
              // The AI should call figma_export_node explicitly when it needs
              // a visual reference. This keeps tool results small.
              if (toolName === 'figma_get_selection' || toolName === 'figma_get_node') {
                // Slim the JSON: strip empty arrays and default values to reduce token usage
                const slimResult = JSON.stringify(result, (key, val) => {
                  // Strip empty arrays (fills: [], strokes: [], effects: [])
                  if (Array.isArray(val) && val.length === 0) return undefined;
                  // Strip default visual values
                  if (key === 'visible' && val === true) return undefined;
                  if (key === 'opacity' && val === 1) return undefined;
                  if (key === 'cornerRadius' && val === 0) return undefined;
                  // Strip invisible fills/strokes (visible: false)
                  if ((key === 'fills' || key === 'strokes') && Array.isArray(val)) {
                    const visible = val.filter((f: any) => f.visible !== false);
                    return visible.length > 0 ? visible : undefined;
                  }
                  // Strip boundVariables if empty
                  if (key === 'boundVariables' && typeof val === 'object' && Object.keys(val).length === 0) return undefined;
                  return val;
                }, 2);
                content = slimResult;
              } else if (toolName === 'figma_export_node' && result.svg) {
                // SVG export — return raw SVG for inline use
                content = result.svg;
              } else if (toolName === 'figma_export_node' && result.image) {
                content = `[SCREENSHOT:${result.image}]`;
              } else {
                content = JSON.stringify(result, null, 2);
              }
            } catch (err: any) {
              content = `Figma bridge request failed: ${err.message}`;
              isError = true;
            }
          }
        }
        break;
      default:
        content = `Error: Unknown tool ${toolName}`;
        isError = true;
    }
  } catch (err: any) {
    content = `Error: ${err.message}`;
    isError = true;
  }

  return { content, isError };
}
