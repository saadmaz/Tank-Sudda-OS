import { Hammer } from "lucide-react";
import { EmptyState, PageHeader } from "./page-header";

/** Placeholder for a module that ships in a later phase of the roadmap. */
export function ComingSoon({
  title,
  phase,
  summary,
}: {
  title: string;
  phase: number;
  summary: string;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={title} />
      <EmptyState
        icon={<Hammer className="h-8 w-8" />}
        title={`Arrives in phase ${phase}`}
        description={summary}
      />
    </div>
  );
}
