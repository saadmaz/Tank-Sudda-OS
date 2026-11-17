import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Home, Search, Users } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isoDate } from "@/lib/job";
import { formatPhone } from "@/lib/phone";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/customers/")({
  component: CustomersPage,
});

type Show = "all" | "due" | "residential" | "commercial";

function CustomersPage() {
  const { customers, jobs } = useStore();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const today = isoDate();

  const jobCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) if (!j.isDeleted) m.set(j.customerId, (m.get(j.customerId) ?? 0) + 1);
    return m;
  }, [jobs]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return customers
      .filter((c) => !c.isDeleted)
      .filter((c) => {
        if (show === "due" && !(c.nextDueDate && c.nextDueDate <= today)) return false;
        if (show === "residential" && c.type !== "residential") return false;
        if (show === "commercial" && c.type !== "commercial") return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.sites.some((s) => s.address.toLowerCase().includes(q)) ||
          (digits.length >= 3 && `${c.phone}${c.altPhone}`.replace(/\D/g, "").includes(digits))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, query, show, today]);

  const dueCount = customers.filter(
    (c) => !c.isDeleted && c.nextDueDate && c.nextDueDate <= today,
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Customers"
        description="Everyone you've quoted or served, with their sites and history."
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="Search customers"
            placeholder="Search name, phone or address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select
          aria-label="Show"
          value={show}
          onChange={(e) => setShow(e.target.value as Show)}
          className="sm:w-56"
        >
          <option value="all">All customers</option>
          <option value="due">Due for cleaning ({dueCount})</option>
          <option value="residential">Residential</option>
          <option value="commercial">Commercial</option>
        </Select>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={customers.length ? "No customers match" : "No customers yet"}
          description={
            customers.length
              ? undefined
              : "Customers are created automatically with their first lead."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const due = c.nextDueDate && c.nextDueDate <= today;
            const Icon = c.type === "commercial" ? Building2 : Home;
            return (
              <Link key={c.id} to="/customers/$customerId" params={{ customerId: c.id }}>
                <Card className="h-full space-y-2 p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{formatPhone(c.phone)}</p>
                    </div>
                    {due && <Badge tone="warning">Due</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.sites[0]?.address || "No address"}
                    {c.sites.length > 1 && ` +${c.sites.length - 1} more`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {jobCount.get(c.id) ?? 0} recent job{jobCount.get(c.id) === 1 ? "" : "s"}
                    {c.lastServiceDate && ` · last cleaned ${c.lastServiceDate}`}
                    {c.nextDueDate && ` · next ${c.nextDueDate}`}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
