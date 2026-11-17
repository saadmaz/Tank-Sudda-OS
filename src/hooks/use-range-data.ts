import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import type { Payment } from "@/lib/billing";
import { db } from "@/lib/firebase";
import type { Inspection } from "@/lib/inspection";
import type { Job } from "@/lib/job";
import { timestampBounds, type DateRange } from "@/lib/reports";

export interface RangeData {
  jobs: Job[];
  payments: Payment[];
  inspectionDates: string[];
}

/**
 * Everything a report needs for a date range, read once (not a live
 * listener) to keep reads low for long ranges. Each query uses one field, so
 * no composite indexes are needed.
 */
export function useRangeData(range: DateRange) {
  const { from, to } = range;
  const [data, setData] = useState<RangeData>({ jobs: [], payments: [], inspectionDates: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const ts = timestampBounds({ from, to });
    const jobs = collection(db, "jobs");
    try {
      const [byIntake, byCompleted, byCancelled, byDate, payments, inspections] = await Promise.all(
        [
          getDocs(query(jobs, where("intakeDate", ">=", from), where("intakeDate", "<=", to))),
          getDocs(
            query(jobs, where("completedAt", ">=", ts.from), where("completedAt", "<=", ts.to)),
          ),
          getDocs(
            query(jobs, where("cancelledAt", ">=", ts.from), where("cancelledAt", "<=", ts.to)),
          ),
          getDocs(query(jobs, where("date", ">=", from), where("date", "<=", to))),
          getDocs(
            query(collection(db, "payments"), where("date", ">=", from), where("date", "<=", to)),
          ),
          getDocs(
            query(
              collection(db, "inspections"),
              where("date", ">=", from),
              where("date", "<=", to),
            ),
          ),
        ],
      );
      const byId = new Map<string, Job>();
      for (const snap of [byIntake, byCompleted, byCancelled, byDate])
        for (const d of snap.docs) byId.set(d.id, { ...(d.data() as Job), id: d.id });
      setData({
        jobs: [...byId.values()],
        payments: payments.docs.map((d) => ({ ...(d.data() as Payment), id: d.id })),
        inspectionDates: inspections.docs
          .map((d) => d.data() as Inspection)
          .filter((i) => i.status !== "cancelled")
          .map((i) => i.date),
      });
    } catch (err) {
      console.error("[reports] load failed:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
