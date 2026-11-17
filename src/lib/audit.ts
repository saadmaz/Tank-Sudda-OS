import { addDoc, collection } from "firebase/firestore";
import { auth, db } from "./firebase";

export type AuditEntity = "settings" | "staff" | "customer" | "job" | "payment" | "inspection";

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName?: string;
  action: string;
  entity: AuditEntity;
  entityId: string;
  summary: string;
}

/**
 * Appends an audit entry in the signed-in person's name. Fire-and-forget: a
 * failed audit write never blocks the change it describes, and offline writes
 * queue with everything else.
 */
export function logAudit(entry: Omit<AuditEntry, "id" | "at" | "actorId" | "actorName">): void {
  const user = auth.currentUser;
  if (!user) return;
  void user
    .getIdTokenResult()
    .then(({ claims }) =>
      addDoc(collection(db, "auditLog"), {
        ...entry,
        at: new Date().toISOString(),
        actorId: user.uid,
        actorName: typeof claims.name === "string" ? claims.name : "",
      }),
    )
    .catch((err) => console.error("[audit] write failed:", err));
}
