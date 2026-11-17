import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/jobs")({
  component: () => (
    <ComingSoon
      title="Jobs"
      phase={2}
      summary="Every tank and sump job from pending to completed, with crew and equipment."
    />
  ),
});
