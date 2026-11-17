import { useEffect, useRef, useState } from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { PinPad } from "@/components/pin-pad";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { MODULES, hasModule } from "@/lib/permissions";

export const Route = createFileRoute("/")({
  component: SignIn,
});

const LAST_USER_KEY = "ts.lastUsername";

function SignIn() {
  const { session, loading, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_USER_KEY);
      if (last) setUsername(last);
    } catch {
      // Storage may be blocked; the field just starts empty.
    }
  }, []);

  if (loading)
    return (
      <Shell>
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      </Shell>
    );
  if (session) {
    if (session.mustChangePin) return <Navigate to="/change-pin" />;
    const first = MODULES.find((m) => hasModule(session.role, session.permissions, m.key));
    return <Navigate to={first?.route ?? "/dashboard"} />;
  }

  const submit = async (code: string) => {
    if (!username.trim()) {
      setError("Enter your username first.");
      setPin("");
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await login(username.trim(), code);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      setPin("");
      return;
    }
    try {
      localStorage.setItem(LAST_USER_KEY, username.trim());
    } catch {
      // Not remembering the username is harmless.
    }
    if (outcome.mustChangePin) void navigate({ to: "/change-pin" });
  };

  return (
    <Shell>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (pin.length === 4) void submit(pin);
        }}
      >
        <div className="space-y-1.5 text-left">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                pinRef.current?.querySelector("button")?.focus();
              }
            }}
            placeholder="e.g. nimal"
          />
        </div>
        <div ref={pinRef}>
          <PinPad
            value={pin}
            onChange={setPin}
            onComplete={(p) => void submit(p)}
            disabled={busy}
          />
        </div>
        <p className="min-h-5 text-center text-sm font-medium text-destructive" role="alert">
          {busy ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            error
          )}
        </p>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-[image:var(--gradient-brand)] px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl sm:p-8">
        <img
          src="/brand/logo-badge-512.png"
          alt="Tank Sudda"
          width={72}
          height={72}
          className="mx-auto h-18 w-18"
        />
        <h1 className="mt-4 text-xl font-bold tracking-tight">Tank Sudda OS</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          Sign in with your username and PIN
        </p>
        {children}
      </div>
    </div>
  );
}
