import { Badge } from "./ui/badge";
import { STATUS_LABEL, STATUS_TONE, type JobStatus } from "@/lib/job";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
