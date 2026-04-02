# Local Mode Implementation Plan

## Overview
Enable the Adorable desktop app to work without login, storing projects locally with optional cloud sync when logged in.

## Architecture

### Storage Structure
```
~/adorable-projects/
├── my-app/
│   ├── _adorable.json          # Project metadata
│   ├── src/
│   ├── package.json
│   └── ...
└── another-project/
    ├── _adorable.json
    └── ...

~/.adorable/
├── config.json                  # App settings & API keys
└── recent-projects.json         # Recent project list
```

### Metadata File (`_adorable.json`)
```json
{
  "name": "My App",
  "localId": "uuid-v4",
  "cloudId": "server-id-or-null",
  "messages": [...],
  "figmaImports": [...],
  "lastModified": "2024-01-15T10:30:00Z",
  "lastSynced": "2024-01-15T10:00:00Z",
  "thumbnail": "data:image/png;base64,..."
}
```

### App Config (`~/.adorable/config.json`)
```json
{
  "apiKeys": {
    "anthropic": "sk-ant-...",
    "openai": "sk-..."
  },
  "defaultModel": "claude-sonnet-4-20250514",
  "theme": "dark"
}
```

## Implementation Steps

### Phase 1: Local Project Storage (Desktop Only)

1. **Create LocalProjectService** (`apps/desktop/local-project-service.ts`)
   - `listProjects()` - scan ~/adorable-projects for _adorable.json files
   - `loadProject(path)` - read files and metadata from disk
   - `saveProject(path, files, messages)` - write to disk
   - `createProject(name)` - create new local project folder
   - `deleteProject(path)` - remove project folder

2. **Add IPC handlers in main.ts**
   - `local:list-projects`
   - `local:load-project`
   - `local:save-project`
   - `local:create-project`
   - `local:delete-project`

3. **Update preload.ts**
   - Expose local project methods to renderer

### Phase 2: Local API Key Storage

1. **Add Settings Service** (`apps/desktop/settings-service.ts`)
   - `getApiKeys()` - read from ~/.adorable/config.json
   - `setApiKey(provider, key)` - securely store API key
   - `getSettings()` / `setSettings()`

2. **Add IPC handlers**
   - `settings:get-api-keys`
   - `settings:set-api-key`
   - `settings:get` / `settings:set`

3. **Update Profile Page**
   - Show API key input fields in desktop mode
   - Store keys locally via IPC

### Phase 3: AI Without Server

1. **Create LocalAIService** (`apps/client/src/app/services/local-ai.service.ts`)
   - Direct HTTP calls to AI providers (Anthropic, OpenAI)
   - Use locally stored API keys
   - Same interface as server-based AI

2. **Update ChatComponent**
   - Detect local mode (no auth + desktop app)
   - Use LocalAIService instead of server API

3. **Update AgentService**
   - Support local AI calls
   - File operations already work via local-agent

### Phase 4: Dashboard for Local Mode

1. **Create LocalDashboardComponent** or update existing
   - List local projects from ~/adorable-projects
   - Show project cards with thumbnails
   - Create/Open/Delete local projects

2. **Update App Routing**
   - `/local` or modify `/dashboard` based on auth state
   - Skip auth guard for local mode

### Phase 5: Cloud Sync (When Logged In)

1. **Sync Status Tracking**
   - Compare `lastModified` vs `lastSynced`
   - Track `cloudId` for linked projects

2. **Sync Operations**
   - `uploadToCloud(localProject)` - create/update on server
   - `downloadFromCloud(cloudProject)` - save locally
   - `linkProject(localId, cloudId)` - associate local with cloud

3. **Conflict Resolution Dialog**
   - Show when cloud `lastModified` > local `lastSynced`
   - Options: Use Cloud / Use Local / Keep Both
   - Display timestamps and optionally file diffs

4. **Auto-Sync (Optional)**
   - On login: check for unsynced local projects
   - Prompt to sync or keep separate

## UI Changes

### Navbar
- Show "Local Mode" indicator when not logged in
- Show sync status icon when logged in with local projects

### Dashboard
- Tab or toggle: "Local Projects" / "Cloud Projects"
- Sync button on project cards
- Conflict badge when sync needed

### Settings/Profile
- API Keys section (desktop only)
- Sync preferences

## Security Considerations

1. **API Key Storage**
   - Store in user's home directory (not app directory)
   - Consider using system keychain via `keytar` for extra security
   - Never sync API keys to cloud

2. **Local Files**
   - Projects are user-owned files
   - No special encryption (user's responsibility)

## Migration Path

1. Existing cloud-only users: no change
2. New desktop users: can start in local mode
3. Local users who login: prompted to sync

## Files to Create/Modify

### New Files
- `apps/desktop/local-project-service.ts`
- `apps/desktop/settings-service.ts`
- `apps/client/src/app/services/local-ai.service.ts`
- `apps/client/src/app/services/local-project.service.ts`

### Modified Files
- `apps/desktop/main.ts` - add IPC handlers
- `apps/desktop/preload.ts` - expose IPC methods
- `apps/client/src/app/dashboard/dashboard.ts` - support local projects
- `apps/client/src/app/chat/chat.component.ts` - use local AI
- `apps/client/src/app/services/agent.service.ts` - support local mode
- `apps/client/src/app/profile/profile.ts` - API key management
- `apps/client/src/app/navbar/navbar.ts` - local mode indicator
- `apps/client/src/app/app.routes.ts` - conditional auth guards

## Estimated Effort

- Phase 1 (Local Storage): Core functionality
- Phase 2 (API Keys): Settings infrastructure
- Phase 3 (Local AI): AI without server
- Phase 4 (Dashboard): UI for local projects
- Phase 5 (Sync): Cloud integration

Phases 1-4 enable fully offline desktop usage.
Phase 5 adds cloud sync capabilities.
