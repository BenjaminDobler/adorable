import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { app } from 'electron';
import Database from 'better-sqlite3';
import * as bcrypt from 'bcryptjs';

export interface LocalUserInfo {
  id: string;
  email: string;
}

export interface DatabaseInitResult {
  databaseUrl: string;
  localUser: LocalUserInfo;
}

// ── Schema Version ──────────────────────────────────────────────────
// Bump LATEST_VERSION and add a new entry to `migrations` whenever the
// Prisma schema changes.  Each migration is idempotent (uses addColumn /
// tryExec helpers) so it's safe to re-run on any database state.
const LATEST_VERSION = 13;

type MigrationFn = (db: Database.Database) => void;

interface Migration {
  version: number;
  name: string;
  up: MigrationFn;
}

// ── Migrations ──────────────────────────────────────────────────────
// Grouped by feature.  The order here matches the historical order in
// which columns were added to the Prisma schema.

const migrations: Migration[] = [
  {
    version: 1,
    name: 'Core user fields',
    up(db) {
      addColumn(db, 'User', 'role', "TEXT NOT NULL DEFAULT 'user'");
      addColumn(db, 'User', 'isActive', 'BOOLEAN NOT NULL DEFAULT 1');
      addColumn(db, 'User', 'emailVerified', 'BOOLEAN NOT NULL DEFAULT 0');
      addColumn(db, 'User', 'emailVerificationToken', 'TEXT');
    },
  },
  {
    version: 2,
    name: 'GitHub integration',
    up(db) {
      addColumn(db, 'User', 'githubId', 'TEXT');
      addColumn(db, 'User', 'githubUsername', 'TEXT');
      addColumn(db, 'User', 'githubAccessToken', 'TEXT');
      addColumn(db, 'User', 'githubAvatarUrl', 'TEXT');
      addColumn(db, 'Project', 'githubRepoId', 'TEXT');
      addColumn(db, 'Project', 'githubRepoFullName', 'TEXT');
      addColumn(db, 'Project', 'githubBranch', 'TEXT');
      addColumn(db, 'Project', 'githubLastSyncAt', 'DATETIME');
      addColumn(db, 'Project', 'githubLastCommitSha', 'TEXT');
      addColumn(db, 'Project', 'githubSyncEnabled', 'BOOLEAN NOT NULL DEFAULT 0');
      addColumn(db, 'Project', 'githubPagesUrl', 'TEXT');
      tryExec(db, 'CREATE UNIQUE INDEX IF NOT EXISTS "User_githubId_key" ON "User"("githubId")');
    },
  },
  {
    version: 3,
    name: 'Kit selection + chat enhancements',
    up(db) {
      addColumn(db, 'Project', 'selectedKitId', 'TEXT');
      addColumn(db, 'ChatMessage', 'commitSha', 'TEXT');
      addColumn(db, 'ChatMessage', 'model', 'TEXT');
    },
  },
  {
    version: 4,
    name: 'Cloud sync',
    up(db) {
      addColumn(db, 'Project', 'cloudProjectId', 'TEXT');
      addColumn(db, 'Project', 'cloudCommitSha', 'TEXT');
      addColumn(db, 'Project', 'cloudLastSyncAt', 'DATETIME');
    },
  },
  {
    version: 5,
    name: 'Teams + access control',
    up(db) {
      addColumn(db, 'Project', 'teamId', 'TEXT');
      addColumn(db, 'User', 'cloudEditorAllowed', 'BOOLEAN NOT NULL DEFAULT 1');
    },
  },
  {
    version: 6,
    name: 'Publishing',
    up(db) {
      addColumn(db, 'Project', 'isPublished', 'BOOLEAN NOT NULL DEFAULT 0');
      addColumn(db, 'Project', 'publishSlug', 'TEXT');
      addColumn(db, 'Project', 'publishVisibility', "TEXT NOT NULL DEFAULT 'public'");
      addColumn(db, 'Project', 'publishedAt', 'DATETIME');
    },
  },
  {
    version: 7,
    name: 'Password reset',
    up(db) {
      addColumn(db, 'User', 'passwordResetToken', 'TEXT');
      addColumn(db, 'User', 'passwordResetTokenExpiresAt', 'DATETIME');
    },
  },
  {
    version: 8,
    name: 'Social login (GitHub + Google OAuth)',
    up(db) {
      addColumn(db, 'User', 'authProvider', 'TEXT');
      addColumn(db, 'User', 'googleId', 'TEXT');
      addColumn(db, 'User', 'googleAvatarUrl', 'TEXT');
      tryExec(db, 'CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId")');
    },
  },
  {
    version: 9,
    name: 'Kit lessons (lessons learned)',
    up(db) {
      tryExec(db, `
        CREATE TABLE IF NOT EXISTS "KitLesson" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "kitId" TEXT NOT NULL,
          "component" TEXT,
          "title" TEXT NOT NULL,
          "problem" TEXT NOT NULL,
          "solution" TEXT NOT NULL,
          "codeSnippet" TEXT,
          "tags" TEXT,
          "scope" TEXT NOT NULL DEFAULT 'user',
          "userId" TEXT NOT NULL,
          "projectId" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE CASCADE,
          FOREIGN KEY ("userId") REFERENCES "User"("id")
        )
      `);
      tryExec(db, 'CREATE INDEX IF NOT EXISTS "KitLesson_kitId_idx" ON "KitLesson"("kitId")');
      tryExec(db, 'CREATE INDEX IF NOT EXISTS "KitLesson_userId_idx" ON "KitLesson"("userId")');
    },
  },
  {
    version: 10,
    name: 'Rename isBuiltIn to isGlobal + add deprecated on Kit',
    up(db) {
      // SQLite doesn't support ALTER COLUMN RENAME, so add new columns and copy data
      addColumn(db, 'Kit', 'isGlobal', 'BOOLEAN NOT NULL DEFAULT 0');
      addColumn(db, 'Kit', 'deprecated', 'BOOLEAN NOT NULL DEFAULT 0');
      // Copy existing isBuiltIn values to isGlobal
      tryExec(db, 'UPDATE "Kit" SET "isGlobal" = "isBuiltIn" WHERE "isBuiltIn" = 1');
    },
  },
  {
    version: 11,
    name: 'External project path (open existing folder)',
    up(db) {
      addColumn(db, 'Project', 'externalPath', 'TEXT');
    },
  },
  {
    version: 12,
    name: 'Claude Code session tracking',
    up(db) {
      addColumn(db, 'Project', 'claudeCodeSessionId', 'TEXT');
    },
  },
  {
    version: 13,
    name: 'FK indexes for query performance',
    up(db) {
      tryExec(db, 'CREATE INDEX IF NOT EXISTS "Project_teamId_idx" ON "Project"("teamId")');
      tryExec(db, 'CREATE INDEX IF NOT EXISTS "TeamMember_userId_idx" ON "TeamMember"("userId")');
      tryExec(db, 'CREATE INDEX IF NOT EXISTS "TeamInvite_teamId_idx" ON "TeamInvite"("teamId")');
      tryExec(db, 'CREATE INDEX IF NOT EXISTS "Kit_userId_idx" ON "Kit"("userId")');
      tryExec(db, 'CREATE INDEX IF NOT EXISTS "Kit_teamId_idx" ON "Kit"("teamId")');
    },
  },
];

// ── Public API ──────────────────────────────────────────────────────

/**
 * Initializes the SQLite database for the desktop app.
 * Creates the database schema directly using SQL statements.
 * This avoids runtime dependencies on Prisma CLI.
 * Also ensures a local user exists for auto-login.
 */
export async function initializeDatabase(): Promise<DatabaseInitResult> {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'adorable.db');
  const databaseUrl = `file:${dbPath}`;

  // Set DATABASE_URL for this process and child processes
  process.env['DATABASE_URL'] = databaseUrl;

  console.log(`[Desktop] Database path: ${dbPath}`);

  // Ensure userData directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const isNewDb = !fs.existsSync(dbPath);
  let localUser: LocalUserInfo;

  try {
    const db = new Database(dbPath);

    if (isNewDb) {
      console.log('[Desktop] Fresh install - creating database...');
      createFreshSchema(db);
      setSchemaVersion(db, LATEST_VERSION);
      console.log(`[Desktop] Schema created at version ${LATEST_VERSION}`);
    } else {
      console.log('[Desktop] Existing database - checking for migrations...');
      runMigrations(db);
    }

    // Ensure local user exists for auto-login
    localUser = ensureLocalUser(db);
    console.log(`[Desktop] Local user ready: ${localUser.email} (${localUser.id})`);

    db.close();
    console.log('[Desktop] Database initialized successfully');
  } catch (error: any) {
    console.error('[Desktop] Database initialization failed:', error.message);
    throw error;
  }

  return { databaseUrl, localUser };
}

// ── Schema creation (fresh installs) ────────────────────────────────

/**
 * Creates the full database schema for a fresh install.
 * This always reflects the latest Prisma schema.
 */
function createFreshSchema(db: Database.Database): void {
  db.exec(`
    -- User table
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "email" TEXT NOT NULL UNIQUE,
      "password" TEXT NOT NULL,
      "name" TEXT,
      "settings" TEXT,
      "role" TEXT NOT NULL DEFAULT 'user',
      "isActive" BOOLEAN NOT NULL DEFAULT 1,
      "emailVerified" BOOLEAN NOT NULL DEFAULT 0,
      "emailVerificationToken" TEXT,
      "passwordResetToken" TEXT,
      "passwordResetTokenExpiresAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "cloudEditorAllowed" BOOLEAN NOT NULL DEFAULT 1,
      "authProvider" TEXT,
      "githubId" TEXT UNIQUE,
      "githubUsername" TEXT,
      "githubAccessToken" TEXT,
      "githubAvatarUrl" TEXT,
      "googleId" TEXT UNIQUE,
      "googleAvatarUrl" TEXT
    );

    -- Project table
    CREATE TABLE IF NOT EXISTS "Project" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "name" TEXT NOT NULL,
      "files" TEXT,
      "thumbnail" TEXT,
      "figmaImports" TEXT,
      "selectedKitId" TEXT,
      "userId" TEXT NOT NULL,
      "teamId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "githubRepoId" TEXT,
      "githubRepoFullName" TEXT,
      "githubBranch" TEXT,
      "githubLastSyncAt" DATETIME,
      "githubLastCommitSha" TEXT,
      "githubSyncEnabled" BOOLEAN NOT NULL DEFAULT 0,
      "githubPagesUrl" TEXT,
      "externalPath" TEXT,
      "claudeCodeSessionId" TEXT,
      "cloudProjectId" TEXT,
      "cloudCommitSha" TEXT,
      "cloudLastSyncAt" DATETIME,
      "isPublished" BOOLEAN NOT NULL DEFAULT 0,
      "publishSlug" TEXT UNIQUE,
      "publishVisibility" TEXT NOT NULL DEFAULT 'public',
      "publishedAt" DATETIME,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );

    -- InviteCode table
    CREATE TABLE IF NOT EXISTS "InviteCode" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "code" TEXT NOT NULL UNIQUE,
      "createdBy" TEXT NOT NULL,
      "usedBy" TEXT,
      "usedAt" DATETIME,
      "expiresAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- ServerConfig table
    CREATE TABLE IF NOT EXISTS "ServerConfig" (
      "key" TEXT PRIMARY KEY NOT NULL,
      "value" TEXT NOT NULL,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- GitHubWebhook table
    CREATE TABLE IF NOT EXISTS "GitHubWebhook" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "projectId" TEXT NOT NULL UNIQUE,
      "webhookId" TEXT NOT NULL,
      "secret" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    );

    -- ChatMessage table
    CREATE TABLE IF NOT EXISTS "ChatMessage" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "projectId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "text" TEXT NOT NULL,
      "files" TEXT,
      "commitSha" TEXT,
      "usage" TEXT,
      "model" TEXT,
      "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    );

    -- Team table
    CREATE TABLE IF NOT EXISTS "Team" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- TeamMember table
    CREATE TABLE IF NOT EXISTS "TeamMember" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "teamId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'member',
      "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );

    -- TeamInvite table
    CREATE TABLE IF NOT EXISTS "TeamInvite" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "teamId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "email" TEXT,
      "role" TEXT NOT NULL DEFAULT 'member',
      "createdBy" TEXT NOT NULL,
      "usedBy" TEXT,
      "usedAt" DATETIME,
      "expiresAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE
    );

    -- Kit table
    CREATE TABLE IF NOT EXISTS "Kit" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "thumbnail" TEXT,
      "isGlobal" BOOLEAN NOT NULL DEFAULT 0,
      "deprecated" BOOLEAN NOT NULL DEFAULT 0,
      "config" TEXT NOT NULL,
      "userId" TEXT,
      "teamId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE
    );

    -- KitLesson table
    CREATE TABLE IF NOT EXISTS "KitLesson" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "kitId" TEXT NOT NULL,
      "component" TEXT,
      "title" TEXT NOT NULL,
      "problem" TEXT NOT NULL,
      "solution" TEXT NOT NULL,
      "codeSnippet" TEXT,
      "tags" TEXT,
      "scope" TEXT NOT NULL DEFAULT 'user',
      "userId" TEXT NOT NULL,
      "projectId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE CASCADE,
      FOREIGN KEY ("userId") REFERENCES "User"("id")
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS "Project_userId_idx" ON "Project"("userId");
    CREATE INDEX IF NOT EXISTS "Project_teamId_idx" ON "Project"("teamId");
    CREATE INDEX IF NOT EXISTS "ChatMessage_projectId_idx" ON "ChatMessage"("projectId");
    CREATE UNIQUE INDEX IF NOT EXISTS "User_githubId_key" ON "User"("githubId");
    CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");
    CREATE UNIQUE INDEX IF NOT EXISTS "GitHubWebhook_projectId_key" ON "GitHubWebhook"("projectId");
    CREATE UNIQUE INDEX IF NOT EXISTS "Team_slug_key" ON "Team"("slug");
    CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
    CREATE INDEX IF NOT EXISTS "TeamMember_userId_idx" ON "TeamMember"("userId");
    CREATE UNIQUE INDEX IF NOT EXISTS "TeamInvite_code_key" ON "TeamInvite"("code");
    CREATE INDEX IF NOT EXISTS "TeamInvite_teamId_idx" ON "TeamInvite"("teamId");
    CREATE INDEX IF NOT EXISTS "Kit_userId_idx" ON "Kit"("userId");
    CREATE INDEX IF NOT EXISTS "Kit_teamId_idx" ON "Kit"("teamId");
    CREATE INDEX IF NOT EXISTS "KitLesson_kitId_idx" ON "KitLesson"("kitId");
    CREATE INDEX IF NOT EXISTS "KitLesson_userId_idx" ON "KitLesson"("userId");
  `);
}

// ── Versioned migrations (existing installs) ────────────────────────

/**
 * Runs pending migrations on an existing database.
 * Handles the transition from the old un-versioned schema too:
 * old databases get version 0, and all migrations are idempotent
 * so they're safe to re-run even if the columns already exist.
 *
 * NOTE: Do NOT call createFreshSchema() here — it includes indexes on
 * columns that may not exist until migrations add them.  If a future
 * migration needs to create a new table, include the CREATE TABLE
 * statement inside that migration's `up` function.
 */
function runMigrations(db: Database.Database): void {
  // Ensure ServerConfig exists (needed to read/write schema version)
  tryExec(db, `
    CREATE TABLE IF NOT EXISTS "ServerConfig" (
      "key" TEXT PRIMARY KEY NOT NULL,
      "value" TEXT NOT NULL,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const currentVersion = getSchemaVersion(db);
  if (currentVersion >= LATEST_VERSION) {
    console.log(`[Desktop] Schema is up to date (version ${currentVersion})`);
    return;
  }

  console.log(`[Desktop] Migrating from version ${currentVersion} to ${LATEST_VERSION}...`);

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`[Desktop] Running migration v${migration.version}: ${migration.name}`);
      migration.up(db);
      setSchemaVersion(db, migration.version);
    }
  }

  console.log(`[Desktop] Migrations complete (now at version ${LATEST_VERSION})`);
}

// ── Version helpers ─────────────────────────────────────────────────

function getSchemaVersion(db: Database.Database): number {
  try {
    const row = db.prepare(
      'SELECT "value" FROM "ServerConfig" WHERE "key" = ?'
    ).get('schema_version') as { value: string } | undefined;
    return row ? parseInt(row.value, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare(`
    INSERT INTO "ServerConfig" ("key", "value", "updatedAt")
    VALUES ('schema_version', ?, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = CURRENT_TIMESTAMP
  `).run(String(version));
}

// ── Migration helpers ───────────────────────────────────────────────

function addColumn(db: Database.Database, table: string, column: string, type: string): void {
  try {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
  } catch {
    // Column already exists — ignore
  }
}

function tryExec(db: Database.Database, sql: string): void {
  try {
    db.exec(sql);
  } catch {
    // Statement failed (e.g. index on missing column) — ignore
  }
}

// ── Local user ──────────────────────────────────────────────────────

/**
 * Ensures a local user exists for desktop auto-login.
 * Creates the user on first launch, returns existing user otherwise.
 */
function ensureLocalUser(db: Database.Database): LocalUserInfo {
  const LOCAL_USER_EMAIL = 'local@adorable.desktop';

  // Check if local user exists
  const existingUser = db.prepare(
    'SELECT id, email FROM User WHERE email = ?'
  ).get(LOCAL_USER_EMAIL) as LocalUserInfo | undefined;

  if (existingUser) {
    return existingUser;
  }

  // Create local user with random password (never used - auth is via pre-generated JWT)
  const userId = crypto.randomUUID();
  const password = crypto.randomBytes(32).toString('hex');
  const hashedPassword = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  console.log('[Desktop] Creating local user for auto-login...');

  db.prepare(`
    INSERT INTO User (id, email, password, name, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, LOCAL_USER_EMAIL, hashedPassword, 'Local User', now, now);

  return { id: userId, email: LOCAL_USER_EMAIL };
}
