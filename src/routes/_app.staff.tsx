import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Pencil, Plus, Search, UserCog } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import {
  MODULES,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_DESCRIPTIONS,
  STAFF_ROLES,
  isAdmin,
  mayActOn,
  mayAssignRole,
  type ModuleKey,
  type StaffRole,
} from "@/lib/permissions";
import {
  CREW_ROLES,
  PIN_RE,
  STAFF_COLORS,
  USERNAME_RE,
  initials,
  isWeakPin,
  type CrewRole,
  type StaffMember,
} from "@/lib/staff";
import { resetStaffPinFn, saveStaffFn, type StaffActionError } from "@/server/staff";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/staff")({
  component: StaffPage,
});

const ERRORS: Record<StaffActionError, string> = {
  unauthorized: "Only an administrator with Staff access can do this.",
  forbidden: "You can only manage people junior to you, and grant roles up to your own.",
  not_found: "That person no longer exists.",
  username_taken: "That username is already in use.",
  pin_required: "Set a starting PIN to give this person a sign-in.",
  self_target: "You can't deactivate yourself or change your own role.",
};

function StaffPage() {
  const { staff } = useStore();
  const { session } = useAuth();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<StaffMember | "new" | null>(null);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const canManage = isAdmin(session?.role);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...staff]
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.login?.username.includes(q))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }, [staff, query]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Staff"
        description="Your team, their field roles, and who can sign in."
        actions={
          canManage && (
            <Button onClick={() => setEditing("new")}>
              <Plus /> Add person
            </Button>
          )
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name or username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search staff"
        />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<UserCog className="h-8 w-8" />}
          title={staff.length ? "No one matches that search" : "No staff yet"}
          description="Add supervisors and technicians so they can be assigned to jobs."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => {
            const manageable =
              canManage &&
              session &&
              (!s.login || mayActOn(session.role, s.login.role) || s.id === session.staffId);
            return (
              <Card
                key={s.id}
                className={cn("flex items-start gap-3 p-4", !s.active && "opacity-60")}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                >
                  {initials(s.name)}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{s.name}</p>
                    {!s.active && <Badge>Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.login ? `@${s.login.username} · ${s.login.role}` : "No sign-in"}
                    {s.phone && ` · ${s.phone}`}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {s.crewRoles.map((r) => (
                      <Badge key={r} tone="brand" className="capitalize">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
                {manageable && (
                  <div className="flex shrink-0 gap-1">
                    {s.login && s.id !== session.staffId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Reset PIN for ${s.name}`}
                        onClick={() => setResetting(s)}
                      >
                        <KeyRound />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => setEditing(s)}
                    >
                      <Pencil />
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <StaffDialog member={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
      {resetting && <ResetPinDialog member={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function StaffDialog({ member, onClose }: { member: StaffMember | null; onClose: () => void }) {
  const { session, idToken } = useAuth();
  const actorRole = session?.role ?? "Technician";
  const isSelf = member?.id === session?.staffId;

  const [name, setName] = useState(member?.name ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [crewRoles, setCrewRoles] = useState<CrewRole[]>(member?.crewRoles ?? ["technician"]);
  const [active, setActive] = useState(member?.active ?? true);
  const [color, setColor] = useState(member?.color ?? STAFF_COLORS[0]!);
  const [canSignIn, setCanSignIn] = useState(!!member?.login);
  const [username, setUsername] = useState(member?.login?.username ?? "");
  const [role, setRole] = useState<StaffRole>(member?.login?.role ?? "Technician");
  const [permissions, setPermissions] = useState<ModuleKey[]>(
    member?.login?.permissions ?? ROLE_DEFAULT_PERMISSIONS.Technician,
  );
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const needsPin = canSignIn && !member?.login;
  const assignableRoles = STAFF_ROLES.filter((r) => mayAssignRole(actorRole, r));

  const errors = {
    name: name.trim().length < 2 ? "Enter a name." : undefined,
    username:
      canSignIn && !USERNAME_RE.test(username.trim())
        ? "3 to 20 letters, numbers, dots, dashes or underscores."
        : undefined,
    pin:
      canSignIn && (needsPin || pin)
        ? !PIN_RE.test(pin)
          ? "Exactly 4 digits."
          : isWeakPin(pin)
            ? "Too easy to guess."
            : undefined
        : undefined,
  };
  const valid = !errors.name && !errors.username && !errors.pin;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const result = await saveStaffFn({
        data: {
          idToken: await idToken(),
          id: member?.id,
          name: name.trim(),
          phone: phone.trim(),
          crewRoles,
          color,
          active,
          login: canSignIn ? { username: username.trim(), role, permissions } : null,
          pin: pin || undefined,
        },
      });
      if (!result.success) {
        toast.error(ERRORS[result.error]);
        return;
      }
      toast.success(member ? "Saved" : `${name.trim()} added`);
      onClose();
    } catch {
      toast.error("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{member ? `Edit ${member.name}` : "Add person"}</DialogTitle>
          <DialogDescription>
            Field roles decide who can be assigned to jobs. A sign-in is optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name" htmlFor="s-name" error={name ? errors.name : undefined}>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="s-phone">
              <Input
                id="s-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07X XXX XXXX"
              />
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">Field roles</legend>
            <div className="flex flex-wrap gap-2">
              {CREW_ROLES.map((r) => {
                const on = crewRoles.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setCrewRoles(
                        on ? crewRoles.filter((x) => x !== r.value) : [...crewRoles, r.value],
                      )
                    }
                    className={cn(
                      "h-9 rounded-full border px-4 text-sm font-medium transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {STAFF_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full ring-offset-2 ring-offset-card",
                    color === c && "ring-2 ring-ring",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive people can't sign in or be assigned.
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} label="Active" disabled={isSelf} />
          </div>

          <div className="space-y-4 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Can sign in</p>
                <p className="text-xs text-muted-foreground">
                  Gives this person a username and PIN.
                </p>
              </div>
              <Switch
                checked={canSignIn}
                onCheckedChange={setCanSignIn}
                label="Can sign in"
                disabled={isSelf}
              />
            </div>

            {canSignIn && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="Username"
                    htmlFor="s-user"
                    error={username ? errors.username : undefined}
                  >
                    <Input
                      id="s-user"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </Field>
                  <Field label="Role" htmlFor="s-role" hint={ROLE_DESCRIPTIONS[role]}>
                    <Select
                      id="s-role"
                      value={role}
                      disabled={isSelf}
                      onChange={(e) => {
                        const r = e.target.value as StaffRole;
                        setRole(r);
                        setPermissions(ROLE_DEFAULT_PERMISSIONS[r]);
                      }}
                    >
                      {(isSelf ? [role] : assignableRoles).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field
                  label={needsPin ? "Starting PIN" : "New PIN (optional)"}
                  htmlFor="s-pin"
                  hint={
                    isSelf
                      ? undefined
                      : "They'll be asked to choose their own PIN the first time they sign in."
                  }
                  error={pin ? errors.pin : undefined}
                >
                  <Input
                    id="s-pin"
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="off"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  />
                </Field>

                {role !== "SuperAdmin" && (
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-semibold text-muted-foreground">Modules</legend>
                    <div className="grid grid-cols-2 gap-1.5">
                      {MODULES.map((m) => {
                        const on = permissions.includes(m.key);
                        return (
                          <label
                            key={m.key}
                            className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[var(--primary)]"
                              checked={on}
                              disabled={isSelf}
                              onChange={() =>
                                setPermissions(
                                  on
                                    ? permissions.filter((p) => p !== m.key)
                                    : [...permissions, m.key],
                                )
                              }
                            />
                            {m.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!valid || busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPinDialog({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const { idToken } = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const error = !PIN_RE.test(pin) ? "Exactly 4 digits." : undefined;

  const reset = async () => {
    setBusy(true);
    try {
      const result = await resetStaffPinFn({
        data: { idToken: await idToken(), staffId: member.id, pin },
      });
      if (!result.success) return void toast.error(ERRORS[result.error]);
      toast.success(`PIN reset. ${member.name} will choose a new one at sign-in.`);
      onClose();
    } catch {
      toast.error("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset PIN for {member.name}</DialogTitle>
          <DialogDescription>
            Signs them out everywhere. They use this one-time PIN, then choose their own.
          </DialogDescription>
        </DialogHeader>
        <Field label="One-time PIN" htmlFor="r-pin" error={pin ? error : undefined}>
          <Input
            id="r-pin"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void reset()} disabled={!!error || busy}>
            Reset PIN
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
