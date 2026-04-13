/**
 * query-kit.ts
 *
 * Implementation of the `query_kit` tool the LLM can call. Loads the graph
 * once and answers focused queries about UI5 components: slots, properties,
 * events, CSS parts, and theme variables.
 *
 * Query syntax:
 *   - "ui5-button"                → full component dump (all slots/props/events)
 *   - "ui5-button.design"         → property detail
 *   - "ui5-button@click"          → event detail
 *   - "ui5-button#header"         → slot detail
 *   - "theme:button"              → list theme vars in the Button category
 *   - "theme:--sapBrandColor"     → exact theme variable lookup
 *   - "find:list"                 → fuzzy search component labels
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Node {
  id: string;
  kind: string;
  label: string;
  package?: string;
  description?: string;
  data?: Record<string, unknown>;
}
interface Edge {
  from: string;
  to: string;
  kind: string;
}
interface Graph {
  meta: Record<string, unknown>;
  nodes: Node[];
  edges: Edge[];
}

let graph: Graph | null = null;
const byId = new Map<string, Node>();
const fromIndex = new Map<string, Edge[]>();

function load() {
  if (graph) return;
  const path = join(__dirname, 'ui5-kit-graph.json');
  graph = JSON.parse(readFileSync(path, 'utf8')) as Graph;
  for (const n of graph.nodes) byId.set(n.id, n);
  for (const e of graph.edges) {
    if (!fromIndex.has(e.from)) fromIndex.set(e.from, []);
    fromIndex.get(e.from)!.push(e);
  }
}

function neighborsOf(id: string, kind?: string): Node[] {
  const out: Node[] = [];
  for (const e of fromIndex.get(id) ?? []) {
    if (kind && e.kind !== kind) continue;
    const n = byId.get(e.to);
    if (n) out.push(n);
  }
  return out;
}

function shortDesc(d?: string, max = 200): string {
  if (!d) return '';
  const cleaned = d
    .replace(/^#+\s+.*$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned;
}

interface NgxMeta {
  componentClass: string;
  importModule: string;
  importPath: string;
  exportAs?: string;
  inputs: string[];
  outputs: Record<string, string>;
  outputNames: string[];
}

function dumpComponent(tag: string): string {
  const id = `comp:${tag}`;
  const c = byId.get(id);
  if (!c) return `Component "${tag}" not found in graph. Did you mean: ${suggest(tag)}?`;

  const slots = neighborsOf(id, 'has_slot');
  const props = neighborsOf(id, 'has_property');
  const events = neighborsOf(id, 'fires_event');
  const cssParts = neighborsOf(id, 'has_css_part');
  const themed = neighborsOf(id, 'themed_by');
  const ngx = c.data?.ngx as NgxMeta | undefined;

  const lines: string[] = [];
  lines.push(`# <${tag}>`);
  if (ngx) {
    lines.push(`Angular wrapper: ${ngx.componentClass}`);
    lines.push(`Import:          import { ${ngx.componentClass} } from '${ngx.importPath}';`);
    lines.push(`Template tag:    <${tag}>  (same as raw custom element)`);
  } else {
    lines.push(`⚠  No @ui5/webcomponents-ngx Angular wrapper found for this tag. It may be an internal/private component — consider using an alternative.`);
  }
  lines.push('');
  lines.push(shortDesc(c.description, 400));
  lines.push('');

  if (slots.length) {
    lines.push(`## Slots (${slots.length})`);
    for (const s of slots) {
      lines.push(`- **${s.label}** — ${shortDesc(s.description, 140)}`);
    }
    lines.push('');
  }

  if (ngx && ngx.inputs.length) {
    lines.push(`## Angular @Input()s (${ngx.inputs.length})`);
    lines.push(`Use as property bindings: \`[inputName]="value"\`. NEVER write \`[attr.inputName]\`.`);
    lines.push('');
    // Merge CEM descriptions with ngx input list
    const propByName = new Map(props.map((p) => [p.label, p]));
    for (const input of ngx.inputs) {
      const p = propByName.get(input);
      const t = (p?.data?.type as string) ?? '';
      const def = p?.data?.default ? ` = ${p.data.default}` : '';
      const desc = shortDesc(p?.description, 100);
      lines.push(`- \`[${input}]\`${t ? `: ${t}` : ''}${def}${desc ? ` — ${desc}` : ''}`);
    }
    lines.push('');
  } else if (props.length) {
    // No ngx wrapper — fall back to raw CEM props (should be rare)
    lines.push(`## Properties (${props.length}, raw web-component only)`);
    for (const p of props) {
      const t = (p.data?.type as string) ?? '';
      const def = p.data?.default ? ` = ${p.data.default}` : '';
      lines.push(`- **${p.label}**: ${t}${def} — ${shortDesc(p.description, 120)}`);
    }
    lines.push('');
  }

  if (ngx && Object.keys(ngx.outputs).length) {
    lines.push(`## Angular @Output()s (${Object.keys(ngx.outputs).length}) — RENAMED from DOM event names`);
    lines.push(`Bind these in templates as \`(ui5Xxx)\`. The raw DOM event name shown on the left is NOT what you bind in Angular.`);
    lines.push('');
    lines.push(`| DOM event (don't use) | Angular output (use this) | Description |`);
    lines.push(`|---|---|---|`);
    const eventByName = new Map(events.map((e) => [e.label, e]));
    for (const [domName, ngxName] of Object.entries(ngx.outputs)) {
      const ev = eventByName.get(domName);
      const desc = shortDesc(ev?.description, 80);
      lines.push(`| \`${domName}\` | **\`(${ngxName})\`** | ${desc} |`);
    }
    lines.push('');
  } else if (events.length) {
    lines.push(`## Events (${events.length}, raw DOM — no ngx wrapper)`);
    for (const e of events) {
      const t = (e.data?.type as string) ?? '';
      lines.push(`- **${e.label}** ${t} — ${shortDesc(e.description, 120)}`);
    }
    lines.push('');
  }

  if (cssParts.length) {
    lines.push(`## CSS Parts (${cssParts.length})`);
    for (const p of cssParts) {
      lines.push(`- **${p.label}** — ${shortDesc(p.description, 100)}`);
    }
    lines.push('');
  }

  if (themed.length) {
    lines.push(`## Theme variables (${themed.length})`);
    for (const v of themed.slice(0, 25)) {
      const val = v.data?.value ? ` = ${v.data.value}` : '';
      lines.push(`- ${v.label}${val}`);
    }
    if (themed.length > 25) lines.push(`...and ${themed.length - 25} more`);
    lines.push('');
  }

  lines.push(`## Angular usage example`);
  lines.push('```ts');
  if (ngx) {
    lines.push(`// In your standalone component's imports array:`);
    lines.push(`import { ${ngx.componentClass} } from '${ngx.importPath}';`);
    lines.push(`// @Component({ imports: [${ngx.componentClass}, ...] })`);
  }
  lines.push('```');
  lines.push('```html');
  if (ngx && ngx.inputs.length > 0) {
    const sampleInput = ngx.inputs[0];
    const firstOutput = Object.values(ngx.outputs)[0];
    const openTag = `<${tag} [${sampleInput}]="..."${firstOutput ? ` (${firstOutput})="on${firstOutput.replace(/^ui5/, '')}($event)"` : ''}>`;
    lines.push(`${openTag}</${tag}>`);
  } else {
    lines.push(`<${tag}></${tag}>`);
  }
  lines.push('```');

  return lines.join('\n');
}

function exampleAttrs(props: Node[]): string {
  // Pick up to 2 short string-or-enum properties for the example tag.
  const pick = props
    .filter((p) => {
      const t = ((p.data?.type as string) ?? '').toLowerCase();
      return /string|undefined/.test(t) && !/array|record|map/.test(t);
    })
    .slice(0, 2);
  return pick.map((p) => ` ${kebab(p.label)}=""`).join('');
}

function kebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

function dumpProperty(tag: string, prop: string): string {
  const node = byId.get(`prop:${tag}:${prop}`);
  if (!node) return `Property ${prop} not found on <${tag}>.`;
  return `**<${tag}>.${prop}**\nType: ${node.data?.type}\nDefault: ${node.data?.default ?? '(none)'}\n\n${shortDesc(node.description, 600)}`;
}

function dumpEvent(tag: string, ev: string): string {
  const node = byId.get(`event:${tag}:${ev}`);
  if (!node) return `Event ${ev} not found on <${tag}>.`;
  return `**<${tag}> @${ev}**\nType: ${node.data?.type}\n\n${shortDesc(node.description, 600)}`;
}

function dumpSlot(tag: string, slot: string): string {
  const node = byId.get(`slot:${tag}:${slot}`);
  if (!node) return `Slot ${slot} not found on <${tag}>.`;
  return `**<${tag}> #${slot}**\n\n${shortDesc(node.description, 600)}`;
}

function dumpThemeCategory(category: string): string {
  load();
  const want = category.toLowerCase();
  const matches = graph!.nodes.filter(
    (n) => n.kind === 'themeVariable' && ((n.data?.category as string) ?? '').toLowerCase() === want,
  );
  if (!matches.length) return `No theme category "${category}" found.`;
  const lines = [`# Horizon theme variables — ${category} (${matches.length})`];
  for (const v of matches.slice(0, 50)) {
    lines.push(`- ${v.label} = ${v.data?.value}`);
  }
  if (matches.length > 50) lines.push(`...and ${matches.length - 50} more`);
  return lines.join('\n');
}

function dumpThemeVar(name: string): string {
  load();
  const v = byId.get(`themevar:${name}`);
  if (!v) {
    const close = graph!.nodes
      .filter((n) => n.kind === 'themeVariable' && n.label.toLowerCase().includes(name.toLowerCase().replace(/^--/, '')))
      .slice(0, 8);
    if (!close.length) return `Theme variable "${name}" not found.`;
    return `Did you mean:\n${close.map((n) => `- ${n.label} = ${n.data?.value}`).join('\n')}`;
  }
  return `${v.label} = ${v.data?.value}\nCategory: ${v.data?.category}`;
}

function fuzzyFindComponents(needle: string): string {
  load();
  const want = needle.toLowerCase();
  const matches = graph!.nodes
    .filter((n) => n.kind === 'component' && n.label.toLowerCase().includes(want))
    .slice(0, 25);
  if (!matches.length) return `No components matching "${needle}".`;
  return matches.map((m) => `- <${m.label}> — ${shortDesc(m.description, 100)}`).join('\n');
}

function suggest(tag: string): string {
  load();
  const want = tag.toLowerCase().replace(/^ui5-?/, '');
  const close = graph!.nodes
    .filter((n) => n.kind === 'component' && n.label.toLowerCase().includes(want))
    .slice(0, 5)
    .map((n) => n.label);
  return close.length ? close.join(', ') : '(no close matches)';
}

export function queryKit(query: string): string {
  load();
  const q = query.trim();

  // theme:category or theme:--var
  if (q.startsWith('theme:')) {
    const arg = q.slice('theme:'.length);
    if (arg.startsWith('--')) return dumpThemeVar(arg);
    return dumpThemeCategory(arg);
  }

  if (q.startsWith('find:')) {
    return fuzzyFindComponents(q.slice('find:'.length));
  }

  // ui5-tag.property
  const propMatch = q.match(/^(ui5-[a-z0-9-]+)\.([A-Za-z0-9_]+)$/);
  if (propMatch) return dumpProperty(propMatch[1], propMatch[2]);

  // ui5-tag@event
  const eventMatch = q.match(/^(ui5-[a-z0-9-]+)@([A-Za-z0-9-]+)$/);
  if (eventMatch) return dumpEvent(eventMatch[1], eventMatch[2]);

  // ui5-tag#slot
  const slotMatch = q.match(/^(ui5-[a-z0-9-]+)#([A-Za-z0-9-]+)$/);
  if (slotMatch) return dumpSlot(slotMatch[1], slotMatch[2]);

  // bare ui5-tag
  if (q.startsWith('ui5-')) return dumpComponent(q);

  // fallback fuzzy
  return fuzzyFindComponents(q);
}

/**
 * Hallucination check helper. Returns whether a (tag, attr/event/slot) is valid.
 */
export function validateUsage(): {
  hasComponent(tag: string): boolean;
  hasProperty(tag: string, prop: string): boolean;
  hasEvent(tag: string, ev: string): boolean;
  hasSlot(tag: string, slot: string): boolean;
  hasNgxInput(tag: string, input: string): boolean;
  hasNgxOutput(tag: string, output: string): boolean;
  getNgxOutputFor(tag: string, domEventName: string): string | null;
  getNgxMeta(tag: string): NgxMeta | null;
  componentCount(): number;
} {
  load();
  return {
    hasComponent: (tag) => byId.has(`comp:${tag}`),
    hasProperty: (tag, prop) => byId.has(`prop:${tag}:${prop}`),
    hasEvent: (tag, ev) => byId.has(`event:${tag}:${ev}`),
    hasSlot: (tag, slot) => byId.has(`slot:${tag}:${slot}`),
    hasNgxInput: (tag, input) => {
      const c = byId.get(`comp:${tag}`);
      const ngx = c?.data?.ngx as NgxMeta | undefined;
      return !!ngx && ngx.inputs.includes(input);
    },
    hasNgxOutput: (tag, output) => {
      const c = byId.get(`comp:${tag}`);
      const ngx = c?.data?.ngx as NgxMeta | undefined;
      return !!ngx && ngx.outputNames.includes(output);
    },
    getNgxOutputFor: (tag, domEventName) => {
      const c = byId.get(`comp:${tag}`);
      const ngx = c?.data?.ngx as NgxMeta | undefined;
      return ngx?.outputs[domEventName] ?? null;
    },
    getNgxMeta: (tag) => {
      const c = byId.get(`comp:${tag}`);
      return (c?.data?.ngx as NgxMeta | undefined) ?? null;
    },
    componentCount: () => graph!.nodes.filter((n) => n.kind === 'component').length,
  };
}
