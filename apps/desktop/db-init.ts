import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import Database from 'better-sqlite3';

/**
 * Initializes the SQLite database for the desktop app.
 * Creates the database schema directly using SQL statements.
 * This avoids runtime dependencies on Prisma CLI.
 */
export async function initializeDatabase(): Promise<string> {
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

    db.close();
    console.log('[Desktop] Database initialized successfully');
  } catch (error: any) {
    console.error('[Desktop] Database initialization failed:', error.message);
    throw error;
  }

  return databaseUrl;
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
