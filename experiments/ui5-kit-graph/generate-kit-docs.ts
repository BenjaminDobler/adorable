/**
 * generate-kit-docs.ts
 *
 * Reads ui5-kit-graph.json and emits per-component markdown files in the
 * exact format Adorable's existing kit system expects:
 *
 *   .adorable/components/README.md           — index
 *   .adorable/components/{ComponentName}.md  — one per component
 *   .adorable/design-tokens.md               — Horizon theme variables
 *
 * Also emits:
 *   kit.json                                  — kit metadata for seedDefaultKit
 *   systemPrompt.md                           — the mandatory-pattern summary
 *
 * Output goes to:  apps/server/src/assets/kits/ui5-ngx/
 *
 * Run:  npx tsx generate-kit-docs.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------- paths ----------

const ROOT = __dirname;
const GRAPH_PATH = join(ROOT, 'ui5-kit-graph.json');
const SUMMARY_PATH = join(ROOT, 'ui5-kit-summary.md');
const OUT_DIR = join(ROOT, '..', '..', 'apps', 'server', 'src', 'assets', 'kits', 'ui5-ngx');
const ADORABLE_DIR = join(OUT_DIR, '.adorable');
const COMPONENTS_DIR = join(ADORABLE_DIR, 'components');

// ---------- types ----------

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
interface NgxMeta {
  componentClass: string;
  importModule: string;
  importPath: string;
  exportAs?: string;
  inputs: string[];
  outputs: Record<string, string>;
  outputNames: string[];
}

// ---------- load graph ----------

const graph: Graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
const byId = new Map<string, Node>();
for (const n of graph.nodes) byId.set(n.id, n);
const fromIndex = new Map<string, Edge[]>();
for (const e of graph.edges) {
  if (!fromIndex.has(e.from)) fromIndex.set(e.from, []);
  fromIndex.get(e.from)!.push(e);
}

function neighborsOf(id: string, kind: string): Node[] {
  return (fromIndex.get(id) ?? [])
    .filter((e) => e.kind === kind)
    .map((e) => byId.get(e.to))
    .filter(Boolean) as Node[];
}

function shortDesc(d?: string, max = 300): string {
  if (!d) return '';
  return d
    .replace(/^#+\s+.*$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function shortPkg(pkg?: string): string {
  if (!pkg) return 'unknown';
  if (pkg === '@ui5/webcomponents') return 'main';
  if (pkg === '@ui5/webcomponents-fiori') return 'fiori';
  if (pkg === '@ui5/webcomponents-base') return 'base';
  return pkg;
}

// ---------- generate per-component docs ----------

const components = graph.nodes.filter((n) => n.kind === 'component');
const componentsByPkg = new Map<string, Node[]>();
for (const c of components) {
  const p = c.package ?? 'unknown';
  if (!componentsByPkg.has(p)) componentsByPkg.set(p, []);
  componentsByPkg.get(p)!.push(c);
}

function generateComponentDoc(comp: Node): string {
  const tag = comp.label;
  const ngx = comp.data?.ngx as NgxMeta | undefined;
  const compId = comp.id;
  const slots = neighborsOf(compId, 'has_slot');
  const events = neighborsOf(compId, 'fires_event');
  const cssParts = neighborsOf(compId, 'has_css_part');
  const themed = neighborsOf(compId, 'themed_by');

  const lines: string[] = [];
  const className = ngx?.componentClass ?? (comp.data?.className as string) ?? tag;
  const displayName = className.replace(/Component$/, '');

  lines.push(`# ${displayName}`);
  lines.push('');

  if (ngx) {
    lines.push(`**Type:** Component`);
    lines.push(`**Selector:** \`<${tag}>\``);
    lines.push(`**Import:** \`import { ${ngx.componentClass} } from '${ngx.importPath}';\``);
    if (ngx.exportAs) {
      lines.push(`**Export As:** \`${ngx.exportAs}\``);
    }
  } else {
    lines.push(`**Type:** Web Component (no Angular wrapper available)`);
    lines.push(`**Selector:** \`<${tag}>\``);
    lines.push(`> **Warning:** This component has no \`@ui5/webcomponents-ngx\` wrapper. Consider using an alternative or check if a wrapper has been added in a newer version.`);
  }
  lines.push(`**Package:** \`${comp.package}\` (${shortPkg(comp.package)})`);
  lines.push('');

  // Basic usage example
  if (ngx) {
    lines.push(`## Basic Usage`);
    lines.push('```html');
    const sampleInput = ngx.inputs[0];
    const sampleOutput = Object.entries(ngx.outputs)[0];
    let example = `<${tag}`;
    if (sampleInput) example += ` [${sampleInput}]="..."`;
    if (sampleOutput) example += ` (${sampleOutput[1]})="on${sampleOutput[1].replace(/^ui5/, '')}($event)"`;
    example += `>`;
    example += `</${tag}>`;
    lines.push(example);
    lines.push('```');
    lines.push('');
  }

  // Description
  const desc = shortDesc(comp.description, 600);
  if (desc) {
    lines.push(`## Description`);
    lines.push(desc);
    lines.push('');
  }

  // Angular Inputs
  if (ngx && ngx.inputs.length) {
    lines.push(`## Inputs`);
    lines.push(`| Name | Type | Default | Description |`);
    lines.push(`|------|------|---------|-------------|`);

    // Get property details from graph for richer info
    const propNodes = neighborsOf(compId, 'has_property');
    const propByName = new Map(propNodes.map((p) => [p.label, p]));

    for (const input of ngx.inputs) {
      const p = propByName.get(input);
      const type = (p?.data?.type as string) ?? 'unknown';
      const def = (p?.data?.default as string) ?? '-';
      const pdesc = shortDesc(p?.description, 120);
      lines.push(`| \`${input}\` | \`${type}\` | \`${def}\` | ${pdesc} |`);
    }
    lines.push('');
    lines.push(`> **IMPORTANT:** Use property bindings \`[inputName]="value"\`. Do NOT use \`[attr.inputName]\` — the ngx wrapper provides real Angular @Input()s.`);
    lines.push('');
  }

  // Angular Outputs (renamed events)
  if (ngx && Object.keys(ngx.outputs).length) {
    lines.push(`## Outputs (Events)`);
    lines.push(`| Angular Output (use this) | DOM Event (don't use) | Description |`);
    lines.push(`|--------------------------|----------------------|-------------|`);

    const eventByName = new Map(events.map((e) => [e.label, e]));
    for (const [domName, ngxName] of Object.entries(ngx.outputs)) {
      const ev = eventByName.get(domName);
      const edesc = shortDesc(ev?.description, 120);
      lines.push(`| \`(${ngxName})\` | ~~\`(${domName})\`~~ | ${edesc} |`);
    }
    lines.push('');
    lines.push(`> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.`);
    lines.push('');
    lines.push(`> **Event payload:** The ngx wrapper emits the \`detail\` object directly from the EventEmitter — access properties on the event itself (e.g. \`event.selectedItems\`), NOT via \`event.detail.selectedItems\`. The \`.detail\` wrapper is already unwrapped for you.`);
    lines.push('');
  }

  // Slots
  if (slots.length) {
    lines.push(`## Slots`);
    lines.push(`| Name | Description |`);
    lines.push(`|------|-------------|`);
    for (const s of slots) {
      lines.push(`| \`${s.label}\` | ${shortDesc(s.description, 150)} |`);
    }
    lines.push('');
  }

  // CSS Parts
  if (cssParts.length) {
    lines.push(`## CSS Parts`);
    lines.push(`| Name | Description |`);
    lines.push(`|------|-------------|`);
    for (const p of cssParts) {
      lines.push(`| \`${p.label}\` | ${shortDesc(p.description, 100)} |`);
    }
    lines.push('');
  }

  // Theme variables
  if (themed.length) {
    lines.push(`## Related Horizon Theme Variables`);
    for (const v of themed.slice(0, 15)) {
      const val = v.data?.value ? ` = ${v.data.value}` : '';
      lines.push(`- \`${v.label}\`${val}`);
    }
    if (themed.length > 15) lines.push(`- ...and ${themed.length - 15} more`);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------- generate README ----------

function generateReadme(): string {
  const lines: string[] = [];
  lines.push(`# SAP UI5 Web Components (Angular / @ui5/webcomponents-ngx)`);
  lines.push('');
  lines.push(`UI5 version: ${graph.meta.ui5Version}`);
  lines.push('');
  lines.push(`## MANDATORY — Read Before Writing Code`);
  lines.push('');
  lines.push(`This project uses **@ui5/webcomponents-ngx** Angular wrappers, NOT raw web components.`);
  lines.push('');
  lines.push(`**Rules:**`);
  lines.push(`1. Import wrapper classes from \`@ui5/webcomponents-ngx/main\` or \`@ui5/webcomponents-ngx/fiori\` — NEVER from \`@ui5/webcomponents/dist/*\``);
  lines.push(`2. Use real Angular inputs: \`[design]="..."\` — NEVER \`[attr.design]="..."\``);
  lines.push(`3. Events are renamed with \`ui5\` prefix: \`(ui5Click)\`, \`(ui5SelectionChange)\` — NEVER \`(click)\` or \`(selection-change)\` on UI5 elements`);
  lines.push(`4. Do NOT use \`CUSTOM_ELEMENTS_SCHEMA\` — the wrappers ARE Angular components`);
  lines.push(`5. Use camelCase input names: \`[titleText]\` — NEVER kebab-case \`title-text="..."\``);
  lines.push('');

  for (const [pkg, comps] of componentsByPkg) {
    const sorted = [...comps].sort((a, b) => a.label.localeCompare(b.label));
    const label = shortPkg(pkg);
    lines.push(`## ${label} (${sorted.length} components)`);
    lines.push('');
    for (const c of sorted) {
      const desc = shortDesc(c.description, 80);
      lines.push(`- [${c.label}](./${c.label}.md) — ${desc}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------- generate design tokens ----------

function generateDesignTokens(): string {
  const themeVars = graph.nodes.filter((n) => n.kind === 'themeVariable');
  const byCategory = new Map<string, Node[]>();
  for (const v of themeVars) {
    const cat = (v.data?.category as string) ?? 'Other';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(v);
  }

  const sorted = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length);

  const lines: string[] = [];
  lines.push(`# SAP Horizon Theme — Design Tokens`);
  lines.push('');
  lines.push(`Theme: \`sap_horizon\` (also available: \`sap_horizon_dark\`, \`sap_horizon_hcb\`, \`sap_horizon_hcw\`)`);
  lines.push('');
  lines.push(`Set the theme at app startup:`);
  lines.push('```ts');
  lines.push(`import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';`);
  lines.push(`setTheme('sap_horizon');`);
  lines.push('```');
  lines.push('');
  lines.push(`Use these CSS variables for any custom styling. Prefer semantic variables over hardcoded hex values.`);
  lines.push('');

  for (const [cat, vars] of sorted.slice(0, 25)) {
    lines.push(`## ${cat} (${vars.length})`);
    lines.push('');
    for (const v of vars.slice(0, 20)) {
      const val = v.data?.value ?? '';
      lines.push(`- \`${v.label}\`: \`${val}\``);
    }
    if (vars.length > 20) lines.push(`- ...and ${vars.length - 20} more`);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------- generate kit.json ----------

function generateKitJson(): object {
  const systemPrompt = readFileSync(SUMMARY_PATH, 'utf8');
  return {
    id: 'ui5-ngx-starter',
    name: 'SAP UI5 Web Components (Angular)',
    description:
      'Angular starter with SAP UI5 Web Components via @ui5/webcomponents-ngx. ' +
      'Includes the Horizon theme, 182 components indexed with Angular wrapper metadata ' +
      '(correct inputs, renamed outputs, import paths), and a mandatory-pattern guide ' +
      'that ensures idiomatic ngx code generation.',
    template: {
      type: 'default',
      angularVersion: '21',
    },
    npmPackages: [
      { name: '@ui5/webcomponents', importSuffix: '' },
      { name: '@ui5/webcomponents-fiori', importSuffix: '' },
      { name: '@ui5/webcomponents-ngx', importSuffix: 'Component' },
      { name: '@ui5/webcomponents-theming', importSuffix: '' },
      { name: '@ui5/webcomponents-icons', importSuffix: '' },
    ],
    systemPrompt,
    lessonsEnabled: true,
  };
}

// ---------- emit ----------

// Create directories
mkdirSync(COMPONENTS_DIR, { recursive: true });

// Write component docs
// Filename uses the tag name (e.g. "ui5-button.md") so the AI can guess
// the filename directly from the component tag it wants to use.
let docCount = 0;
for (const comp of components) {
  const doc = generateComponentDoc(comp);
  writeFileSync(join(COMPONENTS_DIR, `${comp.label}.md`), doc);
  docCount++;
}

// Write README
writeFileSync(join(COMPONENTS_DIR, 'README.md'), generateReadme());

// Write design tokens
writeFileSync(join(ADORABLE_DIR, 'design-tokens.md'), generateDesignTokens());

// Write kit.json
writeFileSync(join(OUT_DIR, 'kit.json'), JSON.stringify(generateKitJson(), null, 2));

// Copy graph.json to assets (for Ship 2 rescan + Ship 3 query_kit)
const graphDest = join(OUT_DIR, 'graph.json');
if (!existsSync(graphDest)) {
  writeFileSync(graphDest, readFileSync(GRAPH_PATH, 'utf8'));
}

// ---------- report ----------

console.log('✓ Generated UI5+ngx kit assets');
console.log(`  Output:           ${OUT_DIR}`);
console.log(`  Component docs:   ${docCount}`);
console.log(`  README.md:        ${join(COMPONENTS_DIR, 'README.md')}`);
console.log(`  Design tokens:    ${join(ADORABLE_DIR, 'design-tokens.md')}`);
console.log(`  kit.json:         ${join(OUT_DIR, 'kit.json')}`);
console.log(`  graph.json:       ${graphDest}`);
