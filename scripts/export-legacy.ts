// Exports the legacy app's data (Firestore `orders` and `config/general`) to
// a JSON file for scripts/import-legacy.ts. Read-only on the legacy project.
//
//   LEGACY_PROJECT_ID=... LEGACY_CLIENT_EMAIL=... LEGACY_PRIVATE_KEY=... \
//     npm run legacy:export -- legacy-export.json
//
// The legacy credentials can be the same as FIREBASE_* when the new system
// reuses the legacy project; they're kept separate so they never mix by accident.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const out = process.argv[2] ?? "legacy-export.json";
const projectId = process.env.LEGACY_PROJECT_ID;
if (!projectId || !process.env.LEGACY_CLIENT_EMAIL || !process.env.LEGACY_PRIVATE_KEY) {
  console.error("Set LEGACY_PROJECT_ID, LEGACY_CLIENT_EMAIL and LEGACY_PRIVATE_KEY.");
  process.exit(1);
}

const app = initializeApp(
  {
    credential: cert({
      projectId,
      clientEmail: process.env.LEGACY_CLIENT_EMAIL,
      privateKey: process.env.LEGACY_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  },
  "legacy",
);
const db = getFirestore(app);

const [orders, config] = await Promise.all([
  db.collection("orders").get(),
  db.doc("config/general").get(),
]);
const data = {
  exportedAt: new Date().toISOString(),
  projectId,
  config: config.data() ?? {},
  orders: orders.docs.map((d) => ({ id: d.id, ...d.data() })),
};
writeFileSync(out, JSON.stringify(data, null, 2));
console.log(
  `✅ Exported ${data.orders.length} orders and the config to ${out}. Keep this file private.`,
);
process.exit(0);
