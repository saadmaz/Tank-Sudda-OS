import { useEffect } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

/** Four-dot PIN entry with an on-screen keypad and hardware keyboard support. */
export function PinPad({
  value,
  onChange,
  onComplete,
  disabled,
  label = "PIN",
}: {
  value: string;
  onChange: (pin: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const press = (key: string) => {
    if (disabled) return;
    if (key === "del") return onChange(value.slice(0, -1));
    if (value.length >= 4) return;
    const next = value + key;
    onChange(next);
    if (next.length === 4) onComplete?.(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-5">
      <div
        className="flex justify-center gap-3"
        role="status"
        aria-label={`${label}: ${value.length} of 4 digits`}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 w-3.5 rounded-full border-2 transition-colors",
              i < value.length ? "border-primary bg-primary" : "border-border",
            )}
          />
        ))}
      </div>
      <div className="mx-auto grid max-w-64 grid-cols-3 gap-2.5">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => press(key)}
              aria-label={key === "del" ? "Delete" : key}
              className="flex h-14 items-center justify-center rounded-xl bg-muted text-lg font-semibold transition-colors hover:bg-accent active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {key === "del" ? <Delete className="h-5 w-5" aria-hidden /> : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
