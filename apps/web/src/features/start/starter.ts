import { useSyncExternalStore } from "react";
import type { WorldImportResult } from "@open-cinema/contracts";
import { reloadElements } from "@/features/elements/store";
import { startSession } from "@/features/elements/generate";
import {
  refreshLibrary,
  uploadFiles,
  type MediaItem,
} from "@/features/library";
import { uploadWorldMedia } from "@/features/world/import";
import { importMyWorld } from "@/server/world";
import {
  openStarterWorld,
  SAMPLE_TAKE,
  starterMediaUrl,
} from "./starter-world";

/**
 * Bringing in the starter world, shared by every place that offers it, so
 * leaving the page mid-import keeps the progress and nothing runs twice.
 */
export type StarterState =
  | { phase: "idle"; error: string | null }
  | { phase: "bringing"; sent: number; total: number; step: string }
  | { phase: "done"; result: WorldImportResult };

let state: StarterState = { phase: "idle", error: null };
const listeners = new Set<() => void>();
function emit(next: StarterState) {
  state = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useStarter(): StarterState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export async function bringStarterWorld(signedOut: boolean) {
  if (state.phase === "bringing") return;
  try {
    emit({ phase: "bringing", sent: 0, total: 1, step: "Starting" });
    if (signedOut) {
      await startSession();
      await refreshLibrary();
    }
    const world = await openStarterWorld();
    const total = world.bytes;
    const step = "Bringing in pictures and takes";
    emit({ phase: "bringing", sent: 0, total, step });
    const media = await uploadWorldMedia(
      world,
      (sent) => emit({ phase: "bringing", sent, total, step }),
      new AbortController().signal,
    );
    emit({
      phase: "bringing",
      sent: total,
      total,
      step: "Setting up Cal, the mill and the lantern",
    });
    const result = await importMyWorld({
      data: { manifest: world.raw, media },
    });
    await Promise.all([reloadElements(), refreshLibrary()]);
    emit({ phase: "done", result });
  } catch (error) {
    emit({
      phase: "idle",
      error:
        error instanceof Error && error.message
          ? error.message
          : "The Tide Mill could not be brought in. Try again.",
    });
  }
}

/** Puts the sample take in the Library; resolves to it, or null. */
export async function bringSampleTake(
  signedOut: boolean,
): Promise<MediaItem | null> {
  if (signedOut) {
    await startSession();
    await refreshLibrary();
  }
  const response = await fetch(starterMediaUrl(SAMPLE_TAKE.path));
  if (!response.ok) return null;
  const file = new File([await response.blob()], SAMPLE_TAKE.filename, {
    type: "video/mp4",
  });
  const [item] = await uploadFiles([file]);
  return item ?? null;
}
