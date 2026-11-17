import { describe, expect, it } from "vitest";
import { formatAmount, formatLKR, roundMoney, sumMoney, toAmount } from "./currency";

describe("roundMoney", () => {
  it("rounds to cents", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.005)).toBe(1.01);
  });

  it("treats non-finite values as zero", () => {
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("toAmount", () => {
  it("parses form input", () => {
    expect(toAmount("1,500")).toBe(1500);
    expect(toAmount(" 250.5 ")).toBe(250.5);
    expect(toAmount("")).toBe(0);
    expect(toAmount("abc")).toBe(0);
    expect(toAmount(undefined)).toBe(0);
    expect(toAmount(42)).toBe(42);
  });
});

describe("formatting", () => {
  it("formats for screens and documents", () => {
    expect(formatLKR(12500)).toBe("LKR 12,500");
    expect(formatAmount(12500)).toBe("12,500.00");
  });

  it("sums with a single rounding", () => {
    expect(sumMoney([0.1, 0.2, 1000])).toBe(1000.3);
  });
});
