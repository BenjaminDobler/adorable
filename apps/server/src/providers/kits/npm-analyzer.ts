/**
 * NPM Package Analyzer
 *
 * Analyzes npm packages to discover exported components.
 * Uses jsdelivr CDN to fetch package files without installing.
 */

export interface NpmExport {
  name: string;
  type: 'component' | 'directive' | 'module' | 'service' | 'other';
  path?: string;
}

export interface ComponentMetadata {
  name: string;
  selector?: string;
  usageType?: 'directive' | 'component';
  description?: string;
  inputs?: {
    name: string;
    type: string;
    description?: string;
    required?: boolean;
    defaultValue?: string;
  }[];
  examples?: {
    title?: string;
    code: string;
    language?: string;
  }[];
}

export interface NpmAnalysisResult {
  packageName: string;
  version: string;
  exports: NpmExport[];
  errors: string[];
}

export interface ComponentInput {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
}

export interface ComponentOutput {
  name: string;
  type?: string;
  description?: string;
}

export interface DiscoveredComponent {
  id: string;
  name: string;
  componentName: string;
  category: string;
  type: 'docs' | 'story';
  filePath: string;
  // Metadata
  selector?: string;
  usageType?: 'directive' | 'component';
  description?: string;
  inputs?: ComponentInput[];
  outputs?: ComponentOutput[];
  template?: string;  // HTML template for usage examples
  examples?: ComponentMetadata['examples'];
}

export interface NpmDiscoveryResult {
  packageName: string;
  version: string;
  components: DiscoveredComponent[];
  errors: string[];
}

/**
 * Discover components directly from npm package
 * Scans for .component.d.ts and .directive.d.ts files
 */
export async function discoverComponentsFromNpm(packageName: string): Promise<NpmDiscoveryResult> {
  const result: NpmDiscoveryResult = {
    packageName,
    version: 'latest',
    components: [],
    errors: []
  };

  try {
    // Step 1: Get package version
    const registryUrl = `https://registry.npmjs.org/${packageName}`;
    const registryResponse = await fetch(registryUrl);

    if (!registryResponse.ok) {
      result.errors.push(`Package not found: ${packageName}`);
      return result;
    }

    const packageData = await registryResponse.json();
    const version = packageData['dist-tags']?.latest;

    if (!version) {
      result.errors.push('Could not determine latest version');
      return result;
    }

    result.version = version;

    // Step 2: Get file listing from jsdelivr
    const filesUrl = `https://data.jsdelivr.com/v1/package/npm/${packageName}@${version}/flat`;
    const filesResponse = await fetch(filesUrl);

    if (!filesResponse.ok) {
      result.errors.push('Could not fetch package file listing');
      return result;
    }

    const filesData = await filesResponse.json();
    const files: { name: string; size: number }[] = filesData.files || [];

    // Step 3: Find component and directive .d.ts files
    const componentFiles = files.filter(f =>
      (f.name.endsWith('.component.d.ts') || f.name.endsWith('.directive.d.ts')) &&
      !f.name.includes('.spec.') &&
      !f.name.includes('.test.') &&
      !f.name.includes('__')
    );

    console.log(`[NPM Discovery] Found ${componentFiles.length} component/directive files in ${packageName}`);

    // Step 4: Fetch and parse each component file (limit concurrent requests)
    const batchSize = 10;
    for (let i = 0; i < componentFiles.length; i += batchSize) {
      const batch = componentFiles.slice(i, i + batchSize);

      const batchResults = await Promise.all(batch.map(async file => {
        const filePath = file.name.replace(/^\//, '');
        const content = await fetchPackageFile(packageName, version, filePath);

        if (!content) return null;

        // Extract component info
        const component = parseComponentFile(content, filePath);
        return component;
      }));

      for (const comp of batchResults) {
        if (comp) {
          result.components.push(comp);
        }
      }
    }

    // Step 4b: If no components found via individual files, try bundled type files
    // Some packages (e.g., @fundamental-ngx/core) bundle all types into /types/*.d.ts
    if (result.components.length === 0) {
      const bundledTypeFiles = files.filter(f =>
        f.name.startsWith('/types/') &&
        f.name.endsWith('.d.ts') &&
        !f.name.endsWith('/index.d.ts')
      );

      // Also check for the main typings entry
      const packageData2 = await fetch(registryUrl).then(r => r.json());
      const versionData = packageData2.versions?.[version];
      const typingsEntry = versionData?.typings || versionData?.types;

      if (bundledTypeFiles.length > 0) {
        console.log(`[NPM Discovery] Found ${bundledTypeFiles.length} bundled type files, scanning for components...`);

        for (let i = 0; i < bundledTypeFiles.length; i += batchSize) {
          const batch = bundledTypeFiles.slice(i, i + batchSize);

          const batchResults = await Promise.all(batch.map(async file => {
            const filePath = file.name.replace(/^\//, '');
            const content = await fetchPackageFile(packageName, version, filePath);

            if (!content) return [];

            return parseBundledTypeFile(content, filePath);
          }));

          for (const comps of batchResults) {
            result.components.push(...comps);
          }
        }

        console.log(`[NPM Discovery] Found ${result.components.length} components from bundled type files`);
      } else if (typingsEntry) {
        // Try the single main typings file
        console.log(`[NPM Discovery] Trying main typings entry: ${typingsEntry}`);
        const content = await fetchPackageFile(packageName, version, typingsEntry);
        if (content) {
          const comps = parseBundledTypeFile(content, typingsEntry);
          result.components.push(...comps);
          console.log(`[NPM Discovery] Found ${comps.length} components from main typings file`);
        }
      }
    }

    // Step 5: Enhance with data from the .mjs bundle (contains templates, inputs, outputs)
    console.log(`[NPM Discovery] Fetching .mjs bundle for enhanced metadata...`);
    const mjsContent = await fetchMjsBundle(packageName, version);
    if (mjsContent) {
      enhanceComponentsFromMjs(result.components, mjsContent);
      console.log(`[NPM Discovery] Enhanced components with .mjs bundle data`);
    }

    // Sort by category, then by name
    result.components.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.componentName.localeCompare(b.componentName);
    });

    console.log(`[NPM Discovery] Parsed ${result.components.length} components from ${packageName}`);

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
}

/**
 * Parse a component .d.ts file to extract component info
 */
function parseComponentFile(content: string, filePath: string): DiscoveredComponent | null {
  // Extract class name
  const classMatch = content.match(/export\s+declare\s+class\s+(\w+)/);
  if (!classMatch) return null;

  const className = classMatch[1];

  // Skip if not a component or directive
  if (!className.endsWith('Component') && !className.endsWith('Directive')) {
    return null;
  }

  // Extract component name (without suffix)
  const baseName = className.replace(/Component$|Directive$/, '');

  // Extract category from file path
  // e.g., /lib/core-ui/components/button/button.component.d.ts -> "Core UI"
  const category = extractCategoryFromPath(filePath);

  // Generate ID (similar to Storybook format)
  const id = `${category.toLowerCase().replace(/\s+/g, '-')}-${baseName.toLowerCase()}--docs`;

  // Parse metadata from .d.ts file
  const metadata = parseComponentMetadata(content, className);

  // Also extract selector from ɵcmp/ɵdir declaration in .d.ts
  const selectorMatch = content.match(/ɵɵ(?:Component|Directive)Declaration<[^,]+,\s*"([^"]+)"/);
  let selector = metadata.selector;
  let usageType = metadata.usageType;

  if (selectorMatch) {
    selector = selectorMatch[1];
    // Determine usage type from selector
    if (selector.includes('[') || selector.match(/^[a-z]+\[/)) {
      usageType = 'directive';
    } else {
      usageType = 'component';
    }
  }

  // Convert metadata inputs to ComponentInput format
  const inputs: ComponentInput[] = (metadata.inputs || []).map(input => ({
    name: input.name,
    type: input.type,
    description: input.description,
    required: input.required,
    defaultValue: input.defaultValue
  }));

  return {
    id,
    name: baseName,
    componentName: baseName,
    category,
    type: 'docs',
    filePath,
    selector,
    usageType,
    description: metadata.description,
    inputs: inputs.length > 0 ? inputs : undefined,
    examples: metadata.examples
  };
}

/**
 * Parse a bundled type file (e.g., types/package-name-button.d.ts) to extract
 * all components and directives. These files contain multiple class declarations.
 */
function parseBundledTypeFile(content: string, filePath: string): DiscoveredComponent[] {
  const components: DiscoveredComponent[] = [];

  // Find all class declarations that are components or directives
  // Match: declare class XxxComponent { ... static ɵcmp/ɵdir ... }
  const classPattern = /declare\s+class\s+(\w+(?:Component|Directive))\s*(?:extends\s+\S+\s*)?(?:implements\s+[^{]+)?\{/g;
  let classMatch;

  while ((classMatch = classPattern.exec(content)) !== null) {
    const className = classMatch[1];
    const classStart = classMatch.index;

    // Extract the selector from ɵɵComponentDeclaration or ɵɵDirectiveDeclaration
    // Search forward from the class declaration for the static ɵcmp/ɵdir
    const afterClass = content.substring(classStart, classStart + 5000);

    const selectorMatch = afterClass.match(
      /ɵɵ(?:Component|Directive)Declaration<[^,]+,\s*"([^"]+)"/
    );

    if (!selectorMatch) continue; // Skip classes without selector declarations (abstract/base classes)

    const selector = selectorMatch[1];
    const baseName = className.replace(/Component$|Directive$/, '');
    const isDirective = className.endsWith('Directive') ||
      selector.includes('[') ||
      selector.match(/^[a-z]+\[/);

    // Extract category from file path
    const category = extractCategoryFromBundledPath(filePath);

    const id = `${category.toLowerCase().replace(/\s+/g, '-')}-${baseName.toLowerCase()}--docs`;

    // Parse inputs from the ɵɵComponentDeclaration/ɵɵDirectiveDeclaration
    const inputs = parseBundledInputs(afterClass);
    const outputs = parseBundledOutputs(afterClass);

    // Extract JSDoc description before the class
    let description: string | undefined;
    const beforeClass = content.substring(Math.max(0, classStart - 500), classStart);
    const jsdocMatch = beforeClass.match(/\/\*\*\s*([\s\S]*?)\s*\*\/\s*$/);
    if (jsdocMatch) {
      const descLines = jsdocMatch[1]
        .split('\n')
        .map(l => l.replace(/^\s*\*\s?/, '').trim())
        .filter(l => l && !l.startsWith('@'));
      if (descLines.length > 0) {
        description = descLines.join(' ').trim();
      }
    }

    components.push({
      id,
      name: baseName,
      componentName: baseName,
      category,
      type: 'docs',
      filePath,
      selector,
      usageType: isDirective ? 'directive' : 'component',
      description,
      inputs: inputs.length > 0 ? inputs : undefined,
      outputs: outputs.length > 0 ? outputs : undefined
    });
  }

  return components;
}

/**
 * Parse inputs from the ɵɵComponentDeclaration/ɵɵDirectiveDeclaration format:
 * { "inputName": { "alias": "inputName"; "required": false; "isSignal": true; }; ... }
 */
function parseBundledInputs(declarationBlock: string): ComponentInput[] {
  const inputs: ComponentInput[] = [];

  // Find the inputs section in the declaration
  // Format: ɵɵComponentDeclaration<Type, "selector", ..., { "input1": {...}; "input2": {...}; }, ...>
  const declMatch = declarationBlock.match(
    /ɵɵ(?:Component|Directive)Declaration<[^>]*>/
  );
  if (!declMatch) return inputs;

  const decl = declMatch[0];

  // The inputs are in the 4th type parameter (after Type, selector, exportAs)
  // Extract the object between { } for inputs
  // Count commas at the top level to find the right parameter
  let depth = 0;
  let commaCount = 0;
  let inputsStart = -1;
  let inputsEnd = -1;

  for (let i = decl.indexOf('<') + 1; i < decl.length; i++) {
    const ch = decl[i];
    if (ch === '<' || ch === '{' || ch === '(') depth++;
    if (ch === '>' || ch === '}' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      commaCount++;
      // After the 3rd comma is the inputs parameter (0-indexed: Type, selector, exportAs, inputs)
      if (commaCount === 3) {
        inputsStart = i + 1;
      }
      if (commaCount === 4) {
        inputsEnd = i;
        break;
      }
    }
  }

  if (inputsStart === -1 || inputsEnd === -1) return inputs;

  const inputsStr = decl.substring(inputsStart, inputsEnd).trim();

  // Parse individual input entries: "name": { "alias": "name"; "required": false; ... }
  const inputPattern = /"(\w+)":\s*\{\s*"alias":\s*"([^"]+)";\s*"required":\s*(true|false)/g;
  let inputMatch;
  while ((inputMatch = inputPattern.exec(inputsStr)) !== null) {
    inputs.push({
      name: inputMatch[1],
      type: 'unknown',
      required: inputMatch[3] === 'true'
    });
  }

  return inputs;
}

/**
 * Parse outputs from the ɵɵComponentDeclaration/ɵɵDirectiveDeclaration format:
 * { "outputName": "outputName"; ... }
 */
function parseBundledOutputs(declarationBlock: string): ComponentOutput[] {
  const outputs: ComponentOutput[] = [];

  const declMatch = declarationBlock.match(
    /ɵɵ(?:Component|Directive)Declaration<[^>]*>/
  );
  if (!declMatch) return outputs;

  const decl = declMatch[0];

  // The outputs are in the 5th type parameter
  let depth = 0;
  let commaCount = 0;
  let outputsStart = -1;
  let outputsEnd = -1;

  for (let i = decl.indexOf('<') + 1; i < decl.length; i++) {
    const ch = decl[i];
    if (ch === '<' || ch === '{' || ch === '(') depth++;
    if (ch === '>' || ch === '}' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      commaCount++;
      if (commaCount === 4) {
        outputsStart = i + 1;
      }
      if (commaCount === 5) {
        outputsEnd = i;
        break;
      }
    }
  }

  if (outputsStart === -1 || outputsEnd === -1) return outputs;

  const outputsStr = decl.substring(outputsStart, outputsEnd).trim();

  // Parse output entries: "name": "alias"
  const outputPattern = /"(\w+)":\s*"([^"]+)"/g;
  let outputMatch;
  while ((outputMatch = outputPattern.exec(outputsStr)) !== null) {
    outputs.push({
      name: outputMatch[1]
    });
  }

  return outputs;
}

/**
 * Extract category from a bundled type file path.
 * e.g., "types/fundamental-ngx-core-button.d.ts" -> "Button"
 * e.g., "types/fundamental-ngx-core-date-picker.d.ts" -> "Date Picker"
 */
function extractCategoryFromBundledPath(filePath: string): string {
  const fileName = filePath.split('/').pop() || '';
  // Remove the .d.ts extension
  let name = fileName.replace(/\.d\.ts$/, '');

  // Remove common package prefixes - find the last meaningful segment
  // Pattern: package-name-component-name -> component-name
  // For scoped packages like fundamental-ngx-core-button, we want "button"
  // Strategy: remove everything up to and including the package base name
  // The base name typically has a pattern like "packagescope-packagename-subpackage"

  // Try to find the component part by looking for well-known package patterns
  // For "fundamental-ngx-core-button" -> "button"
  // For "fundamental-ngx-core-date-picker" -> "date-picker"
  const knownPrefixes = [
    /^fundamental-ngx-core-/,
    /^fundamental-ngx-platform-/,
    /^fundamental-ngx-/,
    /^ng-zorro-antd-/,
    /^primeng-/,
    /^angular-material-/,
  ];

  for (const prefix of knownPrefixes) {
    if (prefix.test(name)) {
      name = name.replace(prefix, '');
      break;
    }
  }

  // If no known prefix matched, try a generic approach:
  // Remove everything before the last dash-separated segment that might be the main package name
  // This is a heuristic - works for most Angular libraries
  if (name === fileName.replace(/\.d\.ts$/, '')) {
    // Fallback: just use the full name
  }

  // Convert to readable format: "date-picker" -> "Date Picker"
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Fetch the fesm2022 .mjs bundle which contains rich component metadata
 */
async function fetchMjsBundle(packageName: string, version: string): Promise<string | null> {
  // Try common bundle paths
  const bundlePaths = [
    `fesm2022/${packageName.split('/').pop()}.mjs`,
    `fesm2022/index.mjs`,
    `fesm2020/${packageName.split('/').pop()}.mjs`,
    `esm2022/index.mjs`,
  ];

  // For scoped packages like @leanix/components, try the package name without scope
  const scopedName = packageName.replace('@', '').replace('/', '-');
  bundlePaths.unshift(`fesm2022/${scopedName}.mjs`);

  for (const bundlePath of bundlePaths) {
    const content = await fetchPackageFile(packageName, version, bundlePath);
    if (content && content.includes('ɵɵngDeclareComponent')) {
      console.log(`[NPM Discovery] Found .mjs bundle at ${bundlePath}`);
      return content;
    }
  }

  return null;
}

/**
 * Enhance components with data from the .mjs bundle
 */
function enhanceComponentsFromMjs(components: DiscoveredComponent[], mjsContent: string): void {
  for (const component of components) {
    const className = `${component.componentName}Component`;
    const directiveName = `${component.componentName}Directive`;

    // Try to find the component/directive metadata in the mjs content
    const metadata = extractMjsMetadata(mjsContent, className) ||
                     extractMjsMetadata(mjsContent, directiveName);

    if (metadata) {
      // Update selector if found
      if (metadata.selector) {
        component.selector = metadata.selector;
        // Determine usage type from selector
        if (metadata.selector.includes('[') || metadata.selector.match(/^[a-z]+\[/)) {
          component.usageType = 'directive';
        } else {
          component.usageType = 'component';
        }
      }

      // Merge inputs - combine existing type info with required flags from .mjs
      if (metadata.inputs && metadata.inputs.length > 0) {
        const existingInputs = component.inputs || [];
        const inputMap = new Map(existingInputs.map(i => [i.name, i]));

        for (const mjsInput of metadata.inputs) {
          const existing = inputMap.get(mjsInput.name);
          if (existing) {
            // Merge: keep type/description from .d.ts, add required from .mjs
            existing.required = mjsInput.required;
          } else {
            // New input from .mjs
            inputMap.set(mjsInput.name, mjsInput);
          }
        }

        component.inputs = Array.from(inputMap.values());
      }

      // Add outputs
      if (metadata.outputs && metadata.outputs.length > 0) {
        component.outputs = metadata.outputs;
      }

      // Add template
      if (metadata.template) {
        component.template = metadata.template;
      }
    }

    // Always create a usage example if none exists (based on selector and inputs)
    if (!component.examples || component.examples.length === 0) {
      const usageExample = createUsageExample(component, component.template);
      if (usageExample) {
        component.examples = [{ title: 'Basic Usage', code: usageExample, language: 'html' }];
      }
    }
  }
}

/**
 * Extract metadata for a specific component/directive from .mjs content
 */
function extractMjsMetadata(mjsContent: string, className: string): {
  selector?: string;
  inputs?: ComponentInput[];
  outputs?: ComponentOutput[];
  template?: string;
} | null {
  // Find the class block first to narrow down the search
  const classBlockPattern = new RegExp(
    `class\\s+${className}\\s*(?:extends[^{]+)?\\{[\\s\\S]*?(?=\\nclass\\s|\\nexport\\s|$)`,
    'm'
  );
  const classBlock = mjsContent.match(classBlockPattern);

  if (!classBlock) {
    console.log(`[MJS Parser] Class ${className} not found in bundle`);
    return null;
  }

  const classContent = classBlock[0];
  const result: {
    selector?: string;
    inputs?: ComponentInput[];
    outputs?: ComponentOutput[];
    template?: string;
  } = {};

  // Extract selector from ɵɵngDeclareComponent/ɵɵngDeclareDirective
  const selectorMatch = classContent.match(/selector:\s*["']([^"']+)["']/);
  if (selectorMatch) {
    result.selector = selectorMatch[1];
  }

  // Extract template
  const templateMatch = classContent.match(/template:\s*["']([^"']*(?:\\.[^"']*)*)["']/);
  if (templateMatch) {
    // Unescape the template string
    result.template = templateMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }

  // Find inputs from the inputs declaration in ɵɵngDeclareComponent
  // Format: inputs: { inputName: "inputName", requiredInput: { alias: "requiredInput", required: true } }
  // Or newer format: inputs: { inputName: { isSignal: false, ... }, ... }
  const inputsBlockMatch = classContent.match(/inputs:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/);
  if (inputsBlockMatch) {
    const inputsBlock = inputsBlockMatch[1];
    const inputs: ComponentInput[] = [];

    // Match simple inputs: name: "alias" or name: "name"
    const simpleInputPattern = /(\w+):\s*["'](\w+)["']/g;
    let simpleMatch;
    while ((simpleMatch = simpleInputPattern.exec(inputsBlock)) !== null) {
      // Skip if this is part of an object (check for surrounding braces)
      const beforeMatch = inputsBlock.substring(0, simpleMatch.index);
      const openBraces = (beforeMatch.match(/\{/g) || []).length;
      const closeBraces = (beforeMatch.match(/\}/g) || []).length;
      if (openBraces === closeBraces) {
        inputs.push({
          name: simpleMatch[1],
          type: 'unknown',
          required: false
        });
      }
    }

    // Match object inputs: name: { alias: "alias", required: true }
    const objectInputPattern = /(\w+):\s*\{\s*(?:alias:\s*["']\w+["'],?\s*)?(?:required:\s*(true|false))?[^}]*\}/g;
    let objectMatch;
    while ((objectMatch = objectInputPattern.exec(inputsBlock)) !== null) {
      const inputName = objectMatch[1];
      const isRequired = objectMatch[2] === 'true';
      // Check if we already have this input
      const existingIndex = inputs.findIndex(i => i.name === inputName);
      if (existingIndex >= 0) {
        inputs[existingIndex].required = isRequired;
      } else {
        inputs.push({
          name: inputName,
          type: 'unknown',
          required: isRequired
        });
      }
    }

    if (inputs.length > 0) {
      result.inputs = inputs;
      console.log(`[MJS Parser] ${className}: Found ${inputs.length} inputs from inputs block`);
    }
  }

  // Also look for propDecorators format (older Angular or different compilation)
  // Find the metadata declaration for this class
  const metadataPattern = new RegExp(
    `ɵɵngDeclareClassMetadata\\s*\\(\\s*\\{[\\s\\S]*?type:\\s*${className}[\\s\\S]*?propDecorators:\\s*\\{([\\s\\S]*?)\\}\\s*\\}\\s*\\)`,
    'm'
  );

  const metadataMatch = mjsContent.match(metadataPattern);
  if (metadataMatch) {
    const propContent = metadataMatch[1];
    console.log(`[MJS Parser] ${className}: Found propDecorators block`);

    // Extract inputs - handle various formats
    const inputs: ComponentInput[] = result.inputs || [];
    const existingInputNames = new Set(inputs.map(i => i.name));

    // Pattern 1: name: [{ type: Input }]
    // Pattern 2: name: [{ type: Input, args: [{ required: true }] }]
    const inputPattern = /(\w+):\s*\[\s*\{\s*type:\s*Input(?:\s*,\s*args:\s*\[\s*\{[^}]*required:\s*(true|false)[^}]*\}\s*\])?\s*\}\s*\]/g;
    let inputMatch;
    while ((inputMatch = inputPattern.exec(propContent)) !== null) {
      const inputName = inputMatch[1];
      const isRequired = inputMatch[2] === 'true';

      if (!existingInputNames.has(inputName)) {
        inputs.push({
          name: inputName,
          type: 'unknown',
          required: isRequired
        });
        existingInputNames.add(inputName);
      } else {
        // Update required status if we have more info
        const existing = inputs.find(i => i.name === inputName);
        if (existing && isRequired) {
          existing.required = true;
        }
      }
    }

    if (inputs.length > 0) {
      result.inputs = inputs;
    }

    // Extract outputs
    const outputs: ComponentOutput[] = result.outputs || [];
    const existingOutputNames = new Set(outputs.map(o => o.name));
    const outputPattern = /(\w+):\s*\[\s*\{\s*type:\s*Output\s*\}\s*\]/g;
    let outputMatch;
    while ((outputMatch = outputPattern.exec(propContent)) !== null) {
      if (!existingOutputNames.has(outputMatch[1])) {
        outputs.push({
          name: outputMatch[1]
        });
        existingOutputNames.add(outputMatch[1]);
      }
    }

    if (outputs.length > 0) {
      result.outputs = outputs;
    }
  }

  // Also try to extract outputs from the outputs declaration in component metadata
  const outputsBlockMatch = classContent.match(/outputs:\s*\{([^}]+)\}/);
  if (outputsBlockMatch) {
    const outputsBlock = outputsBlockMatch[1];
    const outputs: ComponentOutput[] = result.outputs || [];
    const existingOutputNames = new Set(outputs.map(o => o.name));

    const outputPattern = /(\w+):\s*["'](\w+)["']/g;
    let outputMatch;
    while ((outputMatch = outputPattern.exec(outputsBlock)) !== null) {
      if (!existingOutputNames.has(outputMatch[1])) {
        outputs.push({
          name: outputMatch[1]
        });
        existingOutputNames.add(outputMatch[1]);
      }
    }

    if (outputs.length > 0) {
      result.outputs = outputs;
    }
  }

  if (result.inputs?.length || result.outputs?.length) {
    console.log(`[MJS Parser] ${className}: Final - ${result.inputs?.length || 0} inputs, ${result.outputs?.length || 0} outputs`);
  }

  return result;
}

/**
 * Create a usage example from component metadata
 */
function createUsageExample(component: DiscoveredComponent, template?: string): string | null {
  const selector = component.selector;
  if (!selector) return null;

  // Get required inputs for the example
  const requiredInputs = component.inputs?.filter(i => i.required) || [];

  // Check if it's a directive (attribute selector)
  if (selector.includes('[')) {
    // Extract attribute name, e.g., "button[lx-button]" -> "lx-button"
    const attrMatch = selector.match(/\[([^\]]+)\]/);
    if (attrMatch) {
      const attr = attrMatch[1];
      const hostElement = selector.split('[')[0] || 'button';

      // Add required inputs to directive usage
      const inputAttrs = requiredInputs.map(i => `[${i.name}]="value"`).join(' ');
      if (inputAttrs) {
        return `<${hostElement} ${attr} ${inputAttrs}>Content</${hostElement}>`;
      }
      return `<${hostElement} ${attr}>Content</${hostElement}>`;
    }
  }

  // It's a component (element selector)
  // Generate meaningful placeholder values based on input names
  const inputAttrs = requiredInputs.map(i => {
    const placeholder = getPlaceholderValue(i.name, i.type);
    return `[${i.name}]="${placeholder}"`;
  }).join(' ');

  if (inputAttrs) {
    return `<${selector} ${inputAttrs}></${selector}>`;
  }

  // Also include commonly used optional inputs in the example if no required ones
  const commonInputs = component.inputs?.filter(i =>
    !i.required && ['content', 'label', 'text', 'value', 'title', 'name'].includes(i.name.toLowerCase())
  ) || [];

  if (commonInputs.length > 0) {
    const commonAttrs = commonInputs.slice(0, 2).map(i => {
      const placeholder = getPlaceholderValue(i.name, i.type);
      return `[${i.name}]="${placeholder}"`;
    }).join(' ');
    return `<${selector} ${commonAttrs}></${selector}>`;
  }

  return `<${selector}></${selector}>`;
}

/**
 * Generate a meaningful placeholder value based on input name and type
 */
function getPlaceholderValue(name: string, type: string): string {
  const nameLower = name.toLowerCase();

  // String-like inputs
  if (nameLower.includes('content') || nameLower.includes('text') || nameLower.includes('label')) {
    return 'Your text here';
  }
  if (nameLower.includes('title')) {
    return 'Title';
  }
  if (nameLower.includes('name')) {
    return 'name';
  }
  if (nameLower.includes('url') || nameLower.includes('href') || nameLower.includes('src')) {
    return 'https://example.com';
  }
  if (nameLower.includes('icon')) {
    return 'icon-name';
  }

  // Boolean-like inputs
  if (nameLower.includes('disabled') || nameLower.includes('readonly') || nameLower.includes('loading')) {
    return 'false';
  }
  if (nameLower.includes('visible') || nameLower.includes('show') || nameLower.includes('open')) {
    return 'true';
  }

  // Number-like inputs
  if (nameLower.includes('count') || nameLower.includes('size') || nameLower.includes('index')) {
    return '0';
  }

  // Type-based fallbacks
  if (type.includes('string')) return 'value';
  if (type.includes('number')) return '0';
  if (type.includes('boolean')) return 'true';

  return 'value';
}

/**
 * Extract a readable category from file path
 */
function extractCategoryFromPath(filePath: string): string {
  // Remove leading slash and file name
  const parts = filePath.replace(/^\//, '').split('/');
  parts.pop(); // Remove filename

  // Common patterns to clean up
  const ignoreParts = ['lib', 'src', 'components', 'directives', 'dist', 'esm2022', 'fesm2022'];

  const relevantParts = parts.filter(p => !ignoreParts.includes(p.toLowerCase()));

  if (relevantParts.length === 0) {
    return 'Components';
  }

  // Convert to readable format: "core-ui" -> "Core UI"
  return relevantParts
    .map(p => p
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    )
    .join(' / ');
}

/**
 * Analyze an npm package to discover Angular exports
 */
export async function analyzeNpmPackage(packageName: string): Promise<NpmAnalysisResult> {
  const result: NpmAnalysisResult = {
    packageName,
    version: 'latest',
    exports: [],
    errors: []
  };

  try {
    // Step 1: Get package metadata from npm registry
    const registryUrl = `https://registry.npmjs.org/${packageName}`;
    const registryResponse = await fetch(registryUrl);

    if (!registryResponse.ok) {
      result.errors.push(`Package not found: ${packageName}`);
      return result;
    }

    const packageData = await registryResponse.json();
    const latestVersion = packageData['dist-tags']?.latest;

    if (!latestVersion) {
      result.errors.push('Could not determine latest version');
      return result;
    }

    result.version = latestVersion;
    const versionData = packageData.versions?.[latestVersion];

    // Step 2: Find the types/typings entry point
    const typesEntry = versionData?.types || versionData?.typings;
    const mainEntry = versionData?.main || 'index.js';
    const moduleEntry = versionData?.module;

    // Step 3: Try to fetch type definitions from jsdelivr
    const typeFiles = await fetchTypeDefinitions(packageName, latestVersion, typesEntry);

    if (typeFiles.length > 0) {
      // Parse type definitions to find exports
      for (const content of typeFiles) {
        const exports = parseTypeDefinitions(content);
        result.exports.push(...exports);
      }
    }

    // Step 4: If we only found modules, try to find component files
    const hasOnlyModules = result.exports.length > 0 &&
      result.exports.every(e => e.type === 'module' || e.type === 'other');

    if (hasOnlyModules || result.exports.filter(e => e.type === 'component' || e.type === 'directive').length < 5) {
      // Try to find more components by scanning common Angular patterns
      const additionalExports = await scanForAngularComponents(packageName, latestVersion);
      result.exports.push(...additionalExports);
    }

    // Step 5: If no types found, try to fetch and analyze the main entry
    if (result.exports.length === 0) {
      const mainContent = await fetchPackageFile(packageName, latestVersion, mainEntry);
      if (mainContent) {
        const exports = parseJavaScriptExports(mainContent);
        result.exports.push(...exports);
      }
    }

    // Deduplicate exports
    const seen = new Set<string>();
    result.exports = result.exports.filter(exp => {
      if (seen.has(exp.name)) return false;
      seen.add(exp.name);
      return true;
    });

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
}

/**
 * Scan for Angular component files in common locations
 */
async function scanForAngularComponents(packageName: string, version: string): Promise<NpmExport[]> {
  const exports: NpmExport[] = [];

  // Try to get the file listing from jsdelivr
  try {
    const filesUrl = `https://data.jsdelivr.com/v1/package/npm/${packageName}@${version}/flat`;
    const response = await fetch(filesUrl);

    if (response.ok) {
      const data = await response.json();
      const files: string[] = data.files?.map((f: any) => f.name) || [];

      // Find .d.ts files that look like component files
      const componentFiles = files.filter(f =>
        f.endsWith('.component.d.ts') ||
        f.endsWith('.directive.d.ts') ||
        (f.endsWith('.d.ts') && !f.includes('module') && !f.includes('index'))
      ).slice(0, 30); // Limit to avoid too many requests

      // Fetch and parse each component file
      for (const file of componentFiles) {
        const content = await fetchPackageFile(packageName, version, file.replace(/^\//, ''));
        if (content) {
          const fileExports = parseTypeDefinitions(content);
          exports.push(...fileExports);
        }
      }
    }
  } catch (e) {
    // Ignore errors in this fallback
  }

  return exports;
}

/**
 * Fetch type definition files from jsdelivr CDN
 */
async function fetchTypeDefinitions(
  packageName: string,
  version: string,
  typesEntry?: string
): Promise<string[]> {
  const contents: string[] = [];
  const fetchedPaths = new Set<string>();

  // Common type definition file patterns
  const typePaths = [
    typesEntry,
    'index.d.ts',
    'public-api.d.ts',
    'public_api.d.ts',
    'src/index.d.ts',
    'dist/index.d.ts',
    'lib/index.d.ts',
    'esm2022/index.d.ts',
    'fesm2022/index.d.ts',
  ].filter(Boolean) as string[];

  for (const typePath of typePaths) {
    if (fetchedPaths.has(typePath)) continue;
    fetchedPaths.add(typePath);

    const content = await fetchPackageFile(packageName, version, typePath);
    if (content && content.includes('export')) {
      contents.push(content);

      // Follow export * from './path' references
      const reExportPaths = extractReExportPaths(content, typePath);
      for (const reExportPath of reExportPaths) {
        if (fetchedPaths.has(reExportPath)) continue;
        fetchedPaths.add(reExportPath);

        const reExportContent = await fetchPackageFile(packageName, version, reExportPath);
        if (reExportContent && reExportContent.includes('export')) {
          contents.push(reExportContent);
        }

        // Limit to avoid too many requests
        if (contents.length >= 10) break;
      }

      // Usually the main entry + re-exports are enough
      if (contents.length >= 5) break;
    }
  }

  return contents;
}

/**
 * Extract re-export paths from type definitions
 */
function extractReExportPaths(content: string, currentPath: string): string[] {
  const paths: string[] = [];
  const baseDir = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : '';

  // Match: export * from './path' or export { ... } from './path'
  const reExportMatches = content.matchAll(/export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g);

  for (const match of reExportMatches) {
    let importPath = match[1];

    // Skip node_modules imports
    if (!importPath.startsWith('.')) continue;

    // Resolve relative path
    if (importPath.startsWith('./')) {
      importPath = baseDir ? `${baseDir}/${importPath.substring(2)}` : importPath.substring(2);
    } else if (importPath.startsWith('../')) {
      // Handle parent directory - simplified
      const parts = baseDir.split('/');
      parts.pop();
      importPath = parts.join('/') + '/' + importPath.substring(3);
    }

    // Add .d.ts extension if not present
    if (!importPath.endsWith('.d.ts')) {
      paths.push(`${importPath}.d.ts`);
      paths.push(`${importPath}/index.d.ts`);
    } else {
      paths.push(importPath);
    }
  }

  return paths;
}

/**
 * Fetch a file from an npm package via jsdelivr CDN
 */
async function fetchPackageFile(
  packageName: string,
  version: string,
  filePath: string
): Promise<string | null> {
  try {
    // jsdelivr URL format: https://cdn.jsdelivr.net/npm/package@version/file
    const url = `https://cdn.jsdelivr.net/npm/${packageName}@${version}/${filePath}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'text/plain' }
    });

    if (response.ok) {
      return await response.text();
    }
  } catch {
    // Ignore errors, file might not exist
  }
  return null;
}

/**
 * Parse TypeScript type definitions to extract exports
 */
function parseTypeDefinitions(content: string): NpmExport[] {
  const exports: NpmExport[] = [];

  // Pattern 1: export { Name } or export { Name as Alias }
  const namedExports = content.matchAll(/export\s*\{\s*([^}]+)\s*\}/g);
  for (const match of namedExports) {
    const names = match[1].split(',').map(s => s.trim());
    for (const name of names) {
      // Handle "Name as Alias" syntax
      const actualName = name.split(/\s+as\s+/)[0].trim();
      if (actualName && !actualName.startsWith('_')) {
        exports.push({
          name: actualName,
          type: inferExportType(actualName)
        });
      }
    }
  }

  // Pattern 2: export declare class ClassName
  const classExports = content.matchAll(/export\s+declare\s+class\s+(\w+)/g);
  for (const match of classExports) {
    const name = match[1];
    if (!name.startsWith('_')) {
      exports.push({
        name,
        type: inferExportType(name)
      });
    }
  }

  // Pattern 3: export class ClassName (without declare)
  const classExports2 = content.matchAll(/export\s+class\s+(\w+)/g);
  for (const match of classExports2) {
    const name = match[1];
    if (!name.startsWith('_')) {
      exports.push({
        name,
        type: inferExportType(name)
      });
    }
  }

  // Pattern 4: export declare const/let/var
  const constExports = content.matchAll(/export\s+declare\s+(?:const|let|var)\s+(\w+)/g);
  for (const match of constExports) {
    const name = match[1];
    if (!name.startsWith('_')) {
      exports.push({
        name,
        type: 'other'
      });
    }
  }

  // Pattern 5: export * from './path' - we can't resolve these without fetching more files
  // But we note them as potential additional exports

  return exports;
}

/**
 * Parse JavaScript exports (fallback when no types available)
 */
function parseJavaScriptExports(content: string): NpmExport[] {
  const exports: NpmExport[] = [];

  // Look for re-exports pattern common in Angular libraries
  // export { ButtonComponent } from './button/button.component';
  const reExports = content.matchAll(/export\s*\{\s*([^}]+)\s*\}\s*from/g);
  for (const match of reExports) {
    const names = match[1].split(',').map(s => s.trim());
    for (const name of names) {
      const actualName = name.split(/\s+as\s+/)[0].trim();
      if (actualName && !actualName.startsWith('_')) {
        exports.push({
          name: actualName,
          type: inferExportType(actualName)
        });
      }
    }
  }

  return exports;
}

/**
 * Infer the type of export based on naming conventions
 */
function inferExportType(name: string): NpmExport['type'] {
  if (name.endsWith('Component')) return 'component';
  if (name.endsWith('Directive')) return 'directive';
  if (name.endsWith('Module')) return 'module';
  if (name.endsWith('Service')) return 'service';
  return 'other';
}

/**
 * Fetch detailed component metadata from npm package .d.ts files
 */
export async function fetchComponentMetadata(
  packageName: string,
  componentName: string
): Promise<ComponentMetadata | null> {
  try {
    // Get package version
    const registryUrl = `https://registry.npmjs.org/${packageName}`;
    const registryResponse = await fetch(registryUrl);
    if (!registryResponse.ok) return null;

    const packageData = await registryResponse.json();
    const version = packageData['dist-tags']?.latest;
    if (!version) return null;

    // Get file listing to find component file
    const filesUrl = `https://data.jsdelivr.com/v1/package/npm/${packageName}@${version}/flat`;
    const filesResponse = await fetch(filesUrl);
    if (!filesResponse.ok) return null;

    const filesData = await filesResponse.json();
    const files: string[] = filesData.files?.map((f: any) => f.name) || [];

    // Find the component .d.ts file
    const baseName = componentName.replace(/Component$|Directive$/, '').toLowerCase();
    const possibleFiles = files.filter(f => {
      const lowerF = f.toLowerCase();
      return (
        lowerF.includes(`/${baseName}.component.d.ts`) ||
        lowerF.includes(`/${baseName}.directive.d.ts`) ||
        lowerF.includes(`/${baseName}.d.ts`) ||
        lowerF.includes(`/${baseName}/index.d.ts`)
      );
    });

    if (possibleFiles.length === 0) return null;

    // Fetch the component file
    const filePath = possibleFiles[0].replace(/^\//, '');
    const content = await fetchPackageFile(packageName, version, filePath);
    if (!content) return null;

    // Parse the metadata
    return parseComponentMetadata(content, componentName);
  } catch (error) {
    console.error(`[NPM Analyzer] Error fetching metadata for ${componentName}:`, error);
    return null;
  }
}

/**
 * Parse component metadata from .d.ts file content
 */
function parseComponentMetadata(content: string, componentName: string): ComponentMetadata {
  const metadata: ComponentMetadata = { name: componentName };

  // Extract selector from ɵcmp or ɵdir declaration
  // Pattern: static ɵcmp: i0.ɵɵComponentDeclaration<..., "selector", ...>
  const selectorMatch = content.match(/ɵɵ(?:Component|Directive)Declaration<[^,]+,\s*"([^"]+)"/);
  if (selectorMatch) {
    metadata.selector = selectorMatch[1];
    // Determine if it's a directive based on selector format
    // [attrName] = directive, element-name = component
    if (metadata.selector.includes('[') || metadata.selector.includes('button[') || metadata.selector.includes('input[')) {
      metadata.usageType = 'directive';
    } else {
      metadata.usageType = 'component';
    }
  }

  // Extract description from JSDoc comment before the class
  const classPattern = new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*export\\s+(?:declare\\s+)?class\\s+${componentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
  const classMatch = content.match(classPattern);
  if (classMatch) {
    const jsdoc = classMatch[1];
    // Extract description (text before any @tags)
    const descMatch = jsdoc.match(/^\s*\*\s*([^@\n][\s\S]*?)(?=\s*\*\s*@|\s*\*\/|\s*$)/);
    if (descMatch) {
      metadata.description = descMatch[1]
        .replace(/\n\s*\*\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // Extract inputs/props with their JSDoc
  const inputs: ComponentMetadata['inputs'] = [];

  // Pattern for properties with JSDoc comments
  const propPattern = /\/\*\*\s*([\s\S]*?)\s*\*\/\s*(?:readonly\s+)?(\w+)(?:\s*[?!]?\s*)?:\s*([^;=]+)/g;
  let propMatch;
  while ((propMatch = propPattern.exec(content)) !== null) {
    const jsdoc = propMatch[1];
    const propName = propMatch[2];
    const propType = propMatch[3].trim();

    // Skip private/protected/internal properties
    if (propName.startsWith('_') || propName.startsWith('ngOn') || propName === 'constructor') continue;
    // Skip static Angular metadata
    if (propName.startsWith('ɵ')) continue;

    // Extract description from JSDoc
    let description = '';
    const descLines = jsdoc.split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trim())
      .filter(l => l && !l.startsWith('@'));
    if (descLines.length > 0) {
      description = descLines.join(' ').trim();
    }

    // Extract default value
    const defaultMatch = jsdoc.match(/@default\s+(.+)/);
    const defaultValue = defaultMatch ? defaultMatch[1].trim() : undefined;

    // Extract required status
    const required = jsdoc.includes('@required');

    // Clean up the type
    let cleanType = propType
      .replace(/import\([^)]+\)\./g, '')
      .replace(/InputSignal<([^>]+)>/g, '$1')
      .replace(/Signal<([^>]+)>/g, '$1')
      .trim();

    inputs.push({
      name: propName,
      type: cleanType,
      description: description || undefined,
      required,
      defaultValue
    });
  }

  if (inputs.length > 0) {
    metadata.inputs = inputs;
  }

  // Extract @example tags
  const examples: ComponentMetadata['examples'] = [];
  const examplePattern = /@example\s*\n?\s*\*?\s*([\s\S]*?)(?=\s*\*\s*@|\s*\*\/|$)/g;
  let exampleMatch;
  while ((exampleMatch = examplePattern.exec(content)) !== null) {
    const exampleCode = exampleMatch[1]
      .replace(/^\s*\*\s*/gm, '')
      .replace(/```\w*\n?/g, '')
      .replace(/\n\s*\*\s*$/g, '')
      .trim();

    if (exampleCode) {
      examples.push({
        code: exampleCode,
        language: exampleCode.startsWith('<') ? 'html' : 'typescript'
      });
    }
  }

  if (examples.length > 0) {
    metadata.examples = examples;
  }

  return metadata;
}

/**
 * Fetch metadata for multiple components from an npm package
 */
export async function fetchAllComponentMetadata(
  packageName: string,
  componentNames: string[]
): Promise<Map<string, ComponentMetadata>> {
  const results = new Map<string, ComponentMetadata>();

  // Limit concurrent requests
  const batchSize = 5;
  for (let i = 0; i < componentNames.length; i += batchSize) {
    const batch = componentNames.slice(i, i + batchSize);
    const promises = batch.map(async name => {
      const metadata = await fetchComponentMetadata(packageName, name);
      if (metadata) {
        results.set(name, metadata);
      }
    });
    await Promise.all(promises);
  }

  return results;
}

/**
 * Validate Storybook components against npm package exports
 */
export function validateStorybookComponents(
  storybookComponents: { name: string; id: string }[],
  npmExports: NpmExport[],
  importSuffix: string = 'Component'
): {
  valid: { name: string; id: string; exportName: string }[];
  invalid: { name: string; id: string; reason: string }[];
  unmatchedExports: NpmExport[];
} {
  const valid: { name: string; id: string; exportName: string }[] = [];
  const invalid: { name: string; id: string; reason: string }[] = [];

  const exportNames = new Set(npmExports.map(e => e.name.toLowerCase()));
  const matchedExports = new Set<string>();

  for (const comp of storybookComponents) {
    // Try different name variations
    const variations = [
      comp.name,
      `${comp.name}${importSuffix}`,
      `${comp.name}Component`,
      `${comp.name}Directive`,
    ].map(n => n.toLowerCase());

    const found = variations.find(v => exportNames.has(v));

    if (found) {
      const actualExport = npmExports.find(e => e.name.toLowerCase() === found);
      valid.push({
        name: comp.name,
        id: comp.id,
        exportName: actualExport?.name || found
      });
      matchedExports.add(found);
    } else {
      invalid.push({
        name: comp.name,
        id: comp.id,
        reason: `Not found in npm package exports`
      });
    }
  }

  // Find exports that weren't matched to any Storybook component
  const unmatchedExports = npmExports.filter(
    e => !matchedExports.has(e.name.toLowerCase()) &&
         (e.type === 'component' || e.type === 'directive')
  );

  return { valid, invalid, unmatchedExports };
}
