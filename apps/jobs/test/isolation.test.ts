import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { routerBaseUrl } from "@open-cinema/comfy";

it("never points tests at a relay or public media origin, whatever .dev.vars holds", () => {
  expect(env.COMFY_BASE_URL).toBe("");
  expect(env.MEDIA_PUBLIC_ORIGIN).toBe("");
  expect(routerBaseUrl(env.COMFY_BASE_URL)).toBe("https://api.comfy.org");
});
