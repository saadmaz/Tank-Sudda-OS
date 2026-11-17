import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";

// import.meta.env is Vite's; plain Node scripts that import this module fall
// back to process.env (populated by `dotenv/config`).
const env = import.meta.env ?? (process.env as Record<string, string | undefined>);

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;

export const auth = getAuth(app);

// Field staff often work with a weak signal. An IndexedDB-backed cache keeps
// every screen readable offline, and the SDK queues writes until the device
// reconnects. Browser only: SSR has no indexedDB and needs no persistence.
// initializeFirestore throws on HMR re-runs; the first call's settings stuck.
export const db = (() => {
  if (typeof window === "undefined") return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
})();

export const storage = getStorage(app);

// Opt-in (VITE_USE_FIREBASE_EMULATOR=true) so local work never touches a real project.
if (env.VITE_USE_FIREBASE_EMULATOR === "true" && typeof window !== "undefined") {
  const g = globalThis as unknown as { __tsEmulatorConnected?: boolean };
  if (!g.__tsEmulatorConnected) {
    g.__tsEmulatorConnected = true;
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
}
