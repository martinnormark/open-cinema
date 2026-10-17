-- Shots carry their staging in words: who stands where, which side the
-- camera is on, what the light does. References carry the picture.
ALTER TABLE "Shot" ADD COLUMN "staging" TEXT NOT NULL DEFAULT '';
