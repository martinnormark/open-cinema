import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";
import {
  getCookie,
  getRequest,
  getRequestHeader,
  setCookie,
} from "@tanstack/react-start/server";

/**
 * Two ways to identify a creator, chosen by AUTH_MODE:
 *
 * - `local` (default): a signed, loopback-only test session for development.
 * - `cloudflare-access`: the deployment sits behind Cloudflare Access, which
 *   authenticates people (email OTP, Google, GitHub, SSO) before any request
 *   reaches the Worker. We verify the Access JWT on every request and derive
 *   the owner from its subject. See docs/auth.md.
 *
 * Any other configuration fails closed.
 */
export type AuthMode = "local" | "cloudflare-access";

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
  return mode === "local" || mode === "cloudflare-access" ? mode : null;
}

function unauthorized(message: string): never {
  throw new Response(message, { status: 401 });
}

/** Display-safe description of how this deployment authenticates people. */
export function getAuthStatus(): AuthStatus {
  const mode = authMode();
  if (mode === "cloudflare-access") {
    const ready = !!accessConfiguration(false);
    return {
      mode,
      ready,
      detail: ready
        ? "Cloudflare Access signs people in before they reach the studio."
        : "Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD to finish configuring Cloudflare Access.",
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
    detail: `AUTH_MODE must be "local" or "cloudflare-access".`,
  };
}

export async function requireSession(): Promise<Session> {
  const mode = authMode();
  if (mode === "cloudflare-access") return requireAccessSession();
  if (mode === "local") return requireLocalSession();
  return unauthorized("Authentication is not configured for this deployment.");
}

/**
 * Explicit POST setup. Locally this mints a signed cookie; behind Cloudflare
 * Access the identity already exists, so it only verifies it. Never accepts a
 * user ID from the browser.
 */
export async function startLocalSession(): Promise<Session> {
  if (authMode() === "cloudflare-access") return requireAccessSession();
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

// Cloudflare Access

interface AccessConfiguration {
  issuer: string;
  audience: string;
}

function accessConfiguration(strict: true): AccessConfiguration;
function accessConfiguration(strict: false): AccessConfiguration | null;
function accessConfiguration(strict: boolean) {
  const domain = (env.CF_ACCESS_TEAM_DOMAIN ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const audience = (env.CF_ACCESS_AUD ?? "").trim();
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(domain) || !audience) {
    if (!strict) return null;
    unauthorized("Cloudflare Access is not fully configured.");
  }
  return { issuer: `https://${domain}`, audience };
}

interface Jwk extends JsonWebKey {
  kid?: string;
}
let jwksCache: { issuer: string; keys: Jwk[]; fetchedAt: number } | null = null;

async function accessKeys(issuer: string, refresh = false) {
  if (
    !refresh &&
    jwksCache?.issuer === issuer &&
    Date.now() - jwksCache.fetchedAt < 60 * 60_000
  )
    return jwksCache.keys;
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
  if (!response.ok) unauthorized("Could not verify your sign-in. Try again.");
  const { keys } = (await response.json()) as { keys?: Jwk[] };
  jwksCache = { issuer, keys: keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function requireAccessSession(): Promise<Session> {
  const { issuer, audience } = accessConfiguration(true);
  const token =
    getRequestHeader("Cf-Access-Jwt-Assertion") ??
    getCookie("CF_Authorization");
  if (!token) return unauthorized("Sign in through Cloudflare Access.");
  try {
    const [rawHeader, rawPayload, rawSignature] = token.split(".");
    if (!rawHeader || !rawPayload || !rawSignature) throw new Error();
    const decoder = new TextDecoder();
    const header = JSON.parse(decoder.decode(base64UrlDecode(rawHeader))) as {
      alg?: string;
      kid?: string;
    };
    if (header.alg !== "RS256" || !header.kid) throw new Error();
    let jwk = (await accessKeys(issuer)).find((k) => k.kid === header.kid);
    // Access rotates keys; refetch once before rejecting an unknown kid.
    jwk ??= (await accessKeys(issuer, true)).find((k) => k.kid === header.kid);
    if (!jwk) throw new Error();
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlDecode(rawSignature),
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
    );
    const claims = JSON.parse(decoder.decode(base64UrlDecode(rawPayload))) as {
      aud?: string | string[];
      iss?: string;
      sub?: string;
      email?: string;
      exp?: number;
      nbf?: number;
    };
    const now = Date.now() / 1000;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      !valid ||
      claims.iss !== issuer ||
      !audiences.includes(audience) ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      typeof claims.exp !== "number" ||
      claims.exp <= now ||
      (typeof claims.nbf === "number" && claims.nbf > now + 60)
    )
      throw new Error();
    return {
      userId: `access-${claims.sub}`,
      expiresAt: claims.exp * 1000,
      ...(typeof claims.email === "string" ? { email: claims.email } : {}),
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    return unauthorized("Your sign-in could not be verified. Sign in again.");
  }
}
