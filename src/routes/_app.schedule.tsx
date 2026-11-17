import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { BookInspection } from "@/components/book-inspection";
import { JobEditor } from "@/components/job-editor";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { isoDate } from "@/lib/job";
import {
  eventsByDay,
  findConflicts,
  monthGrid,
  weekOf,
  type CalendarEvent,
  type EventTone,
} from "@/lib/schedule";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/schedule")({
  component: SchedulePage,
});

const TONE: Record<EventTone, { cls: string; label: string }> = {
  lead: { cls: "bg-info/12 text-info border-info/30", label: "Lead" },
  inspection: { cls: "bg-warning/15 text-warning border-warning/40", label: "Inspection" },
  scheduled: { cls: "bg-primary text-primary-foreground border-primary", label: "Scheduled" },
  progress: { cls: "bg-navy text-navy-foreground border-navy", label: "In progress" },
  done: { cls: "bg-success/12 text-success border-success/30", label: "Completed" },
  cancelled: {
    cls: "bg-muted text-muted-foreground border-border line-through",
    label: "Cancelled",
  },
};

type View = "month" | "week";

function SchedulePage() {
  const { jobs, inspections, staff, settings } = useStore();
  const today = isoDate();
  const [cursor, setCursor] = useState(today);
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "week" : "month",
  );
  const [crew, setCrew] = useState("");
  const [newJob, setNewJob] = useState(false);
  const [booking, setBooking] = useState(false);

  const cur = new Date(`${cursor}T00:00:00`);
  const weeks = useMemo(
    () => (view === "month" ? monthGrid(cur.getFullYear(), cur.getMonth()) : [weekOf(cursor)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, cursor],
  );
  const from = weeks[0]![0]!;
  const to = weeks.at(-1)!.at(-1)!;

  const days = useMemo(() => {
    const all = eventsByDay(jobs, inspections, from, to);
    if (!crew) return all;
    const out = new Map<string, CalendarEvent[]>();
    for (const [d, list] of all) {
      const mine = list.filter((e) => e.staffIds.includes(crew));
      if (mine.length) out.set(d, mine);
    }
    return out;
  }, [jobs, inspections, from, to, crew]);

  const conflicts = useMemo(
    () => findConflicts(jobs, inspections).filter((c) => c.date >= from && c.date <= to),
    [jobs, inspections, from, to],
  );
  const conflictDays = new Set(conflicts.map((c) => c.date));
  const nameOf = (c: (typeof conflicts)[number]) =>
    c.kind === "staff"
      ? (staff.find((s) => s.id === c.resourceId)?.name ?? "Someone")
      : (settings.equipment.find((e) => e.id === c.resourceId)?.name ?? "Equipment");

  const move = (dir: number) => {
    const d = new Date(cur);
    if (view === "month") d.setMonth(d.getMonth() + dir, 1);
    else d.setDate(d.getDate() + dir * 7);
    setCursor(isoDate(d));
  };

  const title =
    view === "month"
      ? cur.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : `${new Date(`${from}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(`${to}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const counts = useMemo(() => {
    const c: Partial<Record<EventTone, Set<string>>> = {};
    for (const list of days.values()) for (const e of list) (c[e.tone] ??= new Set()).add(e.id);
    return c;
  }, [days]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Schedule"
        description="Inspections and jobs by day, with crew and equipment clashes flagged."
        actions={
          <>
            <Button variant="outline" onClick={() => setBooking(true)}>
              <Plus /> Inspection
            </Button>
            <Button onClick={() => setNewJob(true)}>
              <Plus /> Job
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous" onClick={() => move(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" onClick={() => setCursor(today)}>
            Today
          </Button>
          <Button variant="outline" size="icon" aria-label="Next" onClick={() => move(1)}>
            <ChevronRight />
          </Button>
        </div>
        <h3 className="min-w-40 text-base font-semibold">{title}</h3>
        <div className="ml-auto flex gap-2">
          <Select aria-label="Crew member" value={crew} onChange={(e) => setCrew(e.target.value)}>
            <option value="">Everyone</option>
            {staff
              .filter((s) => s.active && s.crewRoles.length)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
          <div role="tablist" className="inline-flex gap-1 rounded-lg bg-muted p-1">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium capitalize",
                  view === v ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {(Object.keys(TONE) as EventTone[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-sm border", TONE[t].cls)} />
            {TONE[t].label} <strong>{counts[t]?.size ?? 0}</strong>
          </span>
        ))}
      </div>

      {conflicts.length > 0 && (
        <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> Double bookings
          </p>
          {conflicts.map((c) => (
            <p key={`${c.date}${c.resourceId}`} className="text-xs">
              {c.date}: <strong>{nameOf(c)}</strong> is on {c.refs.join(", ")}
            </p>
          ))}
        </div>
      )}

      {view === "month" ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-semibold text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((day) => {
                const inMonth = Number(day.slice(5, 7)) === cur.getMonth() + 1;
                const list = days.get(day) ?? [];
                return (
                  <div
                    key={day}
                    className={cn(
                      "min-h-24 space-y-1 border-r p-1 last:border-r-0 sm:min-h-28 sm:p-1.5",
                      !inMonth && "bg-muted/30",
                      conflictDays.has(day) && "bg-destructive/5",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                          day === today && "bg-primary font-bold text-primary-foreground",
                          !inMonth && "text-muted-foreground",
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                      {conflictDays.has(day) && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 text-destructive"
                          aria-label="Double booking"
                        />
                      )}
                    </div>
                    {list.slice(0, 4).map((e) => (
                      <EventChip key={e.key} e={e} compact />
                    ))}
                    {list.length > 4 && (
                      <button
                        className="w-full text-left text-[11px] font-medium text-primary"
                        onClick={() => {
                          setCursor(day);
                          setView("week");
                        }}
                      >
                        +{list.length - 4} more
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </Card>
      ) : (
        <div className="space-y-3">
          {weeks[0]!.map((day) => {
            const list = days.get(day) ?? [];
            return (
              <Card key={day} className={cn("p-3", day === today && "border-primary/50")}>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                  })}
                  {day === today && <span className="text-xs font-medium text-primary">Today</span>}
                  {conflictDays.has(day) && <AlertTriangle className="h-4 w-4 text-destructive" />}
                </p>
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing booked</p>
                ) : (
                  <div className="space-y-1.5">
                    {list.map((e) => (
                      <EventChip key={e.key} e={e} />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {newJob && <JobEditor initialStatus="scheduled" onClose={() => setNewJob(false)} />}
      {booking && <BookInspection onClose={() => setBooking(false)} />}
    </div>
  );
}

function EventChip({ e, compact }: { e: CalendarEvent; compact?: boolean }) {
  const cls = cn(
    "block w-full truncate border text-left transition-opacity hover:opacity-80",
    TONE[e.tone].cls,
    compact ? "px-1.5 py-0.5 text-[11px] font-medium" : "px-3 py-2 text-sm",
    e.span === "single" && "rounded-md",
    e.span === "start" && "rounded-l-md",
    e.span === "end" && "rounded-r-md",
  );
  const body = (
    <>
      {e.time && <span className="mr-1 font-semibold tabular-nums">{e.time}</span>}
      {e.kind === "inspection" && !compact && "Inspection: "}
      {e.title}
      {!compact && <span className="block truncate text-xs opacity-80">{e.subtitle}</span>}
    </>
  );
  return e.kind === "job" ? (
    <Link
      to="/jobs/$jobId"
      params={{ jobId: e.id }}
      className={cls}
      title={`${e.title} · ${e.subtitle}`}
    >
      {body}
    </Link>
  ) : (
    <Link
      to="/inspections/$inspectionId"
      params={{ inspectionId: e.id }}
      className={cls}
      title={`${e.title} · ${e.subtitle}`}
    >
      {body}
    </Link>
  );
}
