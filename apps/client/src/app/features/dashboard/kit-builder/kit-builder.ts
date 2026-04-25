import { Component, signal, inject, computed, viewChild, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api';
import { ToastService } from '../../../core/services/toast';
import { Kit, KitResource, StorybookComponent, StorybookResource, FileTree, KitTemplate, NpmPackageConfig, DevServerPreset, KitCommands } from '../../../core/services/kit-types';
import { AuthService } from '../../../core/services/auth';
import { FolderImportComponent } from '../folder-import/folder-import';
import { ComponentEditorModalComponent } from './component-editor-modal/component-editor-modal.component';
import { ToolTesterComponent } from './tool-tester/tool-tester.component';
import { AdorableFileBrowserComponent } from './adorable-file-browser/adorable-file-browser.component';
import { firstValueFrom } from 'rxjs';

interface TemplateFileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  depth: number;
  size: number;
}

@Component({
  selector: 'app-kit-builder',
  standalone: true,
  imports: [KeyValuePipe, FormsModule, RouterModule, FolderImportComponent, ComponentEditorModalComponent, ToolTesterComponent, AdorableFileBrowserComponent],
  templateUrl: './kit-builder.html',
  styleUrl: './kit-builder.scss'
})
export class KitBuilderComponent {
  private destroyRef = inject(DestroyRef);
  private apiService = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);

  isAdmin = this.authService.isAdmin;
  componentEditorModal = viewChild(ComponentEditorModalComponent);

  // Loaded kit (for edit mode)
  kit: Kit | null = null;
  kitId: string | null = null;
  isGlobalKit = signal(false);
  mcpServers: { id: string; name: string; enabled: boolean }[] = [];
  loading = signal(true);

  // Form state
  kitName = signal('');
  kitDescription = signal('');
  storybookUrl = signal('');
  selectedMcpServerIds = signal<string[]>([]);

  // System prompt
  kitSystemPrompt = signal('');
  kitBaseSystemPrompt = signal('');
  showBasePromptOverride = signal(false);
  defaultSystemPrompt = signal('');

  // Lessons
  kitLessonsEnabled = signal(true);

  // Multi-package support
  npmPackages = signal<NpmPackageConfig[]>([]);
  newPackageName = signal('');
  newPackageSuffix = signal<string>('Component');

  // Commands
  installCommand = signal('');
  devCommand = signal('');
  buildCommand = signal('');
  devServerPreset = signal<DevServerPreset>('angular-cli');
  customReadyPattern = signal('');

  // Template state
  templateType = signal<'default' | 'custom'>('default');
  customTemplate = signal<FileTree | null>(null);
  importedFileCount = signal(0);
  showFolderImport = signal(false);
  showTemplateTree = signal(false);
  expandedTemplatePaths = signal<Set<string>>(new Set());

  // Discovery state
  discovering = signal(false);
  discoveryError = signal<string | null>(null);
  discoveredComponents = signal<StorybookComponent[]>([]);
  selectedComponentIds = signal<Set<string>>(new Set());

  // UI state
  saving = signal(false);
  filterText = signal('');
  selectAll = signal(true);

  // NPM validation
  validating = signal(false);
  validationResult = signal<{
    valid: { name: string; id: string; exportName: string }[];
    invalid: { name: string; id: string; reason: string }[];
    packageVersion: string;
    totalExports: number;
    sampleExports: string[];
  } | null>(null);

  // Auto-populate from npm
  populatingMetadata = signal(false);
  populateProgress = signal('');

  // Component editing
  editingComponent = signal<StorybookComponent | null>(null);

  // Lessons
  showLessons = signal(false);
  lessons = signal<any[]>([]);
  lessonsLoading = signal(false);
  expandedLessonIds = signal<Set<string>>(new Set());
  editingLesson = signal<{ id?: string; title: string; problem: string; solution: string; component?: string; codeSnippet?: string; tags?: string } | null>(null);

  // Computed
  filteredComponents = computed(() => {
    const components = this.discoveredComponents();
    const filter = this.filterText().toLowerCase();
    if (!filter) return components;
    return components.filter(c =>
      (c.componentName || c.title).toLowerCase().includes(filter) ||
      (c.category || '').toLowerCase().includes(filter)
    );
  });

  componentsByCategory = computed(() => {
    const components = this.filteredComponents();
    const map = new Map<string, StorybookComponent[]>();
    for (const c of components) {
      const cat = c.category || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    }
    return map;
  });

  selectedCount = computed(() => this.selectedComponentIds().size);
  totalCount = computed(() => this.discoveredComponents().length);

  templateFileEntries = computed<TemplateFileEntry[]>(() => {
    const files = this.customTemplate();
    if (!files) return [];
    const entries: TemplateFileEntry[] = [];
    const walk = (obj: FileTree, prefix: string, depth: number) => {
      const keys = Object.keys(obj).sort((a, b) => {
        const aIsDir = 'directory' in obj[a];
        const bIsDir = 'directory' in obj[b];
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        return a.localeCompare(b);
      });
      for (const key of keys) {
        const item = obj[key];
        const path = prefix ? `${prefix}/${key}` : key;
        if ('directory' in item) {
          entries.push({ path, name: key, isDirectory: true, depth, size: 0 });
          walk(item.directory, path, depth + 1);
        } else {
          const contents = (item as any).file?.contents || '';
          entries.push({ path, name: key, isDirectory: false, depth, size: typeof contents === 'string' ? contents.length : 0 });
        }
      }
    };
    walk(files, '', 0);
    return entries;
  });

  visibleTemplateEntries = computed<TemplateFileEntry[]>(() => {
    const all = this.templateFileEntries();
    const expanded = this.expandedTemplatePaths();
    const visible: TemplateFileEntry[] = [];
    const collapsedPrefixes: string[] = [];
    for (const entry of all) {
      const hidden = collapsedPrefixes.some(p => entry.path.startsWith(p + '/'));
      if (hidden) continue;
      visible.push(entry);
      if (entry.isDirectory && !expanded.has(entry.path)) {
        collapsedPrefixes.push(entry.path);
      }
    }
    return visible;
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    const globalParam = this.route.snapshot.queryParamMap.get('global');
    if (globalParam === 'true') {
      this.isGlobalKit.set(true);
    }

    // Load default system prompt for the override textarea
    this.apiService.getDefaultSystemPrompt().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => this.defaultSystemPrompt.set(result.prompt),
      error: () => {} // silently ignore
    });

    // Load MCP servers
    this.apiService.getSettings().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (settings) => {
        if (settings?.mcpServers) {
          this.mcpServers = settings.mcpServers.map((s: any) => ({
            id: s.id,
            name: s.name,
            enabled: s.enabled
          }));
        }
      },
      error: () => console.warn('Failed to load MCP servers')
    });

    if (id && id !== 'new') {
      // Edit mode: load kit from API
      this.kitId = id;
      this.loadLessons();
      this.apiService.getKit(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (response) => {
          this.kit = response.kit;
          this.populateForm(this.kit!);
          this.loading.set(false);
        },
        error: () => {
          this.toastService.show('Failed to load kit', 'error');
          this.router.navigate(['/dashboard'], { queryParams: { tab: 'kits' } });
        }
      });
    } else {
      // Create mode
      this.loading.set(false);
    }
  }

  private populateForm(kit: Kit) {
    if (kit.isGlobal) {
      this.isGlobalKit.set(true);
    }
    this.kitName.set(kit.name);
    this.kitDescription.set(kit.description || '');
    this.kitSystemPrompt.set(kit.systemPrompt || '');
    this.kitBaseSystemPrompt.set(kit.baseSystemPrompt || '');
    this.showBasePromptOverride.set(!!kit.baseSystemPrompt);
    this.selectedMcpServerIds.set([...kit.mcpServerIds]);

    // Multi-package: read npmPackages or fall back to legacy npmPackage
    if (kit.npmPackages && kit.npmPackages.length > 0) {
      this.npmPackages.set([...kit.npmPackages]);
    } else if (kit.npmPackage) {
      this.npmPackages.set([{ name: kit.npmPackage, importSuffix: kit.importSuffix || 'Component' }]);
    }

    // Template
    if (kit.template) {
      this.templateType.set(kit.template.type);
      if (kit.template.type === 'custom') {
        this.customTemplate.set(kit.template.files);
        this.importedFileCount.set(this.countFiles(kit.template.files));
        this.expandedTemplatePaths.set(this.getTopLevelDirPaths(kit.template.files));
      }
    }

    // Commands
    if (kit.commands) {
      if (kit.commands.install) {
        this.installCommand.set([kit.commands.install.cmd, ...kit.commands.install.args].join(' '));
      }
      if (kit.commands.dev) {
        this.devCommand.set([kit.commands.dev.cmd, ...kit.commands.dev.args].join(' '));
      }
      if (kit.commands.build) {
        this.buildCommand.set([kit.commands.build.cmd, ...kit.commands.build.args].join(' '));
      }
      this.devServerPreset.set(kit.commands.devServerPreset ?? 'angular-cli');
      this.customReadyPattern.set(kit.commands.devReadyPattern ?? '');
    }

    // Lessons enabled
    this.kitLessonsEnabled.set(kit.lessonsEnabled !== false);

    // Storybook resource
    const storybookResource = kit.resources.find(r => r.type === 'storybook') as StorybookResource | undefined;
    if (storybookResource) {
      this.storybookUrl.set(storybookResource.url);
      this.discoveredComponents.set(storybookResource.components || []);
      this.selectedComponentIds.set(new Set(storybookResource.selectedComponentIds || []));
    }
  }

  toggleBasePromptOverride() {
    const opening = !this.showBasePromptOverride();
    this.showBasePromptOverride.set(opening);
    if (opening && !this.kitBaseSystemPrompt() && this.defaultSystemPrompt()) {
      this.kitBaseSystemPrompt.set(this.defaultSystemPrompt());
    }
  }

  goBack() {
    this.router.navigate(['/dashboard'], { queryParams: { tab: 'kits' } });
  }

  private countFiles(files: FileTree): number {
    let count = 0;
    for (const key of Object.keys(files)) {
      const item = files[key];
      if ('file' in item) {
        count++;
      } else if ('directory' in item) {
        count += this.countFiles(item.directory);
      }
    }
    return count;
  }

  addPackage() {
    const name = this.newPackageName().trim();
    if (!name) return;

    const existing = this.npmPackages();
    if (existing.some(p => p.name === name)) {
      this.discoveryError.set(`Package "${name}" is already added`);
      return;
    }

    this.npmPackages.set([...existing, { name, importSuffix: this.newPackageSuffix() }]);
    this.newPackageName.set('');
  }

  removePackage(index: number) {
    const packages = [...this.npmPackages()];
    const removed = packages.splice(index, 1)[0];
    this.npmPackages.set(packages);

    const remainingPackageNames = new Set(packages.map(p => p.name));
    const components = this.discoveredComponents().filter(c =>
      c.sourcePackage ? remainingPackageNames.has(c.sourcePackage) : remainingPackageNames.size > 0
    );
    this.discoveredComponents.set(components);
    const validIds = new Set(components.map(c => c.id));
    const selections = new Set<string>();
    for (const id of this.selectedComponentIds()) {
      if (validIds.has(id)) selections.add(id);
    }
    this.selectedComponentIds.set(selections);
    this.selectAll.set(selections.size === components.length && components.length > 0);
  }

  updatePackageSuffix(index: number, suffix: string) {
    const packages = [...this.npmPackages()];
    packages[index] = { ...packages[index], importSuffix: suffix };
    this.npmPackages.set(packages);
  }

  async discoverFromNpm() {
    const pkg = this.newPackageName().trim();
    if (!pkg) {
      this.discoveryError.set('Please enter an npm package name');
      return;
    }

    this.discovering.set(true);
    this.discoveryError.set(null);

    try {
      const result = await firstValueFrom(this.apiService.discoverNpmComponents(pkg));

      if (result && result.success) {
        const newComponents: StorybookComponent[] = result.components.map((c: StorybookComponent) => ({
          ...c,
          sourcePackage: pkg
        }));

        const existingPackages = this.npmPackages();
        if (!existingPackages.some(p => p.name === pkg)) {
          this.npmPackages.set([...existingPackages, { name: pkg, importSuffix: this.newPackageSuffix() }]);
        }

        const previousComponents = this.discoveredComponents();
        const previousSelections = this.selectedComponentIds();

        const otherComponents = previousComponents.filter(c => c.sourcePackage !== pkg);
        const mergedComponents = [...otherComponents, ...newComponents];

        const updatedSelections = new Set<string>();
        const otherIds = new Set(otherComponents.map(c => c.id));
        for (const id of previousSelections) {
          if (otherIds.has(id)) updatedSelections.add(id);
        }
        for (const comp of newComponents) {
          updatedSelections.add(comp.id);
        }

        this.discoveredComponents.set(mergedComponents);
        this.selectedComponentIds.set(updatedSelections);
        this.selectAll.set(updatedSelections.size === mergedComponents.length);

        this.newPackageName.set('');

        console.log(`[Kit Builder] Discovered ${result.count} components from ${pkg} v${result.version}`);
      } else {
        this.discoveryError.set('Failed to discover components from npm package');
      }
    } catch (error: any) {
      this.discoveryError.set(error.error?.error || error.message || 'Failed to analyze npm package');
    } finally {
      this.discovering.set(false);
    }
  }

  async discoverComponents() {
    const url = this.storybookUrl();
    if (!url) {
      this.discoveryError.set('Please enter a Storybook URL');
      return;
    }

    this.discovering.set(true);
    this.discoveryError.set(null);

    try {
      const result = await firstValueFrom(this.apiService.discoverStorybookComponents(url));
      if (result && result.success) {
        const newComponents: StorybookComponent[] = result.components;
        const previousComponents = this.discoveredComponents();
        const previousSelections = this.selectedComponentIds();

        if (previousComponents.length === 0) {
          this.discoveredComponents.set(newComponents);
          this.selectedComponentIds.set(new Set(newComponents.map(c => c.id)));
          this.selectAll.set(true);
        } else {
          const newComponentIds = new Set(newComponents.map(c => c.id));
          const previousComponentIds = new Set(previousComponents.map(c => c.id));

          const updatedSelections = new Set<string>();
          for (const id of previousSelections) {
            if (newComponentIds.has(id)) {
              updatedSelections.add(id);
            }
          }

          let newCount = 0;
          for (const comp of newComponents) {
            if (!previousComponentIds.has(comp.id)) {
              updatedSelections.add(comp.id);
              newCount++;
            }
          }

          this.discoveredComponents.set(newComponents);
          this.selectedComponentIds.set(updatedSelections);
          this.selectAll.set(updatedSelections.size === newComponents.length);

          const removedCount = previousComponents.filter(c => !newComponentIds.has(c.id)).length;
          if (newCount > 0 || removedCount > 0) {
            console.log(`[Kit Builder] Re-discovery: +${newCount} new, -${removedCount} removed, ${updatedSelections.size} selected`);
          }
        }
      } else {
        this.discoveryError.set('Failed to discover components');
      }
    } catch (error: any) {
      this.discoveryError.set(error.error?.error || error.message || 'Failed to connect to Storybook');
    } finally {
      this.discovering.set(false);
    }
  }

  toggleComponent(id: string) {
    const current = new Set(this.selectedComponentIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.selectedComponentIds.set(current);
    this.selectAll.set(current.size === this.discoveredComponents().length);
  }

  isSelected(id: string): boolean {
    return this.selectedComponentIds().has(id);
  }

  toggleSelectAll() {
    const newState = !this.selectAll();
    this.selectAll.set(newState);

    if (newState) {
      this.selectedComponentIds.set(new Set(this.discoveredComponents().map(c => c.id)));
    } else {
      this.selectedComponentIds.set(new Set());
    }
  }

  toggleMcpServer(id: string) {
    const current = [...this.selectedMcpServerIds()];
    const index = current.indexOf(id);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(id);
    }
    this.selectedMcpServerIds.set(current);
  }

  isMcpServerSelected(id: string): boolean {
    return this.selectedMcpServerIds().includes(id);
  }

  setTemplateType(type: 'default' | 'custom') {
    this.templateType.set(type);
    if (type === 'default') {
      this.customTemplate.set(null);
      this.importedFileCount.set(0);
      this.showTemplateTree.set(false);
      this.expandedTemplatePaths.set(new Set());
    }
  }

  openFolderImport() {
    this.showFolderImport.set(true);
  }

  onFolderImport(data: { files: FileTree; name: string; description: string }) {
    this.customTemplate.set(data.files);
    this.importedFileCount.set(this.countFiles(data.files));
    this.templateType.set('custom');
    this.showFolderImport.set(false);

    this.expandedTemplatePaths.set(this.getTopLevelDirPaths(data.files));
    this.showTemplateTree.set(true);

    if (!this.kitName()) {
      this.kitName.set(data.name);
    }
    if (!this.kitDescription()) {
      this.kitDescription.set(data.description);
    }
  }

  async validateComponents() {
    const packages = this.npmPackages();
    const pkg = packages.length > 0 ? packages[0].name : '';
    if (!pkg || this.discoveredComponents().length === 0) return;
    const suffix = packages.length > 0 ? packages[0].importSuffix : 'Component';

    this.validating.set(true);
    this.validationResult.set(null);

    try {
      const result = await firstValueFrom(this.apiService.validateKitComponents(
        pkg,
        this.discoveredComponents(),
        suffix
      ));

      if (result && result.success) {
        this.validationResult.set({
          valid: result.validation.valid,
          invalid: result.validation.invalid,
          packageVersion: result.version,
          totalExports: result.totalExports,
          sampleExports: (result as any).allExports?.slice(0, 10).map((e: any) => e.name) || []
        });

        if (result.validation.invalid.length > 0) {
          const invalidIds = new Set(result.validation.invalid.map(c => c.id));
          const newSelection = new Set<string>();
          for (const id of this.selectedComponentIds()) {
            if (!invalidIds.has(id)) {
              newSelection.add(id);
            }
          }
          this.selectedComponentIds.set(newSelection);
          this.selectAll.set(newSelection.size === this.discoveredComponents().length);
        }
      }
    } catch (error: any) {
      console.error('Validation error:', error);
    } finally {
      this.validating.set(false);
    }
  }

  skipValidation() {
    this.selectedComponentIds.set(new Set(this.discoveredComponents().map(c => c.id)));
    this.selectAll.set(true);
    this.validationResult.set(null);
  }

  // Component editing methods
  openComponentEditor(component: StorybookComponent, event: Event) {
    event.stopPropagation();
    this.editingComponent.set(component);
    this.componentEditorModal()?.open(component);
  }

  closeComponentEditor() {
    this.editingComponent.set(null);
  }

  onComponentSaved(updated: StorybookComponent) {
    const components = [...this.discoveredComponents()];
    const index = components.findIndex(c => c.id === updated.id);
    if (index >= 0) {
      components[index] = updated;
      this.discoveredComponents.set(components);
    }
    this.closeComponentEditor();
  }

  hasStoredDocs(component: StorybookComponent): boolean {
    return !!(component.selector || component.examples?.length || component.description);
  }

  async populateMetadataFromNpm() {
    const packages = this.npmPackages();
    const pkg = packages.length > 0 ? packages[0].name : '';
    if (!pkg || this.discoveredComponents().length === 0) return;
    const suffix = packages.length > 0 ? packages[0].importSuffix : 'Component';

    this.populatingMetadata.set(true);
    this.populateProgress.set('Fetching metadata...');

    try {
      const components = this.discoveredComponents();
      const componentNames = components.map(c => {
        const name = c.componentName || c.title.split('/').pop() || c.name;
        return name.endsWith('Component') || name.endsWith('Directive') ? name : `${name}${suffix}`;
      });

      const result = await firstValueFrom(this.apiService.fetchBatchComponentMetadata(pkg, componentNames));

      if (result && result.success) {
        this.populateProgress.set(`Found metadata for ${result.found}/${result.total} components`);

        const updatedComponents = [...components];
        for (let i = 0; i < updatedComponents.length; i++) {
          const comp = updatedComponents[i];
          const name = comp.componentName || comp.title.split('/').pop() || comp.name;
          const fullName = name.endsWith('Component') || name.endsWith('Directive') ? name : `${name}${suffix}`;

          const metadata = result.metadata[fullName];
          if (metadata) {
            updatedComponents[i] = {
              ...comp,
              selector: metadata.selector || comp.selector,
              usageType: metadata.usageType || comp.usageType,
              description: metadata.description || comp.description,
              examples: metadata.examples?.length ? metadata.examples : comp.examples
            };
          }
        }

        this.discoveredComponents.set(updatedComponents);
        console.log(`[Kit Builder] Populated metadata for ${result.found} components from npm`);
      }
    } catch (error: any) {
      console.error('Populate metadata error:', error);
      this.populateProgress.set('Error: ' + (error.message || 'Failed to fetch metadata'));
    } finally {
      this.populatingMetadata.set(false);
      setTimeout(() => this.populateProgress.set(''), 3000);
    }
  }

  // Template tree methods
  private getTopLevelDirPaths(files: FileTree): Set<string> {
    const paths = new Set<string>();
    for (const key of Object.keys(files)) {
      if ('directory' in files[key]) {
        paths.add(key);
      }
    }
    return paths;
  }

  toggleTemplateFolder(path: string) {
    const expanded = new Set(this.expandedTemplatePaths());
    if (expanded.has(path)) {
      expanded.delete(path);
    } else {
      expanded.add(path);
    }
    this.expandedTemplatePaths.set(expanded);
  }

  expandAllTemplateFolders() {
    const all = new Set<string>();
    for (const entry of this.templateFileEntries()) {
      if (entry.isDirectory) all.add(entry.path);
    }
    this.expandedTemplatePaths.set(all);
  }

  collapseAllTemplateFolders() {
    this.expandedTemplatePaths.set(new Set());
  }

  removeTemplateFile(path: string) {
    const files = this.customTemplate();
    if (!files) return;
    const newFiles = this.removeFromFileTree(files, path);
    if (Object.keys(newFiles).length === 0) {
      this.customTemplate.set(null);
      this.importedFileCount.set(0);
      this.showTemplateTree.set(false);
      this.expandedTemplatePaths.set(new Set());
    } else {
      this.customTemplate.set(newFiles);
      this.importedFileCount.set(this.countFiles(newFiles));
    }
  }

  removeTemplateFolder(folderPath: string) {
    const files = this.customTemplate();
    if (!files) return;
    const newFiles = this.removeFromFileTree(files, folderPath);
    const expanded = new Set(this.expandedTemplatePaths());
    for (const p of expanded) {
      if (p === folderPath || p.startsWith(folderPath + '/')) {
        expanded.delete(p);
      }
    }
    this.expandedTemplatePaths.set(expanded);

    if (Object.keys(newFiles).length === 0) {
      this.customTemplate.set(null);
      this.importedFileCount.set(0);
      this.showTemplateTree.set(false);
    } else {
      this.customTemplate.set(newFiles);
      this.importedFileCount.set(this.countFiles(newFiles));
    }
  }

  private removeFromFileTree(files: FileTree, targetPath: string): FileTree {
    const result: FileTree = {};
    for (const key of Object.keys(files)) {
      if (key === targetPath) continue;
      const item = files[key];
      if ('directory' in item) {
        if (targetPath.startsWith(key + '/')) {
          const subPath = targetPath.slice(key.length + 1);
          const newDir = this.removeFromFileTree(item.directory, subPath);
          if (Object.keys(newDir).length > 0) {
            result[key] = { directory: newDir };
          }
        } else {
          result[key] = item;
        }
      } else {
        result[key] = item;
      }
    }
    return result;
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async saveKit() {
    const name = this.kitName();
    if (!name) return;

    this.saving.set(true);

    try {
      const template: KitTemplate = {
        type: this.templateType(),
        files: this.templateType() === 'custom' && this.customTemplate()
          ? this.customTemplate()!
          : {},
        angularVersion: '21'
      };

      const packages = this.npmPackages();
      const kitData: any = {
        name,
        description: this.kitDescription() || undefined,
        template,
        npmPackages: packages.length > 0 ? packages : [],
        npmPackage: packages.length > 0 ? packages[0].name : '',
        importSuffix: packages.length > 0 ? packages[0].importSuffix : 'Component',
        storybookUrl: this.storybookUrl() || undefined,
        components: this.discoveredComponents(),
        selectedComponentIds: Array.from(this.selectedComponentIds()),
        mcpServerIds: this.selectedMcpServerIds(),
        systemPrompt: this.kitSystemPrompt() || undefined,
        baseSystemPrompt: this.showBasePromptOverride() && this.kitBaseSystemPrompt() ? this.kitBaseSystemPrompt() : undefined,
        lessonsEnabled: this.kitLessonsEnabled(),
      };

      // Commands
      const commands: KitCommands = {};
      const parseCmd = (str: string) => {
        const parts = str.trim().split(/\s+/);
        return parts.length > 0 ? { cmd: parts[0], args: parts.slice(1) } : undefined;
      };
      if (this.installCommand().trim()) commands.install = parseCmd(this.installCommand())!;
      if (this.devCommand().trim()) commands.dev = parseCmd(this.devCommand())!;
      if (this.buildCommand().trim()) commands.build = parseCmd(this.buildCommand())!;
      if (this.devServerPreset() !== 'angular-cli') commands.devServerPreset = this.devServerPreset();
      if (this.devServerPreset() === 'custom' && this.customReadyPattern().trim()) {
        commands.devReadyPattern = this.customReadyPattern().trim();
      }
      if (Object.keys(commands).length > 0) {
        kitData.commands = commands;
      }

      if (this.isGlobalKit()) {
        kitData.isGlobal = true;
      }

      let result;
      if (this.kit) {
        result = await firstValueFrom(this.apiService.updateKit(this.kit.id, kitData));
      } else {
        result = await firstValueFrom(this.apiService.createKit(kitData));
      }

      if (result && result.kit) {
        this.toastService.show('Kit saved successfully!', 'success');
        if (!this.kit) {
          this.kit = result.kit;
          this.kitId = result.kit.id;
          this.router.navigate(['/dashboard/kit-builder', result.kit.id], { replaceUrl: true });
        } else {
          this.router.navigate(['/dashboard'], { queryParams: { tab: 'kits' } });
        }
      }
    } catch (error: any) {
      console.error('Save kit error:', error);
      this.toastService.show('Failed to save kit', 'error');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Lessons ────────────────────────────────────────────────────────

  loadLessons() {
    if (!this.kitId) return;
    this.lessonsLoading.set(true);
    this.apiService.getKitLessons(this.kitId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.lessons.set(res.lessons || []);
        this.lessonsLoading.set(false);
      },
      error: () => {
        this.lessonsLoading.set(false);
      }
    });
  }

  toggleLessonExpand(lessonId: string) {
    const current = new Set(this.expandedLessonIds());
    if (current.has(lessonId)) {
      current.delete(lessonId);
    } else {
      current.add(lessonId);
    }
    this.expandedLessonIds.set(current);
  }

  startAddLesson() {
    this.showLessons.set(true);
    this.editingLesson.set({
      title: '',
      problem: '',
      solution: '',
      component: '',
      codeSnippet: '',
      tags: '',
    });
  }

  startEditLesson(lesson: any) {
    this.editingLesson.set({
      id: lesson.id,
      title: lesson.title,
      problem: lesson.problem,
      solution: lesson.solution,
      component: lesson.component || '',
      codeSnippet: lesson.codeSnippet || '',
      tags: lesson.tags || '',
    });
  }

  cancelEditLesson() {
    this.editingLesson.set(null);
  }

  updateEditingLesson(field: string, value: string) {
    const current = this.editingLesson();
    if (!current) return;
    this.editingLesson.set({ ...current, [field]: value });
  }

  saveLesson() {
    const lesson = this.editingLesson();
    if (!lesson || !this.kitId) return;

    const data = {
      title: lesson.title,
      problem: lesson.problem,
      solution: lesson.solution,
      component: lesson.component || undefined,
      codeSnippet: lesson.codeSnippet || undefined,
      tags: lesson.tags || undefined,
    };

    if (lesson.id) {
      this.apiService.updateKitLesson(this.kitId, lesson.id, data).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.toastService.show('Lesson updated', 'success');
          this.editingLesson.set(null);
          this.loadLessons();
        },
        error: () => this.toastService.show('Failed to update lesson', 'error')
      });
    } else {
      this.apiService.createKitLesson(this.kitId, data as any).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.toastService.show('Lesson created', 'success');
          this.editingLesson.set(null);
          this.loadLessons();
        },
        error: () => this.toastService.show('Failed to create lesson', 'error')
      });
    }
  }

  deleteLesson(lesson: any) {
    if (!this.kitId) return;
    this.apiService.deleteKitLesson(this.kitId, lesson.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toastService.show('Lesson deleted', 'success');
        this.loadLessons();
      },
      error: () => this.toastService.show('Failed to delete lesson', 'error')
    });
  }

  promoteLesson(lesson: any) {
    if (!this.kitId) return;
    this.apiService.promoteKitLesson(this.kitId, lesson.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toastService.show('Lesson promoted to shared', 'success');
        this.loadLessons();
      },
      error: () => this.toastService.show('Failed to promote lesson', 'error')
    });
  }
}
