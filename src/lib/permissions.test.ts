import { describe, expect, it } from "vitest";
import {
  ALL_MODULES,
  hasModule,
  mayActOn,
  mayAssignRole,
  moduleForPath,
  permissionsFor,
  sanitizePermissions,
} from "./permissions";

describe("hasModule", () => {
  it("grants SuperAdmin everything regardless of the list", () => {
    expect(hasModule("SuperAdmin", [], "settings")).toBe(true);
  });

  it("checks the explicit list for everyone else", () => {
    expect(hasModule("Office", ["leads"], "leads")).toBe(true);
    expect(hasModule("Office", ["leads"], "reports")).toBe(false);
    expect(hasModule(null, ALL_MODULES, "leads")).toBe(false);
  });
});

describe("seniority", () => {
  it("lets an administrator act only on juniors", () => {
    expect(mayActOn("Admin", "Manager")).toBe(true);
    expect(mayActOn("Admin", "Admin")).toBe(false);
    expect(mayActOn("SuperAdmin", "SuperAdmin")).toBe(true);
  });

  it("never lets someone grant a role above their own", () => {
    expect(mayAssignRole("Admin", "Admin")).toBe(true);
    expect(mayAssignRole("Admin", "SuperAdmin")).toBe(false);
    expect(mayAssignRole("SuperAdmin", "SuperAdmin")).toBe(true);
  });
});

describe("moduleForPath", () => {
  it("maps routes and nested routes to modules", () => {
    expect(moduleForPath("/jobs")).toBe("jobs");
    expect(moduleForPath("/jobs/TS-1001")).toBe("jobs");
    expect(moduleForPath("/jobsx")).toBeNull();
    expect(moduleForPath("/")).toBeNull();
  });
});

describe("sanitizing permissions", () => {
  it("drops unknown keys and duplicates", () => {
    expect(sanitizePermissions(["leads", "leads", "nope", 3])).toEqual(["leads"]);
    expect(sanitizePermissions("leads")).toEqual([]);
  });

  it("gives SuperAdmin the full list", () => {
    expect(permissionsFor("SuperAdmin", [])).toEqual(ALL_MODULES);
    expect(permissionsFor("Office", ["billing"])).toEqual(["billing"]);
  });
});
