/**
 * Kit Types for Client
 *
 * Mirror of server-side types for use in client code
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

export interface ComponentExample {
  title?: string;
  code: string;
  language?: string;
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
  id: string;
  title: string;
  name: string;
  importPath?: string;
  type: 'docs' | 'story';
  componentName?: string;
  category?: string;
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
  lastDiscovered?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface StorybookResource extends KitResource {
  type: 'storybook';
  components: StorybookComponent[];
  selectedComponentIds: string[];
}

export interface Kit {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;

  // Template definition
  template: KitTemplate;

  // Component library (optional)
  npmPackage?: string;
  resources: KitResource[];

  // Design tokens (optional, extracted from Storybook)
  designTokens?: DesignTokens;

  // MCP servers (optional)
  mcpServerIds: string[];

  isBuiltIn?: boolean;
  createdAt: string;
  updatedAt: string;
}
