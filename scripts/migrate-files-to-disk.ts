/**
 * Migration script: Move project files from SQLite to disk.
 *
 * For each project that still has a `files` JSON blob in the DB:
 *   1. Parse the JSON
 *   2. Write the file tree to storage/projects/{projectId}/
 *   3. Set project.files = NULL in the DB
 *
 * Also clears ChatMessage.files blobs (old per-message snapshots).
 *
 * Usage:  npx tsx scripts/migrate-files-to-disk.ts
 *         (or: npx ts-node scripts/migrate-files-to-disk.ts)
 */

import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs/promises';

const prisma = new PrismaClient();
const STORAGE_DIR = process.env['STORAGE_DIR'] || path.join(process.cwd(), 'storage');

async function writeTree(basePath: string, files: any): Promise<number> {
  let count = 0;
  for (const name in files) {
    if (name === '.DS_Store') continue;
    const node = files[name];
    const targetPath = path.join(basePath, name);

    if (node.file) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const contents = node.file.contents;
      if (node.file.encoding === 'base64') {
        await fs.writeFile(targetPath, Buffer.from(contents, 'base64'));
      } else {
        await fs.writeFile(targetPath, contents);
      }
      count++;
    } else if (node.directory) {
      await fs.mkdir(targetPath, { recursive: true });
      count += await writeTree(targetPath, node.directory);
    }
  }
  return count;
}

async function main() {
  console.log('=== Migrate project files from DB to disk ===\n');

  // 1. Migrate Project.files
  const projects = await prisma.project.findMany({
    where: { files: { not: null } },
    select: { id: true, name: true, files: true },
  });

  console.log(`Found ${projects.length} project(s) with files in DB.\n`);

  let migrated = 0;
  let skipped = 0;

  for (const project of projects) {
    const projectPath = path.join(STORAGE_DIR, 'projects', project.id);

    try {
      const files = JSON.parse(project.files!);
      const fileCount = await writeTree(projectPath, files);

      // Clear the DB column
      await prisma.project.update({
        where: { id: project.id },
        data: { files: null },
      });

      console.log(`  [OK] ${project.name} (${project.id}) — ${fileCount} files written to ${projectPath}`);
      migrated++;
    } catch (err: any) {
      console.error(`  [FAIL] ${project.name} (${project.id}) — ${err.message}`);
      skipped++;
    }
  }

  // 2. Clear ChatMessage.files blobs
  const messagesWithFiles = await prisma.chatMessage.count({
    where: { files: { not: null } },
  });

  if (messagesWithFiles > 0) {
    console.log(`\nClearing ${messagesWithFiles} chat message file snapshot(s)...`);
    await prisma.chatMessage.updateMany({
      where: { files: { not: null } },
      data: { files: null },
    });
    console.log('  Done.');
  }

  console.log(`\n=== Migration complete ===`);
  console.log(`  Projects migrated: ${migrated}`);
  console.log(`  Projects skipped:  ${skipped}`);
  console.log(`  Message blobs cleared: ${messagesWithFiles}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
