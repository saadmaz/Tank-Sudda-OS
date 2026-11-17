import { useState } from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PinPad } from "@/components/pin-pad";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/change-pin")({
  component: ChangePin,
});

type Step = "current" | "new" | "confirm";

const STEP_LABEL: Record<Step, string> = {
  current: "Enter your current PIN",
  new: "Choose a new PIN",
  confirm: "Enter the new PIN again",
};

const ERRORS: Record<string, string> = {
  unauthorized: "Your session has ended. Sign in again.",
  wrong_pin: "Your current PIN is wrong.",
  weak_pin: "That PIN is too easy to guess. Avoid repeats and sequences.",
  same_pin: "Choose a PIN different from your current one.",
};

function ChangePin() {
  const { session, loading, changePin, logout } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("current");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!session) return <Navigate to="/" />;

  const restart = (message: string) => {
    setError(message);
    setStep("current");
    setCurrent("");
    setNext("");
    setValue("");
  };

  const complete = async (pin: string) => {
    setError(null);
    if (step === "current") {
      setCurrent(pin);
      setStep("new");
      setValue("");
      return;
    }
    if (step === "new") {
      setNext(pin);
      setStep("confirm");
      setValue("");
      return;
    }
    if (pin !== next) {
      setError("The PINs didn't match. Choose a new PIN again.");
      setStep("new");
      setNext("");
      setValue("");
      return;
    }
    setBusy(true);
    try {
      const result = await changePin(current, next);
      if (!result.success) return restart(ERRORS[result.error] ?? "Couldn't change the PIN.");
      toast.success("PIN changed");
      void navigate({ to: "/" });
    } catch {
      restart("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-[image:var(--gradient-brand)] px-4 py-10">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-card p-6 text-center shadow-2xl sm:p-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {session.mustChangePin ? "Set your own PIN" : "Change PIN"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{STEP_LABEL[step]}</p>
        </div>
        <PinPad
          value={value}
          onChange={setValue}
          onComplete={(p) => void complete(p)}
          disabled={busy}
        />
        <p className="min-h-5 text-sm font-medium text-destructive" role="alert">
          {busy ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            error
          )}
        </p>
        {session.mustChangePin ? (
          <Button variant="ghost" className="w-full" onClick={() => void logout()}>
            Sign out
          </Button>
        ) : (
          <Button variant="ghost" className="w-full" onClick={() => void navigate({ to: "/" })}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
