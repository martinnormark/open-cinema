import type {
  ImageAspectRatio,
  Look,
  ShotDirection,
} from "@open-cinema/contracts";

/** What another page hands the studio to start from, e.g. an applied recipe. */
export interface StudioDraft {
  prompt: string;
  medium: "image" | "video";
  overrides: Look;
  shot: ShotDirection;
  aspectRatio?: ImageAspectRatio;
  durationSeconds?: number;
  recipe?: { id: string; version: number; name: string };
}

let pending: { draft: StudioDraft; takenAt: number | null } | null = null;

export function openInStudio(draft: StudioDraft) {
  pending = { draft, takenAt: null };
}

/**
 * The draft for the studio being mounted. It is handed out once: repeated
 * reads during the same mount (StrictMode calls state initializers twice)
 * get the same draft, and a later visit to the studio starts clean.
 */
export function takeStudioDraft(): StudioDraft | null {
  if (!pending) return null;
  const now = Date.now();
  if (pending.takenAt === null) pending.takenAt = now;
  if (now - pending.takenAt > 1000) {
    pending = null;
    return null;
  }
  return pending.draft;
}
