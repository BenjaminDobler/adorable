-- CreateIndex
CREATE INDEX "ChatMessage_projectId_idx" ON "ChatMessage"("projectId");

-- CreateIndex
CREATE INDEX "Kit_userId_idx" ON "Kit"("userId");

-- CreateIndex
CREATE INDEX "Kit_teamId_idx" ON "Kit"("teamId");

-- CreateIndex
CREATE INDEX "KitLesson_kitId_idx" ON "KitLesson"("kitId");

-- CreateIndex
CREATE INDEX "KitLesson_userId_idx" ON "KitLesson"("userId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_teamId_idx" ON "Project"("teamId");

-- CreateIndex
CREATE INDEX "TeamInvite_teamId_idx" ON "TeamInvite"("teamId");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
