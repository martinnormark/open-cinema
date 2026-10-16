-- Nullable for existing provider-only outputs; upgraded coordinators archive them on activation.
ALTER TABLE "JobOutput" ADD COLUMN "r2Key" TEXT;
ALTER TABLE "JobOutput" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "JobOutput" ADD COLUMN "etag" TEXT;
CREATE UNIQUE INDEX "JobOutput_r2Key_key" ON "JobOutput"("r2Key");
