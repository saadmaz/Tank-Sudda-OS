import { createFileRoute } from "@tanstack/react-router";
import { JobList } from "@/components/job-list";
import { bySchedule, WORK_STATUSES, type Job } from "@/lib/job";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/jobs/")({
  component: JobsPage,
});

// Upcoming and in-progress work first, soonest at the top; then the rest.
const OPEN_FIRST: Record<string, number> = {
  in_progress: 0,
  scheduled: 1,
  completed: 2,
  cancelled: 3,
};
const jobOrder = (a: Job, b: Job) =>
  (OPEN_FIRST[a.status] ?? 9) - (OPEN_FIRST[b.status] ?? 9) ||
  (a.status === "completed" || a.status === "cancelled" ? -bySchedule(a, b) : bySchedule(a, b));

function JobsPage() {
  const { jobs } = useStore();
  return (
    <JobList
      title="Jobs"
      description="Scheduled and in-progress work, and recently completed or cancelled jobs."
      jobs={jobs}
      statuses={WORK_STATUSES}
      newLabel="New job"
      newStatus="scheduled"
      sort={jobOrder}
      emptyTitle="No jobs yet"
      emptyDescription="Schedule a lead, or create a job directly."
    />
  );
}
