/**
 * parse-ngx-snapshots.ts
 *
 * Reads the Jest snapshot files from ui5-webcomponents-ngx that contain the
 * generated Angular wrapper source for every UI5 component, and extracts:
 *   - Angular component class name (e.g. ButtonComponent)
 *   - Selector (should match the CEM tagName)
 *   - Inputs (real Angular @Input names — camelCase, not kebab-case)
 *   - Outputs (renamed: DOM event name → Angular output name — e.g. selection-change → ui5SelectionChange)
 *   - Import module (e.g. @ui5/webcomponents-ngx/main)
 *   - exportAs
 *
 * Output:  ngx-wrappers.json  (keyed by tag name)
 *
 * Run:  npx tsx parse-ngx-snapshots.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NGX_REPO = '/Users/benjamindobler/workspace/ui5/ui5-webcomponents-ngx';
const SNAPSHOT_DIR = join(NGX_REPO, 'libs/ui5-angular/__snapshots__');

const SOURCES = [
  {
    path: join(SNAPSHOT_DIR, 'main-snapshot-test.spec.ts.snap'),
    module: '@ui5/webcomponents-ngx/main',
  },
  {
    path: join(SNAPSHOT_DIR, 'fiori-snapshot-test.spec.ts.snap'),
    module: '@ui5/webcomponents-ngx/fiori',
  },
];

export interface NgxWrapper {
  tag: string;
  componentClass: string;
  exportAs?: string;
  importModule: string;
  /** Full import path including subpath, e.g. "@ui5/webcomponents-ngx/main/button" */
  importPath: string;
  inputs: string[];
  /** Map of raw DOM event name → Angular output name (e.g. "selection-change" → "ui5SelectionChange") */
  outputs: Record<string, string>;
  /** Final Angular outputs (the names you use in templates as (ui5Xxx) */
  outputNames: string[];
}

/**
 * Derive the subpath from the component class name.
 * ButtonComponent → button
 * ShellBarComponent → shell-bar
 * ListItemStandardComponent → list-item-standard
 */
function classToSubpath(className: string): string {
  const stem = className.replace(/Component$/, '');
  return stem
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function extractStringBlocks(source: string): string[] {
  // Each entry looks like:  exports[`...`] = `\n"...multi-line string..."\n`;
  // We want the inner (backtick-quoted) payload as a JS string.
  const blocks: string[] = [];
  const re = /exports\[`[^`]+`\] = `([\s\S]*?)`;\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    // The content is a quoted JS string literal. Strip outer quotes and
    // unescape the common escapes we care about.
    let body = m[1].trim();
    if (body.startsWith('"')) body = body.slice(1);
    if (body.endsWith('"')) body = body.slice(0, -1);
    body = body
      .replace(/\\"/g, '"')
      .replace(/\\`/g, '`')
      .replace(/\\\\/g, '\\');
    blocks.push(body);
  }
  return blocks;
}

function parseOneBlock(body: string, importModule: string): NgxWrapper | null {
  // Selector
  const selectorMatch = body.match(/selector:\s*'([^']+)'/);
  if (!selectorMatch) return null;
  const tag = selectorMatch[1];
  if (!tag.startsWith('ui5-')) return null;

  // Class name
  const classMatch = body.match(/class\s+([A-Za-z0-9_]+)/);
  const componentClass = classMatch?.[1] ?? '';

  // exportAs
  const exportAsMatch = body.match(/exportAs:\s*'([^']+)'/);
  const exportAs = exportAsMatch?.[1];

  // Inputs: pull from the @Component({ inputs: [...] }) block.
  // The array can span multiple lines and contain string literals.
  const inputsMatch = body.match(/inputs:\s*\[([\s\S]*?)\]/);
  const inputs: string[] = [];
  if (inputsMatch) {
    const stringRe = /'([A-Za-z][A-Za-z0-9_]*)'/g;
    let m: RegExpExecArray | null;
    while ((m = stringRe.exec(inputsMatch[1])) !== null) {
      inputs.push(m[1]);
    }
  }

  // Outputs mapping comes from @ProxyOutputs([...]).
  // Each entry is either 'raw-name: ui5Name' or 'ui5Name' (when raw === ui5).
  // The Component({ outputs: [...] }) block only has the renamed names.
  const proxyOutMatch = body.match(/@ProxyOutputs\(\[([\s\S]*?)\]\)/);
  const outputs: Record<string, string> = {};
  if (proxyOutMatch) {
    const entryRe = /'([^']+)'/g;
    let em: RegExpExecArray | null;
    while ((em = entryRe.exec(proxyOutMatch[1])) !== null) {
      const entry = em[1];
      const colonIdx = entry.indexOf(':');
      if (colonIdx >= 0) {
        const domName = entry.slice(0, colonIdx).trim();
        const ngxName = entry.slice(colonIdx + 1).trim();
        outputs[domName] = ngxName;
      } else {
        outputs[entry] = entry;
      }
    }
  } else {
    // Fallback: take outputs: [...] names at face value.
    const outMatch = body.match(/\boutputs:\s*\[([\s\S]*?)\]/);
    if (outMatch) {
      const stringRe = /'([A-Za-z][A-Za-z0-9_]*)'/g;
      let m: RegExpExecArray | null;
      while ((m = stringRe.exec(outMatch[1])) !== null) {
        outputs[m[1]] = m[1];
      }
    }
  }

  const subpath = classToSubpath(componentClass);
  return {
    tag,
    componentClass,
    exportAs,
    importModule,
    importPath: `${importModule}/${subpath}`,
    inputs,
    outputs,
    outputNames: Object.values(outputs),
  };
}

// ---------- main ----------

const wrappers = new Map<string, NgxWrapper>();

for (const src of SOURCES) {
  const text = readFileSync(src.path, 'utf8');
  const blocks = extractStringBlocks(text);
  let count = 0;
  for (const block of blocks) {
    const w = parseOneBlock(block, src.module);
    if (w) {
      wrappers.set(w.tag, w);
      count++;
    }
  }
  console.log(`${src.module}: parsed ${count} components from ${src.path.split('/').pop()}`);
}

const outObj: Record<string, NgxWrapper> = {};
for (const [k, v] of wrappers) outObj[k] = v;

const outPath = join(__dirname, 'ngx-wrappers.json');
writeFileSync(outPath, JSON.stringify(outObj, null, 2));
console.log(`\n✓ Wrote ${outPath}`);
console.log(`  Total wrappers: ${wrappers.size}`);

// Spot-checks
for (const spot of ['ui5-button', 'ui5-list', 'ui5-side-navigation', 'ui5-shellbar', 'ui5-timeline']) {
  const w = wrappers.get(spot);
  if (!w) {
    console.log(`  ✗ ${spot}: NOT FOUND`);
    continue;
  }
  console.log(`  ✓ ${spot}: class=${w.componentClass}, ${w.inputs.length} inputs, ${Object.keys(w.outputs).length} outputs`);
  const sampleOutputs = Object.entries(w.outputs).slice(0, 3);
  if (sampleOutputs.length) {
    console.log(`     outputs: ${sampleOutputs.map(([dom, ngx]) => `${dom} → ${ngx}`).join(', ')}`);
  }
}
