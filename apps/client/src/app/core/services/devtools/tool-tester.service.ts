import { Injectable, inject, signal } from '@angular/core';
import { CdpService } from './cdp.service';
import { ProjectService } from '../project';
import { ToolHistoryEntry } from './devtools.types';

@Injectable({
  providedIn: 'root',
})
export class ToolTesterService {
  private cdp = inject(CdpService);
  private projectService = inject(ProjectService);

  toolResult = signal<string>('');
  toolRunning = signal(false);
  toolHistory = signal<ToolHistoryEntry[]>([]);

  async executeTool(toolName: string, toolArgs: Record<string, unknown>): Promise<void> {
    this.toolRunning.set(true);
    this.toolResult.set('');
    const startTime = Date.now();

    try {
      let result: unknown;
      let isError = false;

      if (toolName.startsWith('browse_')) {
        const endpoint = toolName.replace('browse_', '');
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/cdp/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toolArgs),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName.startsWith('inspect_')) {
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/cdp/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: this.buildInspectExpression(toolName, toolArgs) }),
        });
        const data = await resp.json();
        result = data.result?.value ?? data.result ?? data;
        isError = !resp.ok;
      } else if (toolName === 'run_command' || toolName === 'verify_build') {
        let fullCmd: string;
        if (toolName === 'verify_build') {
          const isExternal = !!this.projectService.externalPath();
          const selectedApp = this.projectService.detectedConfig()?.selectedApp;
          fullCmd = isExternal
            ? (selectedApp ? `npx @richapps/ong build --project ${selectedApp}` : 'npx @richapps/ong build')
            : 'npm run build';
        } else {
          fullCmd = String(toolArgs['command'] || '');
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        try {
          const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/exec`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', fullCmd] }),
            signal: controller.signal,
          });
          result = await resp.json();
          isError = !resp.ok || ((result as any).exitCode && (result as any).exitCode !== 0);
        } catch (e: any) {
          if (e.name === 'AbortError') {
            result = { error: 'Command timed out after 120 seconds', command: fullCmd };
          } else {
            throw e;
          }
          isError = true;
        } finally {
          clearTimeout(timeout);
        }
      } else if (toolName === 'read_file') {
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/read-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: toolArgs['path'] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'read_files') {
        const paths = String(toolArgs['paths']).split(',').map((p: string) => p.trim());
        const results: Record<string, string> = {};
        for (const p of paths) {
          try {
            const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/read-file`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: p }),
            });
            const data = await resp.json();
            results[p] = data.content ?? data.error ?? 'unknown';
          } catch (e: any) {
            results[p] = `Error: ${e.message}`;
          }
        }
        result = results;
      } else if (toolName === 'list_dir') {
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/readdir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: toolArgs['path'], withFileTypes: true }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'glob') {
        const pattern = toolArgs['pattern'] || '**/*';
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `find . -path './${pattern}' -not -path '*/node_modules/*' 2>/dev/null | head -100`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'grep') {
        const pattern = toolArgs['pattern'] || '';
        const searchPath = toolArgs['path'] || '.';
        const caseSensitive = toolArgs['case_sensitive'] !== false;
        const flags = caseSensitive ? '' : '-i';
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `grep -rn ${flags} --include='*.ts' --include='*.html' --include='*.scss' --include='*.json' '${String(pattern).replace(/'/g, "'\\''")}' ${searchPath} 2>/dev/null | head -50`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'write_file') {
        const filePath = toolArgs['path'];
        const content = toolArgs['content'] || '';
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `mkdir -p "$(dirname '${filePath}')" && cat > '${filePath}' << 'ADORABLE_EOF'\n${content}\nADORABLE_EOF`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'edit_file') {
        result = { error: 'edit_file requires server-side context. Use run_command with sed for testing, or test via the AI chat.' };
        isError = true;
      } else if (toolName === 'delete_file') {
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `rm -f '${toolArgs['path']}'`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'rename_file') {
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `mv '${toolArgs['old_path']}' '${toolArgs['new_path']}'`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'copy_file') {
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `cp '${toolArgs['source_path']}' '${toolArgs['destination_path']}'`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (['inspect_styles', 'inspect_dom', 'measure_element', 'get_bundle_stats'].includes(toolName)) {
        let expr = '';
        const sel = String(toolArgs['selector'] || '').replace(/'/g, "\\'");
        if (toolName === 'inspect_styles') {
          expr = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Not found'};var cs=getComputedStyle(el);var ps=['display','position','width','height','margin','padding','color','backgroundColor','opacity','visibility','overflow','zIndex','flexDirection','justifyContent','alignItems','gap','fontSize','fontWeight','border','borderRadius','transform'];var r={};for(var i=0;i<ps.length;i++){var v=cs[ps[i]];if(v&&v!=='none'&&v!=='normal'&&v!=='auto')r[ps[i]]=v;}return r;})()`;
        } else if (toolName === 'inspect_dom') {
          expr = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Not found'};return{html:el.outerHTML.substring(0,5000)};})()`;
        } else if (toolName === 'measure_element') {
          expr = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Not found'};var r=el.getBoundingClientRect();var cs=getComputedStyle(el);return{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),visible:r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden',inViewport:r.top<window.innerHeight&&r.bottom>0};})()`;
        } else {
          expr = `(function(){var e=performance.getEntriesByType('resource').filter(function(e){return e.name.endsWith('.js');});return e.map(function(e){return{name:e.name.split('/').pop(),size:e.transferSize||0};}).sort(function(a,b){return b.size-a.size;});})()`;
        }
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/cdp/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: expr }),
        });
        const data = await resp.json();
        result = data.result?.value ?? data.result ?? data;
        isError = !resp.ok;
      } else if (toolName === 'inspect_network') {
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/cdp/network`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: toolArgs['action'] || 'get' }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'type_text') {
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/cdp/type`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: toolArgs['text'] || '' }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'inject_css') {
        const action = toolArgs['action'];
        let expr: string;
        if (action === 'clear') {
          expr = `(function(){var el=document.getElementById('__adorable_injected_css');if(el)el.remove();return{status:'cleared'};})()`;
        } else {
          const css = String(toolArgs['css'] || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
          expr = `(function(){var el=document.getElementById('__adorable_injected_css');if(!el){el=document.createElement('style');el.id='__adorable_injected_css';document.head.appendChild(el);}el.textContent+='\\n${css}';return{status:'injected'};})()`;
        }
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/cdp/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: expr }),
        });
        const data = await resp.json();
        result = data.result?.value ?? data.result ?? data;
        isError = !resp.ok;
      } else if (toolName === 'clear_build_cache') {
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', 'rm -rf .angular/cache .nx/cache node_modules/.cache 2>/dev/null; echo "Caches cleared"'] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'get_container_logs') {
        const lines = toolArgs['lines'] || 50;
        const resp = await fetch(`${this.cdp.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `tail -n ${lines} /tmp/adorable-dev-server.log 2>/dev/null || echo "No log found"`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      } else if (toolName === 'inspect_errors') {
        result = { info: 'inspect_errors parses the last verify_build output. Run a build first via the AI chat, then use inspect_errors there.' };
      } else {
        result = { error: `Tool "${toolName}" is not testable from the UI.` };
        isError = true;
      }

      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      this.toolResult.set(resultStr);
      this.toolHistory.update((h) => [{
        tool: toolName,
        args: toolArgs,
        result: resultStr.substring(0, 2000),
        timestamp: startTime,
        isError,
      }, ...h].slice(0, 50));
    } catch (err: any) {
      const errStr = `Error: ${err.message}`;
      this.toolResult.set(errStr);
      this.toolHistory.update((h) => [{
        tool: toolName,
        args: toolArgs,
        result: errStr,
        timestamp: startTime,
        isError: true,
      }, ...h].slice(0, 50));
    } finally {
      this.toolRunning.set(false);
    }
  }

  private buildInspectExpression(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case 'inspect_component':
        if (args['selector']) {
          const sel = String(args['selector']);
          return `(function(){var el=document.querySelector('${sel.replace(/'/g, "\\'")}');if(!el)el=document.querySelector('[_ong="${sel.replace(/"/g, '\\"')}"]');if(!el)return{error:'not found'};var comp=window.ng&&window.ng.getComponent(el);var props={};if(comp){Object.keys(comp).forEach(function(k){if(!k.startsWith('_'))try{var v=comp[k];if(typeof v==='function'){try{props[k]='Signal('+JSON.stringify(v())+')'}catch(e){}}else{props[k]=JSON.stringify(v)}}catch(e){}});}return{tag:el.tagName.toLowerCase(),component:comp?comp.constructor.name:'',properties:props};})()`;
        }
        return `(function(){var els=[];function walk(el){try{var c=window.ng.getComponent(el);if(c)els.push({tag:el.tagName.toLowerCase(),component:c.constructor.name});}catch(e){}var ch=el.firstElementChild;while(ch){walk(ch);ch=ch.nextElementSibling;}}walk(document.body);return els;})()`;
      case 'inspect_performance':
        if (args['action'] === 'start') {
          return `(function(){window.__adorable_profiler_data=[];if(window.ng&&window.ng.ɵsetProfiler){window.ng.ɵsetProfiler(function(e,c){if(e===0){window.__pStart=performance.now();window.__pName=c?.constructor?.name||'?';}if(e===1){var d=performance.now()-window.__pStart;var data=window.__adorable_profiler_data;var last=data[data.length-1];if(!last||performance.now()-last.t>16){data.push({t:performance.now(),d:0,c:[]});last=data[data.length-1];}last.d+=d;var ex=last.c.find(function(x){return x.n===window.__pName;});if(ex)ex.d+=d;else last.c.push({n:window.__pName,d:d});}});return{status:'recording'};}return{error:'profiler not available'};})()`;
        }
        return `(function(){if(window.ng&&window.ng.ɵsetProfiler)window.ng.ɵsetProfiler(null);return window.__adorable_profiler_data||[];})()`;
      case 'inspect_routes':
        return `(function(){if(!window.ng)return{error:'router API unavailable'};var root=document.querySelector('[ng-version]')||document.querySelector('app-root');if(!root&&window.ng.getRootComponents){try{var rc=window.ng.getRootComponents();if(rc&&rc.length>0&&window.ng.getHostElement)root=window.ng.getHostElement(rc[0]);}catch(e){}}if(!root){var els=document.querySelectorAll('*');for(var i=0;i<els.length;i++){try{var ti=window.ng.getInjector(els[i]);if(ti){root=els[i];break;}}catch(e){}}}if(!root)return{error:'no root'};var inj=window.ng.getInjector(root);if(!inj)return{error:'no injector'};var r=null;var injList=[inj];if(window.ng.ɵgetInjectorResolutionPath){try{var path=window.ng.ɵgetInjectorResolutionPath(inj);if(path)for(var ri=0;ri<path.length;ri++){if(path[ri]!==inj)injList.push(path[ri]);}}catch(e){}}for(var ii=0;ii<injList.length&&!r;ii++){var si=injList[ii];if(window.ng.ɵgetRouterInstance){try{r=window.ng.ɵgetRouterInstance(si);if(r)break;}catch(e){}}if(window.ng.ɵgetInjectorProviders){try{var pp=window.ng.ɵgetInjectorProviders(si);for(var pi=0;pi<pp.length;pi++){try{var v=si.get(pp[pi].token);if(v&&v.config&&typeof v.url!=='undefined'){r=v;break;}}catch(e){}}}catch(e){}}}if(!r)return{error:'no router'};return{url:r.url,routes:r.config.map(function(c){return{path:c.path,component:c.component?c.component.name:'',lazy:!!c.loadComponent||!!c.loadChildren};})};})()`;
      case 'inspect_signals':
        return `(function(){if(!window.ng||!window.ng.ɵgetSignalGraph)return{available:false};var root=document.querySelector('[ng-version]')||document.querySelector('app-root');if(!root)return{available:false};var inj=window.ng.getInjector(root);var g=window.ng.ɵgetSignalGraph(inj);return g||{available:true,nodes:[],edges:[]};})()`;
      default:
        return `({error:'unknown tool'})`;
    }
  }

  clearToolHistory(): void {
    this.toolHistory.set([]);
    this.toolResult.set('');
  }
}
