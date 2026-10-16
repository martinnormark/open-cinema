import { useSyncExternalStore } from "react";
import { jobEventSchema, type JobSnapshot } from "@open-cinema/contracts";
import { getJobSnapshot } from "@/server/functions";
export interface GenerationState {
  snapshot: JobSnapshot | null;
  connection: "connecting" | "live" | "reconnecting" | "unavailable";
}
const initial: GenerationState = { snapshot: null, connection: "connecting" };
let state = initial;
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let fallback: ReturnType<typeof setInterval> | undefined;
let attempt = 0;
let epoch = 0;
function update(next: GenerationState) {
  state = next;
  for (const listener of listeners) listener();
}
export function acceptSnapshot(snapshot: JobSnapshot) {
  if (state.snapshot && snapshot.sequence < state.snapshot.sequence) return;
  update({ ...state, snapshot });
}
async function refresh(currentEpoch: number): Promise<boolean> {
  try {
    const snapshot = await getJobSnapshot();
    if (currentEpoch === epoch && snapshot) acceptSnapshot(snapshot);
    return !!snapshot;
  } catch {
    if (currentEpoch === epoch) update({ ...state, connection: "unavailable" });
    return false;
  }
}
async function connect() {
  if (!listeners.size) return;
  const currentEpoch = epoch;
  if (
    !(await refresh(currentEpoch)) ||
    currentEpoch !== epoch ||
    !listeners.size
  )
    return;
  const url = new URL("/api/jobs/stream", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(url);
  socket = ws;
  ws.onmessage = (message) => {
    if (currentEpoch !== epoch || socket !== ws) return;
    try {
      const event = jobEventSchema.parse(JSON.parse(String(message.data)));
      // This MVP publishes complete authoritative snapshots. Unknown event shapes reconnect.
      if (event.type !== "snapshot") {
        ws.close();
        return;
      }
      attempt = 0;
      acceptSnapshot(event);
      update({ ...state, connection: "live" });
    } catch {
      ws.close();
    }
  };
  ws.onerror = () => ws.close();
  ws.onclose = () => {
    if (currentEpoch !== epoch || socket !== ws || !listeners.size) return;
    socket = null;
    update({
      ...state,
      connection: state.snapshot ? "reconnecting" : "unavailable",
    });
    retry = setTimeout(
      connect,
      Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)) +
        Math.random() * 500,
    );
  };
}
export function reconnectGeneration() {
  epoch++;
  clearTimeout(retry);
  socket?.close();
  socket = null;
  attempt = 0;
  // A newly created session may have a different owner and a lower sequence.
  update(initial);
  connect();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    connect();
    fallback = setInterval(() => {
      if (state.connection === "reconnecting") void refresh(epoch);
    }, 5000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      epoch++;
      clearTimeout(retry);
      clearInterval(fallback);
      socket?.close();
      socket = null;
    }
  };
}
export function useGeneration() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
}
