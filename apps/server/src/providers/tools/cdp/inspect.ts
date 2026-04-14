import { Tool } from '../types';
import { getCdpAgentUrl, isDesktopMode } from '../utils';

export const inspectComponent: Tool = {
  definition: {
    name: 'inspect_component',
    description: 'Inspect the Angular component tree or get details for a specific component. Without a selector, returns the full component tree built from ONG annotations. With a selector, returns detailed info including inputs, outputs, properties, directives, and source location.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector or _ong ID to get details for a specific component. If omitted, returns the full component tree.'
        }
      },
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'Inspect tools are only available in desktop mode with the preview running.', isError: true };
    }

    try {
      let expression = '';
      const selector = args.selector;

      if (selector) {
        expression = `(function(){var el=document.querySelector('${selector.replace(/'/g, "\\'")}');if(!el){var ongEl=document.querySelector('[_ong="${selector.replace(/"/g, '\\"')}"]');if(ongEl)el=ongEl;}if(!el)return{error:'Element not found'};var ann=(window.__ong_annotations||{})[el.getAttribute('_ong')]||{};var comp=window.ng&&window.ng.getComponent(el);var props={};if(comp){Object.keys(comp).forEach(function(k){if(!k.startsWith('_'))try{var v=comp[k];if(typeof v!=='function')props[k]=JSON.stringify(v)}catch(e){props[k]='<error>'}});}var dirs=[];try{var d=window.ng&&window.ng.getDirectives(el);if(d)d.forEach(function(x){dirs.push(x.constructor.name)});}catch(e){}return{tag:el.tagName.toLowerCase(),component:comp?comp.constructor.name:ann.component||'',file:ann.file||'',line:ann.line||0,properties:props,inputs:ann.bindings?.inputs||{},outputs:ann.bindings?.outputs?Object.keys(ann.bindings.outputs):[],directives:dirs,inLoop:!!ann.inLoop,conditional:!!ann.conditional};})()`;
      } else {
        expression = `(function(){var els=document.querySelectorAll('[_ong]');var anns=window.__ong_annotations||{};var nodes={};var roots=[];for(var i=0;i<els.length;i++){var el=els[i];var id=el.getAttribute('_ong');if(!id)continue;var ann=anns[id]||{};var cn='';try{var c=window.ng&&window.ng.getComponent(el);if(c)cn=c.constructor.name;}catch(e){}nodes[id]={ongId:id,tag:el.tagName.toLowerCase(),component:cn||ann.component||'',selector:ann.selector||'',file:ann.file||'',line:ann.line||0,parent:ann.parent||null,children:[]};}Object.keys(nodes).forEach(function(id){var n=nodes[id];if(n.parent&&nodes[n.parent])nodes[n.parent].children.push(n);else roots.push(n);});function clean(n){delete n.parent;n.children.forEach(clean);return n;}return roots.map(clean);})()`;
      }

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `inspect_component failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data.result?.value ?? data.result ?? data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `inspect_component failed: ${err.message}`, isError: true };
    }
  }
};

export const inspectPerformance: Tool = {
  definition: {
    name: 'inspect_performance',
    description: 'Profile Angular change detection performance. Use action "start" to begin recording, "stop" to stop and return collected data. Returns timing data for each change detection cycle and per-component breakdown.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'stop'],
          description: 'Whether to start or stop profiling.'
        }
      },
      required: ['action']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'Inspect tools are only available in desktop mode with the preview running.', isError: true };
    }

    try {
      let expression = '';

      if (args.action === 'start') {
        expression = `(function(){window.__adorable_profiler_data=[];window.__adorable_profiler_cycle=0;if(window.ng&&window.ng.ɵsetProfiler){window.ng.ɵsetProfiler(function(event,context){if(event===0){window.__adorable_profiler_start=performance.now();window.__adorable_profiler_current=context?.constructor?.name||'Unknown';}if(event===1){var dur=performance.now()-(window.__adorable_profiler_start||0);var name=window.__adorable_profiler_current||'Unknown';var data=window.__adorable_profiler_data;var last=data.length>0?data[data.length-1]:null;if(!last||(performance.now()-last.timestamp)>16){window.__adorable_profiler_cycle++;data.push({id:window.__adorable_profiler_cycle,timestamp:performance.now(),duration:0,components:[]});last=data[data.length-1];}last.duration+=dur;var ex=last.components.find(function(c){return c.name===name;});if(ex)ex.duration+=dur;else last.components.push({name:name,duration:dur});}});return{status:'recording'};}return{error:'Profiler API not available'};})()`;
      } else {
        expression = `(function(){if(window.ng&&window.ng.ɵsetProfiler)window.ng.ɵsetProfiler(null);return window.__adorable_profiler_data||[];})()`;
      }

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `inspect_performance failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data.result?.value ?? data.result ?? data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `inspect_performance failed: ${err.message}`, isError: true };
    }
  }
};

export const inspectRoutes: Tool = {
  definition: {
    name: 'inspect_routes',
    description: 'Get the current Angular route configuration and active route. Returns the route tree with paths, components, guards, lazy-loading indicators, and which route is currently active.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'Inspect tools are only available in desktop mode with the preview running.', isError: true };
    }

    try {
      const expression = `(function(){try{if(!window.ng)return{routes:[],activeRoute:'',debug:'no ng'};var appRoot=document.querySelector('[ng-version]')||document.querySelector('app-root')||document.querySelector('[_ong]');if(!appRoot&&window.ng.getRootComponents){try{var rc=window.ng.getRootComponents();if(rc&&rc.length>0&&window.ng.getHostElement)appRoot=window.ng.getHostElement(rc[0]);}catch(e){}}if(!appRoot){var els=document.querySelectorAll('*');for(var ei=0;ei<els.length;ei++){try{var ti=window.ng.getInjector(els[ei]);if(ti){appRoot=els[ei];break;}}catch(e){}}}if(!appRoot)return{routes:[],activeRoute:'',debug:'no root'};var inj=window.ng.getInjector(appRoot);if(!inj)return{routes:[],activeRoute:'',debug:'no injector'};var router=null;var injList=[inj];if(window.ng.ɵgetInjectorResolutionPath){try{var rpath=window.ng.ɵgetInjectorResolutionPath(inj);if(rpath)for(var ri=0;ri<rpath.length;ri++){if(rpath[ri]!==inj)injList.push(rpath[ri]);}}catch(e){}}for(var ii=0;ii<injList.length&&!router;ii++){var si=injList[ii];if(window.ng.ɵgetRouterInstance){try{router=window.ng.ɵgetRouterInstance(si);if(router)break;}catch(e){}}if(window.ng.ɵgetInjectorProviders){try{var pp=window.ng.ɵgetInjectorProviders(si);for(var pi=0;pi<pp.length;pi++){try{var v=si.get(pp[pi].token);if(v&&v.config&&typeof v.url!=='undefined'){router=v;break;}}catch(e){}}}catch(e){}}}if(!router||!router.config)return{routes:[],activeRoute:'',debug:'router not found'};var url='';try{url=router.url||'';}catch(e){}var glr=window.ng.ɵgetLoadedRoutes||function(){return undefined;};function map(cfgs){var res=[];for(var i=0;i<cfgs.length;i++){var r=cfgs[i];var path=r.path;if(path===undefined||path===null)path='';var comp='';if(r.component)comp=r.component.name||'';var guards=[];if(r.canActivate)for(var g=0;g<r.canActivate.length;g++){var gd=r.canActivate[g];guards.push(typeof gd==='function'?(gd.name||'guard'):'guard');}var lazy=!!r.loadComponent||!!r.loadChildren;var children=r.children?map(r.children):[];var lc=glr(r);if(lc&&lc.length>0)children=children.concat(map(lc));var fp='/'+path;var isActive=url===fp||(path&&url.startsWith(fp+'/'))||(path===''&&url==='/');res.push({path:path===''?'(root)':path,component:comp,active:isActive,guards:guards,lazy:lazy,children:children});}return res;}return{routes:map(router.config),activeRoute:url};}catch(e){return{routes:[],activeRoute:'',debug:'error:'+e.message};}})()`;

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `inspect_routes failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data.result?.value ?? data.result ?? data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `inspect_routes failed: ${err.message}`, isError: true };
    }
  }
};

export const inspectSignals: Tool = {
  definition: {
    name: 'inspect_signals',
    description: 'Get the Angular signal dependency graph. Returns signal, computed, and effect nodes with their dependency edges. Requires Angular 19+ with signal graph debug APIs.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'Inspect tools are only available in desktop mode with the preview running.', isError: true };
    }

    try {
      const expression = `(function(){if(!window.ng||!window.ng.ɵgetSignalGraph)return{available:false};try{var root=document.querySelector('app-root')||document.querySelector('[_ong]');if(!root)return{available:false};var inj=window.ng.getInjector(root);var graph=window.ng.ɵgetSignalGraph(inj);if(!graph)return{available:true,nodes:[],edges:[]};var nodes=[];var edges=[];if(graph.nodes)graph.nodes.forEach(function(n,i){var val='';try{val=JSON.stringify(n.value).substring(0,100);}catch(e){}nodes.push({id:String(n.id||i),label:n.label||n.name||'node-'+i,type:n.type||'signal',value:val});});if(graph.edges)graph.edges.forEach(function(e){edges.push({from:String(e.source||e.from),to:String(e.target||e.to)});});return{available:true,nodes:nodes,edges:edges};}catch(e){return{available:false,error:e.message};}})()`;

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `inspect_signals failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data.result?.value ?? data.result ?? data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `inspect_signals failed: ${err.message}`, isError: true };
    }
  }
};
