// Imports a legacy export (scripts/export-legacy.ts) into this system.
//
//   npm run legacy:import -- legacy-export.json            # dry run: report only
//   npm run legacy:import -- legacy-export.json --write    # write to FIREBASE_PROJECT_ID
//
// Safe to re-run: every record has a stable id, so a second run overwrites
// the same documents instead of duplicating them. Settings are written only
// when the target has none yet, unless --settings is passed.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { adminDb } from "../src/server/firebase-admin";
import { mapLegacyOrder, mapLegacySettings, mapLegacyStaff } from "../src/lib/legacy";
import type { Customer } from "../src/lib/customer";

const file = process.argv[2];
const write = process.argv.includes("--write");
const forceSettings = process.argv.includes("--settings");
if (!file) {
  console.error("Usage: npm run legacy:import -- <export.json> [--write] [--settings]");
  process.exit(1);
}

type Raw = Record<string, unknown>;
const data = JSON.parse(readFileSync(file, "utf8")) as { config: Raw; orders: Raw[] };
const now = new Date().toISOString();

const settings = mapLegacySettings(data.config);
const staff = mapLegacyStaff(data.config, data.orders, now);
const staffByName = new Map<string, string>();
for (const s of staff) {
  staffByName.set(s.name, s.id);
  staffByName.set(`${s.name} (Lead)`, s.id);
}

const customers = new Map<string, Customer>();
const writes: { path: string; data: object }[] = [];
let jobs = 0;
let inspections = 0;
let payments = 0;
let adjusted = 0;

for (const o of data.orders) {
  const m = mapLegacyOrder(o, { settings, staffByName, now });
  let c = customers.get(m.customerKey);
  if (!c) {
    c = { ...m.customer, id: `legacy-${customers.size + 1}` };
    customers.set(m.customerKey, c);
  } else {
    // Keep every distinct address as a site, and the latest service dates.
    for (const site of m.customer.sites)
      if (!c.sites.some((s) => s.address.toLowerCase() === site.address.toLowerCase()))
        c.sites.push({
          ...site,
          id: `site-${c.sites.length + 1}`,
          label: `Site ${c.sites.length + 1}`,
        });
    if ((m.customer.lastServiceDate ?? "") > (c.lastServiceDate ?? "")) {
      c.lastServiceDate = m.customer.lastServiceDate;
      c.nextDueDate = m.customer.nextDueDate;
    }
  }
  if (m.job) {
    m.job.customerId = c.id;
    if (m.job.addOns.some((a) => a.id === "legacy-adj")) adjusted++;
    writes.push({ path: `jobs/${m.job.id}`, data: m.job });
    jobs++;
  }
  if (m.inspection) {
    m.inspection.customerId = c.id;
    writes.push({ path: `inspections/${m.inspection.id}`, data: m.inspection });
    inspections++;
  }
  for (const p of m.payments) {
    p.customerId = c.id;
    writes.push({ path: `payments/${p.id}`, data: p });
    payments++;
  }
}
for (const c of customers.values()) writes.push({ path: `customers/${c.id}`, data: c });
for (const s of staff) writes.push({ path: `staff/${s.id}`, data: s });

console.log(`Legacy export: ${data.orders.length} orders`);
console.log(
  `Would write: ${customers.size} customers, ${jobs} jobs, ${inspections} inspections, ${payments} payments, ${staff.length} staff`,
);
console.log(`Jobs whose legacy total needed an adjustment line: ${adjusted}`);

if (!write) {
  console.log("Dry run only. Re-run with --write to import.");
  process.exit(0);
}

const existingSettings = await adminDb.doc("settings/general").get();
if (!existingSettings.exists || forceSettings) {
  writes.push({
    path: "settings/general",
    data: { ...settings, updatedAt: now, updatedBy: "legacy-import" },
  });
  console.log("Settings will be imported.");
} else {
  console.log("Settings already exist; left unchanged (pass --settings to overwrite).");
}

for (let i = 0; i < writes.length; i += 400) {
  const batch = adminDb.batch();
  for (const w of writes.slice(i, i + 400)) batch.set(adminDb.doc(w.path), w.data);
  await batch.commit();
  console.log(`  wrote ${Math.min(i + 400, writes.length)} / ${writes.length}`);
}
await adminDb.collection("auditLog").add({
  at: now,
  actorId: "legacy-import",
  actorName: "Legacy import",
  action: "import.legacy",
  entity: "job",
  entityId: "",
  summary: `Imported ${jobs} jobs, ${customers.size} customers and ${payments} payments from the legacy app`,
});
console.log("✅ Import complete.");
process.exit(0);
