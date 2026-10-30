import "@tanstack/react-start/server-only";
import { env } from "@open-cinema/runtime";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";

import { passwordIdentity, passwordChallenge } from "@open-cinema/runtime/auth";

/** Local signed sessions or a password-protected, self-hosted studio. */
export type AuthMode = "local" | "password";

export interface Session {
  userId: string;
  expiresAt: number;
  email?: string;
}

export interface AuthStatus {
  mode: AuthMode | "unconfigured";
  ready: boolean;
  detail: string;
}

const COOKIE = "open-cinema-local";
const LOOPBACK = ["127.0.0.1", "localhost", "[::1]"];

function authMode(): AuthMode | null {
  const mode = (env.AUTH_MODE || "local").trim();
  return mode === "local" || mode === "password" ? mode : null;
}

function unauthorized(message: string): never {
  throw new Response(message, { status: 401 });
}

/** Display-safe description of how this deployment authenticates people. */
export function getAuthStatus(): AuthStatus {
  const mode = authMode();
  if (mode === "password") {
    const ready = Boolean(env.BASIC_AUTH_USER && env.BASIC_AUTH_PASSWORD);
    return {
      mode,
      ready,
      detail: ready
        ? "This private studio uses the deployment's username and password."
        : "Set BASIC_AUTH_PASSWORD to protect this studio.",
    };
  }
  if (mode === "local") {
    const ready = !!localConfiguration(false);
    return {
      mode,
      ready,
      detail: ready
        ? "Local test session on this machine only. Public addresses are refused."
        : "Local sessions need LOCAL_MVP_ENABLED=true, a 32+ character LOCAL_SESSION_SECRET and a loopback address.",
    };
  }
  return {
    mode: "unconfigured",
    ready: false,
    detail: `AUTH_MODE must be "local" or "password".`,
  };
}

export async function requireSession(): Promise<Session> {
  const mode = authMode();
  if (mode === "password") return requirePasswordSession();
  if (mode === "local") return requireLocalSession();
  return unauthorized("Authentication is not configured for this deployment.");
}

/** The session, or null when nobody is signed in. */
export async function optionalSession(): Promise<Session | null> {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof Response && error.status === 401) return null;
    throw error;
  }
}

/** Creates a local identity, or verifies the hosted account. */
export async function startLocalSession(): Promise<Session> {
  if (authMode() === "password") return requirePasswordSession();
  const secret = localConfiguration(true);
  try {
    return await requireLocalSession();
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

// Local test sessions

function localConfiguration(strict: true): string;
function localConfiguration(strict: false): string | null;
function localConfiguration(strict: boolean) {
  const url = new URL(getRequest().url);
  if (
    String(env.LOCAL_MVP_ENABLED) !== "true" ||
    !LOOPBACK.includes(url.hostname) ||
    !env.LOCAL_SESSION_SECRET ||
    env.LOCAL_SESSION_SECRET.length < 32
  ) {
    if (!strict) return null;
    unauthorized(
      "Account authentication is not configured. The MVP session is local-only.",
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

async function requireLocalSession(): Promise<Session> {
  const secret = localConfiguration(true);
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
    return unauthorized("Start a local test session from Studio.");
  }
}

async function requirePasswordSession(): Promise<Session> {
  const userId = passwordIdentity(getRequest());
  if (!userId) throw passwordChallenge();
  return { userId, expiresAt: Date.now() + 24 * 60 * 60_000 };
}
