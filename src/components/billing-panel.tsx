import { useState } from "react";
import { Ban, FileText, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PaymentDialog, SettleDialog, VoidDialog } from "./billing-dialogs";
import { useJobPayments } from "@/hooks/use-job-payments";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useJobNames } from "@/hooks/use-names";
import { useAuth } from "@/lib/auth";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUS_LABEL,
  balanceOf,
  paidOf,
  paymentStatusFor,
  type Payment,
} from "@/lib/billing";
import {
  invoiceDocument,
  quoteDocument,
  receiptDocument,
  settlementDocument,
} from "@/lib/billing-documents";
import { formatLKR } from "@/lib/currency";
import { issueNumber, setJobStatus } from "@/lib/db";
import type { Job } from "@/lib/job";
import { useStore } from "@/lib/store";

/** Payments, balance and documents for one job. */
export function BillingPanel({ job }: { job: Job }) {
  const { settings } = useStore();
  const { can, online } = useAuth();
  const names = useJobNames();
  const payments = useJobPayments(job.id);
  const [paying, setPaying] = useState(false);
  const [settling, setSettling] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const status = job.paymentStatus ?? paymentStatusFor(job.total, paidOf(job));
  const office = can("billing") || can("leads");
  const canSettle = office && (job.status === "scheduled" || job.status === "in_progress");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast.error(
        online ? "Couldn't create the document." : "Numbered documents need a connection.",
      );
    } finally {
      setBusy(false);
    }
  };

  const quote = () =>
    run(async () => {
      const no = await issueNumber(job, "quote", settings.documents.nextQuoteNumber);
      if (job.status === "new") await setJobStatus(job, "quoted");
      await quoteDocument({ ...job, quoteNo: no }, settings, no);
    });
  const invoice = () =>
    run(async () => {
      const no = await issueNumber(job, "invoice", settings.documents.nextInvoiceNumber);
      await invoiceDocument({ ...job, invoiceNo: no }, settings, no, payments);
    });

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          Billing
          <Badge tone={status === "paid" ? "success" : status === "partial" ? "warning" : "danger"}>
            {PAYMENT_STATUS_LABEL[status]}
          </Badge>
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          {office && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void quote()}>
              <FileText /> {job.quoteNo ? `Quote ${job.quoteNo}` : "Quote"}
            </Button>
          )}
          {office && job.status !== "new" && job.status !== "quoted" && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void invoice()}>
              <Receipt /> {job.invoiceNo ? `Invoice ${job.invoiceNo}` : "Invoice"}
            </Button>
          )}
          {job.status === "completed" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(() => settlementDocument(job, settings, payments, names(job)))
              }
            >
              Settlement
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Total" value={formatLKR(job.total)} />
          <Stat label="Paid" value={formatLKR(paidOf(job))} tone="text-success" />
          <Stat
            label="Balance"
            value={formatLKR(balanceOf(job))}
            tone={balanceOf(job) > 0 ? "text-destructive" : ""}
          />
        </div>

        {payments.length > 0 && (
          <ul className="divide-y text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="tabular-nums text-muted-foreground">{p.date}</span>
                <span className={p.voided ? "line-through" : ""}>
                  {PAYMENT_METHODS.find((m) => m.value === p.method)?.label}
                  {p.reference && ` · ${p.reference}`}
                </span>
                {p.voided && <Badge tone="danger">Void: {p.voidReason}</Badge>}
                <span className="ml-auto font-semibold tabular-nums">{formatLKR(p.amount)}</span>
                {!p.voided && (
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Receipt PDF"
                      onClick={() => void run(() => receiptDocument(p, job, settings))}
                    >
                      Receipt
                    </Button>
                    {can("billing") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Void payment"
                        onClick={() => setVoiding(p)}
                      >
                        <Ban />
                      </Button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {!job.isDeleted && job.status !== "cancelled" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPaying(true)}>
              <Wallet /> Record payment
            </Button>
            {canSettle && <Button onClick={() => setSettling(true)}>Settle and complete</Button>}
          </div>
        )}
      </CardContent>
      {paying && <PaymentDialog job={job} onClose={() => setPaying(false)} />}
      {settling && <SettleDialog job={job} onClose={() => setSettling(false)} />}
      {voiding && <VoidDialog payment={voiding} job={job} onClose={() => setVoiding(null)} />}
    </Card>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
