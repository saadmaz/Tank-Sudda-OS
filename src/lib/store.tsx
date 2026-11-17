import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, onSnapshot, type Query } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";
import type { StaffMember } from "./staff";

// Live listeners for the data every screen shares. Listeners start only after
// sign-in (rules reject anonymous reads) and stop on sign-out. Each feature
// module adds its own collection here as it ships.

interface StoreValue {
  ready: boolean;
  staff: StaffMember[];
}

const StoreContext = createContext<StoreValue | null>(null);

/** Subscribes to a query and keeps its documents in state. */
export function useLiveQuery<T>(
  query: Query | null,
  map: (id: string, data: Record<string, unknown>) => T = (id, data) => ({ id, ...data }) as T,
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const signedIn = !!session;

  const staffQuery = useMemo(() => (signedIn ? collection(db, "staff") : null), [signedIn]);
  const staff = useLiveQuery<StaffMember>(staffQuery);

  const value = useMemo<StoreValue>(() => ({ ready: staff.ready, staff: staff.data }), [staff]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
