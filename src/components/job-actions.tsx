import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Copy,
  Eye,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { SettleDialog } from "./billing-dialogs";
import { JobStatusBadge } from "./job-status";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Field } from "./ui/label";
import { Select } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { useJobNames } from "@/hooks/use-names";
import { useAuth } from "@/lib/auth";
import { purgeJob, setJobDeleted, setJobStatus } from "@/lib/db";
import {
  CANCEL_REASONS,
  JOB_TRANSITIONS,
  STATUS_LABEL,
  jobSummaryText,
  type Job,
  type JobStatus,
} from "@/lib/job";
import { isManagerOrAbove } from "@/lib/permissions";
import { telLink, whatsappLink } from "@/lib/phone";
import { useStore } from "@/lib/store";

/** Status badge that opens the legal next steps for the job. */
export function StatusMenu({ job, disabled }: { job: Job; disabled?: boolean }) {
  const { settings } = useStore();
  const { can } = useAuth();
  const [cancelling, setCancelling] = useState(false);
  const [settling, setSettling] = useState(false);
  const next = JOB_TRANSITIONS[job.status];

  const move = async (to: JobStatus) => {
    if (to === "cancelled") return setCancelling(true);
    // The office closes a job through the settlement; crews just mark it done.
    if (to === "completed" && (can("billing") || can("leads"))) return setSettling(true);
    if (to === "scheduled" && !job.date) {
      toast.error("Set a date first: edit the job and choose when the work happens.");
      return;
    }
    try {
      await setJobStatus(job, to, { recleanMonths: settings.reminders.recleanMonths });
      toast.success(`${job.id} is now ${STATUS_LABEL[to].toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change the status.");
    }
  };

  if (disabled || job.isDeleted) return <JobStatusBadge status={job.status} />;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Status: ${STATUS_LABEL[job.status]}. Change status`}
        >
          <JobStatusBadge status={job.status} />
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
          {next.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => void move(s)}>
              {STATUS_LABEL[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {cancelling && <CancelDialog job={job} onClose={() => setCancelling(false)} />}
      {settling && <SettleDialog job={job} onClose={() => setSettling(false)} />}
    </>
  );
}

export function CancelDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      const text =
        reason === "Other"
          ? detail.trim() || "Other"
          : detail.trim()
            ? `${reason}: ${detail.trim()}`
            : reason;
      await setJobStatus(job, "cancelled", { cancelReason: text });
      toast.success(`${job.id} cancelled`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {job.id}</DialogTitle>
          <DialogDescription>
            The reason is kept on the job and counted in reports.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Reason" htmlFor="c-reason">
            <Select id="c-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {CANCEL_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Details (optional)" htmlFor="c-detail">
            <Textarea
              id="c-detail"
              rows={2}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep job
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
            Cancel job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The ⋯ menu on a job row: view, edit, copy, contact, trash. */
export function JobRowMenu({ job, onEdit }: { job: Job; onEdit: () => void }) {
  const { session } = useAuth();
  const names = useJobNames();
  const [purging, setPurging] = useState(false);
  const wa = whatsappLink(job.phone);
  const fieldRole = session?.role === "Technician" || session?.role === "Supervisor";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(jobSummaryText(job, names(job)));
      toast.success("Job details copied");
    } catch {
      toast.error("Couldn't copy. Your browser blocked the clipboard.");
    }
  };

  const trash = async (deleted: boolean) => {
    try {
      await setJobDeleted(job, deleted);
      toast.success(deleted ? `${job.id} moved to the trash` : `${job.id} restored`);
    } catch {
      toast.error("Couldn't update the job.");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${job.id}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {job.isDeleted ? (
            <>
              <DropdownMenuItem onSelect={() => void trash(false)}>
                <RotateCcw className="h-4 w-4" /> Restore
              </DropdownMenuItem>
              {isManagerOrAbove(session?.role) && (
                <DropdownMenuItem className="text-destructive" onSelect={() => setPurging(true)}>
                  <Trash2 className="h-4 w-4" /> Delete permanently
                </DropdownMenuItem>
              )}
            </>
          ) : (
            <>
              <DropdownMenuItem asChild>
                <Link to="/jobs/$jobId" params={{ jobId: job.id }}>
                  <Eye className="h-4 w-4" /> Open
                </Link>
              </DropdownMenuItem>
              {!fieldRole && (
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="h-4 w-4" /> Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => void copy()}>
                <Copy className="h-4 w-4" /> Copy job details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={telLink(job.phone)}>
                  <Phone className="h-4 w-4" /> Call
                </a>
              </DropdownMenuItem>
              {wa && (
                <DropdownMenuItem asChild>
                  <a href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </DropdownMenuItem>
              )}
              {!fieldRole && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onSelect={() => void trash(true)}>
                    <Trash2 className="h-4 w-4" /> Move to trash
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={purging} onOpenChange={setPurging}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {job.id} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the job for good. It can't be restored, and it won't appear in reports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                void purgeJob(job)
                  .then(() => toast.success(`${job.id} deleted`))
                  .catch(() => toast.error("Couldn't delete. Managers and above only."))
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
