import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardCheck, Plus } from "lucide-react";
import { BookInspection } from "@/components/book-inspection";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useJobNames } from "@/hooks/use-names";
import {
  INSPECTION_STATUS_LABEL,
  INSPECTION_TYPES,
  inspectionWarnings,
  type InspectionStatus,
} from "@/lib/inspection";
import { isoDate, scheduleLabel } from "@/lib/job";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inspections/")({
  component: InspectionsPage,
});

const TABS: InspectionStatus[] = ["scheduled", "completed", "cancelled"];

function InspectionsPage() {
  const { inspections } = useStore();
  const names = useJobNames();
  const [tab, setTab] = useState<InspectionStatus>("scheduled");
  const [booking, setBooking] = useState(false);
  const today = isoDate();

  const list = useMemo(
    () =>
      inspections
        .filter((i) => i.status === tab)
        .sort((a, b) =>
          tab === "scheduled"
            ? `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)
            : `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`),
        ),
    [inspections, tab],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Inspections"
        description="Site visits that check access and measure the work before it's quoted."
        actions={
          <Button onClick={() => setBooking(true)}>
            <Plus /> Book inspection
          </Button>
        }
      />
      <div role="tablist" className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "h-9 rounded-md px-3 text-sm font-medium",
              tab === t ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "scheduled" ? "Upcoming" : INSPECTION_STATUS_LABEL[t]} (
            {inspections.filter((i) => i.status === t).length})
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-8 w-8" />}
          title={tab === "scheduled" ? "No upcoming inspections" : "Nothing here yet"}
          description={
            tab === "scheduled" ? "Book one from a lead, or with the button above." : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {list.map((i) => {
            const warnings = i.status === "completed" ? inspectionWarnings(i) : [];
            const overdue = i.status === "scheduled" && i.date < today;
            return (
              <Link key={i.id} to="/inspections/$inspectionId" params={{ inspectionId: i.id }}>
                <Card className="flex flex-col gap-1 p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{i.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {INSPECTION_TYPES.find((t) => t.value === i.type)?.label} ·{" "}
                      {i.address || i.locationName}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn(overdue && "font-semibold text-destructive")}>
                      {scheduleLabel({ date: i.date, endDate: "", time: i.time })}
                    </span>
                    <span className="text-muted-foreground">
                      {names({ supervisorId: i.inspectorId, technicianIds: [], equipmentIds: [] })
                        .supervisor || "No inspector"}
                    </span>
                    {overdue && <Badge tone="danger">Overdue</Badge>}
                    {warnings.length > 0 && (
                      <Badge tone="warning">
                        <AlertTriangle className="h-3 w-3" /> {warnings.length}
                      </Badge>
                    )}
                    {i.appliedToJobAt && <Badge tone="success">Priced</Badge>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      {booking && <BookInspection onClose={() => setBooking(false)} />}
    </div>
  );
}
