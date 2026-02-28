/**
 * Kit Service
 *
 * Central service for Kit DB operations. Kits are stored in the Prisma Kit table
 * with top-level queryable fields (id, name, description, thumbnail, isBuiltIn)
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
  isBuiltIn: boolean;
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
    isBuiltIn: row.isBuiltIn,
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
  };
  return {
    id: kit.id,
    name: kit.name,
    description: kit.description || null,
    thumbnail: kit.thumbnail || null,
    isBuiltIn: kit.isBuiltIn || false,
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
          { userId: null, isBuiltIn: true },
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
          { userId: null, isBuiltIn: true },
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
  async create(kit: Kit, userId: string, teamId?: string): Promise<Kit> {
    const data = kitToDbData(kit, userId, teamId);
    const row = await prisma.kit.create({ data });
    return dbRowToKit(row);
  }

  /**
   * Update an existing kit. Only updates fields present in `updates`.
   * Returns the updated kit or undefined if not found.
   */
  async update(kitId: string, updates: Kit, userId: string): Promise<Kit | undefined> {
    // Verify ownership
    const existing = await prisma.kit.findFirst({
      where: { id: kitId, userId },
    });
    if (!existing) return undefined;

    const data = kitToDbData(updates, userId);
    // Remove id — can't update primary key
    const { id, ...updateData } = data;
    const row = await prisma.kit.update({
      where: { id: kitId },
      data: updateData,
    });
    return dbRowToKit(row);
  }

  /**
   * Delete a kit by ID, scoped to the user.
   */
  async delete(kitId: string, userId: string): Promise<boolean> {
    const existing = await prisma.kit.findFirst({
      where: { id: kitId, userId },
    });
    if (!existing) return false;

    await prisma.kit.delete({ where: { id: kitId } });
    return true;
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
