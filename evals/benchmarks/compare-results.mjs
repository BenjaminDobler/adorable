#!/usr/bin/env node
/**
 * Compare two benchmark result files side-by-side.
 *
 * Usage:
 *   node evals/benchmarks/compare-results.mjs <result1.json> <result2.json>
 *   node evals/benchmarks/compare-results.mjs results/  # compares last two results
 */

import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);

function loadResults(pathOrDir) {
  if (fs.statSync(pathOrDir).isDirectory()) {
    const files = fs.readdirSync(pathOrDir)
      .filter(f => f.startsWith('benchmark-') && f.endsWith('.json'))
      .sort()
      .slice(-2);
    if (files.length < 2) {
      console.error('Need at least 2 result files in directory');
      process.exit(1);
    }
    return files.map(f => JSON.parse(fs.readFileSync(path.join(pathOrDir, f), 'utf-8')));
  }
  return [JSON.parse(fs.readFileSync(pathOrDir, 'utf-8'))];
}

let results;
if (args.length === 1) {
  results = loadResults(args[0]);
} else if (args.length === 2) {
  results = [
    JSON.parse(fs.readFileSync(args[0], 'utf-8')),
    JSON.parse(fs.readFileSync(args[1], 'utf-8')),
  ];
} else {
  console.log('Usage: compare-results.mjs <result1.json> <result2.json>');
  console.log('       compare-results.mjs <results-dir>  (compares last 2)');
  process.exit(1);
}

const [a, b] = results;

console.log('\n' + '='.repeat(80));
console.log('BENCHMARK COMPARISON');
console.log('='.repeat(80));
console.log(`Run A: ${a.timestamp}`);
console.log(`Run B: ${b.timestamp}`);
console.log('');

const allPromptIds = new Set([...Object.keys(a.summary), ...Object.keys(b.summary)]);

for (const promptId of allPromptIds) {
  console.log(`\n── ${promptId} ──`);

  const providersA = a.summary[promptId] || {};
  const providersB = b.summary[promptId] || {};
  const allProviders = new Set([...Object.keys(providersA), ...Object.keys(providersB)]);

  for (const provider of allProviders) {
    const sa = providersA[provider];
    const sb = providersB[provider];

    if (sa && sb) {
      const durationDiff = sb.avgDuration - sa.avgDuration;
      const tokenDiff = sb.avgTokens - sa.avgTokens;
      const arrow = (diff) => diff > 0 ? `+${diff}` : String(diff);
      const better = (diff, lowerIsBetter = true) =>
        diff === 0 ? '=' : (lowerIsBetter ? (diff < 0 ? 'improved' : 'regressed') : (diff > 0 ? 'improved' : 'regressed'));

      console.log(`  ${provider}:`);
      console.log(`    Duration: ${sa.avgDurationFormatted} → ${sb.avgDurationFormatted} (${arrow(durationDiff)}ms, ${better(durationDiff)})`);
      console.log(`    Tokens:   ${sa.avgTokens} → ${sb.avgTokens} (${arrow(tokenDiff)}, ${better(tokenDiff)})`);
      console.log(`    Cost:     $${sa.avgCost} → $${sb.avgCost}`);
      console.log(`    Tools:    ${sa.avgToolCalls} → ${sb.avgToolCalls}`);
      console.log(`    Files:    ${sa.avgFileWrites} → ${sb.avgFileWrites}`);
      console.log(`    Errors:   ${sa.errorRate} → ${sb.errorRate}`);
    } else if (sa) {
      console.log(`  ${provider}: only in Run A (${sa.avgDurationFormatted}, ${sa.avgTokens} tokens)`);
    } else {
      console.log(`  ${provider}: only in Run B (${sb.avgDurationFormatted}, ${sb.avgTokens} tokens)`);
    }
  }
}

console.log('\n' + '='.repeat(80));
