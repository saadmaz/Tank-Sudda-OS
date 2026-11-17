import { describe, expect, it } from "vitest";
import {
  balanceOf,
  daysSince,
  docNumber,
  outstanding,
  paymentStatusFor,
  profitOf,
  sumPayments,
  type Payment,
} from "./billing";
import { makeJob } from "./test-fixtures";

const pay = (amount: number, voided = false) => ({ amount, voided }) as Payment;

describe("billing", () => {
  it("works out the payment status", () => {
    expect(paymentStatusFor(9500, 0)).toBe("unpaid");
    expect(paymentStatusFor(9500, 4750)).toBe("partial");
    expect(paymentStatusFor(9500, 9500)).toBe("paid");
    expect(paymentStatusFor(9500, 10000)).toBe("paid");
  });

  it("ignores voided payments", () => {
    expect(sumPayments([pay(1000), pay(500, true), pay(250.5)])).toBe(1250.5);
  });

  it("calculates balance and profit", () => {
    expect(balanceOf({ total: 9500, paidAmount: 4750 })).toBe(4750);
    expect(balanceOf({ total: 9500 })).toBe(9500);
    expect(
      profitOf(9500, [
        { category: "Fuel", amount: 1200 },
        { category: "Meals", amount: 300 },
      ]),
    ).toBe(8000);
  });

  it("lists outstanding work only", () => {
    const jobs = [
      makeJob({ id: "a", status: "completed", total: 9500 }),
      { ...makeJob({ id: "b", status: "completed", total: 9500 }), paidAmount: 9500 },
      makeJob({ id: "c", status: "new", total: 9500 }),
      makeJob({ id: "d", status: "cancelled", total: 9500 }),
      makeJob({ id: "e", status: "scheduled", total: 9500, isDeleted: true }),
    ];
    expect(outstanding(jobs).map((j) => j.id)).toEqual(["a"]);
  });

  it("formats numbers and ages", () => {
    expect(docNumber("INV", 1001)).toBe("INV-1001");
    expect(daysSince("2026-11-10", new Date(2026, 10, 18))).toBe(8);
    expect(daysSince("", new Date())).toBe(0);
  });
});
