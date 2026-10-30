import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FileAssetStore } from "@open-cinema/assets";

export interface RuntimeEnv {
  DB: string;
  GENERATED_ASSETS: FileAssetStore;
  AUTH_MODE: string;
  LOCAL_MVP_ENABLED: string;
  LOCAL_SESSION_SECRET: string;
  BASIC_AUTH_USER: string;
  BASIC_AUTH_PASSWORD: string;
  APP_ORIGIN: string;
  COMFY_API_KEY: string;
  COMFY_ROUTER_API_KEY: string;
  COMFY_CLOUD_API_KEY: string;
  COMFY_BASE_URL: string;
  COMFY_ROUTER_BASE_URL: string;
  COMFY_CLOUD_BASE_URL: string;
  MEDIA_PUBLIC_ORIGIN: string;
  MEDIA_SIGNING_SECRET: string;
  MAX_ACTIVE_JOBS: string;
}
export const dataDirectory = resolve(
  process.env.DATA_DIR ??
    fileURLToPath(new URL("../../../.data", import.meta.url)),
);
/** Docker secret files take precedence over environment values. Never build secrets into bundles. */
function setting(name: string, fallback = "") {
  const file = process.env[`${name}_FILE`];
  return file
    ? readFileSync(file, "utf8").trim()
    : (process.env[name] ?? fallback);
}
let secret: string | undefined;
function sessionSecret() {
  if (secret) return secret;
  secret = setting("LOCAL_SESSION_SECRET");
  if (!secret) {
    mkdirSync(dataDirectory, { recursive: true });
    const path = resolve(dataDirectory, "session-secret");
    try {
      secret = readFileSync(path, "utf8").trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      secret = crypto.randomUUID() + crypto.randomUUID();
      writeFileSync(path, secret, { flag: "wx", mode: 0o600 });
    }
  }
  if (secret.length < 32)
    throw new Error("LOCAL_SESSION_SECRET must have at least 32 characters");
  return secret;
}
export const env: RuntimeEnv = {
  DB: resolve(dataDirectory, "catalog.sqlite"),
  GENERATED_ASSETS: new FileAssetStore(resolve(dataDirectory, "assets")),
  get AUTH_MODE() {
    return setting("AUTH_MODE", "local");
  },
  get LOCAL_MVP_ENABLED() {
    return setting("LOCAL_MVP_ENABLED", "true");
  },
  get LOCAL_SESSION_SECRET() {
    return sessionSecret();
  },
  get BASIC_AUTH_USER() {
    return setting("BASIC_AUTH_USER", "studio");
  },
  get BASIC_AUTH_PASSWORD() {
    return setting("BASIC_AUTH_PASSWORD");
  },
  get APP_ORIGIN() {
    return setting("APP_ORIGIN");
  },
  get COMFY_API_KEY() {
    return setting("COMFY_API_KEY");
  },
  get COMFY_ROUTER_API_KEY() {
    return setting("COMFY_ROUTER_API_KEY");
  },
  get COMFY_CLOUD_API_KEY() {
    return setting("COMFY_CLOUD_API_KEY");
  },
  get COMFY_BASE_URL() {
    return setting("COMFY_BASE_URL");
  },
  get COMFY_ROUTER_BASE_URL() {
    return setting("COMFY_ROUTER_BASE_URL");
  },
  get COMFY_CLOUD_BASE_URL() {
    return setting("COMFY_CLOUD_BASE_URL");
  },
  get MEDIA_PUBLIC_ORIGIN() {
    return setting("MEDIA_PUBLIC_ORIGIN");
  },
  get MEDIA_SIGNING_SECRET() {
    return setting("MEDIA_SIGNING_SECRET") || sessionSecret();
  },
  get MAX_ACTIVE_JOBS() {
    return setting("MAX_ACTIVE_JOBS");
  },
};
export function providerCredentials(
  config: RuntimeEnv,
  provider: "cloud" | "cloud-workflow" | "router",
) {
  return provider !== "router"
    ? {
        apiKey: config.COMFY_CLOUD_API_KEY || config.COMFY_API_KEY,
        baseUrl: config.COMFY_CLOUD_BASE_URL || config.COMFY_BASE_URL,
      }
    : {
        apiKey: config.COMFY_ROUTER_API_KEY || config.COMFY_API_KEY,
        baseUrl: config.COMFY_ROUTER_BASE_URL || config.COMFY_BASE_URL,
      };
}
