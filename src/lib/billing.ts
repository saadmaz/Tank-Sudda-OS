// Money owed and received on a job. Pure.

import { roundMoney, sumMoney, toAmount } from "./currency";
import type { Job } from "./job";

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
export type PaymentStatus = "unpaid" | "partial" | "paid";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Part paid",
  paid: "Paid",
};

/** `payments/{id}`: one amount received against a job. */
export interface Payment {
  id: string;
  jobId: string;
  customerId: string;
  customerName: string;
  amount: number;
  method: PaymentMethod;
  /** YYYY-MM-DD the money was received. */
  date: string;
  reference: string;
  note: string;
  receivedBy: string;
  createdAt: string;
  createdBy: string;
  voided: boolean;
  voidReason: string;
  voidedAt: string | null;
}

export interface Expense {
  category: string;
  amount: number;
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Fuel",
  "Staff incentive",
  "Chemicals",
  "Meals",
  "Other",
];

/** Billing fields stored on a job. Older jobs may lack them; read through these helpers. */
export interface JobBilling {
  paidAmount: number;
  paymentStatus: PaymentStatus;
  expenses: Expense[];
  expenseTotal: number;
  profit: number;
  quoteNo: string;
  invoiceNo: string;
  invoiceDate: string;
}

export const paidOf = (j: Partial<JobBilling>) => toAmount(j.paidAmount);
export const balanceOf = (j: Pick<Job, "total"> & Partial<JobBilling>) =>
  roundMoney(j.total - paidOf(j));

export function paymentStatusFor(total: number, paid: number): PaymentStatus {
  if (paid <= 0) return "unpaid";
  return paid + 0.005 >= total ? "paid" : "partial";
}

export const sumPayments = (payments: readonly Payment[]) =>
  sumMoney(payments.filter((p) => !p.voided).map((p) => p.amount));

export const sumExpenses = (expenses: readonly Expense[]) =>
  sumMoney(expenses.map((e) => e.amount));

export const profitOf = (total: number, expenses: readonly Expense[]) =>
  roundMoney(total - sumExpenses(expenses));

/** Jobs with money still owed: scheduled or later, not cancelled, balance above zero. */
export function outstanding<T extends Job & Partial<JobBilling>>(jobs: readonly T[]): T[] {
  return jobs.filter(
    (j) =>
      !j.isDeleted &&
      (j.status === "scheduled" || j.status === "in_progress" || j.status === "completed") &&
      balanceOf(j) > 0,
  );
}

/** "Q-1001", "INV-1001". */
export const docNumber = (prefix: "Q" | "INV", n: number) => `${prefix}-${n}`;

/** Whole days since `date` (YYYY-MM-DD), for ageing unpaid invoices. */
export function daysSince(date: string, today = new Date()): number {
  if (!date) return 0;
  const d = new Date(`${date}T00:00:00`).getTime();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.round((t - d) / 86_400_000));
}
