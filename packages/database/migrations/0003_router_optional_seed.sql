-- Router FLUX 3 Image chooses its own seed. Preserve legacy workflow seeds.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
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
    "seed" INTEGER,
    "progress" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GenerationJob" ("createdAt", "error", "id", "idempotencyKey", "inputsSnapshot", "model", "ownerId", "progress", "prompt", "providerJobId", "requestHash", "seed", "state", "updatedAt", "version", "workflowSnapshot") SELECT "createdAt", "error", "id", "idempotencyKey", "inputsSnapshot", "model", "ownerId", "progress", "prompt", "providerJobId", "requestHash", "seed", "state", "updatedAt", "version", "workflowSnapshot" FROM "GenerationJob";
DROP TABLE "GenerationJob";
ALTER TABLE "new_GenerationJob" RENAME TO "GenerationJob";
CREATE INDEX "GenerationJob_ownerId_createdAt_idx" ON "GenerationJob"("ownerId", "createdAt");
CREATE INDEX "GenerationJob_ownerId_state_idx" ON "GenerationJob"("ownerId", "state");
CREATE UNIQUE INDEX "GenerationJob_ownerId_idempotencyKey_key" ON "GenerationJob"("ownerId", "idempotencyKey");
PRAGMA defer_foreign_keys=OFF;
