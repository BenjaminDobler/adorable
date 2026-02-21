import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { ToastService } from '../../services/toast';
import { Kit, KitResource, StorybookComponent, StorybookResource, WebContainerFiles, KitTemplate, ComponentExample, NpmPackageConfig } from '../../services/kit-types';
import { BASE_FILES } from '../../base-project';
import { FolderImportComponent } from '../folder-import/folder-import';

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
  imports: [CommonModule, FormsModule, RouterModule, FolderImportComponent],
  templateUrl: './kit-builder.html',
  styleUrl: './kit-builder.scss'
})
export class KitBuilderComponent {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastService = inject(ToastService);

  // Loaded kit (for edit mode)
  kit: Kit | null = null;
  kitId: string | null = null;
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

  // Multi-package support
  npmPackages = signal<NpmPackageConfig[]>([]);
  newPackageName = signal('');
  newPackageSuffix = signal<string>('Component');

  // Template state
  templateType = signal<'default' | 'custom'>('default');
  customTemplate = signal<WebContainerFiles | null>(null);
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

  // Tool testing
  selectedTestTool = signal<string>('list_components');
  testComponentName = signal('');
  testingTool = signal(false);
  toolTestResult = signal<string | null>(null);
  toolTestError = signal(false);

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
  editSelector = signal('');
  editUsageType = signal<'directive' | 'component' | ''>('');
  editDescription = signal('');
  editExamples = signal<ComponentExample[]>([]);
  editInputs = signal<{ name: string; type: string; required?: boolean; description?: string }[]>([]);
  editOutputs = signal<{ name: string; type?: string; description?: string }[]>([]);

  // Computed: Generated basic usage example (same as what the tool shows)
  generatedBasicUsage = computed(() => {
    const selector = this.editSelector();
    const usageType = this.editUsageType();
    const inputs = this.editInputs();

    if (!selector) return null;

    const requiredInputs = inputs.filter(i => i.required);
    const inputAttrs = requiredInputs.map(i => `[${i.name}]="${this.getExampleValue(i.name, i.type)}"`).join(' ');

    // Check if it's a directive (attribute selector)
    if (usageType === 'directive' || selector.includes('[')) {
      const attrMatch = selector.match(/\[([^\]]+)\]/);
      const attrName = attrMatch ? attrMatch[1] : selector;
      const hostElement = selector.split('[')[0] || 'button';
      if (inputAttrs) {
        return `<${hostElement} ${attrName} ${inputAttrs}>Content</${hostElement}>`;
      }
      return `<${hostElement} ${attrName}>Content</${hostElement}>`;
    }

    // It's a component
    if (inputAttrs) {
      return `<${selector} ${inputAttrs}></${selector}>`;
    }
    return `<${selector}></${selector}>`;
  });

  private getExampleValue(name: string, type: string): string {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('content') || nameLower.includes('text') || nameLower.includes('label')) return 'Your text';
    if (nameLower.includes('title')) return 'Title';
    if (nameLower.includes('disabled') || nameLower.includes('loading')) return 'false';
    if (nameLower.includes('visible') || nameLower.includes('show')) return 'true';
    if (type?.includes('string')) return 'value';
    if (type?.includes('number')) return '0';
    if (type?.includes('boolean')) return 'true';
    return 'value';
  }

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
    const walk = (obj: WebContainerFiles, prefix: string, depth: number) => {
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
      // Check if any ancestor is collapsed
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

    // Load MCP servers
    this.apiService.getSettings().subscribe({
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
      this.apiService.getKit(id).subscribe({
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

    // Storybook resource
    const storybookResource = kit.resources.find(r => r.type === 'storybook') as StorybookResource | undefined;
    if (storybookResource) {
      this.storybookUrl.set(storybookResource.url);
      this.discoveredComponents.set(storybookResource.components || []);
      this.selectedComponentIds.set(new Set(storybookResource.selectedComponentIds || []));
    }
  }

  goBack() {
    this.router.navigate(['/dashboard'], { queryParams: { tab: 'kits' } });
  }

  private countFiles(files: WebContainerFiles): number {
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

    // Don't add duplicates
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

    // Remove components from this package
    // Keep only components that explicitly belong to a remaining package.
    // Components with no sourcePackage are removed if no packages remain.
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
      const result = await this.apiService.discoverNpmComponents(pkg).toPromise();

      if (result && result.success) {
        // Tag new components with their source package
        const newComponents: StorybookComponent[] = result.components.map((c: StorybookComponent) => ({
          ...c,
          sourcePackage: pkg
        }));

        // Auto-add package to the list if not already present
        const existingPackages = this.npmPackages();
        if (!existingPackages.some(p => p.name === pkg)) {
          this.npmPackages.set([...existingPackages, { name: pkg, importSuffix: this.newPackageSuffix() }]);
        }

        // Merge with existing components from other packages
        const previousComponents = this.discoveredComponents();
        const previousSelections = this.selectedComponentIds();

        // Keep components from other packages, replace components from this package
        const otherComponents = previousComponents.filter(c => c.sourcePackage !== pkg);
        const mergedComponents = [...otherComponents, ...newComponents];

        // Build updated selections
        const updatedSelections = new Set<string>();
        // Keep selections from other packages
        const otherIds = new Set(otherComponents.map(c => c.id));
        for (const id of previousSelections) {
          if (otherIds.has(id)) updatedSelections.add(id);
        }
        // Select all new components
        for (const comp of newComponents) {
          updatedSelections.add(comp.id);
        }

        this.discoveredComponents.set(mergedComponents);
        this.selectedComponentIds.set(updatedSelections);
        this.selectAll.set(updatedSelections.size === mergedComponents.length);

        // Clear the input after successful discovery
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

  // Legacy Storybook discovery (kept for backwards compatibility)
  async discoverComponents() {
    const url = this.storybookUrl();
    if (!url) {
      this.discoveryError.set('Please enter a Storybook URL');
      return;
    }

    this.discovering.set(true);
    this.discoveryError.set(null);

    try {
      const result = await this.apiService.discoverStorybookComponents(url).toPromise();
      if (result && result.success) {
        const newComponents: StorybookComponent[] = result.components;
        const previousComponents = this.discoveredComponents();
        const previousSelections = this.selectedComponentIds();

        // If this is a fresh discovery (no previous components), select all
        if (previousComponents.length === 0) {
          this.discoveredComponents.set(newComponents);
          this.selectedComponentIds.set(new Set(newComponents.map(c => c.id)));
          this.selectAll.set(true);
        } else {
          // Re-discovery: preserve existing selections, auto-select new components
          const newComponentIds = new Set(newComponents.map(c => c.id));
          const previousComponentIds = new Set(previousComponents.map(c => c.id));

          // Start with previous selections, filtered to only include still-existing components
          const updatedSelections = new Set<string>();
          for (const id of previousSelections) {
            if (newComponentIds.has(id)) {
              updatedSelections.add(id);
            }
          }

          // Add newly discovered components (not in previous list) as selected
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

          // Show info about what changed
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

    // Update selectAll state
    this.selectAll.set(current.size === this.discoveredComponents().length);
  }

  isSelected(id: string): boolean {
    return this.selectedComponentIds().has(id);
  }

  toggleSelectAll() {
    const newState = !this.selectAll();
    this.selectAll.set(newState);

    if (newState) {
      // Select all
      this.selectedComponentIds.set(new Set(this.discoveredComponents().map(c => c.id)));
    } else {
      // Deselect all
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

  onFolderImport(data: { files: WebContainerFiles; name: string; description: string }) {
    this.customTemplate.set(data.files);
    this.importedFileCount.set(this.countFiles(data.files));
    this.templateType.set('custom');
    this.showFolderImport.set(false);

    // Auto-expand top-level directories and show tree
    this.expandedTemplatePaths.set(this.getTopLevelDirPaths(data.files));
    this.showTemplateTree.set(true);

    // Auto-fill name/description if empty
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
      const result = await this.apiService.validateKitComponents(
        pkg,
        this.discoveredComponents(),
        suffix
      ).toPromise();

      if (result && result.success) {
        this.validationResult.set({
          valid: result.validation.valid,
          invalid: result.validation.invalid,
          packageVersion: result.version,
          totalExports: result.totalExports,
          sampleExports: (result as any).allExports?.slice(0, 10).map((e: any) => e.name) || []
        });

        // Auto-deselect invalid components
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
    // Re-select all components that were deselected
    this.selectedComponentIds.set(new Set(this.discoveredComponents().map(c => c.id)));
    this.selectAll.set(true);
    this.validationResult.set(null);
  }

  async testTool() {
    if (!this.kit) return;

    this.testingTool.set(true);
    this.toolTestResult.set(null);
    this.toolTestError.set(false);

    try {
      const tool = this.selectedTestTool();
      let args: any = {};

      if (tool === 'get_component') {
        args = { name: this.testComponentName() || 'Button' };
      }

      const result = await this.apiService.previewKitTool(this.kit.id, tool, args).toPromise();

      if (result) {
        this.toolTestResult.set(result.output);
        this.toolTestError.set(result.isError);
      }
    } catch (error: any) {
      this.toolTestResult.set(error.error?.error || error.message || 'Test failed');
      this.toolTestError.set(true);
    } finally {
      this.testingTool.set(false);
    }
  }

  // Component editing methods
  openComponentEditor(component: StorybookComponent, event: Event) {
    event.stopPropagation(); // Don't trigger checkbox toggle
    this.editingComponent.set(component);
    this.editSelector.set(component.selector || '');
    this.editUsageType.set(component.usageType || '');
    this.editDescription.set(component.description || '');
    this.editExamples.set(component.examples ? [...component.examples] : []);
    this.editInputs.set(component.inputs ? [...component.inputs] : []);
    this.editOutputs.set(component.outputs ? [...component.outputs] : []);
  }

  closeComponentEditor() {
    this.editingComponent.set(null);
  }

  addExample() {
    const examples = [...this.editExamples()];
    examples.push({ title: '', code: '', language: 'html' });
    this.editExamples.set(examples);
  }

  removeExample(index: number) {
    const examples = [...this.editExamples()];
    examples.splice(index, 1);
    this.editExamples.set(examples);
  }

  updateExample(index: number, field: 'title' | 'code' | 'language', value: string) {
    const examples = [...this.editExamples()];
    examples[index] = { ...examples[index], [field]: value };
    this.editExamples.set(examples);
  }

  // Input editing methods
  addInput() {
    const inputs = [...this.editInputs()];
    inputs.push({ name: '', type: 'string', required: false });
    this.editInputs.set(inputs);
  }

  removeInput(index: number) {
    const inputs = [...this.editInputs()];
    inputs.splice(index, 1);
    this.editInputs.set(inputs);
  }

  updateInput(index: number, field: 'name' | 'type' | 'required' | 'description', value: any) {
    const inputs = [...this.editInputs()];
    inputs[index] = { ...inputs[index], [field]: value };
    this.editInputs.set(inputs);
  }

  // Output editing methods
  addOutput() {
    const outputs = [...this.editOutputs()];
    outputs.push({ name: '' });
    this.editOutputs.set(outputs);
  }

  removeOutput(index: number) {
    const outputs = [...this.editOutputs()];
    outputs.splice(index, 1);
    this.editOutputs.set(outputs);
  }

  updateOutput(index: number, field: 'name' | 'description', value: string) {
    const outputs = [...this.editOutputs()];
    outputs[index] = { ...outputs[index], [field]: value };
    this.editOutputs.set(outputs);
  }

  saveComponentEdits() {
    const editingComp = this.editingComponent();
    if (!editingComp) return;

    // Update the component in the list
    const components = [...this.discoveredComponents()];
    const index = components.findIndex(c => c.id === editingComp.id);
    if (index >= 0) {
      components[index] = {
        ...components[index],
        selector: this.editSelector() || undefined,
        usageType: this.editUsageType() || undefined,
        description: this.editDescription() || undefined,
        examples: this.editExamples().filter(e => e.code.trim()), // Only keep non-empty examples
        inputs: this.editInputs().length > 0 ? this.editInputs() : undefined,
        outputs: this.editOutputs().length > 0 ? this.editOutputs() : undefined
      };
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
      // Get component names (with suffix)
      const components = this.discoveredComponents();
      const componentNames = components.map(c => {
        const name = c.componentName || c.title.split('/').pop() || c.name;
        return name.endsWith('Component') || name.endsWith('Directive') ? name : `${name}${suffix}`;
      });

      const result = await this.apiService.fetchBatchComponentMetadata(pkg, componentNames).toPromise();

      if (result && result.success) {
        this.populateProgress.set(`Found metadata for ${result.found}/${result.total} components`);

        // Update components with metadata
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
      // Clear progress after a delay
      setTimeout(() => this.populateProgress.set(''), 3000);
    }
  }

  // Template tree methods
  private getTopLevelDirPaths(files: WebContainerFiles): Set<string> {
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
    const newFiles = this.removeFromWebContainerFiles(files, path);
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
    const newFiles = this.removeFromWebContainerFiles(files, folderPath);
    // Also remove from expanded paths
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

  private removeFromWebContainerFiles(files: WebContainerFiles, targetPath: string): WebContainerFiles {
    const result: WebContainerFiles = {};
    for (const key of Object.keys(files)) {
      if (key === targetPath) continue; // top-level match
      const item = files[key];
      if ('directory' in item) {
        // Check if target is within this directory
        if (targetPath.startsWith(key + '/')) {
          const subPath = targetPath.slice(key.length + 1);
          const newDir = this.removeFromWebContainerFiles(item.directory, subPath);
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
      // Build template
      const template: KitTemplate = {
        type: this.templateType(),
        files: this.templateType() === 'custom' && this.customTemplate()
          ? this.customTemplate()!
          : BASE_FILES,
        angularVersion: '21'
      };

      const packages = this.npmPackages();
      const kitData = {
        name,
        description: this.kitDescription() || undefined,
        template,
        npmPackages: packages.length > 0 ? packages : [],
        // Legacy fields for backward compat (first package)
        npmPackage: packages.length > 0 ? packages[0].name : '',
        importSuffix: packages.length > 0 ? packages[0].importSuffix : 'Component',
        storybookUrl: this.storybookUrl() || undefined,
        components: this.discoveredComponents(),
        selectedComponentIds: Array.from(this.selectedComponentIds()),
        mcpServerIds: this.selectedMcpServerIds(),
        systemPrompt: this.kitSystemPrompt() || undefined,
        baseSystemPrompt: this.showBasePromptOverride() && this.kitBaseSystemPrompt() ? this.kitBaseSystemPrompt() : undefined,
      };

      let result;
      if (this.kit) {
        // Update existing kit
        result = await this.apiService.updateKit(this.kit.id, kitData).toPromise();
      } else {
        // Create new kit
        result = await this.apiService.createKit(kitData).toPromise();
      }

      if (result && result.kit) {
        this.toastService.show('Kit saved successfully!', 'success');
        this.router.navigate(['/dashboard'], { queryParams: { tab: 'kits' } });
      }
    } catch (error: any) {
      console.error('Save kit error:', error);
      this.toastService.show('Failed to save kit', 'error');
    } finally {
      this.saving.set(false);
    }
  }
}
