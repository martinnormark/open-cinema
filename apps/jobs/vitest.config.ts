import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          COMFY_API_KEY: "integration-test-key",
          TEST_MIGRATIONS: await readD1Migrations(
            "../../packages/database/migrations",
          ),
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
}));
