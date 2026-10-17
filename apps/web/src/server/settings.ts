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

interface ProviderStatusProbe {
  getProviderStatus(): Promise<{ comfyConfigured: boolean }>;
}

/** Display-safe facts for the Settings page. Never returns a secret. */
export const getStudioSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<StudioSettings> => {
    const url = new URL(getRequest().url);
    let comfy: ComfyKeyStatus = "unknown";
    try {
      // Only the jobs Worker holds COMFY_API_KEY, so ask it rather than read it here.
      const probe = getCoordinator(
        "settings-probe",
      ) as unknown as ProviderStatusProbe;
      const status = await probe.getProviderStatus();
      comfy = status.comfyConfigured ? "configured" : "missing";
    } catch {
      /* Older jobs Worker without the probe, or unreachable: say we don't know. */
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
