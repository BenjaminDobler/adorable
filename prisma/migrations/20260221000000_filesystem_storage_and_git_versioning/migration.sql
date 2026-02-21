-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Recreate Project table with optional files column
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "files" TEXT,
    "thumbnail" TEXT,
    "figmaImports" TEXT,
    "selectedKitId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "githubRepoId" TEXT,
    "githubRepoFullName" TEXT,
    "githubBranch" TEXT,
    "githubLastSyncAt" DATETIME,
    "githubLastCommitSha" TEXT,
    "githubSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "githubPagesUrl" TEXT,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("id", "name", "files", "thumbnail", "figmaImports", "selectedKitId", "userId", "createdAt", "updatedAt", "githubRepoId", "githubRepoFullName", "githubBranch", "githubLastSyncAt", "githubLastCommitSha", "githubSyncEnabled", "githubPagesUrl") SELECT "id", "name", "files", "thumbnail", "figmaImports", "selectedKitId", "userId", "createdAt", "updatedAt", "githubRepoId", "githubRepoFullName", "githubBranch", "githubLastSyncAt", "githubLastCommitSha", "githubSyncEnabled", "githubPagesUrl" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";

-- Recreate ChatMessage table with commitSha column
CREATE TABLE "new_ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "files" TEXT,
    "commitSha" TEXT,
    "usage" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChatMessage" ("id", "projectId", "role", "text", "files", "usage", "timestamp") SELECT "id", "projectId", "role", "text", "files", "usage", "timestamp" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
