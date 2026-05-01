import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api';
import { Kit, FileTree as KitFileTree } from './kit-types';

/**
 * Owns kit-related state for the active project: which kit is selected,
 * the loaded kit metadata (commands, system prompt, etc.), the kit
 * template files, and any per-project Tailwind prefix override.
 *
 * Decoupled from ProjectService so kit-aware UI (project settings,
 * insights panel, visual editor) can inject the store directly without
 * pulling in the rest of the project lifecycle. ProjectService still
 * re-exposes the signals via getters for back-compat.
 *
 * The store does NOT trigger preview reloads — that's an orchestration
 * concern. ProjectService.setKit() composes kit selection with
 * reloadPreview when needed.
 */
@Injectable({ providedIn: 'root' })
export class KitManagementStore {
  private apiService = inject(ApiService);

  /** ID of the kit assigned to the current project (persisted on save). */
  readonly selectedKitId = signal<string | null>(null);

  /** Loaded kit metadata: commands, npm packages, system prompt, etc. */
  readonly currentKit = signal<Kit | null>(null);

  /** The kit's template files, used as a base layer when reloading the preview. */
  readonly currentKitTemplate = signal<KitFileTree | null>(null);

  /** User-provided Tailwind prefix override (from project settings). */
  readonly tailwindPrefixOverride = signal<string>('');

  /**
   * Fetch a kit by ID and store its metadata as `currentKit`.
   * Returns the template files (or null if the fetch failed) so the caller
   * can decide whether to feed them into a preview reload.
   */
  async loadKitTemplate(kitId: string): Promise<KitFileTree | null> {
    try {
      const result = await firstValueFrom(this.apiService.getKit(kitId));
      if (result?.kit) {
        this.currentKit.set(result.kit);
        if (result.kit.template?.files) {
          return result.kit.template.files;
        }
      }
    } catch (err) {
      console.error('Failed to load kit template:', err);
    }
    return null;
  }

  /**
   * Assign a kit to the project and load its template. Does NOT reload the
   * preview — callers that need a preview refresh (e.g. ProjectService.setKit)
   * should orchestrate that themselves.
   */
  async setKit(kitId: string): Promise<KitFileTree | null> {
    this.selectedKitId.set(kitId);
    const template = await this.loadKitTemplate(kitId);
    if (template) this.currentKitTemplate.set(template);
    return template;
  }

  /** Reset to the empty state used when switching to a fresh project. */
  reset(): void {
    this.selectedKitId.set(null);
    this.currentKit.set(null);
    this.currentKitTemplate.set(null);
    this.tailwindPrefixOverride.set('');
  }
}
