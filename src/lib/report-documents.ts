// Operations ledger and payment reconciliation PDFs, for any date range.

import { PAYMENT_METHODS, sumPayments, type Payment } from "./billing";
import { formatAmount, formatLKR, sumMoney } from "./currency";
import { jobService, type Job } from "./job";
import { deliver, finish, fmtDate, infoPanel, sectionTitle, startDocument, table } from "./pdf";
import type { DateRange } from "./reports";
import type { Settings } from "./settings";

const label = (r: DateRange) =>
  r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} to ${fmtDate(r.to)}`;
const right = { halign: "right" as const };
const bold = (t: string) => ({ content: t, styles: { fontStyle: "bold" as const } });

/** Completed jobs with revenue, expenses and profit. */
export async function ledgerDocument(completed: Job[], r: DateRange, settings: Settings) {
  const rows = [...completed].sort((a, b) =>
    (a.completedAt ?? "").localeCompare(b.completedAt ?? ""),
  );
  const revenue = sumMoney(rows.map((j) => j.total));
  const expenses = sumMoney(rows.map((j) => j.expenseTotal ?? 0));
  const started = await startDocument(settings, {
    title: "Operations ledger",
    meta: [label(r), `${rows.length} completed job${rows.length === 1 ? "" : "s"}`],
  });
  const doc = started.doc;
  let y = infoPanel(doc, started.y, [
    { label: "Revenue", lines: [formatLKR(revenue)] },
    { label: "Expenses", lines: [formatLKR(expenses)] },
    { label: "Net profit", lines: [formatLKR(revenue - expenses)] },
  ]);
  y = table(
    doc,
    y,
    ["Date", "Job", "Customer", "Service", "Revenue", "Expenses", "Profit"],
    [
      ...rows.map((j) => [
        fmtDate(j.completedAt ?? ""),
        j.id,
        j.customerName,
        jobService(j),
        formatAmount(j.total),
        formatAmount(j.expenseTotal ?? 0),
        formatAmount(j.total - (j.expenseTotal ?? 0)),
      ]),
      [
        bold("Total"),
        "",
        "",
        "",
        bold(formatAmount(revenue)),
        bold(formatAmount(expenses)),
        bold(formatAmount(revenue - expenses)),
      ],
    ],
    { styles: { fontSize: 8 }, columnStyles: { 4: right, 5: right, 6: right } },
  );
  finish(doc, settings);
  await deliver(doc, `Ledger_${r.from}_${r.to}.pdf`);
}

/** Money in by method, each payment, and the expenses of jobs completed in the range. */
export async function reconciliationDocument(
  payments: Payment[],
  completed: Job[],
  r: DateRange,
  settings: Settings,
  preparedBy: string,
) {
  const live = payments.filter((p) => !p.voided).sort((a, b) => a.date.localeCompare(b.date));
  const expenseRows = completed.flatMap((j) => (j.expenses ?? []).map((e) => ({ job: j, ...e })));
  const totalExpenses = sumMoney(expenseRows.map((e) => e.amount));
  const started = await startDocument(settings, {
    title: "Reconciliation",
    meta: [
      label(r),
      `Prepared by ${preparedBy}`,
      `Generated ${new Date().toLocaleString("en-GB")}`,
    ],
  });
  const doc = started.doc;
  let y = sectionTitle(doc, started.y, "Summary");
  y = table(
    doc,
    y,
    null,
    [
      ...PAYMENT_METHODS.map((m) => [
        `${m.label} received`,
        formatLKR(sumPayments(live.filter((p) => p.method === m.value))),
      ]),
      [bold("Total received"), bold(formatLKR(sumPayments(live)))],
      ["Operational expenses (completed jobs)", formatLKR(totalExpenses)],
    ],
    { columnStyles: { 1: { ...right, cellWidth: 55 } } },
  );
  y = sectionTitle(doc, y, "Payments received");
  y = table(
    doc,
    y,
    ["Date", "Job", "Customer", "Method", "Reference", "Amount"],
    live.length
      ? live.map((p) => [
          fmtDate(p.date),
          p.jobId,
          p.customerName,
          PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method,
          p.reference || "—",
          formatAmount(p.amount),
        ])
      : [["—", "", "No payments in this period", "", "", ""]],
    { styles: { fontSize: 8 }, columnStyles: { 5: right } },
  );
  y = sectionTitle(doc, y, "Expenses");
  table(
    doc,
    y,
    ["Job", "Customer", "Category", "Amount"],
    expenseRows.length
      ? expenseRows.map((e) => [e.job.id, e.job.customerName, e.category, formatAmount(e.amount)])
      : [["—", "No expenses recorded", "", ""]],
    { styles: { fontSize: 8 }, columnStyles: { 3: right } },
  );
  finish(doc, settings);
  await deliver(doc, `Reconciliation_${r.from}_${r.to}.pdf`);
}
