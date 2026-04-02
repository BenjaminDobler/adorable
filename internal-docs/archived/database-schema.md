# Database Schema

Adorable uses SQLite via Prisma ORM. The schema is defined in `prisma/schema.prisma`.

## Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Project : "owns"
    User ||--o{ ChatMessage : "sends"
    User ||--o{ TeamMember : "belongs to"
    User ||--o{ InviteCode : "uses"
    Team ||--o{ TeamMember : "has"
    Team ||--o{ TeamInvite : "has"
    Team ||--o{ Project : "owns"
    Project ||--o{ ChatMessage : "has"
    Project ||--o{ GitHubWebhook : "has"

    User {
        string id PK
        string email UK
        string password
        string name
        string role "admin | user"
        boolean isActive
        boolean emailVerified
        string emailVerificationToken
        string passwordResetToken
        datetime passwordResetTokenExpiresAt
        boolean cloudEditorAllowed
        json settings "AI profiles, theme, etc."
        datetime createdAt
        datetime updatedAt
    }

    Project {
        string id PK
        string name
        string userId FK
        string teamId FK
        json files "Project files as JSON"
        string description
        boolean isPublished
        string publicSlug UK
        boolean isPublic
        string kitId
        datetime createdAt
        datetime updatedAt
    }

    ChatMessage {
        string id PK
        string projectId FK
        string userId FK
        string role "user | assistant"
        string content
        json fileSnapshot "Files at this point in time"
        datetime createdAt
    }

    Team {
        string id PK
        string name
        string ownerId FK
        datetime createdAt
    }

    TeamMember {
        string id PK
        string teamId FK
        string userId FK
        string role "owner | admin | member"
        datetime joinedAt
    }

    TeamInvite {
        string id PK
        string teamId FK
        string email
        string role
        string token UK
        datetime expiresAt
    }

    InviteCode {
        string id PK
        string code UK
        string createdBy FK
        string usedBy FK
        datetime usedAt
        datetime expiresAt
        datetime createdAt
    }

    KitLesson {
        string id PK
        string kitId
        string componentName
        string lesson "AI-discovered pattern"
        datetime createdAt
    }

    GitHubWebhook {
        string id PK
        string projectId FK
        string repo
        string branch
        string secret
        datetime createdAt
    }

    ServerConfig {
        string id PK
        string key UK
        string value
        datetime updatedAt
    }
```

## Key Models

### User
Central user model with authentication fields, role-based access, and JSON settings (AI profiles, theme preferences, MCP server configs).

### Project
Stores project metadata and all files as a JSON string. Supports publishing with unique slugs for public/private sharing.

### ChatMessage
Stores conversation history with file snapshots at each message, enabling time-travel through project states.

### Team
Team workspace support with role-based membership (owner, admin, member) and invite system.

### ServerConfig
Key-value store for server-wide settings, cached in memory by `ServerConfigService`.

### KitLesson
AI-discovered patterns for component kits, learned during code generation and reused in future sessions.

## Desktop Database

The desktop app uses its own SQLite schema in `apps/desktop/db-init.ts` (not Prisma migrations). When modifying `prisma/schema.prisma`, you **must** also update `db-init.ts`:

1. Update `createFreshSchema()` with new columns/tables
2. Add a migration entry to the `migrations` array
3. Bump `LATEST_VERSION`
