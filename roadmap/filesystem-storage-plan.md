# Filesystem-First Storage, Git Versioning, Drop WebContainer

## Context

Projects are currently stored as JSON blobs in SQLite (`Project.files` = entire file tree stringified). This causes:
- `PayloadTooLargeError` on save as projects grow (especially with `.adorable/` docs included)
- Slow save/load due to `JSON.stringify()`/`JSON.parse()` of the full tree
- Chat message snapshots store FULL file copies per message (not diffs), bloating the DB further
- Redundant storage: Docker projects already live on disk at `storage/projects/{userId}/` AND in the DB

Additionally, WebContainer (browser mode) adds COEP/COOP header complexity but is unused in practice. Docker and Native modes are the real workflow.

**Goals:**
1. Store project files on disk, not in DB
2. Use git for version snapshots (replaces chat message file blobs)
3. Drop WebContainer support
4. Optionally persist `node_modules` for instant project switching

---

## Phase 1: Drop WebContainer (independent, do first)

Smallest change, reduces surface area before bigger refactors.

### Delete
- `apps/client/src/app/services/browser-container.engine.ts` (261 lines)

### Modify
- **`apps/client/src/app/services/smart-container.engine.ts`**
  - Remove `BrowserContainerEngine` import and injection
  - Remove `case 'browser'` from `activeEngine` computed
  - Change `ContainerMode` type to `'local' | 'native'`
  - Default mode: `'local'` instead of `'browser'`
- **`apps/client/src/app/services/container-engine.ts`**
  - Update `mode` type to `'local' | 'native'`
- **`apps/client/src/app/app.ts`**
  - Remove browser mode from UI mode selector (if present)
- **`apps/server/src/main.ts`** (lines 71-76)
  - Remove COEP/COOP headers middleware
- **`apps/server/src/middleware/proxy.ts`** (lines 63-66)
  - Remove `Cross-Origin-Resource-Policy` and `Cross-Origin-Embedder-Policy` from proxy responses
- **`package.json`**
  - Remove `@webcontainer/api` dependency

**Note:** Keep `WebContainerFiles` type -- it's a generic file tree structure, not WebContainer-specific. Optionally rename to `ProjectFiles` later.

---

## Phase 2: Filesystem-Based Project Storage (foundational)

### 2a. New service: `apps/server/src/services/project-fs.service.ts`

Storage layout: `storage/projects/{projectId}/` (one folder per project)

Key methods:
- `getProjectPath(projectId)` -- returns `path.join(STORAGE_DIR, 'projects', projectId)`
- `writeProjectFiles(projectId, files: WebContainerFiles)` -- recursively writes tree to disk (reuse pattern from existing `ProjectService.saveFilesToDisk()`)
- `readProjectFiles(projectId, exclude?)` -- reads disk back into `WebContainerFiles` tree, excluding `node_modules`, `.git`, `.angular`, `dist`
- `readProjectFilesFlat(projectId)` -- flat `Record<string, string>` map for AI context / MemoryFileSystem init
- `deleteProjectFiles(projectId)` / `copyProject(sourceId, targetId)`
- `projectExistsOnDisk(projectId)` -- check if filesystem version exists

### 2b. Schema migration

**`prisma/schema.prisma`:**
- Make `Project.files` optional: `String` -> `String?`
- New projects will have `files = null`
- Existing projects keep data until lazily migrated

### 2c. Updated project routes

**`apps/server/src/routes/project.routes.ts`:**

**POST `/api/projects` (save):**
- Write metadata to DB (name, thumbnail, selectedKitId -- NO files blob)
- Write files to disk via `projectFsService.writeProjectFiles(id, files)`
- If `files` in request body is present (backward compat during transition), write to disk

**GET `/api/projects/:id` (load):**
- Read metadata from DB
- Read files from disk via `projectFsService.readProjectFiles(id)`
- Fallback: if no files on disk but `project.files` in DB, lazy-migrate (write to disk, clear DB column)

**DELETE `/api/projects/:id`:**
- Delete from DB + delete from filesystem

**POST `/api/projects/:id/clone`:**
- Copy filesystem via `projectFsService.copyProject(sourceId, newId)`
- Create new DB record

### 2d. Docker bind mount path change

**`apps/server/src/providers/container/docker-manager.ts`:**

Currently: `storage/projects/{userId}/` mounted to `/app`
New: `storage/projects/{projectId}/` mounted to `/app`

- `DockerManager` needs `projectId` (not just `userId`)
- One container per user, re-mount on project switch (stop, change bind mount, restart)
- **`container.routes.ts` POST `/start`**: accept `projectId` in body, pass to container creation
- **`container-registry.ts`**: key stays as `userId` (one container per user), but the bind mount path changes per project

### 2e. Update AI generation to read from disk

**`apps/server/src/routes/ai.routes.ts`:**
- Add `projectId` to request body (client already has it)
- When no ContainerFileSystem available, init MemoryFileSystem from disk instead of `previousFiles`:
  ```
  const flattened = await projectFsService.readProjectFilesFlat(projectId);
  const fs = new MemoryFileSystem(flattened);
  ```

**`apps/server/src/providers/base.ts` (line ~109):**
- After AI generation, write `accumulatedFiles` to disk (not just return to client)

**`apps/client/src/app/chat/chat.component.ts`:**
- Stop sending `previousFiles` in the generate request body (server reads from disk)
- Send `projectId` instead

### 2f. Update client save flow

**`apps/client/src/app/services/project.ts` `saveProject()`:**
- Still send files to server on explicit save (server writes to disk)
- But for AI-generated changes, files are already on disk -- save only needs metadata

**`apps/client/src/app/services/api.ts` `saveProject()`:**
- Keep `files` parameter but make it optional (during transition)
- Server handles: if files provided, write to disk; otherwise just update metadata

### 2g. Update other routes that read `project.files`

- **`apps/server/src/routes/github.routes.ts`** -- replace `JSON.parse(project.files)` with `projectFsService.readProjectFiles(id)`
- **`apps/server/src/routes/webhooks.routes.ts`** -- same
- **`apps/server/src/routes/skills.routes.ts`** -- same

---

## Phase 3: Git-Based Versioning

### 3a. New service: `apps/server/src/services/git.service.ts`

Dependency: add `simple-git` to `package.json`

Key methods:
- `initRepo(projectPath)` -- `git init`, create `.gitignore` (node_modules, .angular, dist, .cache, tmp)
- `commit(projectPath, message)` -- `git add -A && git commit`, returns SHA
- `getLog(projectPath, limit?)` -- returns commit history
- `checkout(projectPath, sha)` -- restore files to a specific version
- `getFilesAtCommit(projectPath, sha)` -- read files from a historical commit

### 3b. Schema update

**`prisma/schema.prisma`:**
- `ChatMessage.files` stays `String?` (deprecated, null for new messages)
- Add `ChatMessage.commitSha String?` -- git SHA for this point in time

### 3c. Integration with AI generation

**`apps/server/src/routes/ai.routes.ts`:**
- Before generation: `git commit -m "Before: {user prompt}"` (if dirty)
- After generation: `git commit -m "AI: {summary}"`, return SHA in result

### 3d. Client changes

**`apps/client/src/app/chat/chat.component.ts`:**
- Line ~749 (user message): stop storing `files` snapshot, server handles git commit
- Line ~1009 (assistant result): store `commitSha` from response instead of `files`
- `restoreVersion()`: call `POST /api/projects/:id/restore { commitSha }` instead of reloading from memory

**`apps/client/src/app/chat/chat.html`:**
- Restore button: use `msg.commitSha` instead of `msg.files`

### 3e. New endpoint

**`apps/server/src/routes/project.routes.ts`:**
- `POST /api/projects/:id/restore` -- accepts `{ commitSha }`, runs `git checkout`, returns updated files

---

## Phase 4: node_modules Persistence (independent optimization)

### Changes
- **`apps/client/src/app/services/local-container.engine.ts`** `clean()`:
  - Don't delete `node_modules` unless explicitly requested (kit/template change)
- **`apps/client/src/app/services/native-container.engine.ts`**:
  - Same change
- **`apps/client/src/app/services/project.ts`** `reloadPreview()`:
  - Before `runInstall()`, check if `node_modules/` exists and `package.json` hasn't changed
  - If so, skip install entirely
- **`.gitignore`** (per project, from Phase 3): already excludes `node_modules`

---

## Files Changed Summary

| Phase | New Files | Modified Files | Deleted Files |
|-------|-----------|---------------|---------------|
| 1 (WebContainer) | 0 | 5 | 1 |
| 2 (Filesystem) | 1 | ~10 | 0 |
| 3 (Git) | 1 | ~5 | 0 |
| 4 (node_modules) | 0 | 3 | 0 |

---

## Migration Strategy

**Lazy migration** (safest): On `GET /api/projects/:id`, if files exist in DB but not on disk, write them to disk and clear the DB column. New saves always go to disk.

---

## Verification

1. `npx nx build server && npx nx build client` -- compilation passes
2. Create a new project -> verify files written to `storage/projects/{projectId}/`
3. Save/load project -> verify metadata from DB, files from disk
4. AI generation -> verify files read from disk, changes written to disk
5. Restore version -> verify git checkout works, files update correctly
6. Open existing project (migration) -> verify lazy migration from DB to disk
7. Switch projects -> verify node_modules persists, `pnpm install` skipped
8. Clone project -> verify filesystem copy works
9. Verify no COEP/COOP headers in responses after WebContainer removal
