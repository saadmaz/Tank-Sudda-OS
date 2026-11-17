// Branded PDF documents. One layout (header with logo, title block, footer
// with company details and page numbers) shared by every document: inspection
// reports now, quotes, invoices, settlements and reports later. Uses jsPDF's
// built-in Helvetica, so documents build offline with no font downloads.

import { jsPDF } from "jspdf";
import autoTable, { type RowInput, type UserOptions } from "jspdf-autotable";
import type { Settings } from "./settings";

export const BRAND = {
  navy: "#061c36",
  blue: "#2b7fb3",
  light: "#4ba7db",
  text: "#1e293b",
  muted: "#64748b",
  border: "#e2e8f0",
  panel: "#f1f5f9",
  red: "#dc2626",
  green: "#16a34a",
};

export const PAGE = { w: 210, h: 297, margin: 15 };

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

const logoCache = new Map<string, string | null>();

/** Loads an image as a PNG data URL, or null if it can't be loaded. */
async function loadImage(url: string): Promise<string | null> {
  if (logoCache.has(url)) return logoCache.get(url)!;
  const data = await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d")!.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  logoCache.set(url, data);
  return data;
}

export interface DocMeta {
  title: string;
  /** Right-hand lines under the title, e.g. reference and date. */
  meta: string[];
  /** Small coloured stamp under the meta, e.g. PAID. */
  stamp?: { text: string; color: string };
}

/** Starts an A4 document with the branded header. Returns the doc and the y to continue from. */
export async function startDocument(
  settings: Settings,
  d: DocMeta,
): Promise<{ doc: Doc; y: number }> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true }) as Doc;
  const c = settings.company;
  doc.setFillColor(BRAND.navy);
  doc.rect(0, 0, PAGE.w, 4, "F");

  const logo = await loadImage(c.logoUrl || "/brand/logo-512.png");
  let textX = PAGE.margin;
  if (logo) {
    doc.addImage(logo, "PNG", PAGE.margin, 11, 22, 22);
    textX = PAGE.margin + 26;
  }
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(BRAND.navy);
  doc.text(c.name.toUpperCase(), textX, 19);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(BRAND.muted);
  doc.text(c.tagline, textX, 24.5);
  const contact = [c.phone, c.email].filter(Boolean).join("  ·  ");
  if (contact) doc.text(contact, textX, 29);
  if (c.registrationNo) doc.text(`Reg. ${c.registrationNo}`, textX, 33.5);

  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(BRAND.blue);
  doc.text(d.title.toUpperCase(), PAGE.w - PAGE.margin, 19, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(BRAND.text);
  d.meta.forEach((line, i) =>
    doc.text(line, PAGE.w - PAGE.margin, 25.5 + i * 4.6, { align: "right" }),
  );

  let y = 25.5 + d.meta.length * 4.6;
  if (d.stamp) {
    doc.setDrawColor(d.stamp.color).setLineWidth(0.6).setTextColor(d.stamp.color);
    doc.setFont("helvetica", "bold").setFontSize(10);
    const w = doc.getTextWidth(d.stamp.text) + 8;
    doc.roundedRect(PAGE.w - PAGE.margin - w, y - 1, w, 7, 1, 1, "D");
    doc.text(d.stamp.text, PAGE.w - PAGE.margin - w / 2, y + 3.8, { align: "center" });
    y += 8;
  }
  return { doc, y: Math.max(y, 40) + 6 };
}

/** Grey panel with a label and lines, e.g. "PREPARED FOR". Returns the next y. */
export function infoPanel(
  doc: Doc,
  y: number,
  columns: { label: string; lines: string[] }[],
): number {
  const colW = (PAGE.w - PAGE.margin * 2) / columns.length;
  const wrapped = columns.map((col) =>
    col.lines.filter(Boolean).flatMap((l) => doc.splitTextToSize(l, colW - 10) as string[]),
  );
  const h = 12 + Math.max(...wrapped.map((w) => w.length)) * 4.6;
  doc.setFillColor(BRAND.panel).roundedRect(PAGE.margin, y, PAGE.w - PAGE.margin * 2, h, 2, 2, "F");
  columns.forEach((col, i) => {
    const x = PAGE.margin + 5 + i * colW;
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(BRAND.muted);
    doc.text(col.label.toUpperCase(), x, y + 6);
    wrapped[i]!.forEach((line, j) => {
      doc.setFont("helvetica", j === 0 ? "bold" : "normal").setFontSize(j === 0 ? 10.5 : 9);
      doc.setTextColor(BRAND.text).text(line, x, y + 11.5 + j * 4.6);
    });
  });
  return y + h + 6;
}

export function sectionTitle(doc: Doc, y: number, title: string): number {
  y = ensureSpace(doc, y, 20);
  doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(BRAND.navy);
  doc.text(title, PAGE.margin, y);
  return y + 3;
}

/** Table in the house style. Returns the y below it. */
export function table(
  doc: Doc,
  y: number,
  head: string[] | null,
  body: RowInput[],
  opts: Partial<UserOptions> = {},
): number {
  autoTable(doc, {
    startY: y,
    head: head ? [head] : undefined,
    body,
    theme: "grid",
    margin: { left: PAGE.margin, right: PAGE.margin, bottom: 22 },
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.6,
      textColor: BRAND.text,
      lineColor: BRAND.border,
      lineWidth: 0.1,
    },
    headStyles: { fillColor: BRAND.navy, textColor: "#ffffff", fontStyle: "bold" },
    alternateRowStyles: { fillColor: "#f8fafc" },
    ...opts,
  });
  return (doc.lastAutoTable?.finalY ?? y) + 6;
}

/** Wrapped paragraph. Returns the next y. */
export function paragraph(doc: Doc, y: number, text: string, size = 9): number {
  doc.setFont("helvetica", "normal").setFontSize(size).setTextColor(BRAND.text);
  const lines = doc.splitTextToSize(text, PAGE.w - PAGE.margin * 2) as string[];
  for (const line of lines) {
    y = ensureSpace(doc, y, 6);
    doc.text(line, PAGE.margin, y);
    y += size * 0.45;
  }
  return y + 2;
}

/** Starts a new page when fewer than `needed` mm remain. */
export function ensureSpace(doc: Doc, y: number, needed: number): number {
  if (y + needed <= PAGE.h - 22) return y;
  doc.addPage();
  return 20;
}

/** Footer on every page: company line and page numbers. Call last. */
export function finish(doc: Doc, settings: Settings) {
  const c = settings.company;
  const line = [c.legalName.toUpperCase(), c.phone, c.email, c.website]
    .filter(Boolean)
    .join("  ·  ");
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFillColor(BRAND.panel).rect(0, PAGE.h - 13, PAGE.w, 13, "F");
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(BRAND.muted);
    doc.text(line, PAGE.w / 2, PAGE.h - 5.5, { align: "center" });
    doc.text(`Page ${p} of ${pages}`, PAGE.w - PAGE.margin, PAGE.h - 5.5, { align: "right" });
  }
}

/**
 * Saves the document. On phones that can share files (Android, iOS), offers
 * the share sheet so it can go straight to WhatsApp; otherwise downloads it.
 */
export async function deliver(doc: Doc, fileName: string, share = false): Promise<void> {
  const blob = doc.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: fileName });
      return;
    } catch {
      // Share cancelled: fall through to a normal download.
    }
  }
  doc.save(fileName);
}

export const fmtDate = (iso: string) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
