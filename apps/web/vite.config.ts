import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import { localServer } from "./dev-server.ts";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import typegpu from "unplugin-typegpu/vite";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig, loadEnv } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ command, mode }) => {
  // The dev server reads settings from the repository's .env and .env.local,
  // as the README sets up. Values already in the environment win. Builds never
  // read them, and only VITE_* variables from this folder reach the browser.
  if (command === "serve")
    for (const [name, value] of Object.entries(loadEnv(mode, root, "")))
      process.env[name] ??= value;
  return {
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    environments: Object.fromEntries(
      ["ssr", "rsc"].map((name) => [
        name,
        {
          build: {
            rolldownOptions: {
              external: [
                /^@open-cinema\/(runtime|jobs|database|assets|comfy)(\/.*)?$/,
                /^bun:/,
              ],
            },
          },
          // Bun loads our TypeScript server packages natively in development too.
          resolve: {
            builtins: [
              ...builtinModules,
              /^node:/,
              /^bun:/,
              /^file:\/\/.*\/(?:packages\/(?:runtime|database|assets|comfy)|apps\/jobs)\/src\//,
            ],
            external: [
              "@open-cinema/runtime",
              "@open-cinema/jobs",
              "@open-cinema/database",
              "@open-cinema/assets",
              "@open-cinema/comfy",
              "bun:sqlite",
            ],
          },
        },
      ]),
    ),
    plugins: [
      localServer(),
      tailwindcss(),
      typegpu(),
      tanstackStart({ rsc: { enabled: true } }),
      rsc(),
      react(),
    ],
  };
});
