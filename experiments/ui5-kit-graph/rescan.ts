/**
 * rescan.ts
 *
 * Re-analyzes already-generated files with an improved UI5 usage detector:
 *   - Catches `[attr.foo]="..."` Angular attribute binding (was missing)
 *   - Validates `slot="foo"` against the parent component's declared slots
 *   - Same regex for tag-level components, properties, and events
 *
 * Run:  npx tsx rescan.ts [results-hard|results]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateUsage } from './query-kit';

const DIR = process.argv[2] ?? 'results-hard';
const ROOT = join(__dirname, DIR);

// ---------- helpers ----------

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|html)$/.test(entry)) out.push(full);
  }
  return out;
}

function isAngularBuiltin(s: string): boolean {
  return [
    'click', 'input', 'change', 'focus', 'blur', 'keydown', 'keyup',
    'keypress', 'mouseenter', 'mouseleave', 'mousedown', 'mouseup',
    'ngIf', 'ngFor', 'ngClass', 'ngStyle', 'ngModel', 'ngSwitch',
  ].includes(s);
}

function isStaticHtmlAttr(s: string): boolean {
  return [
    'class', 'id', 'style', 'title', 'role', 'tabindex', 'slot',
    'name', 'value', 'href', 'src', 'alt', 'type', 'for', 'rel',
    'target', 'accesskey', 'lang', 'dir', 'hidden', 'draggable',
  ].includes(s)
    || s.startsWith('aria-')
    || s.startsWith('data-');
}

function toCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// ---------- detector ----------

interface Finding {
  kind:
    | 'unknown_component'
    | 'unknown_property'
    | 'unknown_event'
    | 'unknown_slot'
    | 'ngx_attr_binding'         // [attr.foo] used when real @Input exists
    | 'ngx_raw_event'            // (dom-event) used instead of (ui5Xxx)
    | 'ngx_raw_import'           // import from @ui5/webcomponents/dist/...
    | 'ngx_schema_used'          // CUSTOM_ELEMENTS_SCHEMA declared
    | 'ngx_missing_import';      // <ui5-button> used but ButtonComponent not imported
  tag: string;
  name?: string;
  parent?: string;
  suggestion?: string;
  file: string;
  line: number;
}

function lineOf(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length;
}

function analyzeFile(file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const v = validateUsage();
  const findings: Finding[] = [];

  // File-level ngx checks (.ts files only)
  if (file.endsWith('.ts')) {
    // Flag CUSTOM_ELEMENTS_SCHEMA
    if (/CUSTOM_ELEMENTS_SCHEMA/.test(content)) {
      const idx = content.indexOf('CUSTOM_ELEMENTS_SCHEMA');
      findings.push({
        kind: 'ngx_schema_used',
        tag: '(file)',
        suggestion: 'Remove CUSTOM_ELEMENTS_SCHEMA and the schemas entry — ngx wrappers are real Angular components.',
        file,
        line: lineOf(content, idx),
      });
    }

    // Flag raw dist imports from @ui5/webcomponents/dist/* or @ui5/webcomponents-fiori/dist/*
    // (Theme import from webcomponents-base is allowed — it has no wrapper.)
    const rawImportRe = /from\s+['"](@ui5\/webcomponents(?:-fiori)?\/dist\/[^'"]+)['"]/g;
    let im: RegExpExecArray | null;
    while ((im = rawImportRe.exec(content)) !== null) {
      findings.push({
        kind: 'ngx_raw_import',
        tag: '(file)',
        name: im[1],
        suggestion: `Import the Angular wrapper class from @ui5/webcomponents-ngx/{main|fiori} instead.`,
        file,
        line: lineOf(content, im.index),
      });
    }

    // Collect ngx-imported component classes to check ngx_missing_import later.
    const ngxImportRe = /from\s+['"]@ui5\/webcomponents-ngx\/(?:main|fiori)['"]/g;
    // We don't need to match symbols — presence of ngx import is a good signal.
    // (Fine-grained per-tag check is below against used tags.)
    const hasAnyNgxImport = ngxImportRe.test(content);

    // Find all <ui5-xxx> tags used in this file (inside backtick templates)
    const usedTags = new Set<string>();
    const tagRe2 = /<(ui5-[a-z0-9-]+)\b/g;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe2.exec(content)) !== null) usedTags.add(tm[1]);

    // For each used tag that has an ngx wrapper, check whether its component
    // class name appears anywhere in the file's imports. This is a loose
    // check (doesn't verify the module path) but catches the common case of
    // "used <ui5-button> but forgot to import ButtonComponent".
    for (const tag of usedTags) {
      const meta = v.getNgxMeta(tag);
      if (!meta) continue; // no wrapper → can't enforce
      const className = meta.componentClass;
      const importsRe = new RegExp(`\\b${className}\\b`);
      // If the class name doesn't appear anywhere in the file, it's missing.
      // Exception: component may be imported transitively via a shared module.
      if (!importsRe.test(content) && !hasAnyNgxImport) {
        findings.push({
          kind: 'ngx_missing_import',
          tag,
          name: className,
          suggestion: `import { ${className} } from '${meta.importModule}';`,
          file,
          line: 1,
        });
      }
    }
  }

  // Match every <ui5-xxx ...> opening tag
  // (Both `<ui5-foo attrs>` and self-closing `<ui5-foo attrs />`)
  const tagRe = /<(ui5-[a-z0-9-]+)\b([^>]*)>/g;

  // Parent-tag stack for slot validation.
  // We only push ui5 tags, not HTML.
  interface StackEntry {
    tag: string;
    openOffset: number;
  }
  const stack: StackEntry[] = [];

  // Closing tag regex to pop the stack.
  const closeRe = /<\/(ui5-[a-z0-9-]+)>/g;

  // Collect all opens and closes in order to walk them chronologically.
  interface Event {
    type: 'open' | 'close';
    tag: string;
    attrs?: string;
    offset: number;
    selfClosing?: boolean;
  }
  const events: Event[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(content)) !== null) {
    const attrs = m[2];
    const selfClosing = /\/\s*$/.test(attrs);
    events.push({ type: 'open', tag: m[1], attrs, offset: m.index, selfClosing });
  }
  while ((m = closeRe.exec(content)) !== null) {
    events.push({ type: 'close', tag: m[1], offset: m.index });
  }
  events.sort((a, b) => a.offset - b.offset);

  for (const ev of events) {
    if (ev.type === 'close') {
      // Pop matching tag
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === ev.tag) {
          stack.splice(i, 1);
          break;
        }
      }
      continue;
    }

    const tag = ev.tag;
    const attrs = ev.attrs ?? '';
    const line = lineOf(content, ev.offset);

    // Component existence
    if (!v.hasComponent(tag)) {
      findings.push({ kind: 'unknown_component', tag, file, line });
      // Don't try to validate attributes on an unknown component
      if (!ev.selfClosing) stack.push({ tag, openOffset: ev.offset });
      continue;
    }

    // First, scan for bare boolean attributes (no `="..."`)
    // e.g. `<ui5-dynamic-page show-header-content>` — strip value-having attrs
    // first, then split what's left and check each remaining token.
    const stripped = attrs
      .replace(/\s(?:\(?[A-Za-z][A-Za-z0-9.-]*\)?|\[[A-Za-z][A-Za-z0-9.-]*\])\s*=\s*"[^"]*"/g, ' ')
      .replace(/\s(?:[A-Za-z][A-Za-z0-9.-]*)\s*=\s*'[^']*'/g, ' ')
      .replace(/\/\s*$/, '')
      .trim();
    if (stripped) {
      for (const token of stripped.split(/\s+/)) {
        if (!token) continue;
        if (isStaticHtmlAttr(token)) continue;
        const camel = toCamel(token);
        if (!v.hasProperty(tag, camel)) {
          findings.push({ kind: 'unknown_property', tag, name: token, file, line });
        }
      }
    }

    // Value-having attributes — catches:
    //   plain-attr="..."
    //   [prop]="..."
    //   [attr.foo]="..."   (NEW)
    //   [attr.foo-bar]="..."
    //   (event)="..."
    const attrRe = /\s(\(?[A-Za-z][A-Za-z0-9.-]*\)?|\[[A-Za-z][A-Za-z0-9.-]*\])\s*=\s*"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(attrs)) !== null) {
      const raw = am[1];

      // Event: (foo) or (foo-bar) or (ui5Foo)
      if (raw.startsWith('(') && raw.endsWith(')')) {
        const ev = raw.slice(1, -1);

        // ngx-mode: if this is a renamed ngx output (ui5Xxx), it's correct
        if (v.hasNgxOutput(tag, ev)) continue;

        // If the tag has an ngx wrapper and the user bound a raw DOM name
        // that the wrapper has renamed, flag it.
        const renamed = v.getNgxOutputFor(tag, ev);
        if (renamed) {
          findings.push({
            kind: 'ngx_raw_event',
            tag,
            name: ev,
            suggestion: `(${renamed})="..."`,
            file,
            line,
          });
          continue;
        }

        // Otherwise fall back to raw CEM event check
        if (!v.hasEvent(tag, ev) && !isAngularBuiltin(ev)) {
          findings.push({ kind: 'unknown_event', tag, name: ev, file, line });
        }
        continue;
      }

      // Property binding: [foo], [attr.foo], [attr.foo-bar]
      if (raw.startsWith('[') && raw.endsWith(']')) {
        let name = raw.slice(1, -1);
        const isAttrBinding = name.startsWith('attr.');
        if (isAttrBinding) name = name.slice('attr.'.length);
        const camel = toCamel(name);
        if (name === 'slot') continue; // dynamic slot binding
        if (isStaticHtmlAttr(name)) continue;

        // ngx-mode: flag [attr.xxx] when the ngx wrapper declares xxx as a real @Input
        if (isAttrBinding && v.hasNgxInput(tag, camel)) {
          findings.push({
            kind: 'ngx_attr_binding',
            tag,
            name,
            suggestion: `[${camel}]="..."`,
            file,
            line,
          });
          continue;
        }
        // Unknown property (neither in ngx inputs nor raw CEM)
        if (!v.hasProperty(tag, camel) && !v.hasNgxInput(tag, camel)) {
          findings.push({ kind: 'unknown_property', tag, name, file, line });
        }
        continue;
      }

      // Plain attribute
      if (raw === 'slot') continue;
      if (isStaticHtmlAttr(raw)) continue;
      const camel = toCamel(raw);
      if (!v.hasProperty(tag, camel) && !v.hasNgxInput(tag, camel)) {
        findings.push({ kind: 'unknown_property', tag, name: raw, file, line });
      }
    }

    // Slot="..." — validate against parent ui5 tag's declared slots.
    const slotRe = /\sslot\s*=\s*"([^"]+)"/g;
    let sm: RegExpExecArray | null;
    while ((sm = slotRe.exec(attrs)) !== null) {
      const slotName = sm[1];
      const parent = stack[stack.length - 1]?.tag;
      if (!parent) continue; // no ui5 parent — slot targets non-ui5 host, skip
      if (slotName === 'default') continue;
      if (!v.hasSlot(parent, slotName)) {
        findings.push({ kind: 'unknown_slot', tag, name: slotName, parent, file, line });
      }
    }

    // Push onto stack unless self-closing
    if (!ev.selfClosing) stack.push({ tag, openOffset: ev.offset });
  }

  return findings;
}

// ---------- main ----------

interface ScenarioResult {
  name: string;
  totalUsages: number;
  distinctComponents: Set<string>;
  findings: Finding[];
}

const scenarios: ScenarioResult[] = [];

for (const sub of readdirSync(ROOT)) {
  const full = join(ROOT, sub);
  if (!statSync(full).isDirectory()) continue;
  const files = walk(full);
  const allFindings: Finding[] = [];
  const components = new Set<string>();
  let totalUsages = 0;

  for (const f of files) {
    const content = readFileSync(f, 'utf8');
    const tagRe = /<(ui5-[a-z0-9-]+)\b/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(content)) !== null) {
      totalUsages++;
      components.add(m[1]);
    }
    allFindings.push(...analyzeFile(f));
  }

  scenarios.push({
    name: sub,
    totalUsages,
    distinctComponents: components,
    findings: allFindings,
  });
}

// ---------- report ----------

console.log(`\n=== Re-scan of ${DIR} with improved detector ===\n`);

for (const s of scenarios) {
  const byKind = new Map<string, number>();
  for (const f of s.findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);

  console.log(`## ${s.name}`);
  console.log(`   total <ui5-*> tags:         ${s.totalUsages}`);
  console.log(`   distinct components used:   ${s.distinctComponents.size}`);
  console.log(`   unknown components:         ${byKind.get('unknown_component') ?? 0}`);
  console.log(`   unknown properties:         ${byKind.get('unknown_property') ?? 0}`);
  console.log(`   unknown events:             ${byKind.get('unknown_event') ?? 0}`);
  console.log(`   unknown slots:              ${byKind.get('unknown_slot') ?? 0}`);
  console.log(`   ngx: [attr.x] when [x] ok:  ${byKind.get('ngx_attr_binding') ?? 0}`);
  console.log(`   ngx: (raw-event) not ui5X:  ${byKind.get('ngx_raw_event') ?? 0}`);
  console.log(`   ngx: raw dist imports:      ${byKind.get('ngx_raw_import') ?? 0}`);
  console.log(`   ngx: missing wrapper imp:   ${byKind.get('ngx_missing_import') ?? 0}`);
  console.log(`   ngx: CUSTOM_ELEMENTS_SCHEMA: ${byKind.get('ngx_schema_used') ?? 0}`);
  console.log(`   TOTAL ISSUES:               ${s.findings.length}`);
  console.log('');

  // Group findings by (kind, tag, name) for readability
  const grouped = new Map<string, { f: Finding; count: number }>();
  for (const f of s.findings) {
    const key = `${f.kind}|${f.tag}|${f.name ?? ''}|${f.parent ?? ''}`;
    const existing = grouped.get(key);
    if (existing) existing.count++;
    else grouped.set(key, { f, count: 1 });
  }

  for (const { f, count } of grouped.values()) {
    const loc = `${f.file.split('/').slice(-2).join('/')}:${f.line}`;
    const n = count > 1 ? ` (×${count})` : '';
    switch (f.kind) {
      case 'unknown_component':
        console.log(`   ✗ <${f.tag}> — no such component${n} ${loc}`);
        break;
      case 'unknown_property':
        console.log(`   ✗ <${f.tag}> ${f.name} — no such property${n} ${loc}`);
        break;
      case 'unknown_event':
        console.log(`   ✗ <${f.tag}> (${f.name}) — no such event${n} ${loc}`);
        break;
      case 'unknown_slot':
        console.log(`   ✗ <${f.tag} slot="${f.name}"> — parent <${f.parent}> has no "${f.name}" slot${n} ${loc}`);
        break;
      case 'ngx_attr_binding':
        console.log(`   ⚠ <${f.tag}> uses [attr.${f.name}] — should be ${f.suggestion}${n} ${loc}`);
        break;
      case 'ngx_raw_event':
        console.log(`   ⚠ <${f.tag}> (${f.name}) — should be ${f.suggestion}${n} ${loc}`);
        break;
      case 'ngx_raw_import':
        console.log(`   ⚠ raw dist import: ${f.name}${n} ${loc}`);
        break;
      case 'ngx_missing_import':
        console.log(`   ⚠ <${f.tag}> used but ${f.name} not imported${n} ${loc}`);
        break;
      case 'ngx_schema_used':
        console.log(`   ⚠ CUSTOM_ELEMENTS_SCHEMA declared — ngx wrappers don't need it ${loc}`);
        break;
    }
  }
  console.log('');
}
