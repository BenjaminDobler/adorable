#!/usr/bin/env node
/**
 * Adorable AI Provider Benchmark Runner
 *
 * Runs standardized test prompts against different AI providers and kits,
 * collects metrics, and generates a comparison report.
 *
 * Usage:
 *   node evals/benchmarks/run-benchmark.mjs [options]
 *
 * Options:
 *   --server <url>       Adorable server URL (default: http://localhost:3333)
 *   --providers <list>   Comma-separated providers (default: anthropic,claude-code)
 *   --prompts <ids>      Comma-separated prompt IDs (default: all)
 *   --kit <id>           Kit ID to use (default: none)
 *   --output <dir>       Output directory (default: evals/benchmarks/results)
 *   --runs <n>           Number of runs per combination (default: 1)
 *
 * Examples:
 *   node evals/benchmarks/run-benchmark.mjs --providers anthropic --prompts simple-component
 *   node evals/benchmarks/run-benchmark.mjs --providers anthropic,claude-code --prompts crud-feature,dashboard-layout
 *   node evals/benchmarks/run-benchmark.mjs --providers anthropic --kit default-angular-starter --runs 3
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const SERVER = getArg('server', 'http://localhost:3333');
const PROVIDERS = getArg('providers', 'anthropic,claude-code').split(',');
const PROMPT_IDS = getArg('prompts', '').split(',').filter(Boolean);
const KIT_ID = getArg('kit', '');
const OUTPUT_DIR = getArg('output', path.join(__dirname, 'results'));
const RUNS = parseInt(getArg('runs', '1'));

// ── Load test prompts ────────────────────────────────────────────────

const allPrompts = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-prompts.json'), 'utf-8'));
const prompts = PROMPT_IDS.length > 0
  ? allPrompts.filter(p => PROMPT_IDS.includes(p.id))
  : allPrompts.filter(p => !p.requiresFigma); // Skip Figma tests by default

// ── Auth ─────────────────────────────────────────────────────────────

let authToken = process.env.ADORABLE_TOKEN || '';

async function login() {
  if (authToken) return;

  // Verify server is reachable
  try {
    const res = await fetch(`${SERVER}/api/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  } catch (err) {
    console.error(`Cannot reach server at ${SERVER}: ${err.message}`);
    process.exit(1);
  }

  // Get a fresh token from the server's benchmark endpoint
  try {
    const res = await fetch(`${SERVER}/api/system/benchmark-token`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status}: ${body}`);
    }
    const data = await res.json();
    authToken = data.token;
    console.log(`Got benchmark token for ${data.email} (${data.userId})`);
  } catch (err) {
    console.error(`Auth failed: ${err.message}`);
    console.error('Make sure the Adorable desktop app is running. Or set ADORABLE_TOKEN env var.');
    process.exit(1);
  }
}

// ── Create project ───────────────────────────────────────────────────

async function createProject(name) {
  const res = await fetch(`${SERVER}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ name, kitId: KIT_ID || undefined }),
  });

  if (!res.ok) throw new Error(`Create project failed: ${res.status}`);
  const data = await res.json();
  return data.id;
}

// ── Run generation ───────────────────────────────────────────────────

async function runGeneration(projectId, prompt, provider, model) {
  const startTime = Date.now();
  const metrics = {
    provider,
    model,
    prompt: prompt.id,
    promptText: prompt.prompt,
    startTime: new Date().toISOString(),
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cost: 0,
    subscription: false,
    toolCalls: [],
    fileWrites: [],
    errors: [],
    buildPassed: null,
    textLength: 0,
  };

  return new Promise((resolve, reject) => {
    fetch(`${SERVER}/api/generate-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        prompt: prompt.prompt,
        provider,
        model,
        projectId,
        kitId: KIT_ID || undefined,
      }),
    }).then(async (response) => {
      if (!response.ok) {
        metrics.errors.push(`HTTP ${response.status}: ${await response.text()}`);
        metrics.durationMs = Date.now() - startTime;
        resolve(metrics);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            processEvent(event, metrics);
          } catch { /* skip */ }
        }
      }

      metrics.durationMs = Date.now() - startTime;
      resolve(metrics);
    }).catch(err => {
      metrics.errors.push(err.message);
      metrics.durationMs = Date.now() - startTime;
      resolve(metrics);
    });
  });
}

function processEvent(event, metrics) {
  switch (event.type) {
    case 'text':
      metrics.textLength += (event.content || '').length;
      break;
    case 'tool_call':
      metrics.toolCalls.push({ name: event.name, index: event.index });
      break;
    case 'file_written':
      metrics.fileWrites.push(event.path);
      break;
    case 'usage':
      metrics.inputTokens = event.usage?.inputTokens || 0;
      metrics.outputTokens = event.usage?.outputTokens || 0;
      metrics.totalTokens = (event.usage?.inputTokens || 0) + (event.usage?.outputTokens || 0);
      metrics.cacheReadTokens = event.usage?.cacheReadInputTokens || 0;
      metrics.cacheCreationTokens = event.usage?.cacheCreationInputTokens || 0;
      metrics.cost = event.cost?.totalCost || 0;
      metrics.subscription = event.cost?.subscription || false;
      break;
    case 'result':
      // Check if build passed from the result
      const text = JSON.stringify(event.content || '');
      metrics.buildPassed = !text.includes('build failed') && !text.includes('compilation error');
      break;
    case 'error':
      metrics.errors.push(event.content || 'Unknown error');
      break;
  }
}

// ── Report ───────────────────────────────────────────────────────────

function generateReport(allResults) {
  const report = {
    timestamp: new Date().toISOString(),
    config: { server: SERVER, providers: PROVIDERS, kit: KIT_ID, runs: RUNS },
    summary: {},
    details: allResults,
  };

  // Group by prompt
  const byPrompt = {};
  for (const r of allResults) {
    if (!byPrompt[r.prompt]) byPrompt[r.prompt] = [];
    byPrompt[r.prompt].push(r);
  }

  // Generate summary
  for (const [promptId, results] of Object.entries(byPrompt)) {
    const byProvider = {};
    for (const r of results) {
      if (!byProvider[r.provider]) byProvider[r.provider] = [];
      byProvider[r.provider].push(r);
    }

    report.summary[promptId] = {};
    for (const [provider, runs] of Object.entries(byProvider)) {
      const avgDuration = runs.reduce((s, r) => s + r.durationMs, 0) / runs.length;
      const avgTokens = runs.reduce((s, r) => s + r.totalTokens, 0) / runs.length;
      const avgCost = runs.reduce((s, r) => s + r.cost, 0) / runs.length;
      const avgToolCalls = runs.reduce((s, r) => s + r.toolCalls.length, 0) / runs.length;
      const avgFileWrites = runs.reduce((s, r) => s + r.fileWrites.length, 0) / runs.length;
      const errorRate = runs.filter(r => r.errors.length > 0).length / runs.length;

      report.summary[promptId][provider] = {
        runs: runs.length,
        avgDuration: Math.round(avgDuration),
        avgDurationFormatted: formatDuration(avgDuration),
        avgTokens: Math.round(avgTokens),
        avgCost: avgCost.toFixed(4),
        avgToolCalls: Math.round(avgToolCalls * 10) / 10,
        avgFileWrites: Math.round(avgFileWrites * 10) / 10,
        errorRate: (errorRate * 100).toFixed(0) + '%',
        subscription: runs[0]?.subscription || false,
      };
    }
  }

  return report;
}

function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function printReport(report) {
  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(80));
  console.log(`Date: ${report.timestamp}`);
  console.log(`Providers: ${PROVIDERS.join(', ')}`);
  console.log(`Kit: ${KIT_ID || '(none)'}`);
  console.log(`Runs per combination: ${RUNS}`);
  console.log('');

  for (const [promptId, providers] of Object.entries(report.summary)) {
    const prompt = allPrompts.find(p => p.id === promptId);
    console.log(`\n── ${prompt?.name || promptId} ──`);
    console.log(`   "${(prompt?.prompt || '').substring(0, 80)}..."`);
    console.log('');

    // Table header
    const cols = ['Provider', 'Duration', 'Tokens', 'Cost', 'Tools', 'Files', 'Errors'];
    console.log('   ' + cols.map(c => c.padEnd(12)).join(''));
    console.log('   ' + '-'.repeat(cols.length * 12));

    for (const [provider, stats] of Object.entries(providers)) {
      const row = [
        provider,
        stats.avgDurationFormatted,
        String(stats.avgTokens),
        stats.subscription ? 'subscription' : `$${stats.avgCost}`,
        String(stats.avgToolCalls),
        String(stats.avgFileWrites),
        stats.errorRate,
      ];
      console.log('   ' + row.map(c => String(c).padEnd(12)).join(''));
    }
  }

  console.log('\n' + '='.repeat(80));
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('Adorable AI Benchmark Runner');
  console.log(`Server: ${SERVER}`);
  console.log(`Providers: ${PROVIDERS.join(', ')}`);
  console.log(`Prompts: ${prompts.map(p => p.id).join(', ')}`);
  console.log(`Kit: ${KIT_ID || '(none)'}`);
  console.log(`Runs: ${RUNS}`);
  console.log('');

  await login();
  console.log('Authenticated.\n');

  const allResults = [];

  for (const prompt of prompts) {
    for (const provider of PROVIDERS) {
      // Determine model per provider
      const model = provider === 'claude-code' ? 'sonnet' :
                    provider === 'anthropic' ? 'claude-sonnet-4-5-20250929' :
                    provider === 'gemini' ? 'gemini-2.5-flash' : '';

      for (let run = 0; run < RUNS; run++) {
        const label = `[${prompt.id}] ${provider} (run ${run + 1}/${RUNS})`;
        console.log(`Starting: ${label}...`);

        try {
          const projectId = await createProject(`benchmark-${prompt.id}-${provider}-${run}`);
          const metrics = await runGeneration(projectId, prompt, provider, model);

          allResults.push(metrics);

          const status = metrics.errors.length > 0 ? 'ERROR' : 'OK';
          console.log(`  ${status}: ${formatDuration(metrics.durationMs)} | ${metrics.totalTokens} tokens | ${metrics.toolCalls.length} tools | ${metrics.fileWrites.length} files`);
        } catch (err) {
          console.error(`  FAILED: ${err.message}`);
          allResults.push({
            provider, model, prompt: prompt.id,
            errors: [err.message], durationMs: 0,
            toolCalls: [], fileWrites: [],
            inputTokens: 0, outputTokens: 0, totalTokens: 0,
            cost: 0, textLength: 0,
          });
        }
      }
    }
  }

  // Generate and save report
  const report = generateReport(allResults);
  printReport(report);

  // Save to file
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filename = `benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${filepath}`);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
