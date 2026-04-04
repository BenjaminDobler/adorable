#!/usr/bin/env tsx
/**
 * Build script that compiles individual TypeScript runtime scripts into a single
 * RUNTIME_SCRIPTS string constant. Each .ts file in runtime-scripts/ is compiled
 * to JavaScript via esbuild, then combined into the output.
 *
 * Usage: npx tsx libs/shared-types/scripts/build-runtime-scripts.ts
 */

import { transformSync } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCRIPTS_DIR = resolve(__dirname, '../src/lib/runtime-scripts');
const OUTPUT_FILE = resolve(__dirname, '../src/lib/runtime-scripts.generated.ts');

// Order matters — element-helpers must come before inspector/multi-annotator
const SCRIPT_ORDER = [
  'storage-settings.ts',
  'console-interceptor.ts',
  'route-tracker.ts',
  'element-helpers.ts',
  'inspector.ts',
  'multi-annotator.ts',
  'screenshot.ts',
];

function compileScript(filePath: string): string {
  const source = readFileSync(filePath, 'utf-8');
  const isGlobal = filePath.includes('element-helpers');

  const result = transformSync(source, {
    loader: 'ts',
    target: 'es2020',
    // element-helpers defines global functions — compile as plain script, not IIFE
    format: isGlobal ? 'esm' : 'iife',
  });
  let code = result.code.trim();

  // For global scripts compiled as ESM, strip any "export {}" that esbuild adds
  if (isGlobal) {
    code = code.replace(/\nexport \{\s*\};\s*$/, '').trim();
  }

  return code;
}

function build() {
  const availableFiles = readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));

  // Validate all ordered files exist
  for (const file of SCRIPT_ORDER) {
    if (!availableFiles.includes(file)) {
      console.warn(`Warning: ${file} listed in SCRIPT_ORDER but not found in ${SCRIPTS_DIR}`);
    }
  }

  // Warn about files not in the order list
  for (const file of availableFiles) {
    if (!SCRIPT_ORDER.includes(file)) {
      console.warn(`Warning: ${file} exists but is not listed in SCRIPT_ORDER — it will be skipped`);
    }
  }

  const compiledScripts: string[] = [];

  for (const file of SCRIPT_ORDER) {
    const filePath = join(SCRIPTS_DIR, file);
    try {
      const compiled = compileScript(filePath);
      compiledScripts.push(`    // --- ${file.replace('.ts', '')} ---\n${compiled.split('\n').map(l => '    ' + l).join('\n')}`);
      console.log(`  ✓ ${file} (${compiled.length} chars)`);
    } catch (e) {
      console.error(`  ✗ ${file}: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  const output = `// AUTO-GENERATED — do not edit manually.
// Source: libs/shared-types/src/lib/runtime-scripts/*.ts
// Build:  npx tsx libs/shared-types/scripts/build-runtime-scripts.ts

export const RUNTIME_SCRIPTS = \`
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script>
${compiledScripts.join('\n\n')}
  </script>
\`;
`;

  writeFileSync(OUTPUT_FILE, output, 'utf-8');
  console.log(`\nWritten to ${OUTPUT_FILE} (${output.length} chars)`);
}

build();
