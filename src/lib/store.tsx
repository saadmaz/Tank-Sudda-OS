import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  collection,
  doc,
  onSnapshot,
  type DocumentReference,
  type Query,
} from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";
import type { StaffMember } from "./staff";
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "./settings";

// Live listeners for the data every screen shares. Listeners start only after
// sign-in (rules reject anonymous reads) and stop on sign-out. Each feature
// module adds its own collection here as it ships.

interface StoreValue {
  ready: boolean;
  staff: StaffMember[];
  settings: Settings;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Subscribes to a query and keeps its documents in state. */
export function useLiveQuery<T>(
  query: Query | null,
  map: (id: string, data: Record<string, unknown>) => T = (id, data) => ({ ...data, id }) as T,
): { data: T[]; ready: boolean } {
  const [state, setState] = useState<{ data: T[]; ready: boolean }>({ data: [], ready: false });
  useEffect(() => {
    if (!query) {
      setState({ data: [], ready: false });
      return;
    }
    return onSnapshot(
      query,
      (snap) => setState({ data: snap.docs.map((d) => map(d.id, d.data())), ready: true }),
      (err) => {
        console.error("[store] listener failed:", err);
        setState((s) => ({ ...s, ready: true }));
      },
    );
    // `map` is expected to be stable (a module-level function).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return state;
}

/** Subscribes to one document. `data` is undefined until it exists. */
export function useLiveDoc(ref: DocumentReference | null): {
  data: Record<string, unknown> | undefined;
  ready: boolean;
} {
  const [state, setState] = useState<{ data: Record<string, unknown> | undefined; ready: boolean }>(
    { data: undefined, ready: false },
  );
  useEffect(() => {
    if (!ref) {
      setState({ data: undefined, ready: false });
      return;
    }
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.data(), ready: true }),
      (err) => {
        console.error("[store] listener failed:", err);
        setState((s) => ({ ...s, ready: true }));
      },
    );
  }, [ref]);
  return state;
}

export const settingsRef = () => doc(db, "settings", "general");

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const signedIn = !!session;

  const staffQuery = useMemo(() => (signedIn ? collection(db, "staff") : null), [signedIn]);
  const staff = useLiveQuery<StaffMember>(staffQuery);

  const settingsDoc = useMemo(() => (signedIn ? settingsRef() : null), [signedIn]);
  const settings = useLiveDoc(settingsDoc);

  const value = useMemo<StoreValue>(
    () => ({
      ready: staff.ready && settings.ready,
      staff: staff.data,
      settings: settings.data ? normalizeSettings(settings.data) : DEFAULT_SETTINGS,
    }),
    [staff, settings],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
