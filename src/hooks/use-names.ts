import { useMemo } from "react";
import { useStore } from "@/lib/store";
import type { Job } from "@/lib/job";

/** Resolves staff and equipment ids on a job to display names. */
export function useJobNames() {
  const { staff, settings } = useStore();
  return useMemo(() => {
    const staffName = new Map(staff.map((s) => [s.id, s.name]));
    const equipmentName = new Map(settings.equipment.map((e) => [e.id, e.name]));
    return (job: Pick<Job, "supervisorId" | "technicianIds" | "equipmentIds">) => ({
      supervisor: job.supervisorId ? (staffName.get(job.supervisorId) ?? "Former staff") : "",
      technicians: job.technicianIds.map((id) => staffName.get(id) ?? "Former staff"),
      equipment: job.equipmentIds.map((id) => equipmentName.get(id) ?? "Retired equipment"),
    });
  }, [staff, settings.equipment]);
}
