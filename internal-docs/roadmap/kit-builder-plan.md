# Kit Builder - Company Customization Plan

## Goal
Build a **Kit Builder UI** where users can create custom component library integrations by providing a Storybook URL. The system auto-discovers components and generates dynamic tools the AI can use.

## Target Example
- **LeanIX Storybook**: https://storybook.leanix.net
- **npm package**: @leanix/components

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  Kit Builder UI                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Kit Name: [LeanIX Components                    ]              │
│  npm Package: [@leanix/components                ]              │
│                                                                 │
│  Resources:                                          [+ Add]    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 📦 Storybook    https://storybook.leanix.net   [Edit]   │    │
│  │    └─ 47 components discovered                          │    │
│  │                                                         │    │
│  │ 🎨 Design Tokens (future)                      [Add]    │    │
│  │ 📄 API Docs (future)                           [Add]    │    │
│  │ 📝 Custom Rules (future)                       [Add]    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [Save Kit]                                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Extensible Resource Types (Future)

The Kit Builder architecture supports adding new resource types:

| Resource Type | Source | Tool Generated |
|---------------|--------|----------------|
| **Storybook** | `/index.json` URL | `list_components`, `get_component` |
| **Design Tokens** | JSON/CSS file URL | `get_design_tokens` |
| **API Docs** | OpenAPI/Swagger URL | `get_api_endpoint`, `list_endpoints` |
| **Custom Rules** | Markdown/text | Injected into system prompt |
| **Figma** | Figma file URL | `get_figma_component` |
| **MCP Servers** | From configured servers | Server-specific tools |

## MCP Server Association

Kits can specify which MCP servers should be active when the kit is selected:

```
┌─────────────────────────────────────────────────────────────────┐
│  Kit Builder UI                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Kit Name: [LeanIX Components                    ]              │
│  ...                                                            │
│                                                                 │
│  Active MCP Servers:                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ☑ Figma MCP Server        (configured in settings)      │    │
│  │ ☑ Jira MCP Server         (configured in settings)      │    │
│  │ ☐ GitHub MCP Server       (configured in settings)      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [Save Kit]                                                     │
└─────────────────────────────────────────────────────────────────┘
```

When a kit is selected:
1. Its associated MCP servers are automatically enabled
2. MCP server tools become available to the AI
3. User doesn't need to manually toggle servers per project

```typescript
interface Kit {
  id: string;
  name: string;
  npmPackage?: string;
  resources: KitResource[];
  mcpServerIds: string[];  // IDs of MCP servers to activate

  // npm registry configuration (for private packages)
  npmRegistry?: {
    url?: string;        // e.g., "https://npm.company.com"
    authToken?: string;  // npm auth token (encrypted)
    scope?: string;      // e.g., "@leanix"
  };
}
```

## npm Package Integration

When a kit is selected, the AI can install and use the npm packages:

```
┌─────────────────────────────────────────────────────────────────┐
│  Kit Builder UI                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ...                                                            │
│                                                                 │
│  npm Configuration:                                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Package: [@leanix/components              ]            │    │
│  │  Registry: [https://registry.npmjs.org     ] (optional) │    │
│  │  Auth Token: [••••••••••••••••             ] (optional) │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**How npm integration works:**
1. Kit stores `npmPackage` and optional registry config
2. When AI needs a component, it checks `package.json`
3. If package missing, AI adds it and runs `npm install`
4. For private registries, `.npmrc` is configured with auth token
5. AI generates code with correct imports

---

## Current Scope (Phase 1)

```
┌─────────────────────────────────────────────────────────────────┐
│  Kit Builder UI (MVP)                                           │
├─────────────────────────────────────────────────────────────────┤
│  Kit Name: [LeanIX Components                    ]              │
│  Storybook URL: [https://storybook.leanix.net    ] [Discover]   │
│                                                                 │
│  ✅ Found 47 components from /index.json                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ☑ Avatar        ☑ Button       ☑ Card       ☑ Modal     │    │
│  │ ☑ Checkbox      ☑ Banner       ☑ Badge      ☑ Popover   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  npm Package: [@leanix/components                ]              │
│  [Save Kit]                                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dynamic Tools Generated                                        │
├─────────────────────────────────────────────────────────────────┤
│  list_components() → ["Avatar", "Button", "Card", ...]          │
│  get_component("Button") → { selector, import, props, example } │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  AI Generation Flow                                             │
├─────────────────────────────────────────────────────────────────┤
│  User: "Create a button"                                        │
│  AI calls: get_component("Button")                              │
│  System fetches: storybook.leanix.net/?path=/docs/button--docs  │
│  AI receives: ButtonComponent docs, props, example              │
│  AI generates: Correct LeanIX code                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Storybook Discovery

Storybook exposes `/index.json` with structured component data:

```json
{
  "button--docs": {
    "id": "button--docs",
    "title": "Components/Button",
    "name": "Docs",
    "importPath": "./libs/components/src/lib/core-ui/components/button/button.stories.ts",
    "type": "docs"
  }
}
```

**Data sources:**
| Source | URL | Data |
|--------|-----|------|
| Component index | `/index.json` | All component names & paths |
| Component docs | `/?path=/docs/{id}` | Usage, examples, props |

---

## Implementation Plan

### Phase 1: Kit Builder UI + Discovery

**New files:**
```
apps/server/src/providers/kits/
├── kit-registry.ts          # Kit CRUD operations
├── storybook-parser.ts      # Fetch & parse Storybook index.json
└── types.ts                 # Kit interfaces

apps/client/src/app/settings/
├── kit-builder/
│   ├── kit-builder.ts       # Kit builder component
│   └── kit-builder.html     # Builder UI
```

**Files to modify:**
- `apps/client/src/app/settings/settings.ts` - Add Kit tab
- `apps/client/src/app/settings/settings.html` - Add Kit tab UI
- `prisma/schema.prisma` - Add Kit model (or store in User.settings JSON)

**Kit Builder Features:**
1. Enter Storybook URL
2. Click "Discover" → fetch `/index.json`
3. Display found components with checkboxes
4. Enter npm package name
5. Save kit to user's account

### Phase 2: Dynamic Tools

**New files:**
```
apps/server/src/providers/kit-tools.ts   # Tool implementations
```

**Files to modify:**
- `apps/server/src/providers/base.ts` - Register kit tools
- `apps/server/src/providers/tools.ts` - Add kit tool definitions

**Tools to create:**
```typescript
// list_components - Returns all components in selected kit
{
  name: "list_components",
  description: "List available components in the selected UI kit",
  input_schema: {
    properties: {
      category: { type: "string", description: "Filter by category" }
    }
  }
}

// get_component - Returns component documentation
{
  name: "get_component",
  description: "Get documentation for a UI component",
  input_schema: {
    properties: {
      name: { type: "string", description: "Component name (e.g., Button)" }
    },
    required: ["name"]
  }
}
```

**Tool execution:**
1. `list_components()` → Return component names from saved kit
2. `get_component("Button")` → Fetch Storybook docs page, extract info

### Phase 3: Storybook Content Extraction

**Challenge:** Extract useful info from Storybook docs pages.

**Options:**
1. **HTML parsing** - Fetch page, extract with cheerio
2. **Browser automation** - Use puppeteer/playwright to render JS
3. **Storybook API** - Some Storybooks expose additional JSON endpoints

**Content to extract:**
- Component description
- Import statement
- Props/Inputs with types
- Code examples from stories

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `apps/server/src/providers/kits/kit-registry.ts` | Create | Kit CRUD, storage |
| `apps/server/src/providers/kits/storybook-parser.ts` | Create | Fetch/parse Storybook |
| `apps/server/src/providers/kit-tools.ts` | Create | list_components, get_component tools |
| `apps/server/src/providers/tools.ts` | Modify | Add kit tool definitions |
| `apps/server/src/providers/base.ts` | Modify | Register kit tools dynamically |
| `apps/client/src/app/settings/kit-builder/` | Create | Builder UI component |
| `apps/client/src/app/settings/settings.ts` | Modify | Add Kit tab |
| `apps/client/src/app/settings/settings.html` | Modify | Add Kit tab UI |

---

## Verification

1. **Discovery test**: Enter `https://storybook.leanix.net`, verify components are found
2. **Save test**: Save kit, verify it persists in settings
3. **Tool test**: In chat, AI calls `list_components()`, gets LeanIX components
4. **Fetch test**: AI calls `get_component("Button")`, gets documentation
5. **Generation test**: Ask AI to "create a button", verify it uses LeanIX ButtonComponent
