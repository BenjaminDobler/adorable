/**
 * Kit Service
 *
 * Central service for Kit DB operations. Kits are stored in the Prisma Kit table
 * with top-level queryable fields (id, name, description, thumbnail, isGlobal)
 * and a JSON `config` column for everything else (template, npmPackages, resources, etc.).
 *
 * The Kit TypeScript interface (providers/kits/types.ts) stays unchanged —
 * consumer code sees the same object shape.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { prisma } from '../db/prisma';
import { Kit } from '../providers/kits/types';
import { parseUserSettings } from './user-settings.service';
import { kitFsService } from './kit-fs.service';

type KitRow = {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  isGlobal: boolean;
  deprecated: boolean;
  config: string;
  userId: string | null;
  teamId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Merge a Prisma Kit row back into the Kit TypeScript interface.
 */
function dbRowToKit(row: KitRow): Kit {
  const config = JSON.parse(row.config || '{}');
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    thumbnail: row.thumbnail || undefined,
    isGlobal: row.isGlobal,
    deprecated: row.deprecated || false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // Spread config fields (template, npmPackage, importSuffix, npmPackages, resources, designTokens, systemPrompt, baseSystemPrompt, mcpServerIds)
    template: config.template || { type: 'default', files: {}, angularVersion: '21' },
    npmPackage: config.npmPackage,
    importSuffix: config.importSuffix,
    npmPackages: config.npmPackages,
    resources: config.resources || [],
    designTokens: config.designTokens,
    systemPrompt: config.systemPrompt,
    baseSystemPrompt: config.baseSystemPrompt,
    mcpServerIds: config.mcpServerIds || [],
    lessonsEnabled: config.lessonsEnabled,
    commands: config.commands,
    teamId: row.teamId || undefined,
  };
}

/**
 * Extract top-level DB columns and serialize the rest into `config` JSON.
 */
function kitToDbData(kit: Kit, userId?: string, teamId?: string) {
  const config = {
    template: kit.template,
    npmPackage: kit.npmPackage,
    importSuffix: kit.importSuffix,
    npmPackages: kit.npmPackages,
    resources: kit.resources,
    designTokens: kit.designTokens,
    systemPrompt: kit.systemPrompt,
    baseSystemPrompt: kit.baseSystemPrompt,
    mcpServerIds: kit.mcpServerIds,
    lessonsEnabled: kit.lessonsEnabled,
    commands: kit.commands,
  };
  return {
    id: kit.id,
    name: kit.name,
    description: kit.description || null,
    thumbnail: kit.thumbnail || null,
    isGlobal: kit.isGlobal || false,
    config: JSON.stringify(config),
    userId: teamId ? null : (userId || null),
    teamId: teamId || null,
  };
}

class KitService {
  /**
   * List all kits owned by a user, their teams, or built-in.
   */
  async listByUser(userId: string): Promise<Kit[]> {
    // Find all teams the user belongs to
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);

    const rows = await prisma.kit.findMany({
      where: {
        OR: [
          { userId },
          { userId: null, isGlobal: true, deprecated: false },
          ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(dbRowToKit);
  }

  /**
   * Get a single kit by ID, scoped to the user, their teams, or built-in.
   */
  async getById(kitId: string, userId: string): Promise<Kit | undefined> {
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);

    const row = await prisma.kit.findFirst({
      where: {
        id: kitId,
        OR: [
          { userId },
          { userId: null, isGlobal: true },
          ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        ],
      },
    });
    return row ? dbRowToKit(row) : undefined;
  }

  /**
   * Create a new kit in the database.
   * When teamId is set, userId is cleared (exclusive ownership).
   */
  async create(kit: Kit, userId: string, teamId?: string, isGlobal = false): Promise<Kit> {
    const data = kitToDbData(kit, isGlobal ? undefined : userId, teamId);
    if (isGlobal) {
      data.isGlobal = true;
      data.userId = null;
      data.teamId = null;
    }
    const row = await prisma.kit.create({ data });
    return dbRowToKit(row);
  }

  /**
   * List all global kits (including deprecated) — for admin panel.
   */
  async listGlobal(): Promise<Kit[]> {
    const rows = await prisma.kit.findMany({
      where: { isGlobal: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(dbRowToKit);
  }

  /**
   * Update an existing kit. Only updates fields present in `updates`.
   * When isAdmin is true and the kit is global, bypasses userId ownership check.
   * Returns the updated kit or undefined if not found.
   */
  async update(kitId: string, updates: Kit, userId: string, isAdmin = false): Promise<Kit | undefined> {
    const existing = await prisma.kit.findUnique({ where: { id: kitId } });
    if (!existing) return undefined;

    // Verify ownership: admin can update global kits, users can only update their own
    if (existing.isGlobal) {
      if (!isAdmin) return undefined;
    } else if (existing.userId !== userId) {
      return undefined;
    }

    const data = kitToDbData(updates, existing.isGlobal ? undefined : userId);
    // Preserve isGlobal flag
    data.isGlobal = existing.isGlobal;
    // Remove id — can't update primary key
    const { id, ...updateData } = data;
    const row = await prisma.kit.update({
      where: { id: kitId },
      data: updateData,
    });
    return dbRowToKit(row);
  }

  /**
   * Delete a kit by ID. Admin can delete global kits, users can only delete their own.
   */
  async delete(kitId: string, userId: string, isAdmin = false): Promise<boolean> {
    const existing = await prisma.kit.findUnique({ where: { id: kitId } });
    if (!existing) return false;

    if (existing.isGlobal) {
      if (!isAdmin) return false;
    } else if (existing.userId !== userId) {
      return false;
    }

    await prisma.kit.delete({ where: { id: kitId } });
    return true;
  }

  /**
   * Deprecate a global kit (admin-only). Deprecated kits are hidden from new project creation.
   */
  async deprecate(kitId: string): Promise<Kit | undefined> {
    const existing = await prisma.kit.findFirst({ where: { id: kitId, isGlobal: true } });
    if (!existing) return undefined;
    const row = await prisma.kit.update({ where: { id: kitId }, data: { deprecated: true } });
    return dbRowToKit(row);
  }

  /**
   * Undeprecate a global kit (admin-only). Restores visibility for new project creation.
   */
  async undeprecate(kitId: string): Promise<Kit | undefined> {
    const existing = await prisma.kit.findFirst({ where: { id: kitId, isGlobal: true } });
    if (!existing) return undefined;
    const row = await prisma.kit.update({ where: { id: kitId }, data: { deprecated: false } });
    return dbRowToKit(row);
  }

  /**
   * Check if a kit name already exists for a user.
   */
  async nameExists(name: string, userId: string, excludeKitId?: string): Promise<boolean> {
    const row = await prisma.kit.findFirst({
      where: {
        userId,
        name: { equals: name },
        ...(excludeKitId ? { NOT: { id: excludeKitId } } : {}),
      },
    });
    return !!row;
  }

  /**
   * Startup migration: move kits from User.settings JSON → Kit table.
   * Idempotent — skips kits that already exist in the table.
   */
  async migrateFromSettings(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { settings: { not: null } },
      select: { id: true, settings: true },
    });

    let totalMigrated = 0;

    for (const user of users) {
      if (!user.settings) continue;

      const settings = parseUserSettings(user.settings);

      if (!Array.isArray(settings.kits) || settings.kits.length === 0) {
        continue;
      }

      let migratedCount = 0;
      for (const kit of settings.kits as Kit[]) {
        if (!kit.id) continue;

        // Skip if already in the Kit table
        const exists = await prisma.kit.findUnique({ where: { id: kit.id } });
        if (exists) continue;

        const data = kitToDbData(kit, user.id);
        await prisma.kit.create({ data });
        migratedCount++;
      }

      // Remove kits key from settings now that they're migrated
      const { kits: _removed, ...cleanSettings } = settings;
      await prisma.user.update({
        where: { id: user.id },
        data: { settings: JSON.stringify(cleanSettings) },
      });

      totalMigrated += migratedCount;
    }

    if (totalMigrated > 0) {
      console.log(`[Kit Migration] Migrated ${totalMigrated} kit(s) from user settings to Kit table`);
    }
  }
  /**
   * Seed the built-in default kit from assets.
   * Reads kit.json metadata and template files from the assets directory,
   * creates/updates the Kit DB row, and syncs template files to storage/kits/.
   * Idempotent — safe to call on every startup.
   */
  async seedDefaultKit(): Promise<void> {
    // Resolve asset path (dev source or prod dist)
    const devPath = path.join(process.cwd(), 'apps/server/src/assets/default-kit');
    const prodPath = path.join(__dirname, 'assets/default-kit');

    let assetPath: string | null = null;
    for (const p of [devPath, prodPath]) {
      try {
        await fs.access(path.join(p, 'kit.json'));
        assetPath = p;
        break;
      } catch {
        // Try next path
      }
    }

    if (!assetPath) {
      console.log('[Default Kit] No default kit assets found, skipping seed');
      return;
    }

    // Read kit metadata
    const kitMeta = JSON.parse(await fs.readFile(path.join(assetPath, 'kit.json'), 'utf-8'));
    const kitId = kitMeta.id;

    // Check if already exists in DB
    const existing = await prisma.kit.findUnique({ where: { id: kitId } });

    // Read template files from assets into FileTree format
    const templateFiles = await kitFsService.readDirAsFileTreeFromPath(path.join(assetPath, 'template'));

    const config = {
      template: {
        type: kitMeta.template?.type || 'default',
        angularVersion: kitMeta.template?.angularVersion || '21',
        files: {},
        storedOnDisk: true,
      },
      resources: [],
      mcpServerIds: [],
    };

    if (existing) {
      // Update: sync template files to disk, update DB metadata
      await kitFsService.writeKitTemplateFiles(kitId, templateFiles);
      await prisma.kit.update({
        where: { id: kitId },
        data: {
          name: kitMeta.name,
          description: kitMeta.description || null,
          config: JSON.stringify(config),
        },
      });
      console.log(`[Default Kit] Updated "${kitMeta.name}" (${kitId})`);
    } else {
      // Create: write template files to disk, insert DB row
      await kitFsService.writeKitTemplateFiles(kitId, templateFiles);
      await prisma.kit.create({
        data: {
          id: kitId,
          name: kitMeta.name,
          description: kitMeta.description || null,
          isGlobal: true,
          config: JSON.stringify(config),
          userId: null,
          teamId: null,
        },
      });
      console.log(`[Default Kit] Created "${kitMeta.name}" (${kitId})`);
    }
  }

  /**
   * Seed all built-in kits from the assets/kits/ directory.
   * Each subdirectory should contain a kit.json. The method handles:
   *   - Template files (if template/ exists)
   *   - Pre-generated .adorable/ files (component docs, design tokens)
   *   - Kit config from kit.json (systemPrompt, npmPackages, etc.)
   * Idempotent — safe to call on every startup.
   */
  async seedBuiltInKits(): Promise<void> {
    // Resolve the kits directory (dev source or prod dist)
    const devPath = path.join(process.cwd(), 'apps/server/src/assets/kits');
    const prodPath = path.join(__dirname, 'assets/kits');

    let kitsDir: string | null = null;
    for (const p of [devPath, prodPath]) {
      try {
        const stat = await fs.stat(p);
        if (stat.isDirectory()) {
          kitsDir = p;
          break;
        }
      } catch {
        // Try next path
      }
    }

    if (!kitsDir) return;

    // Scan for kit subdirectories
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(kitsDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const kitAssetPath = path.join(kitsDir, entry.name);
      const kitJsonPath = path.join(kitAssetPath, 'kit.json');

      // Skip directories without kit.json
      try {
        await fs.access(kitJsonPath);
      } catch {
        continue;
      }

      try {
        await this.seedOneBuiltInKit(kitAssetPath);
      } catch (err) {
        console.error(`[Built-in Kit] Error seeding "${entry.name}":`, err);
      }
    }
  }

  /**
   * Seed a single built-in kit from an asset directory.
   */
  private async seedOneBuiltInKit(assetPath: string): Promise<void> {
    const kitMeta = JSON.parse(await fs.readFile(path.join(assetPath, 'kit.json'), 'utf-8'));
    const kitId = kitMeta.id;

    // Build config from kit.json metadata
    const config: Record<string, unknown> = {
      template: {
        type: kitMeta.template?.type || 'default',
        angularVersion: kitMeta.template?.angularVersion || '21',
        files: {},
        storedOnDisk: true,
      },
      resources: kitMeta.resources || [],
      mcpServerIds: kitMeta.mcpServerIds || [],
    };

    // Pass through optional fields from kit.json
    if (kitMeta.npmPackages) config.npmPackages = kitMeta.npmPackages;
    if (kitMeta.npmPackage) config.npmPackage = kitMeta.npmPackage;
    if (kitMeta.importSuffix) config.importSuffix = kitMeta.importSuffix;
    if (kitMeta.systemPrompt) config.systemPrompt = kitMeta.systemPrompt;
    if (kitMeta.baseSystemPrompt) config.baseSystemPrompt = kitMeta.baseSystemPrompt;
    if (kitMeta.designTokens) config.designTokens = kitMeta.designTokens;
    if (kitMeta.commands) config.commands = kitMeta.commands;
    if (kitMeta.lessonsEnabled !== undefined) config.lessonsEnabled = kitMeta.lessonsEnabled;

    // Read template files (if template/ directory exists)
    const templateDir = path.join(assetPath, 'template');
    let hasTemplate = false;
    try {
      const stat = await fs.stat(templateDir);
      hasTemplate = stat.isDirectory();
    } catch { /* no template dir */ }

    if (hasTemplate) {
      const templateFiles = await kitFsService.readDirAsFileTreeFromPath(templateDir);
      await kitFsService.writeKitTemplateFiles(kitId, templateFiles);
    }

    // Read pre-generated .adorable/ files (component docs, design tokens)
    const adorableDir = path.join(assetPath, '.adorable');
    let hasAdorable = false;
    try {
      const stat = await fs.stat(adorableDir);
      hasAdorable = stat.isDirectory();
    } catch { /* no .adorable dir */ }

    if (hasAdorable) {
      const adorableFiles = await this.readAdorableFilesFromPath(adorableDir);
      await kitFsService.writeKitAdorableFiles(kitId, adorableFiles);
    }

    // Upsert into the DB
    const existing = await prisma.kit.findUnique({ where: { id: kitId } });

    if (existing) {
      await prisma.kit.update({
        where: { id: kitId },
        data: {
          name: kitMeta.name,
          description: kitMeta.description || null,
          config: JSON.stringify(config),
        },
      });
      console.log(`[Built-in Kit] Updated "${kitMeta.name}" (${kitId})`);
    } else {
      await prisma.kit.create({
        data: {
          id: kitId,
          name: kitMeta.name,
          description: kitMeta.description || null,
          isGlobal: true,
          config: JSON.stringify(config),
          userId: null,
          teamId: null,
        },
      });
      console.log(`[Built-in Kit] Created "${kitMeta.name}" (${kitId})`);
    }
  }

  /**
   * Read all files from a .adorable directory into a flat Record.
   * Keys are relative paths like ".adorable/components/Button.md".
   */
  private async readAdorableFilesFromPath(adorablePath: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    await this.readDirRecursiveFlat(adorablePath, '.adorable', result);
    return result;
  }

  private async readDirRecursiveFlat(
    dirPath: string,
    prefix: string,
    result: Record<string, string>
  ): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = prefix + '/' + entry.name;
      if (entry.isDirectory()) {
        await this.readDirRecursiveFlat(fullPath, relativePath, result);
      } else if (entry.isFile()) {
        try {
          result[relativePath] = await fs.readFile(fullPath, 'utf-8');
        } catch {
          // skip unreadable files
        }
      }
    }
  }
}

export const kitService = new KitService();
