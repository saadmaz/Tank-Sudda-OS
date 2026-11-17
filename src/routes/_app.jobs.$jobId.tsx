import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { doc } from "firebase/firestore";
import {
  ArrowLeft,
  CalendarDays,
  Copy,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { JobEditor } from "@/components/job-editor";
import { StatusMenu } from "@/components/job-actions";
import { EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useJobNames } from "@/hooks/use-names";
import { useAuth } from "@/lib/auth";
import { formatAmount, formatLKR } from "@/lib/currency";
import { db } from "@/lib/firebase";
import { JOB_SOURCES, jobService, jobSummaryText, scheduleLabel, type Job } from "@/lib/job";
import { advanceAmount, priceSummary } from "@/lib/pricing";
import { formatPhone, telLink, whatsappLink } from "@/lib/phone";
import { useLiveDoc, useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/jobs/$jobId")({
  component: JobDetail,
});

function JobDetail() {
  const { jobId } = Route.useParams();
  const ref = useMemo(() => doc(db, "jobs", jobId), [jobId]);
  const { data, ready } = useLiveDoc(ref);
  const job = data as Job | undefined;

  if (!ready) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  if (!job) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <EmptyState
          title="Job not found"
          description={`${jobId} doesn't exist, or was deleted permanently.`}
          action={
            <Button asChild variant="outline">
              <Link to="/jobs">Back to jobs</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <JobView job={job} />;
}

function JobView({ job }: { job: Job }) {
  const { settings } = useStore();
  const { session } = useAuth();
  const names = useJobNames()(job);
  const [editing, setEditing] = useState(false);
  const summary = priceSummary(job);
  const wa = whatsappLink(job.phone);
  const fieldRole = session?.role === "Technician" || session?.role === "Supervisor";
  const source = JOB_SOURCES.find((s) => s.value === job.source)?.label ?? job.source;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(jobSummaryText(job, names));
      toast.success("Job details copied");
    } catch {
      toast.error("Couldn't copy. Your browser blocked the clipboard.");
    }
  };

  const timeline: [string, string | null][] = [
    ["Created", job.createdAt],
    ["Quoted", job.quotedAt],
    ["Started", job.startedAt],
    ["Completed", job.completedAt],
    ["Cancelled", job.cancelledAt],
    ["Moved to trash", job.deletedAt],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <Link
            to={job.status === "new" || job.status === "quoted" ? "/leads" : "/jobs"}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <h2 className="text-xl font-bold tracking-tight">{job.customerName}</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{job.id}</span>
            <StatusMenu job={job} />
            {job.isDeleted && <Badge tone="danger">In trash</Badge>}
            {job.inspectionNeeded && <Badge tone="warning">Needs inspection</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={telLink(job.phone)}>
              <Phone /> Call
            </a>
          </Button>
          {wa && (
            <Button variant="outline" asChild>
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => void copy()}>
            <Copy /> Copy
          </Button>
          {!fieldRole && !job.isDeleted && (
            <Button onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
        </div>
      </div>

      {job.status === "cancelled" && job.cancelReason && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <strong>Cancelled:</strong> {job.cancelReason}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{jobService(job)}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {summary.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3">
                      <p className="font-medium">{l.title}</p>
                      {l.detail && <p className="text-xs text-muted-foreground">{l.detail}</p>}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground tabular-nums">
                      {l.qty > 1 && `${l.qty} × ${formatAmount(l.unitPrice)}`}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatAmount(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2">
                {summary.discount > 0 && (
                  <>
                    <tr>
                      <td colSpan={2} className="pt-2 text-muted-foreground">
                        Subtotal
                      </td>
                      <td className="pt-2 text-right tabular-nums">
                        {formatAmount(summary.subtotal)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="text-destructive">
                        Discount
                      </td>
                      <td className="text-right text-destructive tabular-nums">
                        −{formatAmount(summary.discount)}
                      </td>
                    </tr>
                  </>
                )}
                <tr>
                  <td colSpan={2} className="pt-2 font-semibold">
                    Total
                  </td>
                  <td className="pt-2 text-right text-base font-bold tabular-nums">
                    {formatLKR(summary.total)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="text-xs text-muted-foreground">
                    Advance ({settings.pricing.advancePercent}%)
                  </td>
                  <td className="text-right text-xs text-muted-foreground tabular-nums">
                    {formatLKR(advanceAmount(summary.total, settings.pricing.advancePercent))}
                  </td>
                </tr>
              </tfoot>
            </table>
            {summary.lines.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No work added yet. Edit the job to price it.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Info icon={<MapPin className="h-4 w-4" />} title="Customer and site">
            <p className="font-medium">{job.customerName}</p>
            <p>{formatPhone(job.phone)}</p>
            {job.altPhone && <p>{formatPhone(job.altPhone)}</p>}
            <p className="text-muted-foreground">{job.address || "No address"}</p>
            <p className="text-muted-foreground">{job.locationName}</p>
            {job.customerId && (
              <Link
                to="/customers/$customerId"
                params={{ customerId: job.customerId }}
                className="mt-1 inline-block text-xs font-semibold text-primary hover:underline"
              >
                Customer profile →
              </Link>
            )}
          </Info>
          <Info icon={<CalendarDays className="h-4 w-4" />} title="Schedule">
            <p>{scheduleLabel(job)}</p>
            <p className="text-xs text-muted-foreground">
              Enquiry {job.intakeDate} · {source}
            </p>
          </Info>
          <Info icon={<Users className="h-4 w-4" />} title="Crew">
            <p>
              <span className="text-muted-foreground">Supervisor:</span>{" "}
              {names.supervisor || "Unassigned"}
            </p>
            <p>
              <span className="text-muted-foreground">Technicians:</span>{" "}
              {names.technicians.join(", ") || "Unassigned"}
            </p>
            <p>
              <span className="text-muted-foreground">Equipment:</span>{" "}
              {names.equipment.join(", ") || "None"}
            </p>
          </Info>
        </div>
      </div>

      {job.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{job.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1.5 text-sm">
            {timeline
              .filter(([, at]) => at)
              .map(([label, at]) => (
                <li key={label} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="tabular-nums">{new Date(at!).toLocaleString("en-GB")}</span>
                </li>
              ))}
          </ol>
        </CardContent>
      </Card>

      {editing && <JobEditor job={job} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Info({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 pb-2">
        <span className="text-primary">{icon}</span>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 text-sm">{children}</CardContent>
    </Card>
  );
}
