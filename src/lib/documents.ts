// The documents the business sends: built on the shared layout in pdf.ts.

import {
  BRAND,
  deliver,
  finish,
  fmtDate,
  infoPanel,
  paragraph,
  sectionTitle,
  startDocument,
  table,
} from "./pdf";
import { INSPECTION_TYPES, findingRows, inspectionWarnings, type Inspection } from "./inspection";
import { formatPhone } from "./phone";
import { sumpVolume } from "./pricing";
import type { Settings } from "./settings";

export async function inspectionReport(
  i: Inspection,
  settings: Settings,
  inspectorName: string,
  share = false,
): Promise<void> {
  const typeLabel = INSPECTION_TYPES.find((t) => t.value === i.type)?.label ?? i.type;
  const started = await startDocument(settings, {
    title: "Inspection report",
    meta: [`Reference: ${i.id}`, `Date: ${fmtDate(i.date)}${i.time ? `, ${i.time}` : ""}`],
  });
  const doc = started.doc;
  let y = started.y;

  y = infoPanel(doc, y, [
    { label: "Customer", lines: [i.customerName, formatPhone(i.phone)] },
    { label: "Site", lines: [i.address || "Address not recorded", i.locationName] },
    {
      label: "Inspection",
      lines: [
        typeLabel,
        `Inspector: ${inspectorName || "Not assigned"}`,
        i.jobId ? `Job: ${i.jobId}` : "",
      ],
    },
  ]);

  const warnings = inspectionWarnings(i);
  if (warnings.length) {
    y = sectionTitle(doc, y, "Points to note");
    y = table(
      doc,
      y,
      null,
      warnings.map((w) => [w]),
      { styles: { textColor: BRAND.red, fontSize: 9, cellPadding: 2.2 } },
    );
  }

  y = sectionTitle(doc, y, "Findings");
  y = table(doc, y, ["Checked", "Result"], findingRows(i), {
    columnStyles: { 1: { cellWidth: 60 } },
  });

  if (i.tanks.length) {
    y = sectionTitle(doc, y, "Tanks measured");
    y = table(
      doc,
      y,
      ["#", "Size", "Capacity"],
      i.tanks.map((t, n) => [
        String(n + 1),
        t.label,
        t.litres ? `${t.litres.toLocaleString()} L` : "—",
      ]),
      { columnStyles: { 0: { cellWidth: 12 } } },
    );
  }
  if (i.sumps.length) {
    y = sectionTitle(doc, y, "Sumps measured");
    y = table(
      doc,
      y,
      ["#", "Length (ft)", "Breadth (ft)", "Height (ft)", "Volume (ft³)"],
      i.sumps.map((s, n) => [
        String(n + 1),
        String(s.length),
        String(s.breadth),
        String(s.height),
        String(sumpVolume(s)),
      ]),
      { columnStyles: { 0: { cellWidth: 12 } } },
    );
  }

  if (i.observations.trim()) {
    y = sectionTitle(doc, y, "Observations");
    y = paragraph(doc, y + 2, i.observations.trim());
  }
  if (i.recommendations.trim()) {
    y = sectionTitle(doc, y, "Recommendations");
    y = paragraph(doc, y + 2, i.recommendations.trim());
  }

  finish(doc, settings);
  await deliver(doc, `Inspection_${i.id}.pdf`, share);
}
