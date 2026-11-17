// Sri Lankan phone numbers. Customers type them every way imaginable
// ("077 123 4567", "+94771234567", "0094 77-123-4567"); storing one canonical
// form lets the same customer be recognised across leads, jobs and website
// requests, and lets WhatsApp links work.

/** Canonical E.164 (+94XXXXXXXXX) for a Sri Lankan number, or null if it isn't one. */
export function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let national: string | null = null;
  if (digits.length === 10 && digits.startsWith("0")) national = digits.slice(1);
  else if (digits.length === 9 && !digits.startsWith("0")) national = digits;
  else if (digits.length === 11 && digits.startsWith("94")) national = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith("0094")) national = digits.slice(4);
  if (!national || !/^[1-9]\d{8}$/.test(national)) return null;
  return `+94${national}`;
}

/** "077 123 4567" for screens and documents; falls back to the input as typed. */
export function formatPhone(input: string): string {
  const e164 = toE164(input);
  if (!e164) return input.trim();
  const n = "0" + e164.slice(3);
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/** Key used to match the same person across records: E.164, or bare digits. */
export function phoneKey(input: string): string {
  return toE164(input) ?? input.replace(/\D/g, "");
}

/** Mobile numbers (07X) can receive WhatsApp; landlines can't. */
export function isMobile(input: string): boolean {
  const e164 = toE164(input);
  return !!e164 && e164.startsWith("+947");
}

/** wa.me link with an optional pre-filled message. */
export function whatsappLink(input: string, message?: string): string | null {
  const e164 = toE164(input);
  if (!e164) return null;
  const base = `https://wa.me/${e164.slice(1)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function telLink(input: string): string {
  return `tel:${toE164(input) ?? input.replace(/[^\d+]/g, "")}`;
}
