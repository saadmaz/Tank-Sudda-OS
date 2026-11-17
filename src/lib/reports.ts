// Aggregations behind the dashboard and reports. Pure.

import { sumPayments, type Payment } from "./billing";
import { roundMoney, sumMoney } from "./currency";
import { JOB_SOURCES, isoDate, type Job } from "./job";

export interface DateRange {
  from: string;
  to: string;
}

/**
 * The local calendar day of a stored value. Dates (YYYY-MM-DD) are already
 * local; ISO timestamps are UTC, which in Sri Lanka (UTC+5:30) is the
 * previous day until 05:30, so they are converted.
 */
export const localDay = (v: string) => (v.length > 10 ? isoDate(new Date(v)) : v);

/** UTC bounds of a local date range, for querying timestamp fields. */
export function timestampBounds(r: DateRange): { from: string; to: string } {
  return {
    from: new Date(`${r.from}T00:00:00`).toISOString(),
    to: new Date(`${r.to}T23:59:59.999`).toISOString(),
  };
}

const inRange = (d: string | null | undefined, r: DateRange) =>
  !!d && localDay(d) >= r.from && localDay(d) <= r.to;

export interface Breakdown {
  key: string;
  label: string;
  count: number;
  revenue: number;
}

export interface RangeStats {
  leads: number;
  inspections: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  revenue: number;
  expenses: number;
  profit: number;
  received: number;
  receivedByMethod: Record<string, number>;
  averageJob: number;
  /** Leads in the range that went on to be scheduled or completed, as a percentage. */
  conversion: number;
  byLocation: Breakdown[];
  bySource: Breakdown[];
  byService: Breakdown[];
  cancelReasons: Breakdown[];
  /** Revenue of completed jobs per day. */
  daily: { date: string; revenue: number; count: number }[];
}

export function serviceKind(j: Pick<Job, "tanks" | "sumps">): "tank" | "sump" | "both" | "none" {
  if (j.tanks.length && j.sumps.length) return "both";
  if (j.tanks.length) return "tank";
  if (j.sumps.length) return "sump";
  return "none";
}

const SERVICE_LABEL = {
  tank: "Overhead tanks",
  sump: "Sumps",
  both: "Tanks and sumps",
  none: "Not specified",
};

function breakdown(
  jobs: Job[],
  keyOf: (j: Job) => string,
  labelOf: (k: string) => string,
): Breakdown[] {
  const m = new Map<string, Breakdown>();
  for (const j of jobs) {
    const key = keyOf(j);
    const b = m.get(key) ?? { key, label: labelOf(key), count: 0, revenue: 0 };
    b.count++;
    b.revenue = roundMoney(b.revenue + (j.status === "completed" ? j.total : 0));
    m.set(key, b);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
}

export function rangeStats(
  jobs: readonly Job[],
  payments: readonly Payment[],
  inspectionDates: readonly string[],
  r: DateRange,
): RangeStats {
  const live = jobs.filter((j) => !j.isDeleted);
  const leads = live.filter((j) => inRange(j.intakeDate, r));
  const completed = live.filter((j) => j.status === "completed" && inRange(j.completedAt, r));
  const cancelled = live.filter((j) => j.status === "cancelled" && inRange(j.cancelledAt, r));
  const scheduled = live.filter(
    (j) => (j.status === "scheduled" || j.status === "in_progress") && inRange(j.date, r),
  );
  const paid = payments.filter((p) => !p.voided && inRange(p.date, r));

  const revenue = sumMoney(completed.map((j) => j.total));
  const expenses = sumMoney(completed.map((j) => j.expenseTotal ?? 0));
  const receivedByMethod: Record<string, number> = {};
  for (const p of paid)
    receivedByMethod[p.method] = roundMoney((receivedByMethod[p.method] ?? 0) + p.amount);

  const converted = leads.filter((j) =>
    ["scheduled", "in_progress", "completed"].includes(j.status),
  ).length;

  const daily = new Map<string, { date: string; revenue: number; count: number }>();
  for (const j of completed) {
    const d = localDay(j.completedAt!);
    const e = daily.get(d) ?? { date: d, revenue: 0, count: 0 };
    e.revenue = roundMoney(e.revenue + j.total);
    e.count++;
    daily.set(d, e);
  }

  return {
    leads: leads.length,
    inspections: inspectionDates.filter((d) => inRange(d, r)).length,
    scheduled: scheduled.length,
    completed: completed.length,
    cancelled: cancelled.length,
    revenue,
    expenses,
    profit: roundMoney(revenue - expenses),
    received: sumPayments(paid),
    receivedByMethod,
    averageJob: completed.length ? roundMoney(revenue / completed.length) : 0,
    conversion: leads.length ? Math.round((converted / leads.length) * 100) : 0,
    byLocation: breakdown(
      [...leads, ...completed.filter((j) => !leads.includes(j))],
      (j) => j.locationName || "Unknown",
      (k) => k,
    ),
    bySource: breakdown(
      leads,
      (j) => j.source,
      (k) => JOB_SOURCES.find((s) => s.value === k)?.label ?? k,
    ),
    byService: breakdown(
      completed,
      serviceKind,
      (k) => SERVICE_LABEL[k as keyof typeof SERVICE_LABEL],
    ),
    cancelReasons: breakdown(
      cancelled,
      (j) => (j.cancelReason || "No reason").split(":")[0]!,
      (k) => k,
    ),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Common report ranges, relative to `today`. */
export function presetRange(
  preset: "today" | "week" | "month" | "last-month" | "year",
  today = new Date(),
): DateRange {
  const t = isoDate(today);
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "today":
      return { from: t, to: t };
    case "week": {
      const d = new Date(today);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return { from: isoDate(d), to: t };
    }
    case "month":
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
    case "last-month":
      return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) };
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

/** RFC 4180 CSV: every field quoted when needed, CRLF line endings. */
export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? "" : String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadText(text: string, fileName: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿", text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
