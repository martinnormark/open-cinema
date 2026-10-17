import { useSyncExternalStore } from "react";
import type { Project } from "@open-cinema/contracts";
import { getProjects } from "@/server/revisions";

/**
 * The creator's projects for the studio, loaded once per page and refreshed
 * after a look changes, plus the project new shots are filed under. The
 * current project is remembered per browser.
 */
interface ProjectsState {
  status: "loading" | "ready" | "signed-out" | "error";
  projects: Project[];
  currentId: string | null;
}

const KEY = "open-cinema:studio-project";
const initial: ProjectsState = {
  status: "loading",
  projects: [],
  currentId: null,
};
let state = initial;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: ProjectsState) {
  state = next;
  for (const listener of listeners) listener();
}

function remembered(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function reloadProjects() {
  loading = getProjects()
    .then((result) => {
      const wanted = state.currentId ?? remembered();
      emit({
        status: result.signedIn ? "ready" : "signed-out",
        projects: result.projects,
        currentId: result.projects.some((p) => p.id === wanted) ? wanted : null,
      });
    })
    .catch(() => emit({ ...state, status: "error" }));
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loading) void reloadProjects();
  return () => listeners.delete(listener);
}

export function useProjects() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
}

export function setCurrentProject(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // Remembering is a convenience; the choice still applies to this page.
  }
  emit({ ...state, currentId: id });
}

/** Replaces one project after its look was saved elsewhere in the app. */
export function acceptProject(project: Project) {
  emit({
    ...state,
    projects: state.projects.map((p) =>
      p.id === project.id ? { ...p, ...project } : p,
    ),
  });
}
