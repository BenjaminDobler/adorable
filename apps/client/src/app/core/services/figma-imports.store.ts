import { Injectable, signal } from '@angular/core';
import { FigmaImportPayload } from '@adorable/shared-types';

/**
 * Owns the list of Figma imports attached to the current project — frame
 * payloads the user pulled from Figma that have been stored alongside the
 * project so they can be reattached to follow-up generations.
 *
 * Decoupled from ProjectService so Figma-aware UI (the workspace's Figma
 * panel) can inject this store directly without depending on the rest of
 * the project lifecycle. ProjectService still re-exposes the signal via a
 * getter for back-compat with the existing template binding.
 */
@Injectable({ providedIn: 'root' })
export class FigmaImportsStore {
  /** All Figma frame payloads currently attached to the project. */
  readonly imports = signal<FigmaImportPayload[]>([]);

  /** Replace the entire import list (used when loading a project). */
  setImports(imports: FigmaImportPayload[]): void {
    this.imports.set(imports);
  }

  /** Reset to the empty state (used when a saved project has no imports). */
  clear(): void {
    this.imports.set([]);
  }
}
