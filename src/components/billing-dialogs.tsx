import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Field, Label } from "./ui/label";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  balanceOf,
  paidOf,
  profitOf,
  sumExpenses,
  type Expense,
  type Payment,
  type PaymentMethod,
} from "@/lib/billing";
import { settlementDocument } from "@/lib/billing-documents";
import { formatLKR, roundMoney, toAmount } from "@/lib/currency";
import { recordPayment, settleJob, voidPayment, type PaymentInput } from "@/lib/db";
import { isoDate, type Job } from "@/lib/job";
import { priceSummary } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { useJobPayments } from "@/hooks/use-job-payments";
import { useJobNames } from "@/hooks/use-names";
import { cn } from "@/lib/utils";

function MethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Payment method"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {PAYMENT_METHODS.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={value === m.value}
          onClick={() => onChange(m.value)}
          className={cn(
            "h-10 rounded-md border text-sm font-medium",
            value === m.value
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card hover:bg-muted",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function PaymentFields({
  value,
  onChange,
}: {
  value: PaymentInput;
  onChange: (p: PaymentInput) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (LKR)" htmlFor="pay-amount">
          <Input
            id="pay-amount"
            type="number"
            inputMode="decimal"
            value={value.amount || ""}
            onChange={(e) => onChange({ ...value, amount: toAmount(e.target.value) })}
          />
        </Field>
        <Field label="Date received" htmlFor="pay-date">
          <Input
            id="pay-date"
            type="date"
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        </Field>
      </div>
      <MethodPicker value={value.method} onChange={(method) => onChange({ ...value, method })} />
      {value.method !== "cash" && (
        <Field label="Reference (transfer or cheque no.)" htmlFor="pay-ref">
          <Input
            id="pay-ref"
            value={value.reference}
            onChange={(e) => onChange({ ...value, reference: e.target.value })}
          />
        </Field>
      )}
    </div>
  );
}

export function PaymentDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { settings } = useStore();
  const balance = balanceOf(job);
  const suggested =
    paidOf(job) === 0 && job.status !== "completed"
      ? roundMoney((job.total * settings.pricing.advancePercent) / 100)
      : balance;
  const [p, setP] = useState<PaymentInput>({
    amount: Math.max(0, suggested),
    method: "cash",
    date: isoDate(),
    reference: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await recordPayment(job, p);
      toast.success(`${formatLKR(p.amount)} recorded`);
      onClose();
    } catch {
      toast.error("Couldn't record the payment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {job.customerName} · balance {formatLKR(balance)}
          </DialogDescription>
        </DialogHeader>
        <PaymentFields value={p} onChange={setP} />
        {p.amount > balance && balance > 0 && (
          <p className="text-xs font-medium text-warning">
            More than the balance of {formatLKR(balance)}.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || p.amount <= 0 || !p.date}>
            Record {formatLKR(p.amount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VoidDialog({
  payment,
  job,
  onClose,
}: {
  payment: Payment;
  job: Job;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Void {formatLKR(payment.amount)}?</DialogTitle>
          <DialogDescription>
            The payment stays on record, marked void, and the balance goes back up.
          </DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="void-reason">
          <Input
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Entered twice"
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !reason.trim()}
            onClick={() => {
              setBusy(true);
              void voidPayment(payment, job, reason.trim())
                .then(() => {
                  toast.success("Payment voided");
                  onClose();
                })
                .catch(() => toast.error("Couldn't void. Billing access needed."))
                .finally(() => setBusy(false));
            }}
          >
            Void
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Completes a job with its final discount, expenses, profit and last payment. */
export function SettleDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { settings } = useStore();
  const names = useJobNames();
  const payments = useJobPayments(job.id);
  const [discount, setDiscount] = useState(job.discount);
  const [expenses, setExpenses] = useState<Expense[]>(
    job.expenses?.length
      ? job.expenses
      : DEFAULT_EXPENSE_CATEGORIES.slice(0, 2).map((category) => ({ category, amount: 0 })),
  );
  const summary = priceSummary({ ...job, discount });
  const balance = roundMoney(summary.total - paidOf(job));
  const [collect, setCollect] = useState(balance > 0);
  const [form, setForm] = useState<PaymentInput>({
    amount: 0,
    method: "cash",
    date: isoDate(),
    reference: "",
    note: "",
  });
  // The amount follows the balance (which moves with the discount) until edited.
  const [amountEdited, setAmountEdited] = useState(false);
  const p = { ...form, amount: amountEdited ? form.amount : Math.max(0, balance) };
  const setP = (next: PaymentInput) => {
    if (next.amount !== p.amount) setAmountEdited(true);
    setForm(next);
  };
  const [busy, setBusy] = useState(false);
  const expenseTotal = sumExpenses(expenses);

  const settle = async () => {
    setBusy(true);
    try {
      const done = await settleJob(job, {
        discount,
        expenses,
        finalPayment: collect && p.amount > 0 ? p : null,
        recleanMonths: settings.reminders.recleanMonths,
      });
      toast.success(`${job.id} settled`, {
        action: {
          label: "Settlement PDF",
          onClick: () => void settlementDocument(done, settings, payments, names(done)),
        },
      });
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Couldn't settle the job.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settle {job.id}</DialogTitle>
          <DialogDescription>
            Close the job with its final price, expenses and payment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
          <Row label="Subtotal" value={formatLKR(summary.subtotal)} />
          <Row label="Discount" value={`−${formatLKR(summary.discount)}`} tone="text-destructive" />
          <Row label="Final total" value={formatLKR(summary.total)} strong />
          <Row label="Already paid" value={formatLKR(paidOf(job))} tone="text-success" />
        </div>

        <Field label="Discount (LKR)" htmlFor="st-discount">
          <Input
            id="st-discount"
            type="number"
            inputMode="decimal"
            value={discount || ""}
            onChange={(e) => setDiscount(toAmount(e.target.value))}
          />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Expenses</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpenses([...expenses, { category: "", amount: 0 }])}
            >
              <Plus /> Add
            </Button>
          </div>
          {expenses.map((e, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label="Expense category"
                list="expense-categories"
                value={e.category}
                onChange={(ev) =>
                  setExpenses(
                    expenses.map((x, j) => (j === i ? { ...x, category: ev.target.value } : x)),
                  )
                }
              />
              <Input
                aria-label="Expense amount"
                type="number"
                inputMode="decimal"
                className="w-32"
                value={e.amount || ""}
                onChange={(ev) =>
                  setExpenses(
                    expenses.map((x, j) =>
                      j === i ? { ...x, amount: toAmount(ev.target.value) } : x,
                    ),
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove expense"
                onClick={() => setExpenses(expenses.filter((_, j) => j !== i))}
              >
                <Minus />
              </Button>
            </div>
          ))}
          <datalist id="expense-categories">
            {DEFAULT_EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={collect}
              onChange={(e) => setCollect(e.target.checked)}
            />
            Collect a payment now
          </label>
          {collect && <PaymentFields value={p} onChange={setP} />}
        </div>

        <div className="space-y-1 rounded-lg bg-success/10 p-3 text-sm">
          <Row label="Expenses" value={formatLKR(expenseTotal)} />
          <Row label="Net profit" value={formatLKR(profitOf(summary.total, expenses))} strong />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void settle()} disabled={busy}>
            Settle and complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className={cn("flex justify-between", strong && "font-bold", tone)}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
