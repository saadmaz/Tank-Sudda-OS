// Quotes, invoices, receipts and job settlements, on the shared layout in pdf.ts.

import {
  BRAND,
  PAGE,
  deliver,
  ensureSpace,
  finish,
  fmtDate,
  infoPanel,
  paragraph,
  sectionTitle,
  startDocument,
  table,
} from "./pdf";
import { PAYMENT_METHODS, balanceOf, paymentStatusFor, sumPayments, type Payment } from "./billing";
import { formatAmount, formatLKR, sumMoney } from "./currency";
import { isoDate, jobService, scheduleLabel, type Job } from "./job";
import { formatPhone } from "./phone";
import { advanceAmount, priceSummary } from "./pricing";
import type { Settings } from "./settings";

type Doc = Parameters<typeof table>[0];
type Tone = "strong" | "red" | "green";

const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;
const safeName = (s: string) => s.replace(/\W+/g, "_");

function customerColumns(job: Job, label: string) {
  return [
    {
      label,
      lines: [
        job.customerName,
        formatPhone(job.phone),
        job.altPhone ? formatPhone(job.altPhone) : "",
      ],
    },
    { label: "Site", lines: [job.address || "Address to be confirmed", job.locationName] },
  ];
}

function linesTable(doc: Doc, y: number, job: Job): number {
  const s = priceSummary(job);
  return table(
    doc,
    y,
    ["Description", "Qty", "Unit price", "Amount"],
    s.lines.map((l) => [
      l.detail ? `${l.title}\n${l.detail}` : l.title,
      String(l.qty),
      formatAmount(l.unitPrice),
      formatAmount(l.amount),
    ]),
    {
      columnStyles: {
        1: { halign: "center", cellWidth: 16 },
        2: { halign: "right", cellWidth: 32 },
        3: { halign: "right", cellWidth: 34 },
      },
    },
  );
}

function totalsBlock(doc: Doc, y: number, rows: [string, string, Tone?][]): number {
  y = ensureSpace(doc, y, rows.length * 7 + 8);
  const x1 = PAGE.w - PAGE.margin - 85;
  const x2 = PAGE.w - PAGE.margin - 4;
  doc.setFillColor(BRAND.panel).roundedRect(x1 - 4, y - 5, 89, rows.length * 7 + 4, 2, 2, "F");
  rows.forEach(([label, value, tone], i) => {
    const yy = y + i * 7;
    doc
      .setFont("helvetica", tone === "strong" ? "bold" : "normal")
      .setFontSize(tone === "strong" ? 11 : 9.5)
      .setTextColor(tone === "red" ? BRAND.red : tone === "green" ? BRAND.green : BRAND.text);
    doc.text(label, x1, yy);
    doc.text(value, x2, yy, { align: "right" });
  });
  return y + rows.length * 7 + 6;
}

function bankDetails(doc: Doc, y: number, settings: Settings): number {
  const b = settings.bank;
  if (!b.accountNumber) return y;
  y = ensureSpace(doc, y, 32);
  doc.setFillColor("#eff6ff").setDrawColor(BRAND.light).setLineWidth(0.3);
  doc.roundedRect(PAGE.margin, y, 95, 27, 2, 2, "FD");
  doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(BRAND.navy);
  doc.text("Pay by bank transfer", PAGE.margin + 5, y + 6.5);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(BRAND.text);
  [
    `Account name: ${b.accountName}`,
    `Account no.: ${b.accountNumber}`,
    `Bank: ${b.bankName}${b.branch ? `, ${b.branch}` : ""}`,
  ].forEach((l, i) => doc.text(l, PAGE.margin + 5, y + 12.5 + i * 4.8));
  return y + 33;
}

function discountRow(discount: number): [string, string, Tone][] {
  return discount ? [["Discount", `-${formatAmount(discount)}`, "red"]] : [];
}

export async function quoteDocument(job: Job, settings: Settings, quoteNo: string, share = false) {
  const valid = new Date();
  valid.setDate(valid.getDate() + settings.documents.quoteValidityDays);
  const started = await startDocument(settings, {
    title: "Quotation",
    meta: [
      `Quote no.: ${quoteNo}`,
      `Date: ${fmtDate(new Date().toISOString())}`,
      `Valid until: ${fmtDate(valid.toISOString())}`,
      `Job: ${job.id}`,
    ],
  });
  const doc = started.doc;
  let y = infoPanel(doc, started.y, customerColumns(job, "Prepared for"));
  y = linesTable(doc, y, job);
  const s = priceSummary(job);
  y = totalsBlock(doc, y + 4, [
    ["Subtotal", formatAmount(s.subtotal)],
    ...discountRow(s.discount),
    ["Total", formatLKR(s.total), "strong"],
    [
      `Advance (${settings.pricing.advancePercent}%)`,
      formatLKR(advanceAmount(s.total, settings.pricing.advancePercent)),
    ],
  ]);
  if (job.date) y = paragraph(doc, y, `Proposed date: ${scheduleLabel(job)}.`);
  y = bankDetails(doc, y, settings);

  if (settings.terms.length) {
    y = sectionTitle(doc, y + 2, "Terms and conditions") + 3;
    settings.terms.forEach((sec, n) => {
      y = ensureSpace(doc, y, 14);
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(BRAND.navy);
      doc.text(`${n + 1}. ${sec.title}`, PAGE.margin, y);
      y += 4.5;
      for (const c of sec.clauses)
        y = paragraph(doc, y, `${c.title ? `${c.title}: ` : ""}${c.text}`, 8.5);
      y += 1;
    });
  }
  finish(doc, settings);
  await deliver(doc, `Quote_${quoteNo}_${safeName(job.customerName)}.pdf`, share);
}

export async function invoiceDocument(
  job: Job,
  settings: Settings,
  invoiceNo: string,
  payments: Payment[],
  share = false,
) {
  const s = priceSummary(job);
  const live = payments.filter((p) => !p.voided).sort((a, b) => a.date.localeCompare(b.date));
  const paid = sumPayments(live);
  const balance = Math.max(0, s.total - paid);
  const status = paymentStatusFor(s.total, paid);
  const issued = job.invoiceDate || isoDate();
  const due = new Date(`${issued}T00:00:00`);
  due.setDate(due.getDate() + settings.documents.invoiceDueDays);

  const started = await startDocument(settings, {
    title: "Invoice",
    meta: [
      `Invoice no.: ${invoiceNo}`,
      `Date: ${fmtDate(issued)}`,
      ...(balance > 0 ? [`Due: ${fmtDate(due.toISOString())}`] : []),
      `Job: ${job.id}`,
    ],
    stamp:
      status === "paid"
        ? { text: "PAID", color: BRAND.green }
        : { text: status === "partial" ? "PART PAID" : "UNPAID", color: BRAND.red },
  });
  const doc = started.doc;
  let y = infoPanel(doc, started.y, customerColumns(job, "Bill to"));
  y = linesTable(doc, y, job);
  y = totalsBlock(doc, y + 4, [
    ["Subtotal", formatAmount(s.subtotal)],
    ...discountRow(s.discount),
    ["Total", formatLKR(s.total), "strong"],
    ["Paid", formatAmount(paid), "green"],
    ["Balance due", formatLKR(balance), balance > 0 ? "red" : "green"],
  ]);
  if (live.length) {
    y = sectionTitle(doc, y, "Payments received");
    y = table(
      doc,
      y,
      ["Date", "Method", "Reference", "Amount"],
      live.map((p) => [
        fmtDate(p.date),
        methodLabel(p.method),
        p.reference || "—",
        formatAmount(p.amount),
      ]),
      { columnStyles: { 3: { halign: "right" } } },
    );
  }
  if (balance > 0) bankDetails(doc, y, settings);
  finish(doc, settings);
  await deliver(doc, `Invoice_${invoiceNo}_${safeName(job.customerName)}.pdf`, share);
}

export async function receiptDocument(
  payment: Payment,
  job: Job,
  settings: Settings,
  share = false,
) {
  const started = await startDocument(settings, {
    title: "Receipt",
    meta: [
      `Receipt: R-${payment.id.slice(0, 8).toUpperCase()}`,
      `Date: ${fmtDate(payment.date)}`,
      `Job: ${job.id}`,
    ],
    stamp: { text: "RECEIVED", color: BRAND.green },
  });
  const doc = started.doc;
  const y = infoPanel(doc, started.y, customerColumns(job, "Received from"));
  const end = table(
    doc,
    y,
    null,
    [
      ["Amount received", formatLKR(payment.amount)],
      ["Method", methodLabel(payment.method)],
      ...(payment.reference ? [["Reference", payment.reference]] : []),
      ["For", `${jobService(job)} (${job.id})`],
      ["Balance remaining", formatLKR(balanceOf(job))],
    ],
    { columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } } },
  );
  if (payment.note) paragraph(doc, end, payment.note);
  finish(doc, settings);
  await deliver(doc, `Receipt_${job.id}_${payment.date}.pdf`, share);
}

export async function settlementDocument(
  job: Job,
  settings: Settings,
  payments: Payment[],
  names: { supervisor: string; technicians: string[] },
  share = false,
) {
  const s = priceSummary(job);
  const live = payments.filter((p) => !p.voided);
  const paid = sumPayments(live);
  const expenses = job.expenses ?? [];
  const expenseTotal = sumMoney(expenses.map((e) => e.amount));
  const right = { 1: { halign: "right" as const, cellWidth: 50 } };
  const bold = (t: string) => ({ content: t, styles: { fontStyle: "bold" as const } });

  const started = await startDocument(settings, {
    title: "Job settlement",
    meta: [`Job: ${job.id}`, `Completed: ${fmtDate(job.completedAt ?? new Date().toISOString())}`],
    stamp:
      paid + 0.005 >= s.total
        ? { text: "SETTLED", color: BRAND.green }
        : { text: "BALANCE DUE", color: BRAND.red },
  });
  const doc = started.doc;
  let y = infoPanel(doc, started.y, [
    ...customerColumns(job, "Customer"),
    {
      label: "Job",
      lines: [
        jobService(job),
        `Supervisor: ${names.supervisor || "—"}`,
        `Crew: ${names.technicians.join(", ") || "—"}`,
        scheduleLabel(job),
      ],
    },
  ]);
  y = sectionTitle(doc, y, "Order");
  y = table(
    doc,
    y,
    null,
    [
      ["Gross value", formatAmount(s.subtotal)],
      ...(s.discount ? [["Discount", `-${formatAmount(s.discount)}`]] : []),
      [bold("Order total"), bold(formatLKR(s.total))],
    ],
    { columnStyles: right },
  );
  y = sectionTitle(doc, y, "Expenses");
  y = table(
    doc,
    y,
    null,
    expenses.length
      ? [
          ...expenses.map((e) => [e.category, formatAmount(e.amount)]),
          [bold("Total expenses"), bold(formatAmount(expenseTotal))],
        ]
      : [["No expenses recorded", ""]],
    { columnStyles: right },
  );
  y = sectionTitle(doc, y, "Payments");
  y = table(
    doc,
    y,
    null,
    live.length
      ? live.map((p) => [`${fmtDate(p.date)} · ${methodLabel(p.method)}`, formatAmount(p.amount)])
      : [["No payments recorded", ""]],
    { columnStyles: right },
  );
  totalsBlock(doc, y + 4, [
    ["Received", formatAmount(paid), "green"],
    ["Balance due", formatLKR(Math.max(0, s.total - paid)), s.total - paid > 0 ? "red" : "green"],
    ["Net profit", formatLKR(s.total - expenseTotal), "strong"],
  ]);
  finish(doc, settings);
  await deliver(doc, `Settlement_${job.id}.pdf`, share);
}
