-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "graph" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workflow_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationJob" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobOutput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "providerAssetId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    CONSTRAINT "JobOutput_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Workflow_ownerId_createdAt_idx" ON "Workflow"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_ownerId_createdAt_idx" ON "GenerationJob"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_ownerId_state_idx" ON "GenerationJob"("ownerId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_ownerId_idempotencyKey_key" ON "GenerationJob"("ownerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "JobOutput_jobId_idx" ON "JobOutput"("jobId");
