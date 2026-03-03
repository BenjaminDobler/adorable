-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "files" TEXT,
    "thumbnail" TEXT,
    "figmaImports" TEXT,
    "selectedKitId" TEXT,
    "userId" TEXT,
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "githubRepoId" TEXT,
    "githubRepoFullName" TEXT,
    "githubBranch" TEXT,
    "githubLastSyncAt" DATETIME,
    "githubLastCommitSha" TEXT,
    "githubSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "githubPagesUrl" TEXT,
    "cloudProjectId" TEXT,
    "cloudCommitSha" TEXT,
    "cloudLastSyncAt" DATETIME,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishSlug" TEXT,
    "publishVisibility" TEXT NOT NULL DEFAULT 'public',
    "publishedAt" DATETIME,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("cloudCommitSha", "cloudLastSyncAt", "cloudProjectId", "createdAt", "figmaImports", "files", "githubBranch", "githubLastCommitSha", "githubLastSyncAt", "githubPagesUrl", "githubRepoFullName", "githubRepoId", "githubSyncEnabled", "id", "name", "selectedKitId", "teamId", "thumbnail", "updatedAt", "userId") SELECT "cloudCommitSha", "cloudLastSyncAt", "cloudProjectId", "createdAt", "figmaImports", "files", "githubBranch", "githubLastCommitSha", "githubLastSyncAt", "githubPagesUrl", "githubRepoFullName", "githubRepoId", "githubSyncEnabled", "id", "name", "selectedKitId", "teamId", "thumbnail", "updatedAt", "userId" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_publishSlug_key" ON "Project"("publishSlug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
