-- Projects are gone: drop the Project table and every projectId column.
-- Generated with prisma migrate diff, without its PRAGMA toggles: the runner
-- applies migrations with foreign keys off, so rebuilding Element and
-- Sequence does not cascade into their states, references or shots.
-- DropIndex
DROP INDEX "Project_ownerId_updatedAt_idx";

-- DropTable
DROP TABLE "Project";

-- RedefineTables
CREATE TABLE "new_GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "workflowSnapshot" JSONB NOT NULL,
    "inputsSnapshot" JSONB NOT NULL,
    "providerJobId" TEXT,
    "error" TEXT,
    "prompt" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'FLUX 3 Image Klein',
    "workflowKind" TEXT NOT NULL DEFAULT 'image.flux',
    "seed" INTEGER,
    "progress" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GenerationJob" ("createdAt", "error", "id", "idempotencyKey", "inputsSnapshot", "model", "ownerId", "progress", "prompt", "providerJobId", "requestHash", "seed", "state", "updatedAt", "version", "workflowKind", "workflowSnapshot") SELECT "createdAt", "error", "id", "idempotencyKey", "inputsSnapshot", "model", "ownerId", "progress", "prompt", "providerJobId", "requestHash", "seed", "state", "updatedAt", "version", "workflowKind", "workflowSnapshot" FROM "GenerationJob";
DROP TABLE "GenerationJob";
ALTER TABLE "new_GenerationJob" RENAME TO "GenerationJob";
CREATE INDEX "GenerationJob_ownerId_createdAt_idx" ON "GenerationJob"("ownerId", "createdAt");
CREATE INDEX "GenerationJob_ownerId_state_idx" ON "GenerationJob"("ownerId", "state");
CREATE UNIQUE INDEX "GenerationJob_ownerId_idempotencyKey_key" ON "GenerationJob"("ownerId", "idempotencyKey");
CREATE TABLE "new_Element" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Element_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Element" ("createdAt", "description", "handle", "id", "name", "ownerId", "type", "updatedAt", "version") SELECT "createdAt", "description", "handle", "id", "name", "ownerId", "type", "updatedAt", "version" FROM "Element";
DROP TABLE "Element";
ALTER TABLE "new_Element" RENAME TO "Element";
CREATE INDEX "Element_ownerId_type_updatedAt_idx" ON "Element"("ownerId", "type", "updatedAt");
CREATE UNIQUE INDEX "Element_ownerId_handle_key" ON "Element"("ownerId", "handle");
CREATE TABLE "new_MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
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
    "pixelAspect" REAL,
    "hasAudio" BOOLEAN,
    "posterKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MediaAsset" ("createdAt", "durationMs", "etag", "filename", "fps", "hasAudio", "height", "id", "kind", "mediaType", "ownerId", "pixelAspect", "posterKey", "r2Key", "sizeBytes", "status", "updatedAt", "width") SELECT "createdAt", "durationMs", "etag", "filename", "fps", "hasAudio", "height", "id", "kind", "mediaType", "ownerId", "pixelAspect", "posterKey", "r2Key", "sizeBytes", "status", "updatedAt", "width" FROM "MediaAsset";
DROP TABLE "MediaAsset";
ALTER TABLE "new_MediaAsset" RENAME TO "MediaAsset";
CREATE UNIQUE INDEX "MediaAsset_r2Key_key" ON "MediaAsset"("r2Key");
CREATE INDEX "MediaAsset_ownerId_kind_createdAt_idx" ON "MediaAsset"("ownerId", "kind", "createdAt");
CREATE TABLE "new_Revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
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
    CONSTRAINT "Revision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Revision" ("createdAt", "id", "intent", "jobId", "ownerId", "parentRevisionId", "resultJobId", "resultOutputId", "sourceAssetId", "sourceJobId", "sourceOutputId", "sourceType", "status", "updatedAt", "workflowKind") SELECT "createdAt", "id", "intent", "jobId", "ownerId", "parentRevisionId", "resultJobId", "resultOutputId", "sourceAssetId", "sourceJobId", "sourceOutputId", "sourceType", "status", "updatedAt", "workflowKind" FROM "Revision";
DROP TABLE "Revision";
ALTER TABLE "new_Revision" RENAME TO "Revision";
CREATE INDEX "Revision_ownerId_createdAt_idx" ON "Revision"("ownerId", "createdAt");
CREATE INDEX "Revision_jobId_idx" ON "Revision"("jobId");
CREATE INDEX "Revision_sourceAssetId_idx" ON "Revision"("sourceAssetId");
CREATE INDEX "Revision_sourceJobId_sourceOutputId_idx" ON "Revision"("sourceJobId", "sourceOutputId");
CREATE TABLE "new_Sequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "idea" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sequence_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Sequence" ("createdAt", "id", "idea", "ownerId", "title", "updatedAt") SELECT "createdAt", "id", "idea", "ownerId", "title", "updatedAt" FROM "Sequence";
DROP TABLE "Sequence";
ALTER TABLE "new_Sequence" RENAME TO "Sequence";
CREATE INDEX "Sequence_ownerId_updatedAt_idx" ON "Sequence"("ownerId", "updatedAt");

