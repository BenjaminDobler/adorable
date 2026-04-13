/**
 * build-kit-graph.ts
 *
 * Reads UI5 Web Components custom-elements.json files (CEM) + the Horizon
 * theme CSS bundle and emits:
 *   - ui5-kit-graph.json   full graph (nodes + edges)
 *   - ui5-kit-summary.md   compact summary for LLM system-prompt injection
 *
 * Run:  npx tsx build-kit-graph.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NgxWrapper } from './parse-ngx-snapshots';

// ---------- paths ----------

const ROOT = __dirname;
const NM = join(ROOT, 'node_modules', '@ui5');
const NGX_WRAPPERS_PATH = join(ROOT, 'ngx-wrappers.json');

const CEM_FILES: Array<{ pkg: string; path: string }> = [
  { pkg: '@ui5/webcomponents', path: join(NM, 'webcomponents/dist/custom-elements.json') },
  { pkg: '@ui5/webcomponents-fiori', path: join(NM, 'webcomponents-fiori/dist/custom-elements.json') },
  { pkg: '@ui5/webcomponents-base', path: join(NM, 'webcomponents-base/dist/custom-elements.json') },
];

const HORIZON_BUNDLE = join(
  NM,
  'webcomponents-theming/dist/generated/themes/sap_horizon/parameters-bundle.css.js',
);

// ---------- graph types ----------

type NodeKind =
  | 'component'
  | 'slot'
  | 'property'
  | 'event'
  | 'cssPart'
  | 'themeVariable'
  | 'theme'
  | 'package';

interface Node {
  id: string;
  kind: NodeKind;
  label: string;
  package?: string;
  description?: string;
  data?: Record<string, unknown>;
}

type EdgeKind =
  | 'has_slot'
  | 'has_property'
  | 'fires_event'
  | 'has_css_part'
  | 'in_package'
  | 'extends'
  | 'themed_by'
  | 'theme_contains';

interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
}

interface Graph {
  meta: {
    generatedAt: string;
    ui5Version: string;
    horizon: boolean;
    componentCount: number;
    themeVarCount: number;
  };
  nodes: Node[];
  edges: Edge[];
}

const nodes = new Map<string, Node>();
const edges: Edge[] = [];

function addNode(n: Node) {
  if (!nodes.has(n.id)) nodes.set(n.id, n);
}
function addEdge(e: Edge) {
  edges.push(e);
}

// ---------- utils ----------

function firstSentence(desc?: string): string {
  if (!desc) return '';
  const clean = desc
    .replace(/^#+\s*Overview\s*/im, '')
    .replace(/^#+\s+.*$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const dot = clean.indexOf('. ');
  return dot === -1 ? clean : clean.slice(0, dot + 1);
}

function shortPkg(pkg?: string): string {
  if (!pkg) return 'unknown';
  if (pkg === '@ui5/webcomponents') return 'main';
  if (pkg === '@ui5/webcomponents-fiori') return 'fiori';
  if (pkg === '@ui5/webcomponents-base') return 'base';
  return pkg;
}

// ---------- CEM ingestion ----------

interface CemMember {
  kind: string;
  name: string;
  privacy?: string;
  description?: string;
  default?: string;
  type?: { text?: string };
  readonly?: boolean;
  static?: boolean;
}
interface CemSlot {
  name: string;
  description?: string;
}
interface CemEvent {
  name: string;
  description?: string;
  type?: { text?: string };
}
interface CemCssPart {
  name: string;
  description?: string;
}
interface CemDeclaration {
  kind: string;
  name: string;
  description?: string;
  tagName?: string;
  customElement?: boolean;
  superclass?: { name?: string; package?: string };
  slots?: CemSlot[];
  members?: CemMember[];
  events?: CemEvent[];
  cssParts?: CemCssPart[];
}
interface CemModule {
  kind: string;
  path: string;
  declarations?: CemDeclaration[];
}
interface Cem {
  schemaVersion?: string;
  modules: CemModule[];
}

let componentCount = 0;

for (const { pkg, path } of CEM_FILES) {
  const cem: Cem = JSON.parse(readFileSync(path, 'utf8'));
  addNode({ id: `pkg:${pkg}`, kind: 'package', label: pkg });

  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.kind !== 'class' || !decl.customElement || !decl.tagName) continue;
      componentCount++;

      const compId = `comp:${decl.tagName}`;
      addNode({
        id: compId,
        kind: 'component',
        label: decl.tagName,
        package: pkg,
        description: decl.description,
        data: {
          className: decl.name,
          modulePath: mod.path,
          importPath: `${pkg}/${mod.path}`,
          superclass: decl.superclass?.name,
        },
      });
      addEdge({ from: compId, to: `pkg:${pkg}`, kind: 'in_package' });

      if (decl.superclass?.name) {
        addEdge({ from: compId, to: `comp:super:${decl.superclass.name}`, kind: 'extends' });
      }

      for (const slot of decl.slots ?? []) {
        const id = `slot:${decl.tagName}:${slot.name}`;
        addNode({
          id,
          kind: 'slot',
          label: slot.name,
          description: slot.description,
        });
        addEdge({ from: compId, to: id, kind: 'has_slot' });
      }

      for (const m of decl.members ?? []) {
        if (m.kind !== 'field' || m.privacy !== 'public' || m.static) continue;
        const id = `prop:${decl.tagName}:${m.name}`;
        addNode({
          id,
          kind: 'property',
          label: m.name,
          description: m.description,
          data: {
            type: m.type?.text,
            default: m.default,
            readonly: m.readonly ?? false,
          },
        });
        addEdge({ from: compId, to: id, kind: 'has_property' });
      }

      for (const ev of decl.events ?? []) {
        const id = `event:${decl.tagName}:${ev.name}`;
        addNode({
          id,
          kind: 'event',
          label: ev.name,
          description: ev.description,
          data: { type: ev.type?.text },
        });
        addEdge({ from: compId, to: id, kind: 'fires_event' });
      }

      for (const part of decl.cssParts ?? []) {
        const id = `csspart:${decl.tagName}:${part.name}`;
        addNode({
          id,
          kind: 'cssPart',
          label: part.name,
          description: part.description,
        });
        addEdge({ from: compId, to: id, kind: 'has_css_part' });
      }
    }
  }
}

// ---------- ngx wrapper join ----------
// Reads ngx-wrappers.json (produced by parse-ngx-snapshots.ts) and attaches
// Angular wrapper metadata to each matching component node. This is the layer
// that teaches the LLM "use the ngx wrapper, not the raw custom element".

let ngxJoinCount = 0;
let ngxMissingCount = 0;
if (!existsSync(NGX_WRAPPERS_PATH)) {
  console.warn(`⚠ ngx-wrappers.json not found. Run: npx tsx parse-ngx-snapshots.ts`);
} else {
  const ngxMap = JSON.parse(readFileSync(NGX_WRAPPERS_PATH, 'utf8')) as Record<string, NgxWrapper>;
  for (const node of nodes.values()) {
    if (node.kind !== 'component') continue;
    const w = ngxMap[node.label];
    if (!w) {
      ngxMissingCount++;
      continue;
    }
    // Attach ngx data to the component node
    node.data = {
      ...node.data,
      ngx: {
        componentClass: w.componentClass,
        importModule: w.importModule,
        importPath: w.importPath,
        exportAs: w.exportAs,
        inputs: w.inputs,
        outputs: w.outputs,          // { 'dom-event': 'ui5Name' }
        outputNames: w.outputNames,  // ['ui5Name', ...]
      },
    };
    ngxJoinCount++;

    // Also register a per-output "renamed" alias so query_kit can answer
    // "what's the Angular output for selection-change on ui5-list?"
    for (const [domEvent, ngxName] of Object.entries(w.outputs)) {
      const evNode = byIdLookup(`event:${node.label}:${domEvent}`);
      if (evNode) {
        evNode.data = { ...(evNode.data ?? {}), ngxName };
      }
    }
  }
}

function byIdLookup(id: string): Node | undefined {
  return nodes.get(id);
}

// ---------- Horizon theme ingestion ----------

addNode({ id: 'theme:sap_horizon', kind: 'theme', label: 'sap_horizon' });

const themeSrc = readFileSync(HORIZON_BUNDLE, 'utf8');
// Extract --sap* CSS variables and their values from the compiled bundle.
const varRe = /(--sap[A-Za-z0-9_]+)\s*:\s*([^;]+);/g;
const seenVars = new Set<string>();
let themeVarCount = 0;
let match: RegExpExecArray | null;
while ((match = varRe.exec(themeSrc)) !== null) {
  const [, name, rawValue] = match;
  if (seenVars.has(name)) continue;
  seenVars.add(name);
  const value = rawValue.trim();
  const id = `themevar:${name}`;
  addNode({
    id,
    kind: 'themeVariable',
    label: name,
    data: { value, category: categorizeVar(name) },
  });
  addEdge({ from: 'theme:sap_horizon', to: id, kind: 'theme_contains' });
  themeVarCount++;
}

function categorizeVar(name: string): string {
  // --sapBrandColor, --sapButton_Background, --sapElement_Height, etc.
  const stripped = name.replace(/^--sap/, '');
  const firstUnderscore = stripped.indexOf('_');
  if (firstUnderscore !== -1) return stripped.slice(0, firstUnderscore);
  // no underscore: categorize by leading capitalized word
  const m = stripped.match(/^([A-Z][a-z]+)/);
  return m ? m[1] : 'Other';
}

// Heuristic: link components to theme vars whose category matches the
// component's class name stem. e.g. ui5-button ↔ --sapButton_*
for (const node of nodes.values()) {
  if (node.kind !== 'component') continue;
  const className = (node.data?.className as string) ?? '';
  if (!className) continue;
  // match theme vars with category === className (e.g. Button, List, Card)
  for (const vnode of nodes.values()) {
    if (vnode.kind !== 'themeVariable') continue;
    const cat = (vnode.data?.category as string) ?? '';
    if (cat === className) {
      addEdge({ from: node.id, to: vnode.id, kind: 'themed_by' });
    }
  }
}

// ---------- write outputs ----------

const pkgJson = JSON.parse(
  readFileSync(join(NM, 'webcomponents/package.json'), 'utf8'),
) as { version: string };

const graph: Graph = {
  meta: {
    generatedAt: new Date().toISOString(),
    ui5Version: pkgJson.version,
    horizon: true,
    componentCount,
    themeVarCount,
  },
  nodes: [...nodes.values()],
  edges,
};

writeFileSync(join(ROOT, 'ui5-kit-graph.json'), JSON.stringify(graph, null, 2));

// ---------- summary markdown (for LLM injection) ----------

const components = [...nodes.values()].filter((n) => n.kind === 'component');
const componentsByPkg = new Map<string, Node[]>();
for (const c of components) {
  const p = c.package ?? 'unknown';
  if (!componentsByPkg.has(p)) componentsByPkg.set(p, []);
  componentsByPkg.get(p)!.push(c);
}

// degree ranking for "god nodes"
const degree = new Map<string, number>();
for (const e of edges) {
  degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
  degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
}
const godNodes = components
  .map((c) => ({ c, d: degree.get(c.id) ?? 0 }))
  .sort((a, b) => b.d - a.d)
  .slice(0, 15);

const themeCategories = new Map<string, number>();
for (const n of nodes.values()) {
  if (n.kind !== 'themeVariable') continue;
  const cat = (n.data?.category as string) ?? 'Other';
  themeCategories.set(cat, (themeCategories.get(cat) ?? 0) + 1);
}
const topThemeCats = [...themeCategories.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

const md: string[] = [];
md.push(`# UI5 Web Components Kit (Angular / @ui5/webcomponents-ngx) — Horizon theme`);
md.push(``);
md.push(`UI5 version: \`${graph.meta.ui5Version}\` · ngx wrappers joined: ${ngxJoinCount} · generated ${graph.meta.generatedAt}`);
md.push(``);
md.push(`**${componentCount} components** indexed, **${themeVarCount}** Horizon theme variables captured.`);
md.push(``);

md.push(`## MANDATORY usage pattern — read before writing any UI5 code`);
md.push(``);
md.push(`This kit targets the **\`@ui5/webcomponents-ngx\` Angular wrappers**, NOT the raw web components. Follow this pattern exactly:`);
md.push(``);
md.push(`### ✅ Do this`);
md.push(``);
md.push('```ts');
md.push(`import { Component, signal } from '@angular/core';`);
md.push(`// Import the Angular wrapper COMPONENT CLASSES, not the raw dist files:`);
md.push(`import { ButtonComponent } from '@ui5/webcomponents-ngx/main/button';`);
md.push(`import { ListComponent } from '@ui5/webcomponents-ngx/main/list';`);
md.push(`import { ListItemStandardComponent } from '@ui5/webcomponents-ngx/main/list-item-standard';`);
md.push(`import { ShellBarComponent } from '@ui5/webcomponents-ngx/fiori/shell-bar';`);
md.push(`// Theme setup — call ONCE per app, at module load:`);
md.push(`import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';`);
md.push(`setTheme('sap_horizon'); // or 'sap_horizon_dark', 'sap_horizon_hcb', etc.`);
md.push(``);
md.push(`@Component({`);
md.push(`  selector: 'app-products',`);
md.push(`  standalone: true,`);
md.push(`  imports: [ButtonComponent, ListComponent, ListItemStandardComponent, ShellBarComponent],`);
md.push(`  // NO schemas — the ngx wrappers are real Angular components`);
md.push(`  template: \\\``);
md.push(`    <ui5-shellbar [primaryTitle]="'Products'" (ui5ProfileClick)="onProfileClick()" />`);
md.push(`    <ui5-list [selectionMode]="'Single'" (ui5SelectionChange)="onSelect($event)">`);
md.push(`      @for (p of products(); track p.id) {`);
md.push(`        <ui5-li [description]="p.category">{{ p.name }}</ui5-li>`);
md.push(`      }`);
md.push(`    </ui5-list>`);
md.push(`    <ui5-button [design]="'Emphasized'" (ui5Click)="save()">Save</ui5-button>`);
md.push(`  \\\`,`);
md.push(`})`);
md.push(`export class ProductsComponent { /* ... */ }`);
md.push('```');
md.push(``);
md.push(`### ❌ Do NOT do these things`);
md.push(``);
md.push(`1. **DO NOT use \`CUSTOM_ELEMENTS_SCHEMA\`.** The ngx wrappers are real Angular components, not custom elements. Using the schema means you imported the wrong thing.`);
md.push(`2. **DO NOT use \`[attr.xxx]="..."\` bindings.** The wrappers expose real Angular \`@Input()\`s — write \`[design]="..."\`, not \`[attr.design]="..."\`. If the binding requires \`[attr.]\`, you are using a property that doesn't exist in the wrapper.`);
md.push(`3. **DO NOT bind raw DOM event names.** UI5 events are renamed as Angular outputs with a \`ui5\` prefix: \`click\` → \`ui5Click\`, \`selection-change\` → \`ui5SelectionChange\`, \`item-click\` → \`ui5ItemClick\`. Always use \`(ui5Xxx)\`, never \`(click)\` or \`(selection-change)\` on a ui5 element.`);
md.push(`4. **DO NOT import from \`@ui5/webcomponents/dist/*\`.** That's the raw custom-element side. Import Angular wrapper classes from \`@ui5/webcomponents-ngx/main/{component}\` or \`@ui5/webcomponents-ngx/fiori/{component}\` — each component has its own subpath (e.g. \`@ui5/webcomponents-ngx/main/button\`, \`@ui5/webcomponents-ngx/fiori/shell-bar\`). Check each component's doc for the exact import path.`);
md.push(`5. **DO NOT use kebab-case attribute bindings** like \`title-text="..."\` or \`[attr.subtitle-text]="..."\`. Use camelCase inputs: \`[titleText]="..."\`, \`[subtitleText]="..."\`.`);
md.push(`6. **Event payloads are unwrapped.** The ngx wrappers emit the \`detail\` object directly from the EventEmitter. Access properties on the event itself (e.g. \`event.selectedItems\`), NOT via \`event.detail.selectedItems\`. The \`.detail\` wrapper is already removed for you.`);
md.push(``);
md.push(`### Example — events renamed`);
md.push(``);
md.push(`| Component | DOM event | Angular output (use this) |`);
md.push(`|---|---|---|`);
md.push(`| \`<ui5-button>\` | \`click\` | \`(ui5Click)\` |`);
md.push(`| \`<ui5-list>\` | \`selection-change\` | \`(ui5SelectionChange)\` |`);
md.push(`| \`<ui5-list>\` | \`item-click\` | \`(ui5ItemClick)\` |`);
md.push(`| \`<ui5-side-navigation>\` | \`selection-change\` | \`(ui5SelectionChange)\` |`);
md.push(`| \`<ui5-shellbar>\` | \`profile-click\` | \`(ui5ProfileClick)\` |`);
md.push(`| \`<ui5-shellbar>\` | \`notifications-click\` | \`(ui5NotificationsClick)\` |`);
md.push(`| \`<ui5-tabcontainer>\` | \`tab-select\` | \`(ui5TabSelect)\` |`);
md.push(``);
md.push(`For any component you use, call \`query_kit("<ui5-tag>")\` to see the exact list of Angular inputs, ngx-renamed outputs, import module, and the component class name to import.`);
md.push(``);
md.push(`### Module mapping`);
md.push(``);
md.push(`- Components from \`@ui5/webcomponents\` → import from **\`@ui5/webcomponents-ngx/main/{component}\`** (e.g. \`/main/button\`, \`/main/list\`)`);
md.push(`- Components from \`@ui5/webcomponents-fiori\` → import from **\`@ui5/webcomponents-ngx/fiori/{component}\`** (e.g. \`/fiori/shell-bar\`, \`/fiori/illustrated-message\`)`);
md.push(``);
md.push(`## Theming (Horizon)`);
md.push(``);
md.push(`Horizon is the default modern SAP theme. Set it explicitly:`);
md.push(``);
md.push(`\`\`\`ts`);
md.push(`import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';`);
md.push(`setTheme('sap_horizon');`);
md.push(`\`\`\``);
md.push(``);
md.push(`Customise via CSS variables (on \`:root\` or any ancestor). Top theme variable categories:`);
md.push(``);
for (const [cat, n] of topThemeCats) {
  md.push(`- **${cat}** — ${n} variables`);
}
md.push(``);
md.push(
  `All theme variables are named \`--sap*\` and are semantic, not physical (prefer \`--sapBrandColor\` over hardcoded hex values).`,
);
md.push(``);
md.push(`## God-node components (most connected)`);
md.push(``);
md.push(`These are the components with the richest API surfaces. Use them as anchors when composing layouts.`);
md.push(``);
for (const { c, d } of godNodes) {
  md.push(`- \`<${c.label}>\` (${shortPkg(c.package)}) — ${d} connections — ${firstSentence(c.description)}`);
}
md.push(``);
md.push(`## Component index by package`);
md.push(``);
for (const [pkg, comps] of componentsByPkg) {
  md.push(`### ${pkg} (${comps.length})`);
  md.push(``);
  md.push(comps.map((c) => `\`${c.label}\``).sort().join(', '));
  md.push(``);
}
md.push(``);
md.push(`## Graph query tool`);
md.push(``);
md.push(
  `For detailed API info on any component (slots, properties, events, CSS parts, theme variables) use \`query_kit("ui5", "<ui5-tagName>")\`. Prefer this over reading source files.`,
);
md.push(``);

writeFileSync(join(ROOT, 'ui5-kit-summary.md'), md.join('\n'));

// ---------- console report ----------

console.log('✓ Wrote ui5-kit-graph.json');
console.log('✓ Wrote ui5-kit-summary.md');
console.log('');
console.log(`UI5 version:          ${graph.meta.ui5Version}`);
console.log(`Components:           ${componentCount}`);
console.log(`Nodes total:          ${nodes.size}`);
console.log(`Edges total:          ${edges.length}`);
console.log(`Horizon theme vars:   ${themeVarCount}`);
console.log('');
console.log('Node kind breakdown:');
const kindCounts = new Map<string, number>();
for (const n of nodes.values()) kindCounts.set(n.kind, (kindCounts.get(n.kind) ?? 0) + 1);
for (const [k, v] of [...kindCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(16)} ${v}`);
}
console.log('');
console.log('Edge kind breakdown:');
const edgeCounts = new Map<string, number>();
for (const e of edges) edgeCounts.set(e.kind, (edgeCounts.get(e.kind) ?? 0) + 1);
for (const [k, v] of [...edgeCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(16)} ${v}`);
}
