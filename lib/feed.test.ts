import { describe, it, expect } from "vitest";
import { computeShareExpiration, isShareActive } from "./feed";

describe("computeShareExpiration", () => {
  it("returns midnight next day in sharer timezone converted to UTC", () => {
    // 2026-02-24 in America/New_York (UTC-5 in Feb)
    // Should expire at 2026-02-25 00:00:00 ET = 2026-02-25 05:00:00 UTC
    const result = computeShareExpiration("2026-02-24", "America/New_York");
    expect(result.toISOString()).toBe("2026-02-25T05:00:00.000Z");
  });

  it("handles UTC timezone (offset = 0)", () => {
    // 2026-02-24 in UTC
    // Should expire at 2026-02-25 00:00:00 UTC
    const result = computeShareExpiration("2026-02-24", "UTC");
    expect(result.toISOString()).toBe("2026-02-25T00:00:00.000Z");
  });

  it("handles timezone ahead of UTC (Asia/Tokyo = UTC+9)", () => {
    // 2026-02-24 in Asia/Tokyo (UTC+9)
    // Should expire at 2026-02-25 00:00:00 JST = 2026-02-24 15:00:00 UTC
    const result = computeShareExpiration("2026-02-24", "Asia/Tokyo");
    expect(result.toISOString()).toBe("2026-02-24T15:00:00.000Z");
  });

  it("handles timezone behind UTC (America/Los_Angeles = UTC-8 in Feb)", () => {
    // 2026-02-24 in America/Los_Angeles (PST = UTC-8 in Feb)
    // Should expire at 2026-02-25 00:00:00 PST = 2026-02-25 08:00:00 UTC
    const result = computeShareExpiration("2026-02-24", "America/Los_Angeles");
    expect(result.toISOString()).toBe("2026-02-25T08:00:00.000Z");
  });

  it("handles DST transition — spring forward (America/New_York)", () => {
    // March 8, 2026 is the spring forward date for US Eastern
    // On March 8, clocks go from 2am to 3am EST->EDT
    // 2026-03-08 in America/New_York
    // Expires at 2026-03-09 00:00:00 EDT (UTC-4) = 2026-03-09 04:00:00 UTC
    const result = computeShareExpiration("2026-03-08", "America/New_York");
    expect(result.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("handles DST transition — fall back (America/New_York)", () => {
    // November 1, 2026 is the fall back date for US Eastern
    // On Nov 1, clocks go from 2am to 1am EDT->EST
    // 2026-11-01 in America/New_York
    // Expires at 2026-11-02 00:00:00 EST (UTC-5) = 2026-11-02 05:00:00 UTC
    const result = computeShareExpiration("2026-11-01", "America/New_York");
    expect(result.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("falls back to America/New_York when timezone is null", () => {
    const result = computeShareExpiration("2026-02-24", null);
    const eastern = computeShareExpiration("2026-02-24", "America/New_York");
    expect(result.toISOString()).toBe(eastern.toISOString());
  });

  it("falls back to America/New_York when timezone is undefined", () => {
    const result = computeShareExpiration("2026-02-24", undefined);
    const eastern = computeShareExpiration("2026-02-24", "America/New_York");
    expect(result.toISOString()).toBe(eastern.toISOString());
  });

  it("falls back to America/New_York when timezone is empty string", () => {
    const result = computeShareExpiration("2026-02-24", "");
    const eastern = computeShareExpiration("2026-02-24", "America/New_York");
    expect(result.toISOString()).toBe(eastern.toISOString());
  });

  it("handles date at year boundary", () => {
    // 2026-12-31 in UTC → expires 2027-01-01 00:00:00 UTC
    const result = computeShareExpiration("2026-12-31", "UTC");
    expect(result.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("handles Feb 28 in non-leap year", () => {
    // 2026 is not a leap year
    // 2026-02-28 in UTC → expires 2026-03-01 00:00:00 UTC
    const result = computeShareExpiration("2026-02-28", "UTC");
    expect(result.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("handles Feb 28 in leap year", () => {
    // 2028 is a leap year
    // 2028-02-28 in UTC → expires 2028-02-29 00:00:00 UTC (not March 1)
    const result = computeShareExpiration("2028-02-28", "UTC");
    expect(result.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("handles India timezone (UTC+5:30 — half-hour offset)", () => {
    // 2026-02-24 in Asia/Kolkata (UTC+5:30)
    // Expires at 2026-02-25 00:00:00 IST = 2026-02-24 18:30:00 UTC
    const result = computeShareExpiration("2026-02-24", "Asia/Kolkata");
    expect(result.toISOString()).toBe("2026-02-24T18:30:00.000Z");
  });

  it("handles Nepal timezone (UTC+5:45 — 45-minute offset)", () => {
    // 2026-02-24 in Asia/Kathmandu (UTC+5:45)
    // Expires at 2026-02-25 00:00:00 NPT = 2026-02-24 18:15:00 UTC
    const result = computeShareExpiration("2026-02-24", "Asia/Kathmandu");
    expect(result.toISOString()).toBe("2026-02-24T18:15:00.000Z");
  });
});

describe("isShareActive", () => {
  it("returns true when share has not expired", () => {
    // Share date 2026-02-24 in UTC → expires 2026-02-25 00:00:00 UTC
    // Check at 2026-02-24 23:00:00 UTC → still active
    const now = new Date("2026-02-24T23:00:00.000Z");
    expect(isShareActive("2026-02-24", "UTC", now)).toBe(true);
  });

  it("returns false when share has expired", () => {
    // Share date 2026-02-24 in UTC → expires 2026-02-25 00:00:00 UTC
    // Check at 2026-02-25 00:00:01 UTC → expired
    const now = new Date("2026-02-25T00:00:01.000Z");
    expect(isShareActive("2026-02-24", "UTC", now)).toBe(false);
  });

  it("returns false at exact expiration time", () => {
    // Expiration is > now(), not >=. At exactly midnight, share is expired.
    const now = new Date("2026-02-25T00:00:00.000Z");
    expect(isShareActive("2026-02-24", "UTC", now)).toBe(false);
  });

  it("respects timezone — eastern share still active for west coast viewers", () => {
    // Share date 2026-02-24, sharer in America/New_York (UTC-5)
    // Expires at 2026-02-25 05:00:00 UTC
    // At 2026-02-25 04:00:00 UTC → still active
    const now = new Date("2026-02-25T04:00:00.000Z");
    expect(isShareActive("2026-02-24", "America/New_York", now)).toBe(true);
  });

  it("respects timezone — east coast share expires before west coast", () => {
    // Share date 2026-02-24, sharer in America/New_York (UTC-5)
    // Expires at 2026-02-25 05:00:00 UTC
    // At 2026-02-25 06:00:00 UTC → expired
    const now = new Date("2026-02-25T06:00:00.000Z");
    expect(isShareActive("2026-02-24", "America/New_York", now)).toBe(false);

    // But the same time for a west coast sharer (UTC-8) → still active
    // West coast expires at 2026-02-25 08:00:00 UTC
    expect(isShareActive("2026-02-24", "America/Los_Angeles", now)).toBe(true);
  });

  it("share posted just before midnight is active until midnight", () => {
    // Share date 2026-02-24, sharer in America/New_York (UTC-5)
    // Even if created at 11:59pm ET, it's active until midnight
    // Expires at 2026-02-25 05:00:00 UTC
    const justBefore = new Date("2026-02-25T04:59:59.999Z");
    expect(isShareActive("2026-02-24", "America/New_York", justBefore)).toBe(
      true
    );
    const atMidnight = new Date("2026-02-25T05:00:00.000Z");
    expect(isShareActive("2026-02-24", "America/New_York", atMidnight)).toBe(
      false
    );
  });

  it("uses default timezone (America/New_York) for null timezone", () => {
    const now = new Date("2026-02-25T04:00:00.000Z");
    expect(isShareActive("2026-02-24", null, now)).toBe(true);
    expect(isShareActive("2026-02-24", "America/New_York", now)).toBe(true);

    const after = new Date("2026-02-25T06:00:00.000Z");
    expect(isShareActive("2026-02-24", null, after)).toBe(false);
    expect(isShareActive("2026-02-24", "America/New_York", after)).toBe(false);
  });

  it("handles ahead-of-UTC timezone correctly", () => {
    // Share date 2026-02-24, sharer in Asia/Tokyo (UTC+9)
    // Expires at 2026-02-24 15:00:00 UTC
    const before = new Date("2026-02-24T14:00:00.000Z");
    expect(isShareActive("2026-02-24", "Asia/Tokyo", before)).toBe(true);

    const after = new Date("2026-02-24T16:00:00.000Z");
    expect(isShareActive("2026-02-24", "Asia/Tokyo", after)).toBe(false);
  });
});
