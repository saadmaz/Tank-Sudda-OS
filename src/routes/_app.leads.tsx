import { createFileRoute } from "@tanstack/react-router";
import { JobList } from "@/components/job-list";
import { byNewest, LEAD_STATUSES } from "@/lib/job";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/leads")({
  component: LeadsPage,
});

function LeadsPage() {
  const { jobs } = useStore();
  return (
    <JobList
      title="Leads"
      description="Enquiries not yet scheduled. Quote them, then schedule the work."
      jobs={jobs}
      statuses={LEAD_STATUSES}
      newLabel="New lead"
      newStatus="new"
      sort={byNewest}
      emptyTitle="No open leads"
      emptyDescription="New enquiries from the phone, WhatsApp and the website appear here."
    />
  );
}
