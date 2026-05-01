import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// `pnpm test` uses `vitest run --passWithNoTests` so the bootstrap commit
// (no tests yet) exits 0. Keep the flag — it's load-bearing for CI on
// branches that haven't picked up tests yet. Once Phase 0 task #2 lands
// and real tests exist, the flag is harmless.
//
// `@shared` alias mirrors `electron.vite.config.ts` so test files can
// `import { ... } from "@shared/types"` exactly like the runtime does.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
