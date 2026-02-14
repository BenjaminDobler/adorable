/**
 * Kit Builder Types
 *
 * Kits are Starter Kits - templates that bootstrap new projects with:
 * 1. Base template files (Angular version, dependencies, file structure)
 * 2. Component library integration (optional Storybook, npm packages)
 * 3. MCP server associations (optional)
 *
 * Users select a kit when creating a new project.
 */

// WebContainer file structure type
export interface WebContainerFile {
  file: {
    contents: string;
  };
}

export interface WebContainerDirectory {
  directory: Record<string, WebContainerFile | WebContainerDirectory>;
}

export type WebContainerFiles = Record<string, WebContainerFile | WebContainerDirectory>;

// Kit Template - defines the base files for a project
export interface KitTemplate {
  type: 'default' | 'custom';
  files: WebContainerFiles;
  angularVersion?: string;  // e.g., "17", "18", "21"
}

// Design Tokens - extracted from Storybook
export interface DesignToken {
  name: string;
  value: string;
  cssVariable?: string;
}

export interface TypographyToken {
  name: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
}

export interface DesignTokens {
  colors?: DesignToken[];
  typography?: TypographyToken[];
  spacing?: DesignToken[];
  shadows?: DesignToken[];
  borderRadius?: DesignToken[];
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

export interface StorybookComponent {
  id: string;           // e.g., "button--docs"
  title: string;        // e.g., "Components/Button"
  name: string;         // e.g., "Docs"
  importPath?: string;  // Path from Storybook index.json
  type: 'docs' | 'story';
  componentName?: string; // Extracted: "Button"
  category?: string;      // Extracted: "Components"
  // Stored documentation
  selector?: string;           // e.g., "[lxButton]" or "lx-badge"
  usageType?: 'directive' | 'component';  // How the component is used
  description?: string;        // Component description
  inputs?: ComponentInput[];   // Input properties
  outputs?: ComponentOutput[]; // Output events
  template?: string;           // HTML template
  examples?: ComponentExample[];  // Usage examples
}

export interface KitResource {
  id: string;
  type: 'storybook' | 'design-tokens' | 'api-docs' | 'custom-rules' | 'figma';
  url: string;
  status: 'pending' | 'discovered' | 'error';
  lastDiscovered?: string;   // ISO date
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface StorybookResource extends KitResource {
  type: 'storybook';
  components: StorybookComponent[];
  selectedComponentIds: string[];  // User-selected components to include
}

export interface Kit {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;

  // Template definition
  template: KitTemplate;

  // Component library (optional)
  npmPackage?: string;         // e.g., "@leanix/components"
  importSuffix?: string;       // e.g., "Component", "Directive", "" - suffix for import names
  resources: KitResource[];

  // Design tokens (optional, extracted from Storybook)
  designTokens?: DesignTokens;

  // MCP servers (optional)
  mcpServerIds: string[];      // IDs of MCP servers to activate with this kit

  isBuiltIn?: boolean;         // System kits vs user-created
  createdAt: string;           // ISO date
  updatedAt: string;           // ISO date
}

export interface StorybookIndexEntry {
  id: string;
  title: string;
  name: string;
  importPath?: string;
  type: 'docs' | 'story';
  tags?: string[];
}

export interface StorybookIndex {
  v: number;
  entries: Record<string, StorybookIndexEntry>;
}

export interface ComponentDocumentation {
  name: string;
  description?: string;
  importStatement?: string;
  selector?: string;
  props?: ComponentProp[];
  examples?: ComponentExample[];
  category?: string;
  sourceUrl?: string;
}

export interface ComponentProp {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
}

export interface ComponentExample {
  title?: string;
  code: string;
  language?: string;
}

export interface KitToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  kitId: string;
}
