# GitHub Two-Way Sync Integration

## Overview

Implement a bidirectional synchronization between Adorable projects and GitHub repositories, similar to Lovable's implementation.

## How It Works (Based on Lovable Research)

### Lovable's Approach
1. **GitHub OAuth** - Users authenticate with GitHub to link their identity
2. **GitHub App** - A GitHub App is installed on user's account/org for repository access
3. **Webhook Sync** - GitHub sends webhook events when commits are pushed to the default branch
4. **API Push** - When changes are made in Lovable, they push commits via GitHub API

### Key Design Decisions

| Aspect | Lovable's Approach | Our Approach |
|--------|-------------------|--------------|
| Auth | GitHub OAuth + GitHub App | GitHub OAuth (simpler for MVP) |
| Sync Direction | Two-way, default branch only | Two-way, default branch only |
| Conflict Resolution | Not documented (likely latest-wins) | Latest-wins with conflict detection |
| Repository Creation | Creates new repos, no import | Support both create and import |

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Adorable Client                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ GitHub Settings │  │  Sync Status UI  │  │ Conflict Resolver │  │
│  │   Component     │  │                  │  │                   │  │
│  └─────────────────┘  └──────────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           Adorable Server                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ GitHub OAuth    │  │  GitHub API      │  │ Webhook Handler   │  │
│  │   Routes        │  │   Service        │  │  /api/webhooks/gh │  │
│  └─────────────────┘  └──────────────────┘  └───────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Sync Engine                                │  │
│  │  - Detect changes (project files vs GitHub)                  │  │
│  │  - Transform files to/from Git format                        │  │
│  │  - Queue and batch commits                                   │  │
│  │  - Handle merge conflicts                                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            GitHub                                    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  OAuth App      │  │  Repository      │  │  Webhooks         │  │
│  │                 │  │  (User's repo)   │  │  → push events    │  │
│  └─────────────────┘  └──────────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Adorable → GitHub (Push)
1. User makes changes in Adorable
2. User clicks "Sync to GitHub" or auto-sync triggers
3. Server compares project files with last known GitHub state
4. Server creates a commit with changed files via GitHub API
5. Server updates local sync state

#### GitHub → Adorable (Pull via Webhook)
1. User pushes commits to default branch externally
2. GitHub sends `push` webhook to our server
3. Server fetches latest files from repository
4. Server compares with current project state
5. If no conflicts: auto-merge and notify user
6. If conflicts: store incoming changes and prompt user

---

## Database Schema Changes

```prisma
model Project {
  // ... existing fields

  // GitHub Integration
  githubRepoId       String?   // GitHub repository ID
  githubRepoFullName String?   // owner/repo format
  githubBranch       String?   // Default branch to sync (usually 'main')
  githubLastSyncAt   DateTime? // Last successful sync timestamp
  githubLastCommitSha String?  // Last synced commit SHA
  githubSyncEnabled  Boolean   @default(false)
}

model User {
  // ... existing fields

  // GitHub Integration
  githubId          String?   @unique
  githubUsername    String?
  githubAccessToken String?   // Encrypted OAuth access token
  githubTokenExpiry DateTime?
}

model GitHubWebhook {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
  webhookId   String   // GitHub webhook ID
  secret      String   // Webhook secret for verification
  createdAt   DateTime @default(now())
}
```

---

## API Endpoints

### OAuth Flow
```
GET  /api/github/auth          - Redirect to GitHub OAuth
GET  /api/github/callback      - OAuth callback handler
POST /api/github/disconnect    - Remove GitHub connection
```

### Repository Management
```
GET  /api/github/repos         - List user's repositories
POST /api/github/connect       - Connect project to repository
POST /api/github/create-repo   - Create new repo and connect
DELETE /api/github/disconnect/:projectId - Disconnect project from repo
```

### Sync Operations
```
POST /api/github/sync/:projectId      - Manual sync (push changes)
GET  /api/github/sync/:projectId/status - Get sync status
POST /api/github/sync/:projectId/pull   - Pull latest from GitHub
```

### Webhook
```
POST /api/webhooks/github      - Receive GitHub webhook events
```

---

## Implementation Phases

### Phase 1: GitHub OAuth (MVP)
- [ ] Create GitHub OAuth App in GitHub settings
- [ ] Implement OAuth routes (`/api/github/auth`, `/api/github/callback`)
- [ ] Store GitHub tokens securely (encrypted)
- [ ] Add GitHub section to Profile/Settings page
- [ ] Display connected GitHub account info

### Phase 2: Repository Connection
- [ ] List user's repositories via GitHub API
- [ ] Connect/disconnect project to/from repository
- [ ] Create new repository option
- [ ] Store repository info in Project model
- [ ] Add GitHub connection UI to project settings

### Phase 3: Push to GitHub (Adorable → GitHub)
- [ ] Implement file diff detection
- [ ] Transform WebContainerFiles to Git tree format
- [ ] Create commits via GitHub API (Trees + Commits API)
- [ ] Handle binary files (images, etc.)
- [ ] Add "Push to GitHub" button with status
- [ ] Auto-sync option (push on project save)

### Phase 4: Webhook Sync (GitHub → Adorable)
- [ ] Register webhook when connecting repository
- [ ] Implement webhook verification (signature check)
- [ ] Handle `push` events for default branch
- [ ] Fetch changed files from GitHub
- [ ] Update project files in database
- [ ] Notify connected clients via WebSocket

### Phase 5: Conflict Resolution
- [ ] Detect conflicting changes
- [ ] Store incoming changes separately
- [ ] Show conflict UI to user
- [ ] Provide merge options (keep local, keep remote, manual merge)
- [ ] Implement three-way merge for text files

---

## Security Considerations

1. **Token Storage**: GitHub access tokens must be encrypted at rest
2. **Webhook Verification**: Validate webhook signatures using secret
3. **Rate Limiting**: Respect GitHub API rate limits (5000 req/hour for authenticated)
4. **Scope Minimization**: Request only necessary OAuth scopes (`repo` for private repos)
5. **Token Refresh**: Handle token expiration and refresh

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `apps/server/src/routes/github.routes.ts` | OAuth and repo management endpoints |
| `apps/server/src/routes/webhooks.routes.ts` | Webhook handlers |
| `apps/server/src/providers/github/github.service.ts` | GitHub API wrapper |
| `apps/server/src/providers/github/sync.service.ts` | Sync engine |
| `apps/client/src/app/github/github-settings.component.ts` | GitHub connection UI |
| `apps/client/src/app/services/github.service.ts` | Client-side GitHub service |
| `libs/shared-types/src/lib/github.types.ts` | Shared type definitions |

### Modified Files
| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add GitHub fields to User and Project |
| `apps/server/src/main.ts` | Register new routes |
| `apps/client/src/app/profile/profile.ts` | Add GitHub settings section |
| `apps/client/src/app/chat/chat.component.ts` | Add sync status indicator |

---

## Environment Variables

```env
# GitHub OAuth App
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:3333/api/github/callback

# Webhook secret (generate random string)
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Encryption key for tokens
GITHUB_TOKEN_ENCRYPTION_KEY=your_32_byte_key
```

---

## References

- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [GitHub REST API - Repositories](https://docs.github.com/en/rest/repos)
- [GitHub REST API - Git Database](https://docs.github.com/en/rest/git)
- [GitHub Webhooks](https://docs.github.com/en/developers/webhooks-and-events/webhooks)
- [Lovable GitHub Integration](https://docs.lovable.dev/integrations/github)
