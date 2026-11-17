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

console.log("default deny");
await check("unknown collections are closed", () =>
  assertFails(getDoc(doc(superAdmin, "somethingElse/x"))),
);

await env.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
