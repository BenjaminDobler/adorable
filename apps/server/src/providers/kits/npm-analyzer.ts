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
  secondaryEntryPoint?: string; // e.g., "@fundamental-ngx/core/button"
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
        const component = parseComponentFile(content, filePath, packageName);
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

            return parseBundledTypeFile(content, filePath, packageName);
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
          const comps = parseBundledTypeFile(content, typingsEntry, packageName);
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
function parseComponentFile(content: string, filePath: string, packageName?: string): DiscoveredComponent | null {
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

  const secondaryEntryPoint = packageName ? deriveSecondaryEntryPointFromPath(filePath, packageName) : undefined;

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
    examples: metadata.examples,
    secondaryEntryPoint
  };
}

/**
 * Parse a bundled type file (e.g., types/package-name-button.d.ts) to extract
 * all components and directives. These files contain multiple class declarations.
 */
function parseBundledTypeFile(content: string, filePath: string, packageName?: string): DiscoveredComponent[] {
  const components: DiscoveredComponent[] = [];

  // Parse the public export list from the bottom of the file
  // Format: export { Class1, Class2, ... };
  const publicExports = new Set<string>();
  const exportMatches = content.matchAll(/export\s*\{\s*([^}]+)\s*\}/g);
  for (const exportMatch of exportMatches) {
    const names = exportMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
    for (const name of names) {
      if (name) publicExports.add(name);
    }
  }

  // First pass: collect ALL class declarations (including base classes with selector: never)
  // so we can resolve inheritance later
  const baseClassMap = new Map<string, { inputs: ComponentInput[], outputs: ComponentOutput[] }>();

  // Find all class declarations that are components or directives
  // Handle generic type parameters like <T = any>
  const classPattern = /declare\s+class\s+(\w+(?:Component|Directive))\s*(?:<[^>]*>)?\s*(?:extends\s+(\S+?)(?:\s*<[^>]*>)?\s*)?(?:implements\s+[^{]+)?\{/g;
  let classMatch;

  // Also find base classes (not ending in Component/Directive) that have declarations
  const baseClassPattern = /declare\s+(?:abstract\s+)?class\s+(\w+)\s*(?:<[^>]*>)?\s*(?:implements\s+[^{]+)?\{/g;
  let baseMatch;
  while ((baseMatch = baseClassPattern.exec(content)) !== null) {
    const name = baseMatch[1];
    if (name.endsWith('Component') || name.endsWith('Directive') || name.endsWith('Module')) continue;
    const start = baseMatch.index;
    const afterBase = content.substring(start, start + 8000);
    const declStr = extractDeclarationString(afterBase);
    if (declStr) {
      const inputs = parseBundledInputs(declStr);
      const outputs = parseBundledOutputs(declStr);
      if (inputs.length > 0 || outputs.length > 0) {
        // Also extract types and descriptions from class body
        enrichInputsFromClassBody(inputs, afterBase, name);
        baseClassMap.set(name, { inputs, outputs });
      }
    }
  }

  while ((classMatch = classPattern.exec(content)) !== null) {
    const className = classMatch[1];
    const baseClassName = classMatch[2]; // may be undefined
    const classStart = classMatch.index;

    // Search forward from the class declaration for the static ɵcmp/ɵdir
    const afterClass = content.substring(classStart, classStart + 8000);

    // Extract the full declaration string with balanced bracket matching
    const declStr = extractDeclarationString(afterClass);
    if (!declStr) continue;

    // Extract selector from the 2nd parameter (index 1)
    const selectorParam = extractDeclarationParam(declStr, 1);
    if (!selectorParam) continue;
    const selectorStrMatch = selectorParam.match(/^"([^"]+)"$/);
    if (!selectorStrMatch) continue; // Skip classes without proper selector (e.g., "never")

    const selector = selectorStrMatch[1];
    const baseName = className.replace(/Component$|Directive$/, '');
    const isDirective = className.endsWith('Directive') ||
      selector.includes('[') ||
      selector.match(/^[a-z]+\[/);

    // Extract category from file path
    const category = extractCategoryFromBundledPath(filePath);

    const id = `${category.toLowerCase().replace(/\s+/g, '-')}-${baseName.toLowerCase()}--docs`;

    // Parse inputs/outputs from declaration
    const inputs = parseBundledInputs(declStr);
    const outputs = parseBundledOutputs(declStr);

    // Merge inherited inputs/outputs from base class
    if (baseClassName) {
      const baseData = baseClassMap.get(baseClassName);
      if (baseData) {
        const existingInputNames = new Set(inputs.map(i => i.name));
        for (const baseInput of baseData.inputs) {
          if (!existingInputNames.has(baseInput.name)) {
            inputs.push({ ...baseInput });
          }
        }
        const existingOutputNames = new Set(outputs.map(o => o.name));
        for (const baseOutput of baseData.outputs) {
          if (!existingOutputNames.has(baseOutput.name)) {
            outputs.push({ ...baseOutput });
          }
        }
      }
    }

    // Enrich inputs with types and descriptions from class body
    enrichInputsFromClassBody(inputs, afterClass, className);
    // Also try the base class body for inherited inputs
    if (baseClassName) {
      const baseClassBodyPattern = new RegExp(
        `declare\\s+(?:abstract\\s+)?class\\s+${baseClassName}\\s*(?:<[^>]*>)?\\s*(?:implements\\s+[^{]+)?\\{`,
        'm'
      );
      const baseBodyMatch = content.match(baseClassBodyPattern);
      if (baseBodyMatch) {
        const baseAfterClass = content.substring(baseBodyMatch.index!, baseBodyMatch.index! + 8000);
        enrichInputsFromClassBody(inputs, baseAfterClass, baseClassName);
      }
    }

    // Extract JSDoc description before the class using lastIndexOf to find the nearest comment
    let description: string | undefined;
    const beforeClass = content.substring(Math.max(0, classStart - 500), classStart);
    const lastCloseIdx = beforeClass.lastIndexOf('*/');
    if (lastCloseIdx !== -1) {
      const afterClose = beforeClass.substring(lastCloseIdx + 2);
      if (afterClose.trim() === '') {
        const jsdocStart = beforeClass.lastIndexOf('/**', lastCloseIdx);
        if (jsdocStart !== -1) {
          const jsdocContent = beforeClass.substring(jsdocStart + 3, lastCloseIdx);
          const descLines = jsdocContent
            .split('\n')
            .map(l => l.replace(/^\s*\*\s?/, '').trim())
            .filter(l => l && !l.startsWith('@') && l !== '@hidden' && l !== 'hidden');
          if (descLines.length > 0) {
            description = descLines.join(' ').trim();
          }
        }
      }
    }

    // Sanitize: reject descriptions that contain raw TypeScript artifacts
    if (description && (
      description.includes('ɵɵ') ||
      description.includes('static ɵ') ||
      description.includes('i0.ɵ') ||
      description.includes('declare ') ||
      description.includes('.d.ts') ||
      description.length > 500
    )) {
      description = undefined;
    }

    const secondaryEntryPoint = packageName ? deriveSecondaryEntryPoint(filePath, packageName) : undefined;

    components.push({
      id,
      name: baseName,
      componentName: className,
      category,
      type: 'docs',
      filePath,
      selector,
      usageType: isDirective ? 'directive' : 'component',
      description,
      inputs: inputs.length > 0 ? inputs : undefined,
      outputs: outputs.length > 0 ? outputs : undefined,
      secondaryEntryPoint
    });
  }

  // Filter to only include publicly exported classes (if export list found)
  if (publicExports.size > 0) {
    return components.filter(c => publicExports.has(c.componentName));
  }

  return components;
}

/**
 * Extract the full declaration string content (between the outermost < >) from
 * a ɵɵComponentDeclaration or ɵɵDirectiveDeclaration. Handles nested generics.
 */
function extractDeclarationString(afterClass: string): string | null {
  // Find BOTH declaration types and use whichever comes FIRST in the text.
  // This is critical because the 8000-char search window may contain the next class's declaration.
  const compIdx = afterClass.indexOf('ɵɵComponentDeclaration<');
  const dirIdx = afterClass.indexOf('ɵɵDirectiveDeclaration<');
  let declStart: number;
  if (compIdx !== -1 && dirIdx !== -1) {
    declStart = Math.min(compIdx, dirIdx);
  } else if (compIdx !== -1) {
    declStart = compIdx;
  } else if (dirIdx !== -1) {
    declStart = dirIdx;
  } else {
    return null;
  }

  // Find the opening <
  const openBracket = afterClass.indexOf('<', declStart);
  if (openBracket === -1) return null;

  // Use balanced bracket matching to find the closing >
  let depth = 1;
  let inString = false;
  let stringChar = '';
  let i = openBracket + 1;
  for (; i < afterClass.length && depth > 0; i++) {
    const ch = afterClass[i];
    if (inString) {
      if (ch === '\\') { i++; continue; } // skip escaped chars
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === '<' || ch === '{' || ch === '(' || ch === '[') depth++;
    if (ch === '>' || ch === '}' || ch === ')' || ch === ']') depth--;
  }

  if (depth !== 0) return null;
  return afterClass.substring(openBracket + 1, i - 1);
}

/**
 * Extract the Nth top-level comma-separated parameter from a declaration string.
 * Properly handles nested brackets and string literals.
 * paramIndex is 0-based.
 */
function extractDeclarationParam(declContent: string, paramIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let commaCount = 0;
  let paramStart = 0;

  for (let i = 0; i < declContent.length; i++) {
    const ch = declContent[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === '<' || ch === '{' || ch === '(' || ch === '[') depth++;
    if (ch === '>' || ch === '}' || ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      if (commaCount === paramIndex) {
        return declContent.substring(paramStart, i).trim();
      }
      commaCount++;
      paramStart = i + 1;
    }
  }

  // Last parameter (no trailing comma)
  if (commaCount === paramIndex) {
    return declContent.substring(paramStart).trim();
  }

  return null;
}

/**
 * Parse inputs from a declaration string (already extracted content between < >).
 * The inputs are in the 4th parameter (index 3): Type, selector, exportAs, inputs, outputs, ...
 */
function parseBundledInputs(declContent: string): ComponentInput[] {
  const inputs: ComponentInput[] = [];

  const inputsStr = extractDeclarationParam(declContent, 3);
  if (!inputsStr || inputsStr === 'never' || inputsStr === '{}') return inputs;

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

  // Also handle older format without isSignal: "name": { "alias": "name"; "required": false; }
  // (already covered by the pattern above since isSignal is optional in the match)

  return inputs;
}

/**
 * Parse outputs from a declaration string (already extracted content between < >).
 * The outputs are in the 5th parameter (index 4).
 * Format can be: { "name": "eventName"; ... } or { "name": { "alias": "eventName"; ... }; ... }
 */
function parseBundledOutputs(declContent: string): ComponentOutput[] {
  const outputs: ComponentOutput[] = [];

  const outputsStr = extractDeclarationParam(declContent, 4);
  if (!outputsStr || outputsStr === 'never' || outputsStr === '{}') return outputs;

  // Modern format with nested objects: "name": { "alias": "eventName"; ... }
  const objectOutputPattern = /"(\w+)":\s*\{\s*"alias":\s*"([^"]+)"/g;
  let objectMatch;
  const foundNames = new Set<string>();
  while ((objectMatch = objectOutputPattern.exec(outputsStr)) !== null) {
    if (!foundNames.has(objectMatch[1])) {
      outputs.push({ name: objectMatch[1] });
      foundNames.add(objectMatch[1]);
    }
  }

  // Simple format: "name": "eventName"
  // Only if no object outputs were found (avoid double-matching)
  if (outputs.length === 0) {
    const simpleOutputPattern = /"(\w+)":\s*"([^"]+)"/g;
    let simpleMatch;
    while ((simpleMatch = simpleOutputPattern.exec(outputsStr)) !== null) {
      if (!foundNames.has(simpleMatch[1])) {
        outputs.push({ name: simpleMatch[1] });
        foundNames.add(simpleMatch[1]);
      }
    }
  }

  return outputs;
}

/**
 * Enrich inputs with TypeScript types and JSDoc descriptions from the class body.
 * Scans for property declarations like `readonly inputName: InputSignal<Type>;`
 * and JSDoc comments preceding them.
 */
function enrichInputsFromClassBody(inputs: ComponentInput[], classBody: string, className: string): void {
  if (inputs.length === 0) return;

  for (const input of inputs) {
    if (input.type !== 'unknown' && input.description) continue; // already enriched

    // Step 1: Find the property declaration (without JSDoc)
    // Require line-start context to avoid matching inside other identifiers
    const propPattern = new RegExp(
      `(?:^|\\n)\\s*(?:readonly\\s+)?\\b${input.name}\\b(?:\\s*[?!])?\\s*:\\s*([^;]+);`,
      'm'
    );
    const propMatch = classBody.match(propPattern);
    if (!propMatch) continue;

    // Extract type
    if (input.type === 'unknown' && propMatch[1]) {
      let rawType = propMatch[1].trim();

      // Clean up Angular signal types
      const signalMatch = rawType.match(/(?:_angular_core\.|i0\.)InputSignal<(.+)>/);
      const signalTransformMatch = rawType.match(/(?:_angular_core\.|i0\.)InputSignalWithTransform<([^,]+)/);
      const modelSignalMatch = rawType.match(/(?:_angular_core\.|i0\.)ModelSignal<(.+)>/);

      if (signalMatch) {
        rawType = signalMatch[1].trim();
      } else if (signalTransformMatch) {
        rawType = signalTransformMatch[1].trim();
      } else if (modelSignalMatch) {
        rawType = modelSignalMatch[1].trim();
      }

      // Clean up common wrapper types
      rawType = rawType
        .replace(/import\([^)]+\)\./g, '')
        .replace(/Nullable<([^>]+)>/g, '$1 | null')
        .replace(/\s*\|\s*undefined/g, '')
        .replace(/\s*\|\s*null/g, ' | null')
        .trim();

      // Don't use overly complex types
      if (rawType.length < 100) {
        input.type = rawType;
      }
    }

    // Step 2: Look backwards from the property for its immediately preceding JSDoc comment
    if (!input.description && propMatch.index !== undefined) {
      const beforeProp = classBody.substring(Math.max(0, propMatch.index - 500), propMatch.index);
      // Find the LAST */ in beforeProp and check it's immediately before the property
      const lastCloseIdx = beforeProp.lastIndexOf('*/');
      if (lastCloseIdx !== -1) {
        const afterClose = beforeProp.substring(lastCloseIdx + 2);
        // Only use this JSDoc if nothing but whitespace follows the */
        if (afterClose.trim() === '') {
          const jsdocStart = beforeProp.lastIndexOf('/**', lastCloseIdx);
          if (jsdocStart !== -1) {
            const jsdocContent = beforeProp.substring(jsdocStart + 3, lastCloseIdx);
            const descLines = jsdocContent
              .split('\n')
              .map(l => l.replace(/^\s*\*\s?/, '').trim())
              .filter(l => l && !l.startsWith('@') && l !== 'hidden' && l !== '@hidden');
            if (descLines.length > 0) {
              const desc = descLines.join(' ').trim();
              if (!desc.startsWith('@hidden') && desc !== 'hidden' && desc !== '@hidden') {
                input.description = desc;
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Derive a secondary entry point from a bundled type file path and package name.
 * e.g., packageName="@fundamental-ngx/core", filePath="types/fundamental-ngx-core-button.d.ts"
 *       → "@fundamental-ngx/core/button"
 */
function deriveSecondaryEntryPoint(filePath: string, packageName: string): string | undefined {
  const fileName = filePath.split('/').pop() || '';
  let name = fileName.replace(/\.d\.ts$/, '');

  // Convert the package name to the dash-prefix used in bundled file names
  // "@fundamental-ngx/core" → "fundamental-ngx-core-"
  const prefix = packageName.replace('@', '').replace(/\//g, '-') + '-';

  if (name.startsWith(prefix)) {
    const subpath = name.slice(prefix.length); // e.g., "button" or "date-picker"
    if (subpath) {
      return `${packageName}/${subpath}`;
    }
  }

  return undefined;
}

/**
 * Derive a secondary entry point from an individual component file path and package name.
 * e.g., filePath="lib/button/button.component.d.ts" → "@fundamental-ngx/core/button"
 */
function deriveSecondaryEntryPointFromPath(filePath: string, packageName: string): string | undefined {
  const parts = filePath.replace(/^\//, '').split('/');
  // Remove filename
  parts.pop();
  // Skip common non-meaningful directories
  const ignoreParts = ['lib', 'src', 'components', 'directives', 'dist', 'esm2022', 'fesm2022'];
  const relevantParts = parts.filter(p => !ignoreParts.includes(p.toLowerCase()));

  if (relevantParts.length > 0) {
    // Use the first relevant subdirectory as the entry point hint
    return `${packageName}/${relevantParts[0]}`;
  }

  return undefined;
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
