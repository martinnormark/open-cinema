import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "./index";

export function passwordIdentity(request: Request): string | null {
  if (!env.BASIC_AUTH_PASSWORD || !env.BASIC_AUTH_USER) return null;
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Basic ")) return null;
  try {
    const value = Buffer.from(authorization.slice(6), "base64").toString(
      "utf8",
    );
    const expected = `${env.BASIC_AUTH_USER}:${env.BASIC_AUTH_PASSWORD}`;
    const hash = (text: string) => createHash("sha256").update(text).digest();
    if (!timingSafeEqual(hash(value), hash(expected))) return null;
    return `account-${createHash("sha256").update(env.BASIC_AUTH_USER).digest("hex")}`;
  } catch {
    return null;
  }
}
export function passwordChallenge() {
  return new Response("Sign in to Open Cinema", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Open Cinema", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
/** The media route verifies its own short-lived signature for provider fetches. */
export function authorizeHttp(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname === "/healthz") return null;
  if (env.AUTH_MODE === "local") {
    if (
      env.LOCAL_MVP_ENABLED !== "true" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      return new Response("Local sessions require a loopback address", {
        status: 403,
      });
    return null;
  }
  if (
    env.AUTH_MODE !== "password" ||
    !env.BASIC_AUTH_PASSWORD ||
    !env.BASIC_AUTH_USER
  )
    return new Response(
      "Configure AUTH_MODE and BASIC_AUTH_PASSWORD before serving this studio",
      { status: 503 },
    );
  if (request.method === "GET" || request.method === "HEAD") {
    if (
      /^\/api\/media\/[^/]+$/.test(url.pathname) &&
      url.searchParams.has("signature")
    )
      return null;
  }
  return passwordIdentity(request) ? null : passwordChallenge();
}
/** Fixed public origin avoids trusting arbitrary forwarded headers from clients. */
export function publicRequest(request: Request) {
  if (!env.APP_ORIGIN) return request;
  const origin = new URL(env.APP_ORIGIN);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error("APP_ORIGIN must be an http(s) origin without a path");
  const incoming = new URL(request.url);
  return new Request(
    new URL(incoming.pathname + incoming.search, origin).href,
    request,
  );
}
