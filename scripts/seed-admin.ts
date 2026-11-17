// Creates the first SuperAdmin so someone can sign in and add everyone else.
//
//   npm run seed:admin
//
// Reads SUPERADMIN_NAME, SUPERADMIN_USERNAME and SUPERADMIN_PIN from .env.
// The account must choose its own PIN at first sign-in. Refuses to run if the
// username is already taken, so it is safe to re-run.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { adminDb } from "../src/server/firebase-admin";
import { ALL_MODULES } from "../src/lib/permissions";
import { PIN_RE, USERNAME_RE, usernameKey, type StaffMember } from "../src/lib/staff";

const name = process.env.SUPERADMIN_NAME?.trim() || "Administrator";
const username = process.env.SUPERADMIN_USERNAME?.trim() ?? "";
const pin = process.env.SUPERADMIN_PIN?.trim() ?? "";

if (!USERNAME_RE.test(username) || !PIN_RE.test(pin)) {
  console.error("Set SUPERADMIN_USERNAME (3-20 characters) and SUPERADMIN_PIN (4 digits) in .env");
  process.exit(1);
}

const key = usernameKey(username);
const ref = adminDb.collection("staff").doc();
const now = new Date().toISOString();

try {
  await adminDb.runTransaction(async (tx) => {
    const claim = adminDb.collection("usernames").doc(key);
    if ((await tx.get(claim)).exists) throw new Error(`Username "${username}" already exists`);
    tx.set(claim, { staffId: ref.id });
    const staff: StaffMember = {
      id: ref.id,
      name,
      phone: "",
      crewRoles: ["supervisor"],
      active: true,
      login: { username, role: "SuperAdmin", permissions: [...ALL_MODULES] },
      color: "#12345c",
      createdAt: now,
      updatedAt: now,
    };
    tx.set(ref, staff);
    tx.set(adminDb.collection("staffCredentials").doc(ref.id), {
      pinHash: await bcrypt.hash(pin, 10),
      failCount: 0,
      lockedUntil: null,
      mustChangePin: true,
    });
  });
  console.log(`✅ SuperAdmin "${username}" created. Sign in, then choose a new PIN.`);
  process.exit(0);
} catch (err) {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
}
