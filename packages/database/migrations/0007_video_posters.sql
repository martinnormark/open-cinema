-- Poster stills for videos, made with the media container's ffmpeg when an
-- upload or a generated result is saved (or on first view for older ones), so
-- every video shows a real frame whatever codecs the browser can decode.
-- Generated outputs also keep the size and length measured while making it.
ALTER TABLE "MediaAsset" ADD COLUMN "posterKey" TEXT;
ALTER TABLE "JobOutput" ADD COLUMN "posterKey" TEXT;
ALTER TABLE "JobOutput" ADD COLUMN "width" INTEGER;
ALTER TABLE "JobOutput" ADD COLUMN "height" INTEGER;
ALTER TABLE "JobOutput" ADD COLUMN "durationMs" INTEGER;
