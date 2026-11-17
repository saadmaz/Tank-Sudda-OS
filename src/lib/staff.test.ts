import { describe, expect, it } from "vitest";
import {
  crewFor,
  initials,
  isWeakPin,
  lockoutMinutes,
  usernameKey,
  type StaffMember,
} from "./staff";

const member = (over: Partial<StaffMember>): StaffMember => ({
  id: "s",
  name: "Name",
  phone: "",
  crewRoles: [],
  active: true,
  login: null,
  color: "#000",
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("staff helpers", () => {
  it("normalises usernames", () => {
    expect(usernameKey("  Nimal.P ")).toBe("nimal.p");
  });

  it("rejects weak PINs", () => {
    expect(isWeakPin("1234")).toBe(true);
    expect(isWeakPin("8026")).toBe(false);
  });

  it("escalates the lockout", () => {
    expect(lockoutMinutes(4)).toBe(0);
    expect(lockoutMinutes(5)).toBe(5);
    expect(lockoutMinutes(6)).toBe(15);
    expect(lockoutMinutes(9)).toBe(60);
  });

  it("builds initials", () => {
    expect(initials("Kasun Perera")).toBe("KP");
    expect(initials("Nimal")).toBe("NI");
    expect(initials("  ")).toBe("?");
  });

  it("lists active crew for a field role", () => {
    const staff = [
      member({ id: "1", name: "Sunil", crewRoles: ["technician"] }),
      member({ id: "2", name: "Amal", crewRoles: ["technician", "supervisor"] }),
      member({ id: "3", name: "Kamal", crewRoles: ["technician"], active: false }),
    ];
    expect(crewFor(staff, "technician").map((s) => s.name)).toEqual(["Amal", "Sunil"]);
    expect(crewFor(staff, "supervisor").map((s) => s.id)).toEqual(["2"]);
  });
});
