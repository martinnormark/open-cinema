import { mock, test, expect, beforeEach } from "bun:test";
import { authorizeHttp, passwordIdentity } from "@open-cinema/runtime/auth";

let request = new Request("https://studio.example.com/");
let cookie: string | undefined;
mock.module("@tanstack/react-start/server-only", () => ({}));
mock.module("@tanstack/react-start/server", () => ({
  getCookie: () => cookie,
  getRequest: () => request,
  setCookie: (_: string, value: string) => {
    cookie = value;
  },
}));
const { requireSession, getAuthStatus, startLocalSession, requireSameOrigin } =
  await import("../src/server/session");
const credentials = (
  user = "director",
  password = "test-password-for-docker",
) => ({ Authorization: `Basic ${btoa(`${user}:${password}`)}` });
beforeEach(() => {
  process.env.AUTH_MODE = "password";
  process.env.BASIC_AUTH_USER = "director";
  process.env.BASIC_AUTH_PASSWORD = "test-password-for-docker";
  process.env.LOCAL_MVP_ENABLED = "true";
  process.env.LOCAL_SESSION_SECRET =
    "local-test-secret-with-more-than-32-characters";
  request = new Request("https://studio.example.com/", {
    headers: credentials(),
  });
  cookie = undefined;
});

test("password login provides a stable owner across requests and password rotation", async () => {
  const first = await requireSession();
  expect(first.userId).toStartWith("account-");
  expect(getAuthStatus()).toMatchObject({ mode: "password", ready: true });
  expect(authorizeHttp(request)).toBeNull();
  process.env.BASIC_AUTH_PASSWORD = "rotated-password";
  request = new Request(request.url, {
    headers: credentials("director", "rotated-password"),
  });
  expect((await requireSession()).userId).toBe(first.userId);
  request = new Request(request.url, { headers: credentials() });
  await expect(requireSession()).rejects.toHaveProperty("status", 401);
});
test.each([
  {},
  credentials("stranger"),
  credentials("director", "wrong"),
  { Authorization: "Basic !invalid" },
])("rejects missing or invalid credentials", async (headers) => {
  request = new Request(request.url, { headers });
  expect(passwordIdentity(request)).toBeNull();
  expect(authorizeHttp(request)?.status).toBe(401);
  expect(authorizeHttp(request)?.headers.get("WWW-Authenticate")).toContain(
    "Basic",
  );
  await expect(requireSession()).rejects.toHaveProperty("status", 401);
});
test("unknown modes and an empty deployment password fail closed", async () => {
  process.env.BASIC_AUTH_PASSWORD = "";
  expect(getAuthStatus().ready).toBe(false);
  expect(authorizeHttp(request)?.status).toBe(503);
  await expect(requireSession()).rejects.toHaveProperty("status", 401);
  process.env.AUTH_MODE = "open";
  expect(getAuthStatus().mode).toBe("unconfigured");
  await expect(requireSession()).rejects.toHaveProperty("status", 401);
});
test("public mode admits anyone as the password account, without a password", async () => {
  const account = (await requireSession()).userId;
  process.env.AUTH_MODE = "public";
  process.env.BASIC_AUTH_PASSWORD = "";
  request = new Request("https://studio.example.com/");
  expect(authorizeHttp(request)).toBeNull();
  expect(getAuthStatus()).toMatchObject({ mode: "public", ready: true });
  expect((await requireSession()).userId).toBe(account);
  expect((await startLocalSession()).userId).toBe(account);
});
test("local sessions reject public addresses even with valid configuration", async () => {
  process.env.AUTH_MODE = "local";
  expect(getAuthStatus().ready).toBe(false);
  expect(authorizeHttp(request)?.status).toBe(403);
  await expect(startLocalSession()).rejects.toHaveProperty("status", 401);
});
test("local signed sessions survive another request and reject tampering", async () => {
  process.env.AUTH_MODE = "local";
  request = new Request("http://localhost:3000/");
  const session = await startLocalSession();
  expect(await requireSession()).toEqual(session);
  const [payload, signature] = cookie!.split(".");
  cookie = `${btoa(JSON.stringify({ ...JSON.parse(atob(payload!)), userId: "local-stranger" }))}.${signature}`;
  await expect(requireSession()).rejects.toHaveProperty("status", 401);
});
test("writes require the configured request origin", () => {
  request = new Request(request.url, {
    headers: { Origin: "https://other.example" },
  });
  expect(() => requireSameOrigin()).toThrow();
  request = new Request(request.url, {
    headers: { Origin: "https://studio.example.com" },
  });
  expect(() => requireSameOrigin()).not.toThrow();
});
test("only health and signed-media GET/HEAD reach handlers without a password", () => {
  expect(
    authorizeHttp(new Request("https://studio.example.com/healthz")),
  ).toBeNull();
  expect(
    authorizeHttp(
      new Request("https://studio.example.com/api/media/id?signature=invalid"),
    ),
  ).toBeNull();
  expect(
    authorizeHttp(new Request("https://studio.example.com/api/media/id"))
      ?.status,
  ).toBe(401);
  expect(
    authorizeHttp(
      new Request("https://studio.example.com/api/media/id?signature=invalid", {
        method: "POST",
      }),
    )?.status,
  ).toBe(401);
  expect(
    authorizeHttp(new Request("https://studio.example.com/api/jobs/stream"))
      ?.status,
  ).toBe(401);
});
