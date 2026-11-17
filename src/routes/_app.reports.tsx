import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, FileBarChart, FileCheck2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRangeData } from "@/hooks/use-range-data";
import { useAuth } from "@/lib/auth";
import { PAYMENT_METHODS, balanceOf, paidOf } from "@/lib/billing";
import { formatLKR } from "@/lib/currency";
import { STATUS_LABEL, jobService } from "@/lib/job";
import { formatPhone } from "@/lib/phone";
import { ledgerDocument, reconciliationDocument } from "@/lib/report-documents";
import {
  downloadText,
  localDay,
  presetRange,
  rangeStats,
  toCSV,
  type Breakdown,
  type DateRange,
} from "@/lib/reports";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

const PRESETS = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["last-month", "Last month"],
  ["year", "This year"],
] as const;

function ReportsPage() {
  const { settings } = useStore();
  const { session } = useAuth();
  const [range, setRange] = useState<DateRange>(() => presetRange("month"));
  const { data, loading, error, reload } = useRangeData(range);
  const s = useMemo(
    () => rangeStats(data.jobs, data.payments, data.inspectionDates, range),
    [data, range],
  );
  const completed = data.jobs.filter(
    (j) =>
      !j.isDeleted &&
      j.status === "completed" &&
      j.completedAt &&
      localDay(j.completedAt) >= range.from &&
      localDay(j.completedAt) <= range.to,
  );
  const leadsByDay = useMemo(() => {
    const m = new Map<string, typeof data.jobs>();
    for (const j of data.jobs)
      if (!j.isDeleted && j.intakeDate >= range.from && j.intakeDate <= range.to)
        m.set(j.intakeDate, [...(m.get(j.intakeDate) ?? []), j]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data, range]);

  const exportCSV = () => {
    const rows = [
      [
        "Reference",
        "Intake",
        "Status",
        "Customer",
        "Phone",
        "Address",
        "Location",
        "Source",
        "Service",
        "Date",
        "End date",
        "Subtotal",
        "Discount",
        "Total",
        "Paid",
        "Balance",
        "Expenses",
        "Profit",
        "Quote",
        "Invoice",
        "Cancel reason",
        "Notes",
      ],
      ...data.jobs
        .filter((j) => !j.isDeleted)
        .sort((a, b) => a.intakeDate.localeCompare(b.intakeDate))
        .map((j) => [
          j.id,
          j.intakeDate,
          STATUS_LABEL[j.status],
          j.customerName,
          formatPhone(j.phone),
          j.address,
          j.locationName,
          j.source,
          jobService(j),
          j.date,
          j.endDate,
          j.subtotal,
          j.subtotal - j.total,
          j.total,
          paidOf(j),
          balanceOf(j),
          j.expenseTotal ?? 0,
          j.status === "completed" ? j.total - (j.expenseTotal ?? 0) : "",
          j.quoteNo ?? "",
          j.invoiceNo ?? "",
          j.cancelReason,
          j.notes,
        ]),
    ];
    downloadText(toCSV(rows), `TankSudda_Jobs_${range.from}_${range.to}.csv`);
  };

  const pdf = (fn: () => Promise<void>) =>
    void fn().catch(() => toast.error("Couldn't create the report."));

  const maxDaily = Math.max(1, ...s.daily.map((d) => d.revenue));

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Reports"
        description="Performance for any period, the daily ledger and the cash reconciliation."
        actions={
          <>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => pdf(() => ledgerDocument(completed, range, settings))}
            >
              <FileBarChart /> Ledger
            </Button>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() =>
                pdf(() =>
                  reconciliationDocument(
                    data.payments,
                    completed,
                    range,
                    settings,
                    session?.name ?? "",
                  ),
                )
              }
            >
              <FileCheck2 /> Reconciliation
            </Button>
            <Button variant="outline" disabled={loading} onClick={exportCSV}>
              <Download /> CSV
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map(([k, l]) => {
          const p = presetRange(k);
          const on = p.from === range.from && p.to === range.to;
          return (
            <Button
              key={k}
              size="sm"
              variant={on ? "default" : "outline"}
              onClick={() => setRange(p)}
            >
              {l}
            </Button>
          );
        })}
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="r-from">From</Label>
            <Input
              id="r-from"
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="r-to">To</Label>
            <Input
              id="r-to"
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </div>
          <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => void reload()}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Couldn't load this period. Check your access and connection.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Revenue (completed)" value={formatLKR(s.revenue)} />
        <Kpi label="Received" value={formatLKR(s.received)} />
        <Kpi label="Expenses" value={formatLKR(s.expenses)} />
        <Kpi label="Net profit" value={formatLKR(s.profit)} tone="text-success" />
        <Kpi label="New leads" value={String(s.leads)} />
        <Kpi label="Inspections" value={String(s.inspections)} />
        <Kpi label="Completed jobs" value={String(s.completed)} />
        <Kpi
          label="Conversion"
          value={`${s.conversion}%`}
          sub={`Avg job ${formatLKR(s.averageJob)}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue by day</CardTitle>
        </CardHeader>
        <CardContent>
          {s.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed jobs in this period.</p>
          ) : (
            <div
              className="flex h-40 items-end gap-1 overflow-x-auto"
              role="img"
              aria-label="Revenue by day"
            >
              {s.daily.map((d) => (
                <div
                  key={d.date}
                  className="flex min-w-6 flex-1 flex-col items-center gap-1"
                  title={`${d.date}: ${formatLKR(d.revenue)} from ${d.count} job(s)`}
                >
                  <div
                    className="w-full rounded-t bg-primary"
                    style={{ height: `${Math.max(4, (d.revenue / maxDaily) * 130)}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {Number(d.date.slice(8))}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {PAYMENT_METHODS.map((m) => (
              <span key={m.value}>
                {m.label}:{" "}
                <strong className="tabular-nums">
                  {formatLKR(s.receivedByMethod[m.value] ?? 0)}
                </strong>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BreakdownCard title="By location" rows={s.byLocation} />
        <BreakdownCard title="By lead source" rows={s.bySource} />
        <BreakdownCard title="By service (completed)" rows={s.byService} />
        <BreakdownCard title="Cancellation reasons" rows={s.cancelReasons} countOnly />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leads by day</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {leadsByDay.length === 0 && (
            <p className="text-sm text-muted-foreground">No leads in this period.</p>
          )}
          {leadsByDay.map(([day, list]) => (
            <div key={day}>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {day} · {list.length} lead{list.length === 1 ? "" : "s"}
              </p>
              <ul className="divide-y rounded-lg border">
                {list.map((j) => (
                  <li key={j.id}>
                    <Link
                      to="/jobs/$jobId"
                      params={{ jobId: j.id }}
                      className="flex flex-wrap gap-x-3 px-3 py-2 text-sm hover:bg-muted/40"
                    >
                      <span className="font-medium">{j.customerName}</span>
                      <span className="text-muted-foreground">{formatPhone(j.phone)}</span>
                      <span className="flex-1 truncate text-muted-foreground">
                        {j.locationName}
                      </span>
                      <span className="text-xs">{STATUS_LABEL[j.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = "",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", tone)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function BreakdownCard({
  title,
  rows,
  countOnly,
}: {
  title: string;
  rows: Breakdown[];
  countOnly?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => (countOnly ? r.count : r.revenue || r.count)));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing in this period.</p>
        )}
        {rows.slice(0, 8).map((r) => (
          <div key={r.key} className="space-y-1">
            <div className="flex justify-between gap-2 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {r.count}
                {!countOnly && r.revenue > 0 && ` · ${formatLKR(r.revenue)}`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${((countOnly ? r.count : r.revenue || r.count) / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
