import { AsyncLocalStorage } from "node:async_hooks";

/** The HTTP adapter owns upgrading; route handlers authenticate before calling it. */
export interface StatusSocket {
  expiresAt: number;
  send(data: string): unknown;
  close(code: number, reason: string): unknown;
}
export interface SocketConnection {
  open(socket: StatusSocket): Promise<void>;
  close(socket: StatusSocket): void;
}
export interface UpgradeContext {
  upgrade(connection: SocketConnection, expiresAt: number): boolean;
  upgraded: boolean;
}
export const upgrades = new AsyncLocalStorage<UpgradeContext>();
export function upgradeConnection(
  connection: SocketConnection,
  expiresAt: number,
): Response {
  const context = upgrades.getStore();
  if (!context || !context.upgrade(connection, expiresAt))
    return new Response("WebSocket upgrade required", { status: 426 });
  context.upgraded = true;
  return new Response(null, { status: 204 });
}
