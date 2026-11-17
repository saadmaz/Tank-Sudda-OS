// Calendar maths and double-booking checks for the schedule. Pure.

import { isoDate, jobDays, STATUS_LABEL, type Job } from "./job";
import type { Inspection } from "./inspection";

export type EventTone = "lead" | "scheduled" | "progress" | "done" | "cancelled" | "inspection";

export interface CalendarEvent {
  key: string;
  kind: "job" | "inspection";
  id: string;
  date: string;
  time: string;
  title: string;
  subtitle: string;
  tone: EventTone;
  /** Position within a multi-day job. */
  span: "single" | "start" | "middle" | "end";
  staffIds: string[];
  equipmentIds: string[];
}

const JOB_TONE: Record<Job["status"], EventTone> = {
  new: "lead",
  quoted: "lead",
  scheduled: "scheduled",
  in_progress: "progress",
  completed: "done",
  cancelled: "cancelled",
};

const crewOf = (j: Pick<Job, "supervisorId" | "technicianIds">) =>
  [j.supervisorId, ...j.technicianIds].filter(Boolean);

/** Every event on each day between `from` and `to` (inclusive, YYYY-MM-DD). */
export function eventsByDay(
  jobs: readonly Job[],
  inspections: readonly Inspection[],
  from: string,
  to: string,
): Map<string, CalendarEvent[]> {
  const out = new Map<string, CalendarEvent[]>();
  const add = (e: CalendarEvent) => {
    if (e.date < from || e.date > to) return;
    const list = out.get(e.date) ?? [];
    list.push(e);
    out.set(e.date, list);
  };

  for (const j of jobs) {
    if (j.isDeleted || !j.date) continue;
    const days = jobDays(j);
    days.forEach((date, n) =>
      add({
        key: `job-${j.id}-${date}`,
        kind: "job",
        id: j.id,
        date,
        time: n === 0 ? j.time : "",
        title: j.customerName,
        subtitle: `${STATUS_LABEL[j.status]} · ${j.locationName}`,
        tone: JOB_TONE[j.status],
        span:
          days.length === 1
            ? "single"
            : n === 0
              ? "start"
              : n === days.length - 1
                ? "end"
                : "middle",
        staffIds: crewOf(j),
        equipmentIds: j.equipmentIds,
      }),
    );
  }

  for (const i of inspections) {
    if (!i.date || i.status === "cancelled") continue;
    add({
      key: `insp-${i.id}`,
      kind: "inspection",
      id: i.id,
      date: i.date,
      time: i.time,
      title: i.customerName,
      subtitle: `Inspection · ${i.locationName}`,
      tone: i.status === "completed" ? "done" : "inspection",
      span: "single",
      staffIds: i.inspectorId ? [i.inspectorId] : [],
      equipmentIds: [],
    });
  }

  for (const list of out.values())
    list.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  return out;
}

export interface Conflict {
  date: string;
  kind: "staff" | "equipment";
  /** Staff or equipment id that is double-booked. */
  resourceId: string;
  /** References of the jobs and inspections involved. */
  refs: string[];
}

/** Active bookings (scheduled or in-progress jobs, scheduled inspections) as day-resource pairs. */
function bookings(jobs: readonly Job[], inspections: readonly Inspection[]) {
  const rows: { date: string; kind: Conflict["kind"]; resourceId: string; ref: string }[] = [];
  for (const j of jobs) {
    if (j.isDeleted || !(j.status === "scheduled" || j.status === "in_progress")) continue;
    for (const date of jobDays(j)) {
      for (const s of crewOf(j)) rows.push({ date, kind: "staff", resourceId: s, ref: j.id });
      for (const e of j.equipmentIds)
        rows.push({ date, kind: "equipment", resourceId: e, ref: j.id });
    }
  }
  for (const i of inspections) {
    if (i.status !== "scheduled" || !i.date || !i.inspectorId) continue;
    rows.push({ date: i.date, kind: "staff", resourceId: i.inspectorId, ref: i.id });
  }
  return rows;
}

/**
 * The same person or machine booked on two jobs on one day. An inspector may
 * fit an inspection around a job, so only job-on-job clashes count for staff.
 */
export function findConflicts(
  jobs: readonly Job[],
  inspections: readonly Inspection[] = [],
): Conflict[] {
  const groups = new Map<string, Conflict>();
  for (const b of bookings(jobs, inspections)) {
    const key = `${b.date}|${b.kind}|${b.resourceId}`;
    const g = groups.get(key) ?? { date: b.date, kind: b.kind, resourceId: b.resourceId, refs: [] };
    if (!g.refs.includes(b.ref)) g.refs.push(b.ref);
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.refs.filter((r) => r.startsWith("TS-")).length > 1)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Clashes a draft job would create with the other bookings. */
export function conflictsFor(
  draft: Pick<
    Job,
    "status" | "date" | "endDate" | "supervisorId" | "technicianIds" | "equipmentIds"
  >,
  others: readonly Job[],
  selfId?: string,
): Conflict[] {
  if (!draft.date) return [];
  const probe = { ...draft, id: "TS-DRAFT", isDeleted: false, status: "scheduled" } as Job;
  return findConflicts([...others.filter((j) => j.id !== selfId), probe]).filter((c) =>
    c.refs.includes("TS-DRAFT"),
  );
}

/** Weeks (Monday first) covering a month, as YYYY-MM-DD strings. */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const weeks: string[][] = [];
  const cur = new Date(start);
  do {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(isoDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  } while (cur.getMonth() === month);
  return weeks;
}

/** Monday-to-Sunday dates of the week containing `date`. */
export function weekOf(date: string): string[] {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, () => {
    const s = isoDate(d);
    d.setDate(d.getDate() + 1);
    return s;
  });
}
