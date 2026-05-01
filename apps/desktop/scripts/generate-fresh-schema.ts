/**
 * Regenerate `apps/desktop/db-fresh-schema.generated.ts` from the current
 * Prisma schema. Run after any change to `prisma/schema.prisma`:
 *
 *     npm run db:generate-fresh-schema
 *
 * Pass `--check` to verify the committed file is up-to-date without writing
 * (exit 1 if stale). Useful as a pre-commit hook or CI gate.
 *
 * Background: `apps/desktop/db-init.ts` previously hand-mirrored every
 * Prisma model into a CREATE TABLE block — easy to forget on a schema
 * change and the desktop app would silently start with a wrong schema.
 * `prisma migrate diff --from-empty` already knows how to emit canonical
 * SQL for the current schema; we just embed its output.
 *
 * The migrations array in db-init.ts is still hand-maintained because each
 * migration entry needs a developer-chosen default value and version
 * number. Only the fresh-install path is auto-generated here.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PRISMA_SCHEMA = path.join(REPO_ROOT, 'prisma/schema.prisma');
const OUT_FILE = path.join(REPO_ROOT, 'apps/desktop/db-fresh-schema.generated.ts');

const checkMode = process.argv.includes('--check');

const sql = execSync(
  `npx prisma migrate diff --from-empty --to-schema-datamodel "${PRISMA_SCHEMA}" --script`,
  { encoding: 'utf-8', cwd: REPO_ROOT },
).trim();

// Defensively escape characters that would break the template literal we wrap
// the SQL in. Prisma's output doesn't currently contain backticks or `${`,
// but Prisma versions can change emit details, so escape them anyway.
const escaped = sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const generated = `// AUTO-GENERATED — do not edit by hand.
// Source: prisma/schema.prisma
// Regenerate with: npm run db:generate-fresh-schema
//
// Full SQL needed to create the desktop SQLite schema from scratch.
// db-init.ts uses this for fresh-install setup; existing installs continue
// to use the versioned migrations array (which is still hand-maintained).

export const FRESH_SCHEMA_SQL = \`${escaped}\n\`;
`;

if (checkMode) {
  const existing = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf-8') : '';
  if (existing !== generated) {
    console.error(
      `[generate-fresh-schema] ${path.relative(REPO_ROOT, OUT_FILE)} is out of date.\n` +
      `Run \`npm run db:generate-fresh-schema\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log(`[generate-fresh-schema] ${path.relative(REPO_ROOT, OUT_FILE)} is up to date.`);
} else {
  fs.writeFileSync(OUT_FILE, generated, 'utf-8');
  console.log(`[generate-fresh-schema] wrote ${path.relative(REPO_ROOT, OUT_FILE)} (${sql.split('\n').length} SQL lines)`);
}
