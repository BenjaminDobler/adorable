/*
  Warnings:

  - You are about to drop the column `isBuiltIn` on the `Kit` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Kit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "deprecated" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Kit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Kit_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Kit" ("config", "createdAt", "description", "id", "isGlobal", "name", "teamId", "thumbnail", "updatedAt", "userId") SELECT "config", "createdAt", "description", "id", "isBuiltIn", "name", "teamId", "thumbnail", "updatedAt", "userId" FROM "Kit";
DROP TABLE "Kit";
ALTER TABLE "new_Kit" RENAME TO "Kit";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
