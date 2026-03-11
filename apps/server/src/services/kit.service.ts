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

import { prisma } from '../db/prisma';
import { Kit } from '../providers/kits/types';

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

      let settings: any;
      try {
        settings = typeof user.settings === 'string'
          ? JSON.parse(user.settings)
          : user.settings;
      } catch {
        continue;
      }

      if (!settings.kits || !Array.isArray(settings.kits) || settings.kits.length === 0) {
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
}

export const kitService = new KitService();
