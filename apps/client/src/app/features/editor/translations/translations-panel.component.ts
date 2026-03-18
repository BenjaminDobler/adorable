import { Component, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project';
import { ContainerEngine } from '../../../core/services/container-engine';
import { ToastService } from '../../../core/services/toast';

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

  translationFiles = signal<TranslationFile[]>([]);
  selectedLocale = signal<string>('');
  searchQuery = signal('');
  editingKey = signal<string | null>(null);
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
    // Reload translations when project files change
    effect(() => {
      const files = this.projectService.files();
      if (files) {
        this.loadTranslations(files);
      }
    });
  }

  private loadTranslations(files: any) {
    const i18nDirs = this.findI18nDirectories(files);
    const result: TranslationFile[] = [];

    for (const dir of i18nDirs) {
      const dirNode = this.getDirectoryNode(files, dir);
      if (!dirNode) continue;

      for (const key in dirNode) {
        const node = dirNode[key];
        if (node.file && key.endsWith('.json')) {
          try {
            const json = JSON.parse(node.file.contents);
            const entries = this.flattenJson(json);
            const locale = key.replace('.json', '');
            result.push({ path: `${dir}/${key}`, locale, entries });
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    this.translationFiles.set(result);

    // Auto-select first locale if none selected
    if (!this.selectedLocale() && result.length > 0) {
      this.selectedLocale.set(result[0].locale);
    }
  }

  startEditing(entry: TranslationEntry) {
    this.editingKey.set(entry.key);
    this.editingValue.set(entry.value);
  }

  cancelEditing() {
    this.editingKey.set(null);
    this.editingValue.set('');
  }

  saveEditing(entry: TranslationEntry) {
    const newValue = this.editingValue();
    if (newValue === entry.value) {
      this.cancelEditing();
      return;
    }

    const filePath = this.activeFilePath();
    if (!filePath) return;

    const files = this.projectService.files();
    if (!files) return;

    const content = this.getFileContent(files, filePath);
    if (!content) return;

    try {
      const json = JSON.parse(content);
      this.setNestedValue(json, entry.key, newValue);
      const updated = JSON.stringify(json, null, 2) + '\n';

      this.projectService.fileStore.updateFile(filePath, updated);
      this.containerEngine.writeFile(filePath, updated);

      // Update local state
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
    // Flat key
    if (key in obj) { obj[key] = value; return; }

    // Nested path
    const parts = key.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
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
