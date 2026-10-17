-- Container facts measured in the browser at upload: the sample (pixel) aspect
-- ratio, so a non-square clip is conformed before Kling reads it, and whether
-- the clip has a sound track, so "Original audio" is offered only when it does.
ALTER TABLE "MediaAsset" ADD COLUMN "pixelAspect" REAL;
ALTER TABLE "MediaAsset" ADD COLUMN "hasAudio" BOOLEAN;
