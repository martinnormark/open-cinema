/**
 * Development-only relay for environments whose egress proxy injects Comfy
 * credentials (for example a Claude Code cloud container). workerd connects
 * directly and bypasses HTTPS_PROXY, so local Workers cannot reach Router with
 * proxy-injected auth. Run this, then set COMFY_BASE_URL in apps/jobs/.dev.vars.
 *
 *   bun scripts/comfy-relay.ts            # listens on 127.0.0.1:8790
 *   COMFY_RELAY_PORT=9000 bun scripts/comfy-relay.ts
 *
 * The relay binds to loopback only, forwards to https://api.comfy.org through
 * HTTPS_PROXY, and drops the caller's Authorization header so only the proxy's
 * credential is used. Never run it on a shared or public interface.
 */
const UPSTREAM = "https://api.comfy.org";
const port = Number(process.env.COMFY_RELAY_PORT ?? 8790);
const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (!proxy) {
  console.error("HTTPS_PROXY is not set; this relay has nothing to add.");
  process.exit(1);
}
const DROP = new Set([
  "host",
  "authorization",
  "connection",
  "content-length",
  "accept-encoding",
]);

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const target = `${UPSTREAM}${url.pathname}${url.search}`;
    const headers = new Headers();
    for (const [name, value] of request.headers)
      if (!DROP.has(name.toLowerCase())) headers.set(name, value);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      proxy,
      redirect: "manual",
    });
    console.log(`${request.method} ${url.pathname} → ${upstream.status}`);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
});
console.log(`Comfy relay on http://127.0.0.1:${port} → ${UPSTREAM} via proxy`);
