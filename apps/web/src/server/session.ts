import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";

export interface Session {
  userId: string;
  expiresAt: number;
}
const COOKIE = "open-cinema-local";
function localConfiguration() {
  const url = new URL(getRequest().url);
  if (
    String(env.LOCAL_MVP_ENABLED) !== "true" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !env.LOCAL_SESSION_SECRET ||
    env.LOCAL_SESSION_SECRET.length < 32
  ) {
    throw new Response(
      "Account authentication is not configured. The MVP session is local-only.",
      { status: 401 },
    );
  }
  return env.LOCAL_SESSION_SECRET;
}
async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function requireSession(): Promise<Session> {
  const secret = localConfiguration();
  const [payload, signature] = (getCookie(COOKIE) ?? "").split(".");
  try {
    if (!payload || !signature) throw new Error();
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
      new TextEncoder().encode(payload),
    );
    const session = JSON.parse(atob(payload)) as Session;
    if (
      !valid ||
      typeof session.userId !== "string" ||
      !session.userId.startsWith("local-") ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Date.now()
    )
      throw new Error();
    return session;
  } catch {
    throw new Response("Start a local test session from Studio.", {
      status: 401,
    });
  }
}
/** Explicit POST setup; never accepts a user ID from the browser. */
export async function startLocalSession(): Promise<Session> {
  const secret = localConfiguration();
  try {
    return await requireSession();
  } catch {
    /* Expired/missing cookie: create a fresh local identity. */
  }
  const session: Session = {
    userId: `local-${crypto.randomUUID()}`,
    expiresAt: Date.now() + 24 * 60 * 60_000,
  };
  const payload = btoa(JSON.stringify(session));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await signingKey(secret),
      new TextEncoder().encode(payload),
    ),
  );
  setCookie(COOKIE, `${payload}.${btoa(String.fromCharCode(...signature))}`, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 86400,
    secure: new URL(getRequest().url).protocol === "https:",
  });
  return session;
}
export function requireSameOrigin() {
  const request = getRequest();
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    throw new Response("Forbidden", { status: 403 });
}
