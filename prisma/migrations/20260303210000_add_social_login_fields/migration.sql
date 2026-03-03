-- AlterTable
ALTER TABLE "User" ADD COLUMN "authProvider" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleAvatarUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
