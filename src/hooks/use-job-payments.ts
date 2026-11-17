import { useMemo } from "react";
import { collection, query, where } from "firebase/firestore";
import type { Payment } from "@/lib/billing";
import { db } from "@/lib/firebase";
import { useLiveQuery } from "@/lib/store";

/** Live payments for one job. */
export function useJobPayments(jobId: string) {
  const q = useMemo(() => query(collection(db, "payments"), where("jobId", "==", jobId)), [jobId]);
  const { data } = useLiveQuery<Payment>(q);
  return useMemo(
    () =>
      [...data].sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      ),
    [data],
  );
}
