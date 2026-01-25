# Enterprise Customization Strategy

This document outlines approaches for tailoring Adorable to specific company needs, including custom component libraries, style guides, internal APIs, and coding standards.

---

## Overview

Enterprise users need to:
- Use internal component libraries instead of generic HTML
- Follow company style guides and design systems
- Connect to internal backends with specific auth patterns
- Enforce coding standards and architectural patterns

---

## Approach 1: Extended Skills System

**Effort: Low | Impact: High**

The existing skills system can be extended for company-specific knowledge. Skills are markdown files that the AI activates and follows.

### Structure

```
.adorable/skills/
├── acme-components.md      # Component library documentation
├── acme-api-patterns.md    # Internal API integration patterns
├── acme-styleguide.md      # Design system rules
├── acme-architecture.md    # Coding standards and patterns
```

### Example: acme-components.md

```markdown
# ACME Component Library

You MUST use ACME components instead of native HTML elements.

## Available Components

### AcmeButton
Import: `import { AcmeButton } from '@acme/components';`

Props:
- `label: string` - Button text
- `variant: 'primary' | 'secondary' | 'danger'`
- `disabled: boolean`
- `loading: boolean`

Usage:
```html
<acme-button label="Submit" variant="primary" [loading]="isLoading" />
```

### AcmeDataTable
Import: `import { AcmeDataTable } from '@acme/components';`

Props:
- `[data]: any[]` - Row data
- `[columns]: ColumnDef[]` - Column definitions
- `[pagination]: boolean` - Enable pagination
- `(rowClick): EventEmitter<any>` - Row click handler

Usage:
```html
<acme-data-table [data]="users" [columns]="userColumns" pagination />
```

## Rules
- NEVER use native `<button>` elements, always use `<acme-button>`
- NEVER use native `<table>`, always use `<acme-data-table>`
- NEVER use native `<input>`, always use `<acme-input>` or `<acme-form-field>`
```

### Activation

Skills are auto-discovered from the `.adorable/skills/` folder or can be force-activated via the UI.

### Enhanced Skills with Resources

Currently, skills are just markdown files. However, skills could be much more powerful by referencing additional resources:

#### Enhanced Skill Folder Structure

```
.adorable/skills/acme-components/
├── SKILL.md                    # Main skill definition
├── components.yaml             # Component registry
├── design-tokens.json          # Design token values
├── templates/                  # Code templates
│   ├── service.template.ts
│   ├── component.template.ts
│   └── crud-feature.template.ts
├── examples/                   # Example implementations
│   ├── data-table-example.ts
│   ├── form-example.ts
│   └── dashboard-layout.html
└── snippets/                   # Reusable code snippets
    ├── api-error-handling.ts
    └── auth-guard.ts
```

#### Enhanced SKILL.md Format

```markdown
---
name: acme-components
description: ACME Corp component library and patterns
triggers:
  - "use acme"
  - "company components"

# NEW: Resource references
resources:
  components: ./components.yaml
  tokens: ./design-tokens.json
  templates:
    - ./templates/service.template.ts
    - ./templates/component.template.ts
  examples:
    - ./examples/*

# NEW: Auto-include these files in context
include_in_context:
  - ./components.yaml
  - ./snippets/api-error-handling.ts
---

# ACME Component Library

You are now using the ACME component library.

## Available Components
{{components}}  <!-- Replaced with parsed components.yaml -->

## Design Tokens
{{tokens}}  <!-- Replaced with design-tokens.json -->

## Templates
When creating services, use this template:
{{template:service.template.ts}}

## Examples
Here's how to implement a data table:
{{example:data-table-example.ts}}
```

#### Resource Types

| Resource Type | Purpose | Format |
|---------------|---------|--------|
| `components` | Component registry | YAML with component definitions |
| `tokens` | Design tokens | JSON with color/spacing/typography |
| `templates` | Code generation templates | TypeScript with `{{placeholders}}` |
| `examples` | Reference implementations | Full working code files |
| `snippets` | Reusable code blocks | TypeScript/HTML fragments |
| `schemas` | API/model definitions | JSON Schema or TypeScript interfaces |

#### Enhanced SkillRegistry Implementation

```typescript
interface EnhancedSkill extends Skill {
  resources: {
    components?: ComponentRegistry;
    tokens?: DesignTokens;
    templates?: Map<string, string>;
    examples?: Map<string, string>;
    snippets?: Map<string, string>;
  };
  // Processed instructions with resources interpolated
  resolvedInstructions: string;
}

class EnhancedSkillRegistry extends SkillRegistry {
  async loadSkillResources(skill: Skill, fs: FileSystemInterface): Promise<EnhancedSkill> {
    const skillDir = path.dirname(skill.sourcePath);
    const enhanced: EnhancedSkill = {
      ...skill,
      resources: {},
      resolvedInstructions: skill.instructions
    };

    // Parse frontmatter for resource references
    const resources = this.parseResourceRefs(skill);

    // Load components.yaml
    if (resources.components) {
      const content = await fs.readFile(`${skillDir}/${resources.components}`);
      enhanced.resources.components = yaml.load(content);
    }

    // Load templates
    if (resources.templates) {
      enhanced.resources.templates = new Map();
      for (const tpl of resources.templates) {
        const name = path.basename(tpl);
        const content = await fs.readFile(`${skillDir}/${tpl}`);
        enhanced.resources.templates.set(name, content);
      }
    }

    // Load examples
    if (resources.examples) {
      enhanced.resources.examples = new Map();
      const exampleFiles = await fs.glob(`${skillDir}/examples/*`);
      for (const file of exampleFiles) {
        const name = path.basename(file);
        const content = await fs.readFile(file);
        enhanced.resources.examples.set(name, content);
      }
    }

    // Interpolate resources into instructions
    enhanced.resolvedInstructions = this.interpolateResources(
      skill.instructions,
      enhanced.resources
    );

    return enhanced;
  }

  private interpolateResources(instructions: string, resources: any): string {
    let result = instructions;

    // Replace {{components}} with formatted component list
    if (resources.components) {
      result = result.replace('{{components}}', this.formatComponents(resources.components));
    }

    // Replace {{tokens}} with formatted tokens
    if (resources.tokens) {
      result = result.replace('{{tokens}}', JSON.stringify(resources.tokens, null, 2));
    }

    // Replace {{template:name}} with template content
    if (resources.templates) {
      for (const [name, content] of resources.templates) {
        result = result.replace(`{{template:${name}}}`, '```typescript\n' + content + '\n```');
      }
    }

    // Replace {{example:name}} with example content
    if (resources.examples) {
      for (const [name, content] of resources.examples) {
        result = result.replace(`{{example:${name}}}`, '```typescript\n' + content + '\n```');
      }
    }

    return result;
  }
}
```

#### Benefits of Enhanced Skills

1. **Separation of Concerns**: Instructions, components, and examples are separate files
2. **Reusability**: Same components.yaml can be used across multiple skills
3. **Maintainability**: Update a template file without editing the skill markdown
4. **Version Control**: Each resource file can be tracked independently
5. **Tooling**: YAML/JSON files can be validated, generated, or synced from external sources

### Skill Upload & Distribution Methods

Since enhanced skills are folders (not single files), we need new ways to create and distribute them:

#### Option A: ZIP Upload

The simplest approach - users upload a `.zip` file containing the skill folder.

```
acme-components.zip
└── acme-components/
    ├── SKILL.md
    ├── components.yaml
    └── templates/
        └── service.template.ts
```

**UI Flow:**
1. User clicks "Import Skill"
2. Selects a .zip file
3. Server extracts to `storage/users/{userId}/skills/`
4. Skill appears in the list

**Implementation:**
```typescript
// Server endpoint
router.post('/skills/import', upload.single('file'), async (req, res) => {
  const zip = new AdmZip(req.file.buffer);
  const extractPath = `storage/users/${req.user.id}/skills/`;
  zip.extractAllTo(extractPath, true);
  res.json({ success: true });
});
```

#### Option B: Git Repository Sync

Skills live in a Git repository and are synced automatically.

```yaml
# User settings or .adorable/config.yaml
skills:
  repositories:
    - url: "https://github.com/acme/adorable-skills.git"
      branch: "main"
      path: "skills/"  # Optional subdirectory
```

**Benefits:**
- Version controlled
- Team collaboration
- CI/CD integration (validate skills before merge)
- Easy updates (git pull)

**Implementation:**
```typescript
class GitSkillSync {
  async sync(repoUrl: string, targetPath: string) {
    // Clone or pull the repository
    if (await this.exists(targetPath)) {
      await exec(`git -C ${targetPath} pull`);
    } else {
      await exec(`git clone ${repoUrl} ${targetPath}`);
    }
  }
}
```

#### Option C: UI-Based Skill Builder

A multi-step wizard to build skills with resources.

**Step 1: Basic Info**
```
┌─────────────────────────────────────┐
│  Create New Skill                   │
├─────────────────────────────────────┤
│  Name: [acme-components          ]  │
│  Description: [ACME component... ]  │
│  Triggers: [acme, company        ]  │
│                                     │
│  [Next →]                           │
└─────────────────────────────────────┘
```

**Step 2: Instructions (Markdown Editor)**
```
┌─────────────────────────────────────┐
│  Instructions                       │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │ # ACME Components           │    │
│  │                             │    │
│  │ Use {{components}} for...   │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│  [← Back] [Next →]                  │
└─────────────────────────────────────┘
```

**Step 3: Resources**
```
┌─────────────────────────────────────┐
│  Resources                          │
├─────────────────────────────────────┤
│  Components Registry:               │
│  [📁 Drop components.yaml here   ]  │
│                                     │
│  Design Tokens:                     │
│  [📁 Drop tokens.json here       ]  │
│                                     │
│  Templates:                         │
│  [+ Add Template]                   │
│  ├─ service.template.ts    [🗑️]    │
│  └─ component.template.ts  [🗑️]    │
│                                     │
│  [← Back] [Save Skill]              │
└─────────────────────────────────────┘
```

#### Option D: NPM-Style Packages

Skills are published as npm packages with a specific structure.

```json
// package.json of a skill package
{
  "name": "@acme/adorable-skill-components",
  "version": "1.0.0",
  "adorable-skill": {
    "name": "acme-components",
    "entry": "./SKILL.md"
  },
  "files": ["SKILL.md", "components.yaml", "templates/"]
}
```

**Installation:**
```bash
# In project directory
npm install @acme/adorable-skill-components
```

**Discovery:**
```typescript
// SkillRegistry scans node_modules for adorable-skill packages
async discoverNpmSkills(projectPath: string) {
  const packageJson = await fs.readFile(`${projectPath}/package.json`);
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  for (const [name, version] of Object.entries(deps)) {
    const pkgPath = `${projectPath}/node_modules/${name}/package.json`;
    const pkg = await fs.readFile(pkgPath);
    if (pkg['adorable-skill']) {
      await this.loadSkillFromPath(`${projectPath}/node_modules/${name}`);
    }
  }
}
```

#### Option E: Skill Marketplace (Future)

A central registry where skills can be published and discovered.

```
┌─────────────────────────────────────────────────────┐
│  🛒 Skill Marketplace                               │
├─────────────────────────────────────────────────────┤
│  [🔍 Search skills...                            ]  │
│                                                     │
│  Popular Skills                                     │
│  ┌─────────────────┐ ┌─────────────────┐           │
│  │ Angular Expert  │ │ Tailwind CSS    │           │
│  │ ⭐ 4.8 (120)    │ │ ⭐ 4.9 (89)     │           │
│  │ [Install]       │ │ [Install]       │           │
│  └─────────────────┘ └─────────────────┘           │
│                                                     │
│  Enterprise Skills (Private)                        │
│  ┌─────────────────┐                               │
│  │ ACME Components │                               │
│  │ 🔒 Internal     │                               │
│  │ [Install]       │                               │
│  └─────────────────┘                               │
└─────────────────────────────────────────────────────┘
```

**API:**
```typescript
// Marketplace API
GET  /api/marketplace/skills          // List public skills
GET  /api/marketplace/skills/:id      // Get skill details
POST /api/marketplace/skills          // Publish a skill
GET  /api/marketplace/org/:org/skills // List org's private skills
```

#### Recommended Approach

| Method | Best For | Effort |
|--------|----------|--------|
| ZIP Upload | Quick start, individual users | Low |
| Git Sync | Teams, version control needed | Medium |
| UI Builder | Non-technical users | Medium |
| NPM Packages | Developer-focused, ecosystem | Medium |
| Marketplace | Platform scale, monetization | High |

**Suggested Implementation Order:**
1. **ZIP Upload** - Quick win, enables folder-based skills immediately
2. **Git Sync** - Best for enterprise teams
3. **UI Builder** - Improves UX for all users
4. **NPM/Marketplace** - Long-term ecosystem play

---

## Approach 2: Custom Knowledge Base

**Effort: Low | Impact: High**

Extend `apps/server/src/providers/knowledge-base.ts` with company-specific patterns.

### Implementation

```typescript
// apps/server/src/providers/knowledge-base.ts

export const COMPANY_KNOWLEDGE_BASE = `
## ACME Corp Angular Standards

### Component Library
- Import all UI components from '@acme/components'
- Prefix: All ACME components use 'acme-' prefix
- Never use native HTML form elements

### API Patterns
- All HTTP calls must go through AcmeApiService
- Use AcmeAuthInterceptor for token injection
- Base URL comes from environment.apiUrl
- Error handling via AcmeErrorHandler

### File Structure
src/app/
├── core/           # Singleton services, guards, interceptors
├── shared/         # Shared components, pipes, directives
├── features/       # Feature modules (lazy-loaded)
└── models/         # TypeScript interfaces

### Coding Standards
- Use signals for state management
- Use reactive forms (never template-driven)
- Maximum 300 lines per component
- All public methods must have JSDoc comments
`;

export const ANGULAR_KNOWLEDGE_BASE = ANGULAR_KNOWLEDGE_BASE_CORE + COMPANY_KNOWLEDGE_BASE;
```

### Configuration Option

Make this configurable via environment or settings:

```typescript
// Load from external file or database
const companyKnowledge = await loadCompanyKnowledge(userId);
```

---

## Approach 3: Component Registry

**Effort: Medium | Impact: Very High**

A structured registry that tells the AI exactly what components are available and how to use them.

### Registry Format

```yaml
# .adorable/components.yaml

library:
  name: "@acme/components"
  version: "^2.0.0"

components:
  - name: AcmeButton
    selector: "acme-button"
    import: "@acme/components"
    description: "Primary button component for all user actions"
    inputs:
      - name: label
        type: string
        required: true
      - name: variant
        type: "'primary' | 'secondary' | 'danger' | 'ghost'"
        default: "'primary'"
      - name: disabled
        type: boolean
        default: false
      - name: loading
        type: boolean
        default: false
      - name: icon
        type: string
        description: "Icon name from ACME icon set"
    outputs:
      - name: clicked
        type: "EventEmitter<void>"
    example: |
      <acme-button
        label="Save Changes"
        variant="primary"
        [loading]="isSaving"
        (clicked)="onSave()" />

  - name: AcmeDataTable
    selector: "acme-data-table"
    import: "@acme/components"
    description: "Data table with sorting, filtering, and pagination"
    inputs:
      - name: data
        type: "any[]"
        required: true
      - name: columns
        type: "AcmeColumnDef[]"
        required: true
      - name: pagination
        type: boolean
        default: true
      - name: pageSize
        type: number
        default: 10
      - name: sortable
        type: boolean
        default: true
      - name: filterable
        type: boolean
        default: false
    outputs:
      - name: rowClick
        type: "EventEmitter<any>"
      - name: selectionChange
        type: "EventEmitter<any[]>"

  - name: AcmeFormField
    selector: "acme-form-field"
    import: "@acme/components"
    description: "Form field wrapper with label, validation, and error display"
    inputs:
      - name: label
        type: string
        required: true
      - name: required
        type: boolean
        default: false
      - name: hint
        type: string
      - name: errorMessages
        type: "Record<string, string>"

replacements:
  # Map native elements to ACME components
  button: AcmeButton
  table: AcmeDataTable
  input: AcmeInput
  select: AcmeSelect
  checkbox: AcmeCheckbox
  radio: AcmeRadioGroup
```

### Service Implementation

```typescript
// apps/server/src/providers/component-registry.ts

export interface ComponentDef {
  name: string;
  selector: string;
  import: string;
  description: string;
  inputs: PropDef[];
  outputs: PropDef[];
  example: string;
}

export class ComponentRegistry {
  private components: Map<string, ComponentDef> = new Map();
  private replacements: Map<string, string> = new Map();

  async load(projectPath: string): Promise<void> {
    const configPath = `${projectPath}/.adorable/components.yaml`;
    // Parse YAML and populate maps
  }

  getComponent(name: string): ComponentDef | undefined {
    return this.components.get(name);
  }

  getReplacement(nativeElement: string): string | undefined {
    return this.replacements.get(nativeElement);
  }

  generatePromptContext(): string {
    // Generate markdown documentation for the AI
    let context = '## Available Components\n\n';
    for (const [name, def] of this.components) {
      context += `### ${name}\n`;
      context += `Selector: \`<${def.selector}>\`\n`;
      context += `Import: \`${def.import}\`\n\n`;
      context += `${def.description}\n\n`;
      context += `**Inputs:**\n`;
      for (const input of def.inputs) {
        context += `- \`${input.name}: ${input.type}\`${input.required ? ' (required)' : ''}\n`;
      }
      context += `\n**Example:**\n\`\`\`html\n${def.example}\n\`\`\`\n\n`;
    }
    return context;
  }
}
```

---

## Approach 4: Custom Base Project Templates

**Effort: Medium | Impact: High**

Pre-configured project templates with company dependencies and structure already set up.

### Template Structure

```typescript
// apps/server/src/templates/acme-template.ts

export const ACME_BASE_FILES: WebContainerFiles = {
  'package.json': {
    file: {
      contents: JSON.stringify({
        name: 'acme-app',
        dependencies: {
          '@angular/core': '^19.0.0',
          '@acme/components': '^2.0.0',
          '@acme/core': '^1.5.0',
          '@acme/icons': '^1.0.0',
        }
      }, null, 2)
    }
  },

  'src/styles.scss': {
    file: {
      contents: `
@use '@acme/components/styles/theme' as theme;
@use '@acme/components/styles/components';

:root {
  @include theme.acme-light-theme;
}

body {
  font-family: theme.$font-family;
  background: var(--acme-background);
  color: var(--acme-text);
}
`
    }
  },

  'src/app/core/services/api.service.ts': {
    file: {
      contents: `
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  get<T>(endpoint: string) {
    return this.http.get<T>(\`\${this.baseUrl}/\${endpoint}\`);
  }

  post<T>(endpoint: string, body: any) {
    return this.http.post<T>(\`\${this.baseUrl}/\${endpoint}\`, body);
  }

  put<T>(endpoint: string, body: any) {
    return this.http.put<T>(\`\${this.baseUrl}/\${endpoint}\`, body);
  }

  delete<T>(endpoint: string) {
    return this.http.delete<T>(\`\${this.baseUrl}/\${endpoint}\`);
  }
}
`
    }
  },

  'src/app/core/interceptors/auth.interceptor.ts': {
    file: {
      contents: `
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();

  if (token) {
    req = req.clone({
      setHeaders: { Authorization: \`Bearer \${token}\` }
    });
  }

  return next(req);
};
`
    }
  },

  'src/environments/environment.ts': {
    file: {
      contents: `
export const environment = {
  production: false,
  apiUrl: 'https://api.acme.internal/v1',
  authUrl: 'https://auth.acme.internal',
};
`
    }
  }
};
```

### Template Selection

Allow users to choose templates when creating a project:

```typescript
// UI: Project creation dialog
const templates = [
  { id: 'default', name: 'Blank Angular Project' },
  { id: 'acme', name: 'ACME Enterprise Template' },
  { id: 'acme-dashboard', name: 'ACME Dashboard Starter' },
];
```

---

## Approach 5: Design Token System

**Effort: Low | Impact: Medium**

Inject company design tokens that the AI uses for all styling.

### Token File

```json
// .adorable/design-tokens.json
{
  "colors": {
    "primary": "#0052CC",
    "secondary": "#6554C0",
    "success": "#36B37E",
    "warning": "#FFAB00",
    "danger": "#DE350B",
    "neutral": {
      "50": "#FAFBFC",
      "100": "#F4F5F7",
      "200": "#EBECF0",
      "500": "#6B778C",
      "900": "#172B4D"
    }
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px"
  },
  "typography": {
    "fontFamily": "'Inter', -apple-system, sans-serif",
    "fontSize": {
      "xs": "12px",
      "sm": "14px",
      "base": "16px",
      "lg": "18px",
      "xl": "20px"
    }
  },
  "borderRadius": {
    "sm": "4px",
    "md": "8px",
    "lg": "12px",
    "full": "9999px"
  }
}
```

### AI Instructions

Include in the system prompt:

```
When styling components, use these design tokens:
- Primary color: var(--acme-primary) = #0052CC
- Always use spacing variables: var(--acme-spacing-md) = 16px
- Border radius: var(--acme-radius-md) = 8px
- Font: var(--acme-font-family) = 'Inter', sans-serif

NEVER use hardcoded colors. ALWAYS use CSS variables.
```

---

## Approach 6: API Connector Templates

**Effort: Medium | Impact: High**

Pre-built service templates for common internal API patterns.

### Template Library

```typescript
// .adorable/api-templates/

// crud-service.template.ts
export const CRUD_SERVICE_TEMPLATE = `
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class {{ServiceName}}Service {
  private http = inject(HttpClient);
  private endpoint = \`\${environment.apiUrl}/{{endpoint}}\`;

  getAll(): Observable<{{Model}}[]> {
    return this.http.get<{{Model}}[]>(this.endpoint);
  }

  getById(id: string): Observable<{{Model}}> {
    return this.http.get<{{Model}}>(\`\${this.endpoint}/\${id}\`);
  }

  create(data: Partial<{{Model}}>): Observable<{{Model}}> {
    return this.http.post<{{Model}}>(this.endpoint, data);
  }

  update(id: string, data: Partial<{{Model}}>): Observable<{{Model}}> {
    return this.http.put<{{Model}}>(\`\${this.endpoint}/\${id}\`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(\`\${this.endpoint}/\${id}\`);
  }
}
`;

// paginated-service.template.ts
export const PAGINATED_SERVICE_TEMPLATE = `
// Service with pagination, filtering, sorting support
...
`;
```

### AI Instructions

```
When the user needs a service for {{resource}}, use this template:
[Include CRUD_SERVICE_TEMPLATE]

Replace:
- {{ServiceName}} with PascalCase resource name
- {{endpoint}} with kebab-case API path
- {{Model}} with the TypeScript interface name
```

---

## Approach 7: Unified Configuration System

**Effort: High | Impact: Very High**

A single configuration file that controls all customization aspects.

### Configuration Schema

```yaml
# .adorable/config.yaml

company:
  name: "ACME Corp"
  logo: "./assets/acme-logo.svg"

components:
  library: "@acme/components"
  prefix: "acme"
  registry: "./components.yaml"

styleguide:
  tokens: "./design-tokens.json"
  globalStyles: "./styles/global.scss"

api:
  baseUrl: "https://api.acme.internal/v1"
  authPattern: "bearer"
  serviceTemplate: "./templates/api-service.ts"

architecture:
  stateManagement: "signals"  # signals | ngrx | akita
  formStyle: "reactive"       # reactive | template
  lazyLoading: true

codeStandards:
  maxComponentLines: 300
  maxServiceLines: 200
  requireJsDoc: true

restrictions:
  - "Never use inline styles"
  - "Never use native HTML form elements"
  - "All HTTP calls must use ApiService"
  - "Components must have data-testid attributes"

templates:
  - id: "dashboard"
    name: "Dashboard Starter"
    path: "./templates/dashboard/"
  - id: "crud"
    name: "CRUD Feature Module"
    path: "./templates/crud/"
```

### Configuration Service

```typescript
// apps/server/src/services/enterprise-config.service.ts

export class EnterpriseConfigService {
  private config: EnterpriseConfig;

  async load(projectPath: string): Promise<void> {
    const configPath = `${projectPath}/.adorable/config.yaml`;
    this.config = await this.parseConfig(configPath);
  }

  generateSystemPromptAdditions(): string {
    let additions = '';

    // Add component library rules
    if (this.config.components) {
      additions += this.generateComponentRules();
    }

    // Add style guide
    if (this.config.styleguide) {
      additions += this.generateStyleRules();
    }

    // Add restrictions
    if (this.config.restrictions) {
      additions += '\n\n## RESTRICTIONS (Must Follow)\n';
      for (const rule of this.config.restrictions) {
        additions += `- ${rule}\n`;
      }
    }

    return additions;
  }
}
```

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)
- [ ] Extend skills system to load from `.adorable/skills/`
- [ ] Add company knowledge base injection point
- [ ] Document skill file format

### Phase 2: Component Registry (2-3 weeks)
- [ ] Define component registry YAML schema
- [ ] Build registry parser service
- [ ] Inject registry into AI context
- [ ] Add "replacement" warnings when AI uses native elements

### Phase 3: Custom Templates (2-3 weeks)
- [ ] Template selection UI on project creation
- [ ] Template storage (database or file-based)
- [ ] Template variable substitution engine

### Phase 4: Unified Config (3-4 weeks)
- [ ] Define full config schema
- [ ] Configuration UI in settings
- [ ] Config validation and error reporting
- [ ] Per-project config overrides

---

## Open Questions

1. **Storage**: Where do company configs live?
   - Per-user settings in database?
   - Git repository per company?
   - Shared config service?

2. **Versioning**: How to handle component library version updates?

3. **Validation**: How to validate that AI output follows the rules?

4. **Multi-tenancy**: Different configs for different teams/projects?

5. **Sync**: How to keep component registry in sync with actual library?
