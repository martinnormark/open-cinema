/** End-to-end checks of a built image, with disposable volumes and fixture secrets.
 * No generation request is submitted and no real provider key is used. */
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const image = process.argv[2] ?? "open-cinema:ci";
const name = `cinema-smoke-${crypto.randomUUID()}`;
const volume = `${name}-data`;
const directory = mkdtempSync(join(tmpdir(), "cinema-secrets-"));
const password = crypto.randomUUID();
const providerKey = `fixture-${crypto.randomUUID()}`;
writeFileSync(join(directory, "password"), password);
writeFileSync(join(directory, "comfy"), providerKey);
const publicOrigin = "https://studio.example.test";
const authorization = `Basic ${btoa(`studio:${password}`)}`;
async function docker(...args: string[]) {
  const child = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`Docker ${args[0]} failed: ${error}`);
  return out.trim();
}
let origin: string;
async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${origin}/healthz`)).ok) return;
    } catch {
      /* starting */
    }
    await Bun.sleep(200);
  }
  throw new Error(
    `Container did not become ready at ${origin}: ${await docker("logs", name)}`,
  );
}
try {
  await docker("volume", "create", volume);
  await docker(
    "run",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1::3000",
    "-v",
    `${volume}:/data`,
    "--mount",
    `type=bind,src=${directory},dst=/run/secrets,readonly`,
    "-e",
    "AUTH_MODE=password",
    "-e",
    `APP_ORIGIN=${publicOrigin}`,
    "-e",
    "BASIC_AUTH_PASSWORD_FILE=/run/secrets/password",
    "-e",
    "COMFY_API_KEY_FILE=/run/secrets/comfy",
    image,
  );
  origin = `http://${await docker("port", name, "3000/tcp")}`;
  console.log(`Checking Docker at ${origin}`);
  await ready();
  assert.equal((await fetch(`${origin}/settings`)).status, 401);
  const page = await fetch(`${origin}/settings`, {
    headers: { Authorization: authorization },
  });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("Docker · Bun"));
  assert.ok(html.includes('comfy:"configured"'));
  assert.ok(!html.includes(password) && !html.includes(providerKey));
  await docker(
    "exec",
    name,
    "sh",
    "-c",
    "test ! -e /app/.env && test ! -e /app/.env.local",
  );

  const png = await Bun.file(
    new URL("../apps/web/public/brand/lockup-on-dark.png", import.meta.url),
  ).arrayBuffer();
  const upload = await fetch(`${origin}/api/media/upload`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      Origin: publicOrigin,
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "X-Media-Filename": "docker-smoke.png",
    },
    body: png,
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const item = (await upload.json()) as { ref: { assetId: string } };
  const mediaPath = `/api/media/${item.ref.assetId}`;
  let media = `${origin}${mediaPath}`;
  assert.equal((await fetch(media)).status, 401);
  assert.equal(
    (await fetch(`${media}?owner=unknown&expires=1&signature=invalid`)).status,
    403,
  );
  const read = async () => {
    const response = await fetch(media, {
      headers: { Authorization: authorization },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      new Uint8Array(png),
    );
  };
  await read();
  const range = await fetch(media, {
    headers: { Authorization: authorization, Range: "bytes=1-5" },
  });
  assert.equal(range.status, 206);
  assert.deepEqual(
    new Uint8Array(await range.arrayBuffer()),
    new Uint8Array(png).slice(1, 6),
  );

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(
      `${origin.replace("http:", "ws:")}/api/jobs/stream`,
      { headers: { Authorization: authorization, Origin: publicOrigin } },
    );
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("No status snapshot"));
    }, 5000);
    socket.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(String(event.data));
        assert.equal(snapshot.type, "snapshot");
        assert.deepEqual(snapshot.jobs, []);
        clearTimeout(timer);
        socket.close();
        resolve();
      } catch (error) {
        clearTimeout(timer);
        socket.close();
        reject(error);
      }
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Status socket failed"));
    };
  });
  await docker("restart", name);
  origin = `http://${await docker("port", name, "3000/tcp")}`;
  media = `${origin}${mediaPath}`;
  await ready();
  await read();
  console.log(
    "Docker smoke passed: secrets, auth, SSR, uploads, ranges, WebSockets and restart persistence.",
  );
} finally {
  await docker("rm", "-f", name).catch(() => {});
  await docker("volume", "rm", volume).catch(() => {});
  rmSync(directory, { recursive: true, force: true });
}
