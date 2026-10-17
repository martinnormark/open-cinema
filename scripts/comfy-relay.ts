/**
 * Development-only relay for environments whose egress proxy injects Comfy
 * credentials (for example a Claude Code cloud container). workerd connects
 * directly and bypasses HTTPS_PROXY, so local Workers cannot reach Router with
 * proxy-injected auth. Run this, then set COMFY_BASE_URL in apps/jobs/.dev.vars.
 *
 *   bun scripts/comfy-relay.ts            # listens on 127.0.0.1:8790
 *   COMFY_RELAY_PORT=9000 bun scripts/comfy-relay.ts
 *
 * The relay binds to loopback only, forwards to Comfy through HTTPS_PROXY (Comfy
 * Cloud's `/api/...` paths to https://cloud.comfy.org, everything else to Router
 * at https://api.comfy.org), and drops the caller's Authorization and X-API-Key
 * headers so only the proxy's
 * credential is used. Never run it on a shared or public interface.
 */
const ROUTER = "https://api.comfy.org";
const CLOUD = "https://cloud.comfy.org";
const port = Number(process.env.COMFY_RELAY_PORT ?? 8790);
const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (!proxy) {
  console.error("HTTPS_PROXY is not set; this relay has nothing to add.");
  process.exit(1);
}
const DROP = new Set([
  "host",
  "authorization",
  "x-api-key",
  "connection",
  "content-length",
  "accept-encoding",
]);

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const upstream = url.pathname.startsWith("/api/") ? CLOUD : ROUTER;
    const target = `${upstream}${url.pathname}${url.search}`;
    const headers = new Headers();
    for (const [name, value] of request.headers)
      if (!DROP.has(name.toLowerCase())) headers.set(name, value);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();
    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      proxy,
      redirect: "manual",
    });
    console.log(`${request.method} ${target} → ${response.status}`);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  },
});
console.log(
  `Comfy relay on http://127.0.0.1:${port} → ${ROUTER} and ${CLOUD} via proxy`,
);
