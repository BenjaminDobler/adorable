import { Component, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project';
import { ContainerEngine } from '../../../core/services/container-engine';
import { ToastService } from '../../../core/services/toast';
import { HMRTriggerService } from '../../../core/services/hmr-trigger.service';

interface TranslationEntry {
  key: string;
  value: string;
}

interface TranslationFile {
  path: string;
  locale: string;
  entries: TranslationEntry[];
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-translations-panel',
  templateUrl: './translations-panel.component.html',
  styleUrl: './translations-panel.component.scss',
})
export class TranslationsPanelComponent {
  private projectService = inject(ProjectService);
  private containerEngine = inject(ContainerEngine);
  private toastService = inject(ToastService);
  private hmrTriggerService = inject(HMRTriggerService);

  translationFiles = signal<TranslationFile[]>([]);
  selectedLocale = signal<string>('');
  searchQuery = signal('');
  editingKey = signal<string | null>(null);
  editingNewKey = signal('');
  editingValue = signal('');

  availableLocales = computed(() => this.translationFiles().map(f => f.locale));

  activeEntries = computed(() => {
    const locale = this.selectedLocale();
    const file = this.translationFiles().find(f => f.locale === locale);
    if (!file) return [];

    const query = this.searchQuery().toLowerCase();
    if (!query) return file.entries;

    return file.entries.filter(
      e => e.key.toLowerCase().includes(query) || e.value.toLowerCase().includes(query),
    );
  });

  activeFilePath = computed(() => {
    const locale = this.selectedLocale();
    return this.translationFiles().find(f => f.locale === locale)?.path || '';
  });

  constructor() {
    // Reload translations when project files or detected config change
    effect(() => {
      const files = this.projectService.files();
      // Read detectedConfig so the effect re-runs when the selected app changes
      this.projectService.detectedConfig();
      if (files && Object.keys(files).length > 0) {
        this.loadTranslations(files);
      }
    });

    // Keep projectService in sync with the active locale so visual editor can use it
    effect(() => {
      this.projectService.activeTranslationLocale.set(this.selectedLocale());
    });
  }

  private loadTranslations(files: any) {
    // For Nx workspaces with a selected app, scope the search to that app's subtree
    const detectedConfig = this.projectService.detectedConfig();
    const selectedApp: string | null = detectedConfig?.selectedApp ?? null;

    let searchRoot = files;
    let pathPrefix = '';
    if (selectedApp && selectedApp !== '.') {
      const appNode = this.getDirectoryNode(files, selectedApp);
      if (appNode) {
        searchRoot = appNode;
        pathPrefix = selectedApp + '/';
      }
    }

    const i18nDirs = this.findI18nDirectories(searchRoot).map(d => pathPrefix + d);
    console.log('[TranslationsPanel] selectedApp:', selectedApp, '| top-level file keys:', Object.keys(files).slice(0, 8), '| i18n dirs found:', i18nDirs);

    // Collect all translation file paths that exist in the store
    const candidates: { path: string; locale: string }[] = [];
    for (const dir of i18nDirs) {
      const dirNode = this.getDirectoryNode(files, dir);
      if (!dirNode) continue;
      for (const key in dirNode) {
        const node = dirNode[key];
        if (node.file && (key.endsWith('.json') || key.endsWith('.jsonc'))) {
          const locale = key.replace(/\.jsonc?$/, '');
          candidates.push({ path: `${dir}/${key}`, locale });
        }
      }
    }

    // Fetch all file contents on demand (handles structure-only mode where contents === '')
    Promise.all(candidates.map(async ({ path, locale }) => {
      const content = await this.projectService.getFileContent(path);
      if (!content) return null;
      try {
        const stripped = content.replace(/\/\/[^\n]*/g, '');
        const json = JSON.parse(stripped);
        const entries = this.flattenJson(json);
        return { path, locale, entries } as TranslationFile;
      } catch {
        return null;
      }
    })).then(results => {
      const result = results.filter((r): r is TranslationFile => r !== null);
      this.translationFiles.set(result);

      // Auto-select first locale; reset if current locale no longer exists in the new result
      const currentLocale = this.selectedLocale();
      const localeStillValid = result.some(f => f.locale === currentLocale);
      if (!localeStillValid) {
        this.selectedLocale.set(result.length > 0 ? result[0].locale : '');
      }
    });
  }

  startEditing(entry: TranslationEntry) {
    this.editingKey.set(entry.key);
    this.editingNewKey.set(entry.key);
    this.editingValue.set(entry.value);
  }

  cancelEditing() {
    this.editingKey.set(null);
    this.editingNewKey.set('');
    this.editingValue.set('');
  }

  saveEditing(entry: TranslationEntry) {
    const newKey = this.editingNewKey().trim();
    const newValue = this.editingValue();
    const keyChanged = newKey && newKey !== entry.key;
    const valueChanged = newValue !== entry.value;

    if (!newKey || (!keyChanged && !valueChanged)) {
      this.cancelEditing();
      return;
    }

    const files = this.projectService.files();
    if (!files) return;

    if (keyChanged) {
      // Rename key across ALL locale files for consistency
      let anyFailed = false;
      const writePromises: Promise<any>[] = [];
      this.translationFiles.update(tfs =>
        tfs.map(tf => {
          const content = this.getFileContent(files, tf.path);
          if (!content) return tf;
          try {
            const stripped = content.replace(/\/\/[^\n]*/g, '');
            const json = JSON.parse(stripped);
            const oldValue = this.getNestedValue(json, entry.key);
            if (oldValue === undefined) return tf; // key doesn't exist in this locale
            this.deleteNestedKey(json, entry.key);
            // For the active locale use the new value; other locales keep their existing value
            const valueToSet = tf.path === this.activeFilePath() ? newValue : oldValue;
            this.setNestedValue(json, newKey, valueToSet);
            const updated = JSON.stringify(json, null, 2) + '\n';
            this.projectService.fileStore.updateFile(tf.path, updated);
            writePromises.push(this.containerEngine.writeFile(tf.path, updated));
            return {
              ...tf,
              entries: tf.entries.map(e =>
                e.key === entry.key
                  ? { key: newKey, value: tf.path === this.activeFilePath() ? newValue : e.value }
                  : e,
              ),
            };
          } catch {
            anyFailed = true;
            return tf;
          }
        }),
      );
      if (anyFailed) {
        this.toastService.show('Some files could not be updated', 'error');
      } else {
        this.toastService.show(`Renamed "${entry.key}" → "${newKey}"`, 'success');
        Promise.all(writePromises).then(() => this.hmrTriggerService.reloadTranslations());
      }
    } else {
      // Value-only change — update active locale file only
      const filePath = this.activeFilePath();
      if (!filePath) return;
      const content = this.getFileContent(files, filePath);
      if (!content) return;
      try {
        const stripped = content.replace(/\/\/[^\n]*/g, '');
        const json = JSON.parse(stripped);
        this.setNestedValue(json, entry.key, newValue);
        const updated = JSON.stringify(json, null, 2) + '\n';
        this.projectService.fileStore.updateFile(filePath, updated);
        this.containerEngine.writeFile(filePath, updated).then(() => {
          this.hmrTriggerService.reloadTranslations(updated);
        });
        this.translationFiles.update(tfs =>
          tfs.map(tf => {
            if (tf.path !== filePath) return tf;
            return {
              ...tf,
              entries: tf.entries.map(e =>
                e.key === entry.key ? { ...e, value: newValue } : e,
              ),
            };
          }),
        );
        this.toastService.show(`Updated "${entry.key}"`, 'success');
      } catch {
        this.toastService.show('Failed to update translation', 'error');
      }
    }

    this.cancelEditing();
  }

  onLocaleChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedLocale.set(select.value);
  }

  /** Flatten a potentially nested JSON object into dot-separated key/value pairs. */
  private flattenJson(obj: any, prefix = ''): TranslationEntry[] {
    const entries: TranslationEntry[] = [];
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        entries.push(...this.flattenJson(val, fullKey));
      } else {
        entries.push({ key: fullKey, value: String(val) });
      }
    }
    return entries;
  }

  private setNestedValue(obj: any, key: string, value: any): void {
    const parts = key.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  private getNestedValue(obj: any, key: string): any {
    const parts = key.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  private deleteNestedKey(obj: any, key: string): void {
    const parts = key.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current == null || typeof current !== 'object') return;
      current = current[parts[i]];
    }
    if (current != null) delete current[parts[parts.length - 1]];
  }

  private findI18nDirectories(files: any, currentPath = ''): string[] {
    const dirs: string[] = [];
    const names = new Set(['i18n', 'locale', 'locales', 'translations', 'lang', 'langs']);
    for (const key in files) {
      const node = files[key];
      const fullPath = currentPath ? `${currentPath}/${key}` : key;
      if (node.directory) {
        if (names.has(key.toLowerCase())) dirs.push(fullPath);
        dirs.push(...this.findI18nDirectories(node.directory, fullPath));
      }
    }
    return dirs;
  }

  private getDirectoryNode(tree: any, path: string): any | null {
    const parts = path.split('/');
    let current = tree;
    for (const part of parts) {
      if (!current[part]?.directory) return null;
      current = current[part].directory;
    }
    return current;
  }

  private getFileContent(tree: any, path: string): string | null {
    const parts = path.split('/');
    let current = tree;
    for (const part of parts) {
      if (!current[part]) return null;
      if (current[part].file) return current[part].file.contents;
      current = current[part].directory;
    }
    return null;
  }
}
