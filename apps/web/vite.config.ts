import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import typegpu from "unplugin-typegpu/vite";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr", childEnvironments: ["rsc"] },
      auxiliaryWorkers: [{ configPath: "../jobs/wrangler.jsonc" }],
      persistState: { path: "../../.wrangler/state" },
      remoteBindings: false,
    }),
    tailwindcss(),
    typegpu(),
    tanstackStart({ rsc: { enabled: true } }),
    rsc(),
    react(),
  ],
});
