import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Health endpoint for the deploy smoke test and uptime monitors. The
// X-Build-Id header lets an open tab notice that a newer build is live.
export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () =>
        new Response("ok", {
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": "no-store",
            "X-Build-Id": __BUILD_ID__,
          },
        }),
    },
  },
});
