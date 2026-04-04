# Figma Integration Plan for Adorable AI App Generator

## Overview
Add Figma integration allowing users to:
- Connect their Figma account via Personal Access Token (stored like AI API keys)
- Browse and select designs (frames/components or entire pages)
- Import design JSON structure + rendered images
- Send to AI for component/app generation

> **Note:** OAuth integration can be added later for a more polished UX.

## Architecture

```
Frontend (Angular)          Backend (Express)           Figma API
─────────────────          ─────────────────           ─────────
FigmaPanelComponent   →    /api/figma/*          →    REST API
FigmaService          ←    PAT Storage (AES)     ←    (with PAT header)
ChatComponent         ←    Image Conversion      ←    Image Export
```

---

## Implementation Steps

### Step 1: Shared Types
**File:** `libs/shared-types/src/lib/shared-types.ts`

Add interfaces:
- `FigmaFile` - File metadata (key, name, thumbnail)
- `FigmaNode` - Design tree node (id, name, type, children)
- `FigmaImportPayload` - Combined data for AI (jsonStructure, imageDataUris)

### Step 2: Backend - Figma Routes
**New file:** `apps/server/src/routes/figma.routes.ts`

Endpoints:
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/status` | Check if Figma PAT is configured |
| GET | `/files` | List user's recent files |
| GET | `/files/:fileKey` | Get file structure (pages/frames) |
| GET | `/files/:fileKey/nodes` | Get specific node details |
| POST | `/import` | Fetch JSON + export images as base64 |

**Register in:** `apps/server/src/main.ts`
```typescript
import { figmaRouter } from './routes/figma.routes';
app.use('/api/figma', figmaRouter);
```

### Step 3: Settings - Figma PAT Storage
**Modify:** `apps/server/src/routes/profile.routes.ts`

Add Figma PAT to profiles array (same pattern as AI providers):
```typescript
// In user settings JSON
{
  profiles: [
    { id: 'anthropic', provider: 'anthropic', apiKey: '...', model: '...' },
    { id: 'gemini', provider: 'gemini', apiKey: '...', model: '...' },
    { id: 'figma', provider: 'figma', apiKey: '...' }  // NEW - PAT stored here
  ]
}
```

Use existing `encrypt()`/`decrypt()` from `utils/crypto.ts`

### Step 4: Frontend - Figma Service
**New file:** `apps/client/src/app/services/figma.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class FigmaService {
  isConfigured = signal(false);
  loading = signal(false);

  checkStatus(): Observable<{ configured: boolean }>;
  getFiles(): Observable<FigmaFile[]>;
  getFile(fileKey: string): Observable<any>;
  importSelection(fileKey: string, nodeIds: string[]): Observable<FigmaImportPayload>;
}
```

### Step 5: Frontend - Figma Panel Component
**New directory:** `apps/client/src/app/figma/`
- `figma-panel.component.ts`
- `figma-panel.component.html`
- `figma-panel.component.scss`

**UI Views:**
1. **Setup View** - Prompt to add Figma PAT in profile settings (when not configured)
2. **Files View** - List of recent Figma files with thumbnails (enter file URL or browse)
3. **Tree View** - Hierarchical tree of pages/frames with checkboxes for selection

**Component outputs:**
```typescript
@Output() importToChat = new EventEmitter<FigmaImportPayload>();
```

### Step 6: Update Main App
**Modify:** `apps/client/src/app/app.ts`

```typescript
// Extend tab type
activeTab = signal<'chat' | 'terminal' | 'files' | 'figma'>('chat');

// Add import handler
onFigmaImport(payload: FigmaImportPayload) {
  this.activeTab.set('chat');
  this.chatComponent.handleFigmaImport(payload);
}
```

**Modify:** `apps/client/src/app/app.html`

Add tab button (after "Files"):
```html
<button class="tab-btn" [class.active]="activeTab() === 'figma'"
        (click)="activeTab.set('figma')">
  Figma
</button>
```

Add panel section:
```html
@if (activeTab() === 'figma') {
  <app-figma-panel (importToChat)="onFigmaImport($event)"></app-figma-panel>
}
```

### Step 7: Chat Integration
**Modify:** `apps/client/src/app/chat/chat.component.ts`

Add method to receive Figma imports:
```typescript
handleFigmaImport(payload: FigmaImportPayload) {
  // Attach images for vision
  this.attachedImages = payload.imageDataUris;

  // Pre-fill prompt with context
  this.prompt = `Create Angular components from this Figma design:
File: ${payload.fileName}
Frames: ${payload.selection.map(s => s.nodeName).join(', ')}`;

  // Store JSON structure to include in generate()
  this.figmaContext = payload.jsonStructure;
}
```

Modify `generate()` to append Figma JSON context to prompt when present.

### Step 8: Update Profile Settings UI
**Modify:** `apps/client/src/app/profile/profile.ts` and `profile.html`

Add a Figma section to the settings page:
- Input field for Figma Personal Access Token
- Link to Figma settings where user can generate token
- Same masked display pattern as AI API keys

---

## Authentication Flow (PAT-based)

1. User goes to Profile/Settings in app
2. User generates a Personal Access Token in Figma (Settings → Account → Personal Access Tokens)
3. User pastes token into app's Figma settings field
4. Token is encrypted and stored (same as AI provider keys)
5. Backend uses token in `X-Figma-Token` header for all Figma API calls
6. Figma panel shows "configured" state and enables file browsing

---

## No Environment Variables Required

The PAT approach requires no server-side Figma configuration - tokens are per-user.

---

## Files to Create/Modify

| Action | File Path |
|--------|-----------|
| CREATE | `apps/server/src/routes/figma.routes.ts` |
| CREATE | `apps/client/src/app/services/figma.service.ts` |
| CREATE | `apps/client/src/app/figma/figma-panel.component.ts` |
| CREATE | `apps/client/src/app/figma/figma-panel.component.html` |
| CREATE | `apps/client/src/app/figma/figma-panel.component.scss` |
| MODIFY | `libs/shared-types/src/lib/shared-types.ts` |
| MODIFY | `apps/server/src/main.ts` |
| MODIFY | `apps/server/src/routes/profile.routes.ts` |
| MODIFY | `apps/client/src/app/app.ts` |
| MODIFY | `apps/client/src/app/app.html` |
| MODIFY | `apps/client/src/app/profile/profile.ts` |
| MODIFY | `apps/client/src/app/profile/profile.html` |
| MODIFY | `apps/client/src/app/chat/chat.component.ts` |

---

## Security Considerations

- Figma PAT encrypted with AES-256-CBC (existing crypto utils)
- PAT masked in UI responses (first 7 + last 4 chars, same as API keys)
- All Figma API calls proxied through backend (token never exposed to frontend)
- No server-side secrets required (each user provides their own token)

---

## Future Enhancement: OAuth Integration

When ready to add OAuth for a smoother UX:
1. Register a Figma Developer App at figma.com/developers
2. Add OAuth endpoints to figma.routes.ts
3. Create popup-based OAuth flow
4. Store OAuth tokens with refresh capability
