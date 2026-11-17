import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardList, Plus, Search, Trash2 } from "lucide-react";
import { JobEditor } from "./job-editor";
import { JobRowMenu, StatusMenu } from "./job-actions";
import { EmptyState, PageHeader } from "./page-header";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { useJobNames } from "@/hooks/use-names";
import { useAuth } from "@/lib/auth";
import { formatLKR } from "@/lib/currency";
import {
  STATUS_LABEL,
  filterJobs,
  jobService,
  scheduleLabel,
  type Job,
  type JobFilter,
  type JobStatus,
} from "@/lib/job";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * The searchable, filterable list behind both Leads and Jobs. `statuses`
 * scopes it; each screen sorts in the order that suits its work.
 */
export function JobList({
  title,
  description,
  jobs,
  statuses,
  newLabel,
  newStatus,
  sort,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  description: string;
  jobs: Job[];
  statuses: JobStatus[];
  newLabel: string;
  newStatus: JobStatus;
  sort: (a: Job, b: Job) => number;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const { session } = useAuth();
  const names = useJobNames();
  const [filter, setFilter] = useState<JobFilter>({
    query: "",
    status: "all",
    area: "all",
    trash: false,
  });
  const [editing, setEditing] = useState<Job | "new" | null>(null);
  const fieldRole = session?.role === "Technician" || session?.role === "Supervisor";

  const scoped = useMemo(() => jobs.filter((j) => statuses.includes(j.status)), [jobs, statuses]);
  const list = useMemo(() => filterJobs(scoped, filter).sort(sort), [scoped, filter, sort]);
  const trashCount = scoped.filter((j) => j.isDeleted).length;
  const total = list.reduce((sum, j) => sum + (j.status === "cancelled" ? 0 : j.total), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title={filter.trash ? `${title}: trash` : title}
        description={description}
        actions={
          <>
            <Button
              variant={filter.trash ? "secondary" : "ghost"}
              onClick={() => setFilter((f) => ({ ...f, trash: !f.trash }))}
            >
              <Trash2 />{" "}
              {filter.trash ? "Close trash" : `Trash${trashCount ? ` (${trashCount})` : ""}`}
            </Button>
            {!fieldRole && (
              <Button onClick={() => setEditing("new")}>
                <Plus /> {newLabel}
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, phone, reference or address"
            aria-label="Search"
            value={filter.query}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            aria-label="Status"
            value={filter.status}
            onChange={(e) =>
              setFilter((f) => ({ ...f, status: e.target.value as JobFilter["status"] }))
            }
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Area"
            value={filter.area}
            onChange={(e) =>
              setFilter((f) => ({ ...f, area: e.target.value as JobFilter["area"] }))
            }
          >
            <option value="all">All areas</option>
            <option value="inside">Inside Colombo</option>
            <option value="outside">Outside Colombo</option>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {list.length} {list.length === 1 ? "record" : "records"}
        {list.length > 0 && ` · ${formatLKR(total)}`}
      </p>

      {list.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title={
            filter.trash
              ? "The trash is empty"
              : scoped.length
                ? "Nothing matches these filters"
                : emptyTitle
          }
          description={filter.trash || scoped.length ? undefined : emptyDescription}
        />
      ) : (
        <>
          {/* Phones: cards */}
          <div className="space-y-2 md:hidden">
            {list.map((j) => (
              <Card key={j.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/jobs/$jobId" params={{ jobId: j.id }} className="min-w-0">
                    <p className="truncate text-sm font-semibold">{j.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {j.id} · {formatPhone(j.phone)}
                    </p>
                  </Link>
                  <JobRowMenu job={j} onEdit={() => setEditing(j)} />
                </div>
                <p className="text-xs">{jobService(j)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {j.locationName}
                  {j.address && ` · ${j.address}`}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <StatusMenu job={j} />
                  <span className="text-sm font-semibold tabular-nums">{formatLKR(j.total)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{scheduleLabel(j)}</p>
              </Card>
            ))}
          </div>

          {/* Tablets and up: table */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Work</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Crew</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="w-12 px-2 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((j) => {
                  const n = names(j);
                  return (
                    <tr
                      key={j.id}
                      className={cn(
                        "align-top hover:bg-muted/40",
                        j.status === "completed" && "bg-success/5",
                      )}
                    >
                      <td className="px-4 py-3">
                        <Link
                          to="/jobs/$jobId"
                          params={{ jobId: j.id }}
                          className="font-semibold hover:text-primary"
                        >
                          {j.customerName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{formatPhone(j.phone)}</p>
                        <p
                          className="max-w-56 truncate text-xs text-muted-foreground"
                          title={j.address}
                        >
                          {j.locationName}
                          {j.address && ` · ${j.address}`}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {j.id} · in {j.intakeDate}
                        </p>
                      </td>
                      <td className="max-w-48 px-4 py-3">
                        <p className="truncate">{jobService(j)}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {j.inspectionNeeded && <Badge tone="warning">Inspection</Badge>}
                          {j.ladderNeeded && <Badge>Ladder</Badge>}
                          {j.source === "website" && <Badge tone="info">Website</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">{scheduleLabel(j)}</td>
                      <td className="px-4 py-3 text-xs">
                        <p className="font-medium">{n.supervisor || "—"}</p>
                        <p className="text-muted-foreground">{n.technicians.join(", ")}</p>
                        {n.equipment.length > 0 && (
                          <p className="text-muted-foreground">{n.equipment.join(", ")}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold tabular-nums">{formatLKR(j.total)}</p>
                        {j.subtotal > j.total && (
                          <p className="text-xs text-destructive tabular-nums">
                            −{formatLKR(j.subtotal - j.total)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusMenu job={j} />
                        {j.status === "cancelled" && j.cancelReason && (
                          <p className="mt-1 max-w-40 text-xs text-destructive">{j.cancelReason}</p>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <JobRowMenu job={j} onEdit={() => setEditing(j)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {editing && (
        <JobEditor
          job={editing === "new" ? undefined : editing}
          initialStatus={newStatus}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
