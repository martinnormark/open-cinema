import { useSyncExternalStore } from "react";
import type {
  CreativeElement,
  ElementReference,
  ElementState,
  ElementType,
  ReferenceSource,
  ReferenceStatus,
} from "./model";
import { toHandle, toStateHandle } from "./model";

export interface NewReference {
  source: ReferenceSource;
  view: string | null;
  stateId: string | null;
  status?: ReferenceStatus;
}

/** The persistence boundary for Elements. The pages only talk to this interface. */
export interface ElementsRepository {
  list(): Promise<CreativeElement[]>;
  save(element: CreativeElement): Promise<void>;
  remove(id: string): Promise<void>;
  subscribeExternal?(onChange: () => void): () => void;
}

const STORAGE_KEY = "open-cinema:elements:v1";

/** Interim adapter: keeps Elements in this browser until D1 persistence lands. */
export const browserRepository: ElementsRepository = {
  async list() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as CreativeElement[]) : [];
    } catch {
      return [];
    }
  },
  async save(element) {
    const all = await this.list();
    const index = all.findIndex((e) => e.id === element.id);
    if (index === -1) all.push(element);
    else all[index] = element;
    write(all);
  },
  async remove(id) {
    write((await this.list()).filter((e) => e.id !== id));
  },
  subscribeExternal(onChange) {
    const listener = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) onChange();
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  },
};
function write(elements: CreativeElement[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(elements));
  } catch {
    throw new Error(
      "This browser is out of space for references. Remove some uploads and try again.",
    );
  }
}

export interface ElementsState {
  status: "loading" | "ready" | "error";
  elements: CreativeElement[];
}
const initial: ElementsState = { status: "loading", elements: [] };
let state = initial;
let repository: ElementsRepository = browserRepository;
const listeners = new Set<() => void>();
let unsubscribeExternal: (() => void) | undefined;

function emit(next: ElementsState) {
  state = next;
  for (const listener of listeners) listener();
}
async function load() {
  try {
    const elements = await repository.list();
    emit({ status: "ready", elements: sortElements(elements) });
  } catch {
    emit({ ...state, status: "error" });
  }
}
function sortElements(elements: CreativeElement[]) {
  return [...elements].sort((a, b) => a.name.localeCompare(b.name));
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void load();
    unsubscribeExternal = repository.subscribeExternal?.(() => void load());
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) unsubscribeExternal?.();
  };
}
export function useElements(): ElementsState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
}
export function useElement(id: string) {
  const { status, elements } = useElements();
  return { status, element: elements.find((e) => e.id === id) ?? null };
}
/** Swap persistence, e.g. to the D1-backed server adapter. */
export function setElementsRepository(next: ElementsRepository) {
  if (repository === next) return;
  repository = next;
  if (listeners.size) void load();
}

function now() {
  return new Date().toISOString();
}
async function commit(element: CreativeElement) {
  const next = { ...element, updatedAt: now() };
  const previous = state.elements;
  emit({
    status: "ready",
    elements: sortElements(
      previous.some((e) => e.id === next.id)
        ? previous.map((e) => (e.id === next.id ? next : e))
        : [...previous, next],
    ),
  });
  try {
    await repository.save(next);
  } catch (error) {
    emit({ ...state, elements: previous });
    throw error;
  }
  return next;
}
function current(id: string) {
  const element = state.elements.find((e) => e.id === id);
  if (!element) throw new Error("This Element no longer exists.");
  return element;
}

/** Names must stay unique so `@` mentions resolve to exactly one Element. */
export function handleTaken(handle: string, exceptId?: string) {
  const key = handle.toLowerCase();
  return state.elements.some(
    (e) => e.id !== exceptId && e.handle.toLowerCase() === key,
  );
}

export async function createElement(input: {
  type: ElementType;
  name: string;
  description: string;
  references: NewReference[];
}) {
  const handle = toHandle(input.name);
  if (!handle)
    throw new Error("Give the Element a name with letters or numbers.");
  if (handleTaken(handle))
    throw new Error(
      `@${handle} is already in your Elements. Choose another name.`,
    );
  const timestamp = now();
  const element: CreativeElement = {
    id: crypto.randomUUID(),
    type: input.type,
    name: input.name.trim(),
    handle,
    description: input.description.trim(),
    references: input.references.map(toReference),
    states: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return commit(element);
}
function toReference(input: NewReference): ElementReference {
  return {
    id: crypto.randomUUID(),
    stateId: input.stateId,
    status: input.status ?? "exploration",
    view: input.view,
    source: input.source,
    createdAt: now(),
  };
}

export async function updateIdentity(
  id: string,
  patch: { name?: string; description?: string },
) {
  const element = current(id);
  const name = patch.name?.trim() ?? element.name;
  const handle = toHandle(name);
  if (!handle)
    throw new Error("Give the Element a name with letters or numbers.");
  if (handleTaken(handle, id))
    throw new Error(
      `@${handle} is already in your Elements. Choose another name.`,
    );
  return commit({
    ...element,
    name,
    handle,
    description: patch.description?.trim() ?? element.description,
  });
}
export async function addReferences(id: string, references: NewReference[]) {
  const element = current(id);
  return commit({
    ...element,
    references: [...references.map(toReference), ...element.references],
  });
}
export async function updateReference(
  id: string,
  referenceId: string,
  patch: Partial<Pick<ElementReference, "status" | "view">>,
) {
  const element = current(id);
  return commit({
    ...element,
    references: element.references.map((r) =>
      r.id === referenceId ? { ...r, ...patch } : r,
    ),
  });
}
export async function removeReference(id: string, referenceId: string) {
  const element = current(id);
  return commit({
    ...element,
    references: element.references.filter((r) => r.id !== referenceId),
  });
}
export async function addState(
  id: string,
  input: { name: string; description: string },
): Promise<ElementState> {
  const element = current(id);
  const handle = toStateHandle(input.name);
  if (!handle) throw new Error("Name the state with letters or numbers.");
  if (element.states.some((s) => s.handle === handle))
    throw new Error(`@${element.handle}:${handle} already exists.`);
  const created: ElementState = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    handle,
    description: input.description.trim(),
    createdAt: now(),
  };
  await commit({ ...element, states: [...element.states, created] });
  return created;
}
export async function removeState(id: string, stateId: string) {
  const element = current(id);
  return commit({
    ...element,
    states: element.states.filter((s) => s.id !== stateId),
    references: element.references.filter((r) => r.stateId !== stateId),
  });
}
export async function deleteElement(id: string) {
  const previous = state.elements;
  emit({ ...state, elements: previous.filter((e) => e.id !== id) });
  try {
    await repository.remove(id);
  } catch (error) {
    emit({ ...state, elements: previous });
    throw error;
  }
}
