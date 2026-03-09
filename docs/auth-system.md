# Authentication & Authorization

Adorable supports multiple authentication methods: email/password, GitHub OAuth, and Google OAuth. Authorization is role-based with admin and user roles.

## Authentication Flow

```mermaid
flowchart TB
    subgraph "Login Methods"
        EMAIL["Email + Password"]
        GITHUB["GitHub OAuth"]
        GOOGLE["Google OAuth"]
    end

    subgraph "Server"
        VERIFY["Verify Credentials"]
        JWT_CREATE["Create JWT Token"]
        CHECK_ACTIVE["Check isActive"]
        CHECK_EMAIL["Check emailVerified"]
    end

    subgraph "Client"
        STORE["Store JWT in localStorage"]
        INTERCEPT["authInterceptor<br/>attaches Bearer token"]
        GUARD["Route Guards"]
    end

    EMAIL --> VERIFY
    GITHUB --> VERIFY
    GOOGLE --> VERIFY
    VERIFY --> CHECK_ACTIVE --> CHECK_EMAIL --> JWT_CREATE
    JWT_CREATE --> STORE
    STORE --> INTERCEPT
    INTERCEPT --> GUARD
```

## Registration Modes

```mermaid
flowchart TB
    REG["Registration Request"]
    FIRST{"First User?"}
    MODE{"Registration Mode"}

    OPEN["Open Registration"]
    INVITE["Check Invite Code"]
    VALID{"Valid Code?"}

    CREATE["Create User"]
    ADMIN_ROLE["Role: admin<br/>Email: verified"]
    USER_ROLE["Role: user"]

    VERIFY_EMAIL{"Email Verification<br/>Enabled?"}
    SEND_EMAIL["Send Verification Email"]
    ISSUE_TOKEN["Issue JWT Token"]

    REG --> FIRST
    FIRST -->|Yes| CREATE --> ADMIN_ROLE --> ISSUE_TOKEN
    FIRST -->|No| MODE
    MODE -->|open| OPEN --> CREATE
    MODE -->|invite-only| INVITE --> VALID
    VALID -->|Yes| CREATE
    VALID -->|No| REJECT["400 Error"]
    CREATE --> USER_ROLE --> VERIFY_EMAIL
    VERIFY_EMAIL -->|Yes| SEND_EMAIL
    VERIFY_EMAIL -->|No| ISSUE_TOKEN
```

- The **first user** always becomes admin with verified email
- Subsequent users follow the configured registration mode
- Invite codes are single-use with optional expiry

## JWT Token Structure

```json
{
  "userId": "string",
  "role": "admin | user",
  "iat": 1234567890,
  "exp": 1234567890
}
```

Tokens expire after 7 days. The `authenticate` middleware in `middleware/auth.ts` validates tokens and attaches the user to `req.user`.

## Authorization Layers

```mermaid
flowchart LR
    REQ["Request"] --> AUTH["authenticate()<br/>Valid JWT?"]
    AUTH --> ADMIN["requireAdmin()<br/>role === admin?"]
    AUTH --> CLOUD["cloudEditorAccess()<br/>Cloud editor allowed?"]
    AUTH --> ACTIVE["isActive check"]

    ADMIN --> ADMIN_ROUTES["Admin Routes"]
    CLOUD --> EDITOR_ROUTES["Editor Routes"]
    ACTIVE --> USER_ROUTES["User Routes"]
```

| Layer | Middleware | Purpose |
|-------|-----------|---------|
| Authentication | `authenticate()` | Verifies JWT, loads user |
| Admin Access | `requireAdmin()` | Checks `role === 'admin'` |
| Cloud Editor | `cloudEditorAccess()` | Checks allowlist mode |
| Account Status | `isActive` check | Disabled accounts blocked |
| Email Verified | `emailVerified` check | Unverified blocked at login |

## Social Login (OAuth)

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant GH as GitHub/Google

    U->>C: Click "Login with GitHub"
    C->>S: GET /api/auth/github
    S->>GH: Redirect to OAuth
    GH->>U: Authorize app
    GH->>S: Callback with code
    S->>GH: Exchange code for token
    GH-->>S: Access token
    S->>GH: Fetch user profile
    GH-->>S: Email, name, avatar
    S->>S: Find or create user
    S->>S: Issue JWT
    S->>C: Redirect with token
    C->>C: Store JWT
```

Social login users get a random password hash (they can set a password later via reset flow). If a user with the same email already exists, the accounts are linked.

## Password Reset

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant E as Email

    U->>C: Enter email
    C->>S: POST /api/auth/forgot-password
    S->>S: Generate reset token (1hr expiry)
    S->>E: Send reset email
    S-->>C: "If account exists, email sent"

    U->>E: Click reset link
    E->>C: /reset-password?token=xxx
    U->>C: Enter new password
    C->>S: POST /api/auth/reset-password
    S->>S: Verify token, hash password
    S-->>C: "Password reset successful"
```

## Rate Limiting

- **Login**: Rate limited via `authRateLimit` (prevents brute force)
- **Register**: Rate limited via `registerRateLimit`
- **Password Reset**: Rate limited via `authRateLimit`
