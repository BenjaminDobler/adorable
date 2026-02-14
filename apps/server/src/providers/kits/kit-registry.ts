/**
 * Kit Registry
 *
 * Manages Kit CRUD operations. Kits are stored in the user's settings JSON.
 */

import { Kit, StorybookResource, KitResource } from './types';

export class KitRegistry {
  private kits: Map<string, Kit> = new Map();

  constructor(kits?: Kit[]) {
    if (kits) {
      for (const kit of kits) {
        this.kits.set(kit.id, kit);
      }
    }
  }

  /**
   * Get all kits
   */
  getAll(): Kit[] {
    return Array.from(this.kits.values());
  }

  /**
   * Get a kit by ID
   */
  get(id: string): Kit | undefined {
    return this.kits.get(id);
  }

  /**
   * Create a new kit
   */
  create(data: Omit<Kit, 'id' | 'createdAt' | 'updatedAt'>): Kit {
    const now = new Date().toISOString();
    const kit: Kit = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.kits.set(kit.id, kit);
    return kit;
  }

  /**
   * Update an existing kit
   */
  update(id: string, updates: Partial<Omit<Kit, 'id' | 'createdAt'>>): Kit | undefined {
    const kit = this.kits.get(id);
    if (!kit) return undefined;

    const updated: Kit = {
      ...kit,
      ...updates,
      id: kit.id,
      createdAt: kit.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.kits.set(id, updated);
    return updated;
  }

  /**
   * Delete a kit
   */
  delete(id: string): boolean {
    return this.kits.delete(id);
  }

  /**
   * Get the Storybook resource from a kit
   */
  getStorybookResource(kitId: string): StorybookResource | undefined {
    const kit = this.kits.get(kitId);
    if (!kit) return undefined;

    return kit.resources.find(
      (r): r is StorybookResource => r.type === 'storybook'
    );
  }

  /**
   * Get selected components from a kit's Storybook resource
   */
  getSelectedComponents(kitId: string): string[] {
    const resource = this.getStorybookResource(kitId);
    if (!resource) return [];

    // Return component names for selected components
    return resource.components
      .filter(c => resource.selectedComponentIds.includes(c.id))
      .map(c => c.componentName || c.title);
  }

  /**
   * Get all component info for a kit
   */
  getComponentInfo(kitId: string, componentName: string): {
    id: string;
    name: string;
    category?: string;
    docsUrl: string;
  } | undefined {
    const resource = this.getStorybookResource(kitId);
    if (!resource) return undefined;

    const component = resource.components.find(
      c => (c.componentName || c.title).toLowerCase() === componentName.toLowerCase()
    );

    if (!component) return undefined;

    // Build the docs URL
    const baseUrl = resource.url.replace(/\/$/, '');
    const docsUrl = `${baseUrl}/?path=/docs/${component.id}`;

    return {
      id: component.id,
      name: component.componentName || component.title,
      category: component.category,
      docsUrl,
    };
  }

  /**
   * Export kits to JSON format for storage
   */
  toJSON(): Kit[] {
    return this.getAll();
  }

  /**
   * Import kits from JSON
   */
  static fromJSON(json: Kit[]): KitRegistry {
    return new KitRegistry(json);
  }
}

/**
 * Parse kits from user settings
 */
export function parseKitsFromSettings(settings: any): Kit[] {
  if (!settings || !settings.kits || !Array.isArray(settings.kits)) {
    return [];
  }
  return settings.kits;
}

/**
 * Update kits in user settings
 */
export function updateKitsInSettings(settings: any, kits: Kit[]): any {
  return {
    ...settings,
    kits,
  };
}
