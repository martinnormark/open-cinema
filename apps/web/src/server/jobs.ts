import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";
import type { GenerationCoordinatorApi } from "@open-cinema/contracts";

interface CoordinatorBinding
  extends GenerationCoordinatorApi, Rpc.DurableObjectBranded {}

// Wrangler cannot infer remote DO methods without importing another app's code.
// Keep the shared RPC contract at this one boundary; generated bindings stay intact.
export function getCoordinator(ownerId: string) {
  const namespace =
    env.GENERATION_COORDINATORS as DurableObjectNamespace<CoordinatorBinding>;
  return namespace.getByName(ownerId);
}
