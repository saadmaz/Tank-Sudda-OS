import { describe, expect, it } from "vitest";
import { formatPhone, isMobile, phoneKey, telLink, toE164, whatsappLink } from "./phone";

describe("toE164", () => {
  it.each([
    ["0771234567", "+94771234567"],
    ["077 123 4567", "+94771234567"],
    ["+94 77 123 4567", "+94771234567"],
    ["0094771234567", "+94771234567"],
    ["771234567", "+94771234567"],
    ["0112345678", "+94112345678"],
  ])("normalises %s", (input, out) => {
    expect(toE164(input)).toBe(out);
  });

  it.each(["", "12345", "07712345678", "0012345678", "abc"])("rejects %s", (input) => {
    expect(toE164(input)).toBeNull();
  });
});

describe("formatting and links", () => {
  it("formats for display", () => {
    expect(formatPhone("+94771234567")).toBe("077 123 4567");
    expect(formatPhone("  12345 ")).toBe("12345");
  });

  it("builds a matching key", () => {
    expect(phoneKey("077-123-4567")).toBe(phoneKey("+94 771234567"));
    expect(phoneKey("12-34")).toBe("1234");
  });

  it("knows mobiles from landlines", () => {
    expect(isMobile("0771234567")).toBe(true);
    expect(isMobile("0112345678")).toBe(false);
  });

  it("builds WhatsApp and phone links", () => {
    expect(whatsappLink("0771234567", "Hi there")).toBe(
      "https://wa.me/94771234567?text=Hi%20there",
    );
    expect(whatsappLink("123")).toBeNull();
    expect(telLink("077 123 4567")).toBe("tel:+94771234567");
  });
});
