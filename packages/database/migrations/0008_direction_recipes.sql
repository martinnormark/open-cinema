-- Phase 2: a project's shared look, state kinds so states can combine one per
-- kind, and saved creative recipes with their version history.
ALTER TABLE "Project" ADD COLUMN "look" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ElementState" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'other';

CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "spec" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "coverType" TEXT,
    "coverAssetId" TEXT,
    "coverJobId" TEXT,
    "coverOutputId" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recipe_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Recipe_ownerId_updatedAt_idx" ON "Recipe"("ownerId", "updatedAt");
