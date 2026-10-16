-- Elements, reference sheets, states, uploaded media, projects, and revisions.
-- Generated with pinned `prisma migrate diff` from the prior schema; the GenerationJob
-- table rebuild was replaced with additive ALTERs to keep history rows untouched.
-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Element" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Element_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Element_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ElementState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "elementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ElementState_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "Element" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ElementReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "elementId" TEXT NOT NULL,
    "stateId" TEXT,
    "assetType" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "jobId" TEXT,
    "outputId" TEXT,
    "status" TEXT NOT NULL,
    "view" TEXT,
    "roles" JSONB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ElementReference_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "Element" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ElementReference_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "ElementState" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "etag" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "fps" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MediaAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "parentRevisionId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceAssetId" TEXT,
    "sourceJobId" TEXT,
    "sourceOutputId" TEXT,
    "resultJobId" TEXT,
    "resultOutputId" TEXT,
    "jobId" TEXT,
    "workflowKind" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Revision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Revision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Additive columns: existing jobs are text-to-image and belong to no project.
ALTER TABLE "GenerationJob" ADD COLUMN "workflowKind" TEXT NOT NULL DEFAULT 'image.flux';
ALTER TABLE "GenerationJob" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "Project_ownerId_updatedAt_idx" ON "Project"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Element_ownerId_type_updatedAt_idx" ON "Element"("ownerId", "type", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Element_ownerId_handle_key" ON "Element"("ownerId", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "ElementState_elementId_name_key" ON "ElementState"("elementId", "name");

-- CreateIndex
CREATE INDEX "ElementReference_elementId_status_idx" ON "ElementReference"("elementId", "status");

-- CreateIndex
CREATE INDEX "ElementReference_stateId_idx" ON "ElementReference"("stateId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_r2Key_key" ON "MediaAsset"("r2Key");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerId_kind_createdAt_idx" ON "MediaAsset"("ownerId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Revision_ownerId_createdAt_idx" ON "Revision"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Revision_jobId_idx" ON "Revision"("jobId");

-- CreateIndex
CREATE INDEX "Revision_sourceAssetId_idx" ON "Revision"("sourceAssetId");

-- CreateIndex
CREATE INDEX "Revision_sourceJobId_sourceOutputId_idx" ON "Revision"("sourceJobId", "sourceOutputId");

