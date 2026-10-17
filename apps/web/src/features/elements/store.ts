import { useSyncExternalStore } from "react";
import type {
  AddElementReferenceInput,
  CreateElementInput,
  Element,
  StateKind,
  UpdateElementReferenceInput,
} from "@open-cinema/contracts";
import {
  addMyElementReference,
  createMyElement,
  createMyElementState,
  deleteMyElement,
  deleteMyElementState,
  listMyElements,
  removeMyElementReference,
  updateMyElement,
  updateMyElementReference,
  updateMyElementState,
} from "@/server/elements";
import { toHandle } from "./model";

export interface ElementsState {
  status: "loading" | "ready" | "signed-out" | "error";
  elements: Element[];
}
const initial: ElementsState = { status: "loading", elements: [] };
let state = initial;
let generation = 0;
const listeners = new Set<() => void>();

function emit(next: ElementsState) {
  state = next;
  for (const listener of listeners) listener();
}
function sorted(elements: Element[]) {
  return [...elements].sort((a, b) => a.name.localeCompare(b.name));
}
/** Loads the creator's Elements; call again after a session starts. */
export async function reloadElements() {
  const current = ++generation;
  try {
    const result = await listMyElements();
    if (current !== generation) return;
    emit({
      status: result.signedIn ? "ready" : "signed-out",
      elements: sorted(result.elements),
    });
  } catch {
    if (current === generation) emit({ ...state, status: "error" });
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && state.status !== "ready") void reloadElements();
  return () => listeners.delete(listener);
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

function put(element: Element) {
  // A list request still in flight must not overwrite this confirmed write.
  generation++;
  emit({
    status: "ready",
    elements: sorted([
      ...state.elements.filter((e) => e.id !== element.id),
      element,
    ]),
  });
  return element;
}
function message(error: unknown, fallback: string): Error {
  return new Error(
    error instanceof Error && error.message ? error.message : fallback,
  );
}
async function write(
  run: () => Promise<Element>,
  fallback: string,
): Promise<Element> {
  try {
    return put(await run());
  } catch (error) {
    throw message(error, fallback);
  }
}

/** Mentions resolve by handle, so names must stay unique per creator. */
export function handleTaken(handle: string, exceptId?: string) {
  const key = handle.toLowerCase();
  return state.elements.some(
    (e) => e.id !== exceptId && e.handle.toLowerCase() === key,
  );
}
function duplicate(handle: string) {
  return Promise.reject(
    new Error(`@${handle} is already in your Elements. Choose another name.`),
  );
}

export function createElement(input: CreateElementInput) {
  const handle = toHandle(input.name);
  if (handleTaken(handle)) return duplicate(handle);
  return write(
    () => createMyElement({ data: { ...input, handle } }),
    "The Element could not be created.",
  );
}
export function updateIdentity(
  id: string,
  patch: { name: string; description: string },
) {
  const handle = toHandle(patch.name);
  if (handleTaken(handle, id)) return duplicate(handle);
  return write(
    () => updateMyElement({ data: { id, ...patch, handle } }),
    "The identity could not be saved.",
  );
}
export function addReference(input: AddElementReferenceInput) {
  return write(
    () => addMyElementReference({ data: input }),
    "The reference could not be added.",
  );
}
export function updateReference(input: UpdateElementReferenceInput) {
  return write(
    () => updateMyElementReference({ data: input }),
    "The reference could not be updated.",
  );
}
export function removeReference(id: string) {
  return write(
    () => removeMyElementReference({ data: { id } }),
    "The reference could not be removed.",
  );
}
export function addState(input: {
  elementId: string;
  name: string;
  description: string;
  kind?: StateKind;
}) {
  return write(
    () => createMyElementState({ data: input }),
    "The state could not be added.",
  );
}
export function updateState(input: {
  id: string;
  description?: string;
  kind?: StateKind;
}) {
  return write(
    () => updateMyElementState({ data: input }),
    "The state could not be saved.",
  );
}
export function removeState(id: string) {
  return write(
    () => deleteMyElementState({ data: { id } }),
    "The state could not be removed.",
  );
}
export async function deleteElement(id: string) {
  try {
    await deleteMyElement({ data: { id } });
  } catch (error) {
    throw message(error, "The Element could not be deleted.");
  }
  generation++;
  emit({ ...state, elements: state.elements.filter((e) => e.id !== id) });
}
