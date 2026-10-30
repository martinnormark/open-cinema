import { env } from "./runtime";
import { expect, it } from "bun:test";
import { routerBaseUrl } from "@open-cinema/comfy";

it("never points tests at a relay or public media origin, whatever the host environment holds", () => {
  expect(env.COMFY_BASE_URL).toBe("");
  expect(env.MEDIA_PUBLIC_ORIGIN).toBe("");
  expect(routerBaseUrl(env.COMFY_BASE_URL)).toBe("https://api.comfy.org");
});
