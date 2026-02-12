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
      "files" TEXT NOT NULL,
      "thumbnail" TEXT,
      "figmaImports" TEXT,
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
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
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
      "usage" TEXT,
      "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS "Project_userId_idx" ON "Project"("userId");
    CREATE INDEX IF NOT EXISTS "ChatMessage_projectId_idx" ON "ChatMessage"("projectId");
    CREATE UNIQUE INDEX IF NOT EXISTS "User_githubId_key" ON "User"("githubId");
    CREATE UNIQUE INDEX IF NOT EXISTS "GitHubWebhook_projectId_key" ON "GitHubWebhook"("projectId");
  `);
}

/**
 * Ensures all required tables exist (for database upgrades).
 */
function ensureSchema(db: Database.Database): void {
  // Check if tables exist and create missing ones
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const tableNames = new Set(tables.map(t => t.name));

  if (!tableNames.has('User') || !tableNames.has('Project') || !tableNames.has('ChatMessage') || !tableNames.has('McpServer')) {
    console.log('[Desktop] Missing tables detected, creating schema...');
    createSchema(db);
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
