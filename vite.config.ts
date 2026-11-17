import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// `vite build` runs a client and an SSR sub-build, and each reloads this file.
// scripts/write-build-id.mjs writes one timestamp before the build so both
// bundles agree on the build id. `vite dev` never runs that script, so fall
// back to a fresh timestamp there.
function readBuildId(): string {
  try {
    return readFileSync(fileURLToPath(new URL(".build-id", import.meta.url)), "utf8").trim();
  } catch {
    return String(Date.now());
  }
}

export default defineConfig({
  // Stamped into both bundles so an open tab can tell when a newer deploy is
  // live (see src/routes/healthz.ts).
  define: {
    __BUILD_ID__: JSON.stringify(readBuildId()),
  },
  build: {
    rolldownOptions: {
      output: {
        // Two long-cacheable chunks keep a cold load to a handful of requests.
        codeSplitting: {
          groups: [
            { name: "vendor", test: /node_modules/ },
            { name: "app", test: /src[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
});
