import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { collection, query, where } from "firebase/firestore";
import { Receipt, Wallet } from "lucide-react";
import { PaymentDialog } from "@/components/billing-dialogs";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PAYMENT_METHODS,
  balanceOf,
  daysSince,
  outstanding,
  paidOf,
  sumPayments,
  type Payment,
} from "@/lib/billing";
import { formatLKR } from "@/lib/currency";
import { db } from "@/lib/firebase";
import { isoDate, type Job } from "@/lib/job";
import { localDay } from "@/lib/reports";
import { useLiveQuery, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

type Tab = "outstanding" | "payments";

function BillingPage() {
  const [tab, setTab] = useState<Tab>("outstanding");
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <PageHeader title="Billing" description="Money owed on jobs, and payments received." />
      <div role="tablist" className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ["outstanding", "Outstanding"],
            ["payments", "Payments"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "h-9 rounded-md px-3 text-sm font-medium",
              tab === k ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "outstanding" ? <Outstanding /> : <Payments />}
    </div>
  );
}

function Outstanding() {
  const { jobs } = useStore();
  const [paying, setPaying] = useState<Job | null>(null);
  const list = useMemo(
    () =>
      outstanding(jobs).sort(
        (a, b) =>
          Number(b.status === "completed") - Number(a.status === "completed") ||
          (a.completedAt ?? a.date).localeCompare(b.completedAt ?? b.date),
      ),
    [jobs],
  );
  const owed = list.reduce((s, j) => s + balanceOf(j), 0);
  const overdue = list
    .filter((j) => j.status === "completed")
    .reduce((s, j) => s + balanceOf(j), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Owed on open work</p>
          <p className="text-lg font-bold tabular-nums">{formatLKR(owed - overdue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Owed on completed jobs</p>
          <p className="text-lg font-bold text-destructive tabular-nums">{formatLKR(overdue)}</p>
        </Card>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Receipt className="h-8 w-8" />} title="Nothing outstanding" />
      ) : (
        <Card className="divide-y">
          {list.map((j) => {
            const age = j.completedAt ? daysSince(localDay(j.completedAt)) : 0;
            return (
              <div key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                <Link to="/jobs/$jobId" params={{ jobId: j.id }} className="min-w-0 flex-1">
                  <p className="truncate font-semibold hover:text-primary">{j.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {j.id}
                    {j.invoiceNo && ` · ${j.invoiceNo}`}
                  </p>
                </Link>
                {j.status === "completed" ? (
                  <Badge tone={age > 14 ? "danger" : "warning"}>
                    {age === 0
                      ? "Completed today"
                      : `${age} day${age === 1 ? "" : "s"} since completion`}
                  </Badge>
                ) : (
                  <Badge tone="info">Before work</Badge>
                )}
                <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">
                  {formatLKR(paidOf(j))} of {formatLKR(j.total)}
                </span>
                <span className="w-28 text-right font-bold text-destructive tabular-nums">
                  {formatLKR(balanceOf(j))}
                </span>
                <Button size="sm" variant="outline" onClick={() => setPaying(j)}>
                  <Wallet /> Pay
                </Button>
              </div>
            );
          })}
        </Card>
      )}
      {paying && <PaymentDialog job={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function Payments() {
  const today = isoDate();
  const monthStart = `${today.slice(0, 8)}01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const q = useMemo(
    () => query(collection(db, "payments"), where("date", ">=", from), where("date", "<=", to)),
    [from, to],
  );
  const { data, ready } = useLiveQuery<Payment>(q);
  const list = [...data].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  const live = list.filter((p) => !p.voided);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="pf">From</Label>
          <Input id="pf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pt">To</Label>
          <Input id="pt" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total received</p>
          <p className="text-lg font-bold tabular-nums">{formatLKR(sumPayments(live))}</p>
        </Card>
        {PAYMENT_METHODS.map((m) => (
          <Card key={m.value} className="p-4">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className="text-base font-semibold tabular-nums">
              {formatLKR(sumPayments(live.filter((p) => p.method === m.value)))}
            </p>
          </Card>
        ))}
      </div>
      {ready && list.length === 0 ? (
        <EmptyState icon={<Wallet className="h-8 w-8" />} title="No payments in this period" />
      ) : (
        <Card className="divide-y">
          {list.map((p) => (
            <Link
              key={p.id}
              to="/jobs/$jobId"
              params={{ jobId: p.jobId }}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm hover:bg-muted/40",
                p.voided && "opacity-60",
              )}
            >
              <span className="w-24 text-xs text-muted-foreground tabular-nums">{p.date}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.customerName}</span>
              <span className="text-xs text-muted-foreground">
                {PAYMENT_METHODS.find((m) => m.value === p.method)?.label}
                {p.reference && ` · ${p.reference}`}
              </span>
              {p.voided && <Badge tone="danger">Void</Badge>}
              <span
                className={cn(
                  "w-28 text-right font-semibold tabular-nums",
                  p.voided && "line-through",
                )}
              >
                {formatLKR(p.amount)}
              </span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
