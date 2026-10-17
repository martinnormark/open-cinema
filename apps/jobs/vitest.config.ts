import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          COMFY_API_KEY: "integration-test-key",
          // Override any .dev.vars relay or public origin: tests must only ever
          // reach msw fixtures, never a real Router endpoint.
          COMFY_BASE_URL: "",
          MEDIA_PUBLIC_ORIGIN: "",
          TEST_MIGRATIONS: await readD1Migrations(
            "../../packages/database/migrations",
          ),
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    // Lifecycle tests drive real DO alarms; parallel files starve them in
    // small containers and they time out. Serial files are deterministic.
    fileParallelism: false,
  },
}));
