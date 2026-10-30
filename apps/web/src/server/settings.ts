import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAuthStatus, type AuthStatus } from "./session";
import { getCoordinator } from "./jobs";

export type ComfyKeyStatus = "configured" | "missing" | "unknown";

export interface StudioSettings {
  auth: AuthStatus;
  comfy: ComfyKeyStatus;
  environment: {
    mode: "development" | "production";
    host: string;
    secure: boolean;
  };
}

/** Display-safe facts for the Settings page. Never returns a secret. */
export const getStudioSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<StudioSettings> => {
    const url = new URL(getRequest().url);
    let comfy: ComfyKeyStatus = "unknown";
    try {
      // Ask for readiness; never serialize a provider credential.
      const status = await getCoordinator("settings-probe").getProviderStatus();
      comfy = status.comfyConfigured ? "configured" : "missing";
    } catch {
      /* A configuration error makes provider readiness unknown. */
    }
    return {
      auth: getAuthStatus(),
      comfy,
      environment: {
        mode: import.meta.env.DEV ? "development" : "production",
        host: url.host,
        secure: url.protocol === "https:",
      },
    };
  },
);
