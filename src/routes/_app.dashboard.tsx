import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { collection, query, where } from "firebase/firestore";
import { AlertTriangle, ArrowRight, Bell, CalendarDays, Inbox, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { balanceOf, outstanding, sumPayments, type Payment } from "@/lib/billing";
import { formatLKR } from "@/lib/currency";
import { db } from "@/lib/firebase";
import { daysSince } from "@/lib/billing";
import { isoDate, jobService } from "@/lib/job";
import { presetRange, rangeStats } from "@/lib/reports";
import { eventsByDay, findConflicts } from "@/lib/schedule";
import { useLiveQuery, useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { session, can } = useAuth();
  const { jobs, inspections, customers, settings } = useStore();
  const today = isoDate();
  const month = presetRange("month");
  const money = can("billing") || can("reports");

  const paymentsQuery = useMemo(
    () =>
      money
        ? query(
            collection(db, "payments"),
            where("date", ">=", month.from),
            where("date", "<=", month.to),
          )
        : null,
    [money, month.from, month.to],
  );
  const { data: payments } = useLiveQuery<Payment>(paymentsQuery);

  const s = useMemo(
    () =>
      rangeStats(
        jobs,
        payments,
        inspections.map((i) => (i.status === "cancelled" ? "" : i.date)),
        month,
      ),
    [jobs, payments, inspections, month],
  );
  const target = settings.targets.monthlyRevenue;
  const progress = target ? Math.min(100, Math.round((s.revenue / target) * 100)) : 0;
  const todays = eventsByDay(jobs, inspections, today, today).get(today) ?? [];
  const followUps = jobs.filter(
    (j) =>
      !j.isDeleted && (j.status === "new" || j.status === "quoted") && daysSince(j.intakeDate) >= 2,
  );
  const due = customers.filter((c) => !c.isDeleted && c.nextDueDate && c.nextDueDate <= today);
  const owed = outstanding(jobs).reduce((t, j) => t + balanceOf(j), 0);
  const clashes = findConflicts(jobs, inspections).filter((c) => c.date >= today);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title={`${greeting()}, ${session?.name.split(" ")[0] ?? ""}`}
        description={new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      />

      {money && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Revenue this month</p>
                <p className="text-2xl font-bold tabular-nums">{formatLKR(s.revenue)}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {progress}% of {formatLKR(target)} target
              </p>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Monthly target"
            >
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                Cash{" "}
                <strong className="tabular-nums">{formatLKR(s.receivedByMethod.cash ?? 0)}</strong>
              </span>
              <span>
                Bank{" "}
                <strong className="tabular-nums">{formatLKR(s.receivedByMethod.bank ?? 0)}</strong>
              </span>
              <span>
                Received{" "}
                <strong className="tabular-nums">{formatLKR(sumPayments(payments))}</strong>
              </span>
              <span>
                Owed <strong className="tabular-nums text-destructive">{formatLKR(owed)}</strong>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(
          [
            ["New leads", s.leads, "/leads"],
            ["Inspections", s.inspections, "/inspections"],
            ["Scheduled", s.scheduled, "/schedule"],
            ["Completed", s.completed, "/jobs"],
            ["Cancelled", s.cancelled, "/jobs"],
          ] as const
        ).map(([label, n, to]) => (
          <Link key={label} to={to}>
            <Card className="p-4 transition-colors hover:border-primary/40">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold tabular-nums">{n}</p>
              <p className="text-[11px] text-muted-foreground">this month</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent>
            {todays.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing booked today.</p>
            ) : (
              <ul className="divide-y">
                {todays.map((e) => (
                  <li key={e.key}>
                    <Link
                      to={e.kind === "job" ? "/jobs/$jobId" : "/inspections/$inspectionId"}
                      params={e.kind === "job" ? { jobId: e.id } : { inspectionId: e.id }}
                      className="flex items-center gap-3 py-2 text-sm hover:text-primary"
                    >
                      <span className="w-12 tabular-nums text-muted-foreground">
                        {e.time || "—"}
                      </span>
                      <span className="flex-1 truncate font-medium">{e.title}</span>
                      <Badge tone={e.kind === "inspection" ? "warning" : "brand"}>
                        {e.kind === "inspection" ? "Inspection" : "Job"}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Attention
              icon={<Inbox className="h-4 w-4" />}
              to="/leads"
              n={followUps.length}
              text="leads waiting 2+ days for a follow-up"
            />
            <Attention
              icon={<Wallet className="h-4 w-4" />}
              to="/billing"
              n={outstanding(jobs).filter((j) => j.status === "completed").length}
              text="completed jobs not fully paid"
            />
            <Attention
              icon={<Bell className="h-4 w-4" />}
              to="/customers"
              n={due.length}
              text="customers due for their next cleaning"
            />
            <Attention
              icon={<AlertTriangle className="h-4 w-4" />}
              to="/schedule"
              n={clashes.length}
              text="crew or equipment double bookings"
            />
            {followUps.slice(0, 4).map((j) => (
              <Link
                key={j.id}
                to="/jobs/$jobId"
                params={{ jobId: j.id }}
                className="block truncate pl-6 text-xs text-muted-foreground hover:text-primary"
              >
                {j.customerName} · {jobService(j)} · {daysSince(j.intakeDate)} days
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Attention({
  icon,
  to,
  n,
  text,
}: {
  icon: React.ReactNode;
  to: "/leads" | "/billing" | "/customers" | "/schedule";
  n: number;
  text: string;
}) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
      <span className={n ? "text-warning" : "text-muted-foreground"}>{icon}</span>
      <strong className="tabular-nums">{n}</strong>
      <span className="flex-1 text-muted-foreground">{text}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}
