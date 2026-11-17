// Behavioural tests for firestore.rules, run against the emulator:
//   npm run test:rules
//
// Each case states who is acting and what must happen. Add a case with every
// rules change; these are the only proof the data layer enforces access.

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-tank-sudda-rules",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
});

// Contexts mirror the claims minted by loginFn: { role, perms, name }.
const as = (uid, role, perms = []) =>
  env.authenticatedContext(uid, { role, perms, name: uid }).firestore();

const anon = env.unauthenticatedContext().firestore();
const tokenWithoutRole = env.authenticatedContext("x").firestore();
const superAdmin = as("sa", "SuperAdmin");
const manager = as("mgr", "Manager", ["dashboard", "reports"]);
const office = as("off", "Office", ["dashboard", "leads"]);
const tech = as("tech", "Technician", ["dashboard", "jobs"]);

// Start from an empty database so reruns behave the same.
await env.clearFirestore();

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "staff/tech"), { name: "Tech", active: true });
  await setDoc(doc(db, "staffCredentials/tech"), { pinHash: "x" });
  await setDoc(doc(db, "usernames/tech"), { staffId: "tech" });
  await setDoc(doc(db, "auditLog/a1"), { actorId: "sa", at: "now", action: "x" });
});

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n    ${err?.message ?? err}`);
  }
}

console.log("staff directory");
await check("anonymous cannot read", () => assertFails(getDoc(doc(anon, "staff/tech"))));
await check("a token without a role cannot read", () =>
  assertFails(getDoc(doc(tokenWithoutRole, "staff/tech"))),
);
await check("any signed-in person can read", () => assertSucceeds(getDoc(doc(tech, "staff/tech"))));
await check("even a SuperAdmin cannot write from the client", () =>
  assertFails(setDoc(doc(superAdmin, "staff/new"), { name: "X" })),
);

console.log("credentials and usernames");
await check("no client can read credentials", () =>
  assertFails(getDoc(doc(superAdmin, "staffCredentials/tech"))),
);
await check("no client can read the username index", () =>
  assertFails(getDoc(doc(superAdmin, "usernames/tech"))),
);

console.log("audit log");
await check("manager can read", () => assertSucceeds(getDoc(doc(manager, "auditLog/a1"))));
await check("office cannot read", () => assertFails(getDoc(doc(office, "auditLog/a1"))));
await check("anyone signed in can append in their own name", () =>
  assertSucceeds(
    addDoc(collection(office, "auditLog"), { actorId: "off", at: "t", action: "lead.create" }),
  ),
);
await check("nobody can append in someone else's name", () =>
  assertFails(addDoc(collection(office, "auditLog"), { actorId: "sa", at: "t", action: "x" })),
);
await check("entries cannot be edited", () =>
  assertFails(updateDoc(doc(superAdmin, "auditLog/a1"), { action: "y" })),
);
await check("entries cannot be deleted", () =>
  assertFails(deleteDoc(doc(superAdmin, "auditLog/a1"))),
);

console.log("settings");
const validSettings = { pricing: { sumpRatePerCubicFt: 2500 }, locations: [], terms: [] };
const admin = as("adm", "Admin", ["settings", "staff"]);
const managerWithSettings = as("mgr2", "Manager", ["settings"]);
const officeWithSettings = as("off2", "Office", ["settings"]);
await check("anyone signed in can read", () =>
  assertSucceeds(getDoc(doc(tech, "settings/general"))),
);
await check("anonymous cannot read", () => assertFails(getDoc(doc(anon, "settings/general"))));
await check("admin with the module can write", () =>
  assertSucceeds(setDoc(doc(admin, "settings/general"), validSettings)),
);
await check("manager granted the module can write", () =>
  assertSucceeds(setDoc(doc(managerWithSettings, "settings/general"), validSettings)),
);
await check("manager without the module cannot write", () =>
  assertFails(setDoc(doc(manager, "settings/general"), validSettings)),
);
await check("office cannot write even with the module", () =>
  assertFails(setDoc(doc(officeWithSettings, "settings/general"), validSettings)),
);
await check("malformed settings are rejected", () =>
  assertFails(setDoc(doc(admin, "settings/general"), { pricing: { sumpRatePerCubicFt: "x" } })),
);
await check("only the general document exists", () =>
  assertFails(setDoc(doc(admin, "settings/other"), validSettings)),
);

console.log("jobs");
const job = (over = {}) => ({
  id: "TS-1",
  status: "new",
  customerName: "Nimal",
  tanks: [],
  sumps: [],
  addOns: [],
  subtotal: 9500,
  total: 9500,
  isDeleted: false,
  createdAt: "t0",
  createdBy: "off",
  ...over,
});
const fieldTech = as("tech2", "Technician", ["jobs"]);
const reportsOnly = as("rep", "Manager", ["reports"]);
const noJobs = as("nj", "Office", ["dashboard"]);
await check("office with leads can create a job", () =>
  assertSucceeds(setDoc(doc(office, "jobs/TS-1"), job())),
);
await check("a job must be created in the creator's own name", () =>
  assertFails(setDoc(doc(office, "jobs/TS-2"), job({ id: "TS-2", createdBy: "someone" }))),
);
await check("the id must match the document", () =>
  assertFails(setDoc(doc(office, "jobs/TS-3"), job({ id: "TS-X" }))),
);
await check("a discount can't push the total above the subtotal", () =>
  assertFails(setDoc(doc(office, "jobs/TS-4"), job({ id: "TS-4", total: 9999 }))),
);
await check("someone without job modules can't read", () =>
  assertFails(getDoc(doc(noJobs, "jobs/TS-1"))),
);
await check("reports access can read", () => assertSucceeds(getDoc(doc(reportsOnly, "jobs/TS-1"))));
await check("legal status move succeeds", () =>
  assertSucceeds(updateDoc(doc(office, "jobs/TS-1"), { status: "scheduled" })),
);
await check("illegal status move fails", () =>
  assertFails(updateDoc(doc(office, "jobs/TS-1"), { status: "new" })),
);
await check("a technician can start the job", () =>
  assertSucceeds(
    updateDoc(doc(fieldTech, "jobs/TS-1"), { status: "in_progress", startedAt: "t1" }),
  ),
);
await check("a technician can't change the price", () =>
  assertFails(updateDoc(doc(fieldTech, "jobs/TS-1"), { total: 1, subtotal: 1 })),
);
await check("createdBy can't be rewritten", () =>
  assertFails(updateDoc(doc(office, "jobs/TS-1"), { createdBy: "off2" })),
);
await check("a job outside the trash can't be deleted", () =>
  assertFails(deleteDoc(doc(superAdmin, "jobs/TS-1"))),
);
await check("office can move a job to the trash", () =>
  assertSucceeds(updateDoc(doc(office, "jobs/TS-1"), { isDeleted: true })),
);
await check("office can't delete permanently", () =>
  assertFails(deleteDoc(doc(office, "jobs/TS-1"))),
);
await check("a manager with jobs can delete from the trash", () =>
  assertSucceeds(deleteDoc(doc(as("m3", "Manager", ["jobs"]), "jobs/TS-1"))),
);

console.log("payments");
const payment = {
  id: "p1",
  jobId: "TS-9",
  amount: 5000,
  method: "cash",
  date: "2026-11-18",
  createdBy: "tech2",
  voided: false,
};
const billing = as("bill", "Office", ["billing", "leads"]);
await check("a technician can record cash in their own name", () =>
  assertSucceeds(setDoc(doc(fieldTech, "payments/p1"), payment)),
);
await check("not in someone else's name", () =>
  assertFails(setDoc(doc(fieldTech, "payments/p2"), { ...payment, id: "p2", createdBy: "x" })),
);
await check("amounts must be positive", () =>
  assertFails(setDoc(doc(fieldTech, "payments/p3"), { ...payment, id: "p3", amount: -5 })),
);
await check("a technician can't void", () =>
  assertFails(
    updateDoc(doc(fieldTech, "payments/p1"), { voided: true, voidReason: "x", voidedAt: "t" }),
  ),
);
await check("billing can void with a reason", () =>
  assertSucceeds(
    updateDoc(doc(billing, "payments/p1"), {
      voided: true,
      voidReason: "Duplicate",
      voidedAt: "t",
    }),
  ),
);
await check("a voided payment can't be changed again", () =>
  assertFails(updateDoc(doc(billing, "payments/p1"), { voidReason: "y" })),
);
await check("payments can't be deleted", () =>
  assertFails(deleteDoc(doc(superAdmin, "payments/p1"))),
);
await check("counters start", () =>
  assertSucceeds(setDoc(doc(billing, "counters/documents"), { quote: 1001, invoice: 1001 })),
);
await check("counters move forward", () =>
  assertSucceeds(setDoc(doc(billing, "counters/documents"), { quote: 1002, invoice: 1001 })),
);
await check("counters never go back", () =>
  assertFails(setDoc(doc(billing, "counters/documents"), { quote: 1000, invoice: 1001 })),
);

console.log("inspections");
const insp = {
  id: "IN-1",
  type: "tank",
  status: "scheduled",
  customerName: "Nimal",
  findings: {},
  tanks: [],
  sumps: [],
  createdBy: "sup",
};
const supervisor = as("sup", "Supervisor", ["inspections", "jobs"]);
await check("a supervisor can book an inspection", () =>
  assertSucceeds(setDoc(doc(supervisor, "inspections/IN-1"), insp)),
);
await check("and complete it", () =>
  assertSucceeds(updateDoc(doc(supervisor, "inspections/IN-1"), { status: "completed" })),
);
await check("an unknown type is rejected", () =>
  assertFails(updateDoc(doc(supervisor, "inspections/IN-1"), { type: "roof" })),
);
await check("a supervisor can't delete it", () =>
  assertFails(deleteDoc(doc(supervisor, "inspections/IN-1"))),
);
await check("someone without the modules can't read it", () =>
  assertFails(getDoc(doc(noJobs, "inspections/IN-1"))),
);

console.log("customers");
const customer = { name: "Nimal", phoneKey: "+94771234567", sites: [], isDeleted: false };
await check("office with leads can create a customer", () =>
  assertSucceeds(setDoc(doc(office, "customers/c1"), customer)),
);
await check("a customer needs a name", () =>
  assertFails(setDoc(doc(office, "customers/c2"), { ...customer, name: "" })),
);
await check("someone without customer modules can't read", () =>
  assertFails(getDoc(doc(noJobs, "customers/c1"))),
);
await check("office can't delete a customer", () =>
  assertFails(deleteDoc(doc(office, "customers/c1"))),
);

console.log("default deny");
await check("unknown collections are closed", () =>
  assertFails(getDoc(doc(superAdmin, "somethingElse/x"))),
);

await env.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
