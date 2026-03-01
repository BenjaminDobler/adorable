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

  const dbExists = fs.existsSync(dbPath);
  let localUser: LocalUserInfo;

  try {
    const db = new Database(dbPath);

    if (!dbExists) {
      console.log('[Desktop] Fresh install - creating database schema...');
      createSchema(db);
    } else {
      console.log('[Desktop] Existing database - checking schema...');
      // Ensure all tables exist (for upgrades)
      ensureSchema(db);
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

/**
 * Creates the full database schema matching the Prisma schema.
 */
function createSchema(db: Database.Database): void {
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
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "githubId" TEXT UNIQUE,
      "githubUsername" TEXT,
      "githubAccessToken" TEXT,
      "githubAvatarUrl" TEXT
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
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "githubRepoId" TEXT,
      "githubRepoFullName" TEXT,
      "githubBranch" TEXT,
      "githubLastSyncAt" DATETIME,
      "githubLastCommitSha" TEXT,
      "githubSyncEnabled" BOOLEAN NOT NULL DEFAULT 0,
      "githubPagesUrl" TEXT,
      "cloudProjectId" TEXT,
      "cloudCommitSha" TEXT,
      "cloudLastSyncAt" DATETIME,
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
      "isBuiltIn" BOOLEAN NOT NULL DEFAULT 0,
      "config" TEXT NOT NULL,
      "userId" TEXT,
      "teamId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS "Project_userId_idx" ON "Project"("userId");
    CREATE INDEX IF NOT EXISTS "ChatMessage_projectId_idx" ON "ChatMessage"("projectId");
    CREATE UNIQUE INDEX IF NOT EXISTS "User_githubId_key" ON "User"("githubId");
    CREATE UNIQUE INDEX IF NOT EXISTS "GitHubWebhook_projectId_key" ON "GitHubWebhook"("projectId");
    CREATE UNIQUE INDEX IF NOT EXISTS "Team_slug_key" ON "Team"("slug");
    CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
    CREATE UNIQUE INDEX IF NOT EXISTS "TeamInvite_code_key" ON "TeamInvite"("code");
  `);
}

/**
 * Ensures all required tables exist (for database upgrades).
 */
function ensureSchema(db: Database.Database): void {
  // Ensure all tables exist
  createSchema(db); // Uses IF NOT EXISTS, safe to re-run

  // Add missing columns (ALTER TABLE is idempotent via try/catch)
  const migrations: { table: string; column: string; type: string }[] = [
    { table: 'User', column: 'role', type: "TEXT NOT NULL DEFAULT 'user'" },
    { table: 'User', column: 'isActive', type: 'BOOLEAN NOT NULL DEFAULT 1' },
    { table: 'User', column: 'emailVerified', type: 'BOOLEAN NOT NULL DEFAULT 0' },
    { table: 'User', column: 'emailVerificationToken', type: 'TEXT' },
    { table: 'User', column: 'githubId', type: 'TEXT UNIQUE' },
    { table: 'User', column: 'githubUsername', type: 'TEXT' },
    { table: 'User', column: 'githubAccessToken', type: 'TEXT' },
    { table: 'User', column: 'githubAvatarUrl', type: 'TEXT' },
    { table: 'Project', column: 'githubRepoId', type: 'TEXT' },
    { table: 'Project', column: 'githubRepoFullName', type: 'TEXT' },
    { table: 'Project', column: 'githubBranch', type: 'TEXT' },
    { table: 'Project', column: 'githubLastSyncAt', type: 'DATETIME' },
    { table: 'Project', column: 'githubLastCommitSha', type: 'TEXT' },
    { table: 'Project', column: 'githubSyncEnabled', type: 'BOOLEAN NOT NULL DEFAULT 0' },
    { table: 'Project', column: 'githubPagesUrl', type: 'TEXT' },
    { table: 'Project', column: 'selectedKitId', type: 'TEXT' },
    { table: 'ChatMessage', column: 'commitSha', type: 'TEXT' },
    { table: 'ChatMessage', column: 'model', type: 'TEXT' },
    { table: 'Project', column: 'cloudProjectId', type: 'TEXT' },
    { table: 'Project', column: 'cloudCommitSha', type: 'TEXT' },
    { table: 'Project', column: 'cloudLastSyncAt', type: 'DATETIME' },
    { table: 'Project', column: 'teamId', type: 'TEXT' },
  ];

  for (const { table, column, type } of migrations) {
    try {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
      console.log(`[Desktop] Added column ${table}.${column}`);
    } catch {
      // Column already exists, ignore
    }
  }
}

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
