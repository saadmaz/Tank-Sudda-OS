import { generateKeyPairSync } from "node:crypto";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Against the emulators (FIRESTORE_EMULATOR_HOST set), createCustomToken still
// signs locally and the emulator never checks the signer, so a throwaway
// keypair stands in for a real service account.
const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

if (getApps().length === 0) {
  initializeApp({
    credential: cert(
      usingEmulator
        ? {
            projectId: process.env.FIREBASE_PROJECT_ID || "demo-tank-sudda-os",
            clientEmail: "emulator@example.com",
            privateKey: generateKeyPairSync("rsa", {
              modulusLength: 2048,
              privateKeyEncoding: { type: "pkcs1", format: "pem" },
              publicKeyEncoding: { type: "pkcs1", format: "pem" },
            }).privateKey,
          }
        : {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // .env stores the PEM on one line with literal \n sequences.
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          },
    ),
  });
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();

// REST keeps each read an ordinary HTTPS request instead of a long-lived gRPC
// stream, which suits a container that sleeps between shifts. settings() may
// only run once per process, and dev-server reloads re-run this module.
const g = globalThis as unknown as { __tsAdminDbConfigured?: boolean };
if (!g.__tsAdminDbConfigured) {
  g.__tsAdminDbConfigured = true;
  adminDb.settings({
    ignoreUndefinedProperties: true,
    ...(usingEmulator ? {} : { preferRest: true }),
  });
}
