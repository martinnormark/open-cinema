// Verifies Cloudflare Access JWT checks and fail-closed modes with mocked Worker/Start modules.
import { mock, test, expect } from "bun:test";
const env: Record<string, string> = {
  AUTH_MODE: "cloudflare-access",
  CF_ACCESS_TEAM_DOMAIN: "demo.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud123",
};
let headers: Record<string, string> = {};
mock.module("cloudflare:workers", () => ({ env }));
mock.module("@tanstack/react-start/server-only", () => ({}));
mock.module("@tanstack/react-start/server", () => ({
  getCookie: () => undefined,
  getRequest: () => new Request("https://studio.example.com/"),
  getRequestHeader: (n: string) => headers[n],
  setCookie: () => {},
}));
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1" };
let fetches = 0;
globalThis.fetch = (async (url: string) => {
  fetches++;
  expect(url).toBe("https://demo.cloudflareaccess.com/cdn-cgi/access/certs");
  return Response.json({ keys: [jwk] });
}) as typeof fetch;
const b64 = (b: Uint8Array | string) => Buffer.from(b).toString("base64url");
async function token(claims: object, kid = "k1") {
  const h = b64(JSON.stringify({ alg: "RS256", kid })),
    p = b64(JSON.stringify(claims));
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(`${h}.${p}`),
    ),
  );
  return `${h}.${p}.${b64(sig)}`;
}
const { requireSession, getAuthStatus } = await import("../src/server/session");
const now = Math.floor(Date.now() / 1000);
const good = {
  iss: "https://demo.cloudflareaccess.com",
  aud: ["aud123"],
  sub: "user-1",
  email: "a@b.c",
  exp: now + 600,
};
async function status(claims: object, kid?: string) {
  headers = { "Cf-Access-Jwt-Assertion": await token(claims, kid) };
  try {
    return await requireSession();
  } catch (e) {
    return (e as Response).status;
  }
}
test("valid token", async () => {
  expect(await status(good)).toMatchObject({
    userId: "access-user-1",
    email: "a@b.c",
  });
  expect(getAuthStatus().ready).toBe(true);
});
test("wrong audience", async () =>
  expect(await status({ ...good, aud: ["x"] })).toBe(401));
test("wrong issuer", async () =>
  expect(
    await status({ ...good, iss: "https://evil.cloudflareaccess.com" }),
  ).toBe(401));
test("expired", async () =>
  expect(await status({ ...good, exp: now - 1 })).toBe(401));
test("unknown kid", async () => expect(await status(good, "zzz")).toBe(401));
test("tampered", async () => {
  const t = await token(good);
  const parts = t.split(".");
  parts[1] = b64(JSON.stringify({ ...good, sub: "other" }));
  headers = { "Cf-Access-Jwt-Assertion": parts.join(".") };
  await expect(requireSession()).rejects.toHaveProperty("status", 401);
});
test("missing token", async () => {
  headers = {};
  await expect(requireSession()).rejects.toHaveProperty("status", 401);
});
test("bad mode fails closed", async () => {
  env.AUTH_MODE = "open";
  headers = { "Cf-Access-Jwt-Assertion": await token(good) };
  await expect(requireSession()).rejects.toHaveProperty("status", 401);
  expect(getAuthStatus().mode).toBe("unconfigured");
  env.AUTH_MODE = "cloudflare-access";
});
test("local mode refuses public host", async () => {
  env.AUTH_MODE = "local";
  env.LOCAL_MVP_ENABLED = "true";
  env.LOCAL_SESSION_SECRET = "x".repeat(40);
  await expect(requireSession()).rejects.toHaveProperty("status", 401);
  expect(getAuthStatus().ready).toBe(false);
  env.AUTH_MODE = "cloudflare-access";
});
