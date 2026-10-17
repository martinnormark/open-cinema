/**
 * Development override for a loopback relay (scripts/comfy-relay.ts). Anything
 * that is not plain http on 127.0.0.1 or localhost is ignored, so a deployed
 * Worker always sends its key to Comfy itself.
 */
export function loopbackRelay(override: string | undefined): string | null {
  if (!override) return null;
  try {
    const url = new URL(override);
    return url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      url.pathname === "/" &&
      !url.search
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
