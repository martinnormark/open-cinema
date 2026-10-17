-- Sequences: an idea developed into ordered shots, each with keyframe and
-- motion takes that are approved per shot. Generated with prisma migrate diff.
-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "idea" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sequence_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sequence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequenceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "beat" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL DEFAULT '',
    "framing" TEXT NOT NULL,
    "camera" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "continuity" TEXT NOT NULL DEFAULT 'fresh',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shot_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShotTake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "jobId" TEXT,
    "assetType" TEXT,
    "mediaAssetId" TEXT,
    "assetJobId" TEXT,
    "outputId" TEXT,
    "prompt" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShotTake_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Sequence_ownerId_updatedAt_idx" ON "Sequence"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Sequence_projectId_idx" ON "Sequence"("projectId");

-- CreateIndex
CREATE INDEX "Shot_sequenceId_sortOrder_idx" ON "Shot"("sequenceId", "sortOrder");

-- CreateIndex
CREATE INDEX "ShotTake_shotId_role_idx" ON "ShotTake"("shotId", "role");

-- CreateIndex
CREATE INDEX "ShotTake_jobId_idx" ON "ShotTake"("jobId");

