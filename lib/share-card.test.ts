import { describe, it, expect } from "vitest";
import { getAvatarColor, getInitial, getTimeOfDayLabel } from "./share-card";

describe("getTimeOfDayLabel", () => {
  it("returns 'this morning' for hours 5-11", () => {
    expect(getTimeOfDayLabel(5)).toBe("this morning");
    expect(getTimeOfDayLabel(8)).toBe("this morning");
    expect(getTimeOfDayLabel(11)).toBe("this morning");
  });

  it("returns 'this afternoon' for hours 12-16", () => {
    expect(getTimeOfDayLabel(12)).toBe("this afternoon");
    expect(getTimeOfDayLabel(14)).toBe("this afternoon");
    expect(getTimeOfDayLabel(16)).toBe("this afternoon");
  });

  it("returns 'this evening' for hours 17-20", () => {
    expect(getTimeOfDayLabel(17)).toBe("this evening");
    expect(getTimeOfDayLabel(19)).toBe("this evening");
    expect(getTimeOfDayLabel(20)).toBe("this evening");
  });

  it("returns 'tonight' for hours 21-4", () => {
    expect(getTimeOfDayLabel(21)).toBe("tonight");
    expect(getTimeOfDayLabel(23)).toBe("tonight");
    expect(getTimeOfDayLabel(0)).toBe("tonight");
    expect(getTimeOfDayLabel(3)).toBe("tonight");
    expect(getTimeOfDayLabel(4)).toBe("tonight");
  });

  it("handles boundary hours correctly", () => {
    // 4 → tonight, 5 → morning
    expect(getTimeOfDayLabel(4)).toBe("tonight");
    expect(getTimeOfDayLabel(5)).toBe("this morning");

    // 11 → morning, 12 → afternoon
    expect(getTimeOfDayLabel(11)).toBe("this morning");
    expect(getTimeOfDayLabel(12)).toBe("this afternoon");

    // 16 → afternoon, 17 → evening
    expect(getTimeOfDayLabel(16)).toBe("this afternoon");
    expect(getTimeOfDayLabel(17)).toBe("this evening");

    // 20 → evening, 21 → tonight
    expect(getTimeOfDayLabel(20)).toBe("this evening");
    expect(getTimeOfDayLabel(21)).toBe("tonight");
  });
});

describe("getInitial", () => {
  it("returns first character of display name when provided", () => {
    expect(getInitial("Alice", "alice42")).toBe("A");
    expect(getInitial("bob", "bobby")).toBe("B");
  });

  it("returns first character of username when display name is null", () => {
    expect(getInitial(null, "charlie")).toBe("C");
  });

  it("returns first character of username when display name is empty", () => {
    // Empty string is falsy, so it falls back to username
    expect(getInitial("", "dave")).toBe("D");
  });

  it("handles non-Latin characters", () => {
    expect(getInitial("山田太郎", "yamada")).toBe("山");
  });

  it("uppercases lowercase initials", () => {
    expect(getInitial("alice", "alice42")).toBe("A");
    expect(getInitial(null, "zara")).toBe("Z");
  });
});

describe("getAvatarColor", () => {
  it("returns a valid Tailwind bg color class", () => {
    const color = getAvatarColor("alice");
    expect(color).toMatch(/^bg-\w+-500$/);
  });

  it("is deterministic — same input always returns same color", () => {
    const color1 = getAvatarColor("testuser");
    const color2 = getAvatarColor("testuser");
    expect(color1).toBe(color2);
  });

  it("returns different colors for different usernames", () => {
    // Not guaranteed for every pair, but should hold for most distinct inputs
    const colors = new Set([
      getAvatarColor("alice"),
      getAvatarColor("bob"),
      getAvatarColor("charlie"),
      getAvatarColor("dave"),
      getAvatarColor("eve"),
    ]);
    // At least 2 different colors among 5 users
    expect(colors.size).toBeGreaterThanOrEqual(2);
  });

  it("handles single-character usernames", () => {
    const color = getAvatarColor("a");
    expect(color).toMatch(/^bg-\w+-500$/);
  });

  it("handles empty string without throwing", () => {
    const color = getAvatarColor("");
    expect(color).toMatch(/^bg-\w+-500$/);
  });
});
