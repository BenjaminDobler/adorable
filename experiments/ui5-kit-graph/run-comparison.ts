/**
 * run-comparison.ts
 *
 * Runs the same Angular-generation prompt through Claude TWICE:
 *   A) Baseline       — bare system prompt, no UI5 knowledge
 *   B) Kit-augmented  — system prompt + ui5-kit-summary.md + query_kit tool
 *
 * Both scenarios share an identical minimal agent loop, identical file-system
 * tools, and identical model + token settings — so any difference in output
 * comes from the kit context alone.
 *
 * Outputs:
 *   - results/A-baseline/   files written by the baseline run
 *   - results/B-with-kit/   files written by the kit-augmented run
 *   - results/report.md     side-by-side metrics
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx run-comparison.ts
 *   ANTHROPIC_API_KEY=sk-... npx tsx run-comparison.ts --only A
 *   ANTHROPIC_API_KEY=sk-... npx tsx run-comparison.ts --model claude-sonnet-4-6
 */

import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { queryKit, validateUsage } from './query-kit';

// ---------- config ----------

const ROOT = __dirname;
const RESULTS_DIR_BASE = join(ROOT, 'results');

const MODEL_DEFAULT = 'claude-sonnet-4-6';
const MAX_TURNS = 25;
const MAX_TOKENS = 8192;

const EASY_PROMPT = `Build me a single Angular standalone component called \`ProductListPage\` that uses UI5 Web Components with the SAP Horizon theme.

Layout:
- A \`ui5-shellbar\` header at the top showing the title "Product Catalog", with a search field, a notifications icon, and a profile avatar.
- A two-column body below the shellbar:
  - LEFT (60%): a \`ui5-list\` of 8 sample products (id, name, price, category). Items should be selectable single-select. When the user selects an item, the right panel updates.
  - RIGHT (40%): a \`ui5-card\` showing the selected product's details, with a header containing the product name and a \`ui5-button\` "Add to cart" with design "Emphasized" inside the card body.
- Use Horizon CSS variables for theming (background, spacing).

Output a complete, standalone Angular component (TypeScript + inline template + inline styles) named \`ProductListPage\` in \`src/app/product-list-page.component.ts\`. Also write a one-line \`src/app/sample-products.ts\` exporting the sample data.

Do not write tests. Do not write a module file. Do not call read_files unless you actually need to read something — there is nothing to read in this empty workspace.`;

const HARD_PROMPT = `Build me a single Angular standalone component called \`ProjectDashboardPage\` that uses UI5 Web Components with the SAP Horizon DARK theme.

Layout:
- The outermost container should be a \`ui5-dynamic-page\` with:
  - a \`ui5-dynamic-page-title\` showing the heading "Project Atlas Migration" and a subtitle "Q2 2026 deliverables"
  - a \`ui5-dynamic-page-header\` below the title containing three label+value pairs: Owner "Jane Doe", Status "In Progress", Due "2026-06-30"
- Inside the page content, render a \`ui5-flexible-column-layout\` in the layout mode that shows the start column and a mid-expanded middle column simultaneously:
  - START column: a \`ui5-side-navigation\` with 4 items — Overview, Tasks, Timeline, Team. Selecting an item updates what is shown in the mid column.
  - MID column: when "Timeline" is selected, render a \`ui5-timeline\` with 5 \`ui5-timeline-item\` entries (title, subtitle, icon, timestamp). For the other 3 items, show a \`ui5-illustrated-message\` empty-state placeholder with an appropriate illustration name.
- Dark theme: call \`setTheme('sap_horizon_dark')\` at module load. Use Horizon \`--sap*\` CSS variables for any additional custom styling you need (backgrounds, spacing, borders).

Output ONLY these two files:
- \`src/app/project-dashboard-page.component.ts\` — the standalone component with inline template and styles
- \`src/app/sample-timeline.ts\` — exports the 5 sample timeline entries

Do not write bootstrap, config, module, or test files. Do not call read_files — the workspace is empty.`;

// ---------- arg parsing ----------

const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const modelArg = args.includes('--model') ? args[args.indexOf('--model') + 1] : MODEL_DEFAULT;
const cachedMode = args.includes('--cached');
const promptMode = args.includes('--prompt') ? args[args.indexOf('--prompt') + 1] : 'easy';

const TEST_PROMPT = promptMode === 'hard' ? HARD_PROMPT : EASY_PROMPT;
const RESULTS_DIR = promptMode === 'hard' ? `${RESULTS_DIR_BASE}-hard` : RESULTS_DIR_BASE;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: Set ANTHROPIC_API_KEY in your environment first.');
  console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------- shared system prompt (mirrors Adorable's SYSTEM_PROMPT essence) ----------

const BASE_SYSTEM_PROMPT = `You are an expert Angular developer.
Your task is to generate or modify the SOURCE CODE for an Angular application.

CONCISENESS: Keep explanations brief. Focus on code, not commentary.
MINIMAL CHANGES: Make ONLY the changes necessary to fulfill the user's request.

Tool use rules:
- Use write_files to create files. Prefer batching multiple files in one call.
- Use read_files only when you need to inspect existing files.
- Use list_dir to explore directory structure if needed.
- Do NOT over-explore. The workspace is empty except for what you create.
- Start writing code as soon as possible. Aim for 1-3 turns total.
- When the task is complete, respond with a brief summary and stop calling tools.

Angular conventions:
- Use standalone components (no NgModules).
- Use signals for reactive state.
- Use OnPush change detection where applicable.
- Inline templates and styles for small components are fine.`;

const KIT_SYSTEM_ADDENDUM = `\n\n---\n\n` + readFileSync(join(ROOT, 'ui5-kit-summary.md'), 'utf8') + `\n\n---\n\nWhen you need detailed information about a UI5 component (its slots, properties, events, CSS parts, or theme variables), call the query_kit tool. Prefer query_kit over reading source files. Examples of valid queries: "ui5-shellbar", "ui5-button.design", "ui5-list@selection-change", "theme:button".`;

// ---------- tools ----------

const FS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'write_files',
    description: 'Creates or updates MULTIPLE files at once. Always prefer this over writing files one at a time.',
    input_schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path relative to project root.' },
              content: { type: 'string', description: 'Full file content.' },
            },
            required: ['path', 'content'],
          },
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'read_files',
    description: 'Reads MULTIPLE files at once. Returns content for each path.',
    input_schema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } },
      },
      required: ['paths'],
    },
  },
  {
    name: 'list_dir',
    description: 'List files and folders in a directory.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
];

const KIT_TOOL: Anthropic.Tool = {
  name: 'query_kit',
  description:
    'Query the UI5 Web Components knowledge graph for accurate component information. Returns slots, properties, events, CSS parts, and Horizon theme variables. ALWAYS use this before guessing UI5 component APIs. Query syntax: "ui5-button" (full dump), "ui5-button.design" (property detail), "ui5-list@selection-change" (event), "ui5-shellbar#searchField" (slot), "theme:button" (theme category), "theme:--sapBrandColor" (specific variable), "find:list" (fuzzy search).',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Query string per the syntax in the description.' },
    },
    required: ['query'],
  },
};

// ---------- agent loop ----------

interface RunMetrics {
  scenario: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  turns: number;
  toolCalls: Record<string, number>;
  filesWritten: number;
  finalText: string;
  files: Map<string, string>;
  durationMs: number;
  errors: string[];
}

async function runScenario(opts: {
  scenario: string;
  systemPrompt: string | Anthropic.TextBlockParam[];
  tools: Anthropic.Tool[];
  outDir: string;
}): Promise<RunMetrics> {
  const start = Date.now();
  const metrics: RunMetrics = {
    scenario: opts.scenario,
    model: modelArg,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    turns: 0,
    toolCalls: {},
    filesWritten: 0,
    finalText: '',
    files: new Map(),
    durationMs: 0,
    errors: [],
  };

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: TEST_PROMPT },
  ];

  console.log(`\n=== Running scenario: ${opts.scenario} ===`);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    metrics.turns = turn + 1;

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: modelArg,
        max_tokens: MAX_TOKENS,
        system: opts.systemPrompt as any,
        tools: opts.tools,
        messages,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      metrics.errors.push(`turn ${turn}: ${msg}`);
      console.error(`  ✗ API error on turn ${turn}: ${msg}`);
      break;
    }

    metrics.inputTokens += response.usage.input_tokens;
    metrics.outputTokens += response.usage.output_tokens;
    metrics.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    metrics.cacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0;

    const toolUses = response.content.filter((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
    const textBlocks = response.content.filter((b) => b.type === 'text') as Anthropic.TextBlock[];
    const text = textBlocks.map((b) => b.text).join('\n').trim();
    if (text) metrics.finalText = text;

    if (toolUses.length === 0) {
      console.log(`  turn ${turn + 1}: text-only (stop). ${text ? text.slice(0, 80) + '…' : ''}`);
      break;
    }

    // Push assistant turn
    messages.push({ role: 'assistant', content: response.content });

    // Execute tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      metrics.toolCalls[tu.name] = (metrics.toolCalls[tu.name] ?? 0) + 1;
      console.log(`  turn ${turn + 1}: tool_use ${tu.name}`);
      const result = executeTool(tu.name, tu.input as Record<string, unknown>, metrics);
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
    }

    messages.push({ role: 'user', content: toolResults });

    if (response.stop_reason === 'end_turn') {
      // model said it's done but had a tool call — unusual; loop will continue if any
    }
  }

  // Persist files
  if (existsSync(opts.outDir)) rmSync(opts.outDir, { recursive: true });
  mkdirSync(opts.outDir, { recursive: true });
  for (const [path, content] of metrics.files) {
    const full = join(opts.outDir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  metrics.durationMs = Date.now() - start;
  metrics.filesWritten = metrics.files.size;
  console.log(`  ✓ Done. ${metrics.filesWritten} files, ${metrics.turns} turns, ${metrics.inputTokens + metrics.outputTokens} tokens, ${(metrics.durationMs / 1000).toFixed(1)}s`);
  return metrics;
}

function coerceArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      /* fall through */
    }
  }
  if (v && typeof v === 'object') {
    // Some models wrap single items in an object — try to extract
    const obj = v as Record<string, unknown>;
    if ('path' in obj && 'content' in obj) return [v as T];
  }
  return [];
}

function executeTool(name: string, input: Record<string, unknown>, m: RunMetrics): string {
  if (name === 'write_files') {
    const files = coerceArray<{ path: string; content: string }>(input.files);
    if (files.length === 0) {
      console.error(`    ! write_files got unexpected shape:`, JSON.stringify(input).slice(0, 300));
      return `Error: expected { files: [{path, content}, ...] } but got ${typeof input.files}. Please retry with the correct shape.`;
    }
    for (const f of files) {
      if (f && typeof f.path === 'string' && typeof f.content === 'string') {
        m.files.set(f.path, f.content);
      }
    }
    return `Wrote ${files.length} file(s): ${files.map((f) => f.path).join(', ')}`;
  }
  if (name === 'read_files') {
    const paths = coerceArray<string>(input.paths).filter((p): p is string => typeof p === 'string');
    const out: string[] = [];
    for (const p of paths) {
      if (m.files.has(p)) out.push(`### ${p}\n${m.files.get(p)}`);
      else out.push(`### ${p}\n(file not found)`);
    }
    return out.join('\n\n') || '(no paths provided)';
  }
  if (name === 'list_dir') {
    const dir = (input.path as string) ?? '/';
    const inDir = [...m.files.keys()].filter((p) => p.startsWith(dir.replace(/^\//, '')));
    return inDir.length ? inDir.join('\n') : '(empty)';
  }
  if (name === 'query_kit') {
    return queryKit((input.query as string) ?? '');
  }
  return `Unknown tool: ${name}`;
}

// ---------- hallucination analysis ----------

interface HallucinationReport {
  totalUsages: number;
  unknownComponents: Array<{ tag: string; where: string }>;
  unknownProperties: Array<{ tag: string; prop: string; where: string }>;
  unknownEvents: Array<{ tag: string; event: string; where: string }>;
  knownComponents: Set<string>;
}

function analyzeHallucinations(files: Map<string, string>): HallucinationReport {
  const v = validateUsage();
  const report: HallucinationReport = {
    totalUsages: 0,
    unknownComponents: [],
    unknownProperties: [],
    unknownEvents: [],
    knownComponents: new Set(),
  };

  // Match opening tags like <ui5-button design="..." (click)="...">
  const tagRe = /<(ui5-[a-z0-9-]+)([^>]*)>/g;
  for (const [path, content] of files) {
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(content)) !== null) {
      report.totalUsages++;
      const tag = m[1];
      const attrs = m[2];

      if (!v.hasComponent(tag)) {
        report.unknownComponents.push({ tag, where: path });
        continue;
      }
      report.knownComponents.add(tag);

      // Extract attributes: standard ones, [prop]="...", and (event)="..."
      const attrRe = /\s(\(?[A-Za-z][A-Za-z0-9-]*\)?|\[[A-Za-z][A-Za-z0-9-]*\])\s*=\s*"/g;
      let am: RegExpExecArray | null;
      while ((am = attrRe.exec(attrs)) !== null) {
        const raw = am[1];
        if (raw.startsWith('(') && raw.endsWith(')')) {
          const ev = raw.slice(1, -1);
          if (!v.hasEvent(tag, ev) && !isAngularBuiltin(ev)) {
            report.unknownEvents.push({ tag, event: ev, where: path });
          }
        } else if (raw.startsWith('[') && raw.endsWith(']')) {
          const prop = raw.slice(1, -1);
          const camel = toCamel(prop);
          if (!v.hasProperty(tag, camel) && !isAngularBuiltin(prop)) {
            report.unknownProperties.push({ tag, prop, where: path });
          }
        } else {
          // plain attribute — convert kebab to camel
          const camel = toCamel(raw);
          if (!v.hasProperty(tag, camel) && !isStaticHtmlAttr(raw)) {
            report.unknownProperties.push({ tag, prop: raw, where: path });
          }
        }
      }
    }
  }
  return report;
}

function toCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
function isAngularBuiltin(s: string): boolean {
  return ['click', 'input', 'change', 'focus', 'blur', 'keydown', 'keyup', 'mouseenter', 'mouseleave', 'ngIf', 'ngFor', 'ngClass', 'ngStyle', 'ngModel'].includes(s);
}
function isStaticHtmlAttr(s: string): boolean {
  return ['class', 'id', 'style', 'title', 'role', 'tabindex', 'slot', 'name', 'value', 'href', 'src'].includes(s) || s.startsWith('aria-') || s.startsWith('data-');
}

// ---------- main ----------

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const runs: RunMetrics[] = [];
  const reports: Record<string, HallucinationReport> = {};

  // Default mode now runs THREE scenarios in sequence:
  //   A-baseline      — no kit, no cache
  //   B-cold          — kit + cache_control, first call (pays cache creation)
  //   B-warm          — kit + cache_control, second call (should hit cache)
  //
  // This gives us a clean cost picture in a single invocation:
  //   - baseline cost
  //   - kit's one-time warm-up cost
  //   - kit's steady-state cost (what production actually looks like)

  const cachedSystem: Anthropic.TextBlockParam[] = [
    { type: 'text', text: BASE_SYSTEM_PROMPT },
    {
      type: 'text',
      text: KIT_SYSTEM_ADDENDUM,
      cache_control: { type: 'ephemeral' },
    },
  ];
  const cachedTools = [...FS_TOOLS, KIT_TOOL].map((t, i, arr) =>
    i === arr.length - 1 ? { ...t, cache_control: { type: 'ephemeral' as const } } : t,
  );

  if (!onlyArg || onlyArg === 'A') {
    const r = await runScenario({
      scenario: 'A-baseline',
      systemPrompt: BASE_SYSTEM_PROMPT,
      tools: FS_TOOLS,
      outDir: join(RESULTS_DIR, 'A-baseline'),
    });
    runs.push(r);
    reports['A-baseline'] = analyzeHallucinations(r.files);
  }

  if (!onlyArg || onlyArg === 'B') {
    const cold = await runScenario({
      scenario: 'B-cold',
      systemPrompt: cachedSystem,
      tools: cachedTools as Anthropic.Tool[],
      outDir: join(RESULTS_DIR, 'B-cold'),
    });
    runs.push(cold);
    reports['B-cold'] = analyzeHallucinations(cold.files);

    const warm = await runScenario({
      scenario: 'B-warm',
      systemPrompt: cachedSystem,
      tools: cachedTools as Anthropic.Tool[],
      outDir: join(RESULTS_DIR, 'B-warm'),
    });
    runs.push(warm);
    reports['B-warm'] = analyzeHallucinations(warm.files);
  }

  // Write report.md
  const md: string[] = [];
  md.push(`# UI5 Kit Graph — Comparison Report`);
  md.push(``);
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push(`Model: \`${modelArg}\``);
  md.push(``);
  md.push(`## Test prompt`);
  md.push(``);
  md.push('```');
  md.push(TEST_PROMPT);
  md.push('```');
  md.push(``);
  md.push(`## Metrics`);
  md.push(``);
  md.push(`| Metric | ${runs.map((r) => r.scenario).join(' | ')} |`);
  md.push(`|---|${runs.map(() => '---').join('|')}|`);
  md.push(`| Turns                  | ${runs.map((r) => r.turns).join(' | ')} |`);
  md.push(`| Input tokens           | ${runs.map((r) => r.inputTokens).join(' | ')} |`);
  md.push(`| Cache creation tokens  | ${runs.map((r) => r.cacheCreationTokens).join(' | ')} |`);
  md.push(`| Cache read tokens      | ${runs.map((r) => r.cacheReadTokens).join(' | ')} |`);
  md.push(`| Output tokens          | ${runs.map((r) => r.outputTokens).join(' | ')} |`);
  md.push(`| **Billed input (in + cache_creation×1.25 + cache_read×0.1)** | ${runs.map((r) => Math.round(r.inputTokens + r.cacheCreationTokens * 1.25 + r.cacheReadTokens * 0.1)).join(' | ')} |`);
  md.push(`| Duration (s)           | ${runs.map((r) => (r.durationMs / 1000).toFixed(1)).join(' | ')} |`);
  md.push(`| Files written          | ${runs.map((r) => r.filesWritten).join(' | ')} |`);
  md.push(``);
  md.push(`### Tool calls`);
  md.push(``);
  const allToolNames = [...new Set(runs.flatMap((r) => Object.keys(r.toolCalls)))];
  md.push(`| Tool | ${runs.map((r) => r.scenario).join(' | ')} |`);
  md.push(`|---|${runs.map(() => '---').join('|')}|`);
  for (const t of allToolNames) {
    md.push(`| ${t} | ${runs.map((r) => r.toolCalls[t] ?? 0).join(' | ')} |`);
  }
  md.push(``);
  md.push(`## Hallucination analysis`);
  md.push(``);
  md.push(`Counts of UI5 component usages where the component, attribute, or event does not exist in the graph.`);
  md.push(``);
  md.push(`| Metric | ${runs.map((r) => r.scenario).join(' | ')} |`);
  md.push(`|---|${runs.map(() => '---').join('|')}|`);
  md.push(`| Total \`<ui5-*>\` usages | ${runs.map((r) => reports[r.scenario].totalUsages).join(' | ')} |`);
  md.push(`| Distinct components used | ${runs.map((r) => reports[r.scenario].knownComponents.size + reports[r.scenario].unknownComponents.length).join(' | ')} |`);
  md.push(`| **Unknown components** | ${runs.map((r) => reports[r.scenario].unknownComponents.length).join(' | ')} |`);
  md.push(`| **Unknown properties** | ${runs.map((r) => reports[r.scenario].unknownProperties.length).join(' | ')} |`);
  md.push(`| **Unknown events** | ${runs.map((r) => reports[r.scenario].unknownEvents.length).join(' | ')} |`);
  md.push(``);

  for (const r of runs) {
    const rep = reports[r.scenario];
    md.push(`### ${r.scenario} — details`);
    md.push(``);
    if (rep.unknownComponents.length) {
      md.push(`**Unknown components:**`);
      for (const u of rep.unknownComponents) md.push(`- \`<${u.tag}>\` in \`${u.where}\``);
      md.push(``);
    }
    if (rep.unknownProperties.length) {
      md.push(`**Unknown properties:**`);
      for (const u of rep.unknownProperties) md.push(`- \`<${u.tag}>\` \`${u.prop}\` in \`${u.where}\``);
      md.push(``);
    }
    if (rep.unknownEvents.length) {
      md.push(`**Unknown events:**`);
      for (const u of rep.unknownEvents) md.push(`- \`<${u.tag}>\` \`(${u.event})\` in \`${u.where}\``);
      md.push(``);
    }
    if (!rep.unknownComponents.length && !rep.unknownProperties.length && !rep.unknownEvents.length) {
      md.push(`No hallucinations detected. ✓`);
      md.push(``);
    }
  }

  md.push(`## Final assistant text`);
  md.push(``);
  for (const r of runs) {
    md.push(`### ${r.scenario}`);
    md.push('```');
    md.push(r.finalText || '(empty)');
    md.push('```');
    md.push(``);
  }

  writeFileSync(join(RESULTS_DIR, 'report.md'), md.join('\n'));
  console.log(`\n✓ Report written to ${join(RESULTS_DIR, 'report.md')}`);

  // Console summary
  console.log('\n--- Summary ---');
  for (const r of runs) {
    const rep = reports[r.scenario];
    const total = r.inputTokens + r.outputTokens;
    console.log(
      `  ${r.scenario.padEnd(14)} ${String(total).padStart(7)} tok · ${r.turns}t · ${r.filesWritten}f · ${rep.unknownComponents.length}+${rep.unknownProperties.length}+${rep.unknownEvents.length} hallucinations`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
