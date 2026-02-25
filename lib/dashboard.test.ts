import { describe, it, expect } from "vitest";
import { getEmptyStateType, getShareLink } from "./dashboard";

describe("getEmptyStateType", () => {
  it("returns 'welcome' when no follows and not shared today", () => {
    expect(getEmptyStateType(0, false, 0)).toBe("welcome");
  });

  it("returns 'no-follows' when no follows but has shared today", () => {
    expect(getEmptyStateType(0, true, 0)).toBe("no-follows");
  });

  it("returns 'no-shares-today' when has follows but no feed shares", () => {
    expect(getEmptyStateType(5, false, 0)).toBe("no-shares-today");
    expect(getEmptyStateType(5, true, 0)).toBe("no-shares-today");
  });

  it("returns null when has follows and feed shares exist", () => {
    expect(getEmptyStateType(5, false, 3)).toBeNull();
    expect(getEmptyStateType(5, true, 3)).toBeNull();
  });

  it("returns null when has one follow and one feed share", () => {
    expect(getEmptyStateType(1, true, 1)).toBeNull();
  });

  it("prioritizes 'welcome' over 'no-follows' when not shared", () => {
    // Even though followCount is 0, the combined welcome takes precedence
    expect(getEmptyStateType(0, false, 0)).toBe("welcome");
  });

  it("returns 'no-follows' over 'no-shares-today' when no follows exist", () => {
    // followCount === 0 should return 'no-follows' even though feedShareCount is 0
    expect(getEmptyStateType(0, true, 0)).toBe("no-follows");
  });
});

describe("getShareLink", () => {
  it("returns '/share/today' when user has shared today", () => {
    expect(getShareLink(true)).toBe("/share/today");
  });

  it("returns '/share' when user has not shared today", () => {
    expect(getShareLink(false)).toBe("/share");
  });
});
