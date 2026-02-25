import { describe, it, expect } from "vitest";
import { isValidUuid, validateBlockInput, validateUnblockInput } from "./blocking";

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const OTHER_UUID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

describe("isValidUuid", () => {
  it("returns true for a valid lowercase UUID", () => {
    expect(isValidUuid("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
  });

  it("returns true for a valid uppercase UUID", () => {
    expect(isValidUuid("A1B2C3D4-E5F6-7890-ABCD-EF1234567890")).toBe(true);
  });

  it("returns true for a mixed-case UUID", () => {
    expect(isValidUuid("a1B2c3D4-e5F6-7890-AbCd-Ef1234567890")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isValidUuid("")).toBe(false);
  });

  it("returns false for a random string", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
  });

  it("returns false for a UUID missing a segment", () => {
    expect(isValidUuid("a1b2c3d4-e5f6-7890-abcd")).toBe(false);
  });

  it("returns false for a UUID with extra characters", () => {
    expect(isValidUuid("a1b2c3d4-e5f6-7890-abcd-ef1234567890x")).toBe(false);
  });

  it("returns false for a UUID with invalid hex characters", () => {
    expect(isValidUuid("g1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(false);
  });
});

describe("validateBlockInput", () => {
  it("returns null error for valid input", () => {
    expect(validateBlockInput(OTHER_UUID, VALID_UUID)).toEqual({
      error: null,
    });
  });

  it("returns error when targetUserId is null", () => {
    expect(validateBlockInput(null, VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is undefined", () => {
    expect(validateBlockInput(undefined, VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is empty string", () => {
    expect(validateBlockInput("", VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is whitespace", () => {
    expect(validateBlockInput("   ", VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is not a valid UUID", () => {
    expect(validateBlockInput("not-a-uuid", VALID_UUID)).toEqual({
      error: "Invalid user ID.",
    });
  });

  it("returns error when blocking yourself", () => {
    expect(validateBlockInput(VALID_UUID, VALID_UUID)).toEqual({
      error: "You cannot block yourself.",
    });
  });

  it("trims whitespace from targetUserId before comparing", () => {
    expect(validateBlockInput(`  ${VALID_UUID}  `, VALID_UUID)).toEqual({
      error: "You cannot block yourself.",
    });
  });

  it("accepts a valid UUID different from current user", () => {
    expect(
      validateBlockInput(
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222"
      )
    ).toEqual({ error: null });
  });
});

describe("validateUnblockInput", () => {
  it("returns null error for valid input", () => {
    expect(validateUnblockInput(OTHER_UUID, VALID_UUID)).toEqual({
      error: null,
    });
  });

  it("returns error when targetUserId is null", () => {
    expect(validateUnblockInput(null, VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is undefined", () => {
    expect(validateUnblockInput(undefined, VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is empty string", () => {
    expect(validateUnblockInput("", VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is not a valid UUID", () => {
    expect(validateUnblockInput("invalid", VALID_UUID)).toEqual({
      error: "Invalid user ID.",
    });
  });

  it("returns error when unblocking yourself", () => {
    expect(validateUnblockInput(VALID_UUID, VALID_UUID)).toEqual({
      error: "You cannot unblock yourself.",
    });
  });

  it("trims whitespace from targetUserId before comparing", () => {
    expect(validateUnblockInput(`  ${VALID_UUID}  `, VALID_UUID)).toEqual({
      error: "You cannot unblock yourself.",
    });
  });

  it("accepts a valid UUID different from current user", () => {
    expect(
      validateUnblockInput(
        "33333333-3333-3333-3333-333333333333",
        "44444444-4444-4444-4444-444444444444"
      )
    ).toEqual({ error: null });
  });
});
