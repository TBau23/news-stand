import { describe, it, expect } from "vitest";
import { validateFollowInput, validateUnfollowInput } from "./social";

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const OTHER_UUID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

describe("validateFollowInput", () => {
  it("returns null error for valid input", () => {
    expect(validateFollowInput(OTHER_UUID, VALID_UUID)).toEqual({
      error: null,
    });
  });

  it("returns error when targetUserId is null", () => {
    expect(validateFollowInput(null, VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is undefined", () => {
    expect(validateFollowInput(undefined, VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is empty string", () => {
    expect(validateFollowInput("", VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is whitespace", () => {
    expect(validateFollowInput("   ", VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is not a valid UUID", () => {
    expect(validateFollowInput("not-a-uuid", VALID_UUID)).toEqual({
      error: "Invalid user ID.",
    });
  });

  it("returns error when following yourself", () => {
    expect(validateFollowInput(VALID_UUID, VALID_UUID)).toEqual({
      error: "You cannot follow yourself.",
    });
  });

  it("trims whitespace from targetUserId before comparing", () => {
    expect(validateFollowInput(`  ${VALID_UUID}  `, VALID_UUID)).toEqual({
      error: "You cannot follow yourself.",
    });
  });

  it("accepts a valid UUID different from current user", () => {
    expect(
      validateFollowInput(
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222"
      )
    ).toEqual({ error: null });
  });
});

describe("validateUnfollowInput", () => {
  it("returns null error for valid input", () => {
    expect(validateUnfollowInput(OTHER_UUID, VALID_UUID)).toEqual({
      error: null,
    });
  });

  it("returns error when targetUserId is null", () => {
    expect(validateUnfollowInput(null, VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is undefined", () => {
    expect(validateUnfollowInput(undefined, VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is empty string", () => {
    expect(validateUnfollowInput("", VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is whitespace", () => {
    expect(validateUnfollowInput("   ", VALID_UUID)).toEqual({
      error: "User ID is required.",
    });
  });

  it("returns error when targetUserId is not a valid UUID", () => {
    expect(validateUnfollowInput("invalid", VALID_UUID)).toEqual({
      error: "Invalid user ID.",
    });
  });

  it("returns error when unfollowing yourself", () => {
    expect(validateUnfollowInput(VALID_UUID, VALID_UUID)).toEqual({
      error: "You cannot unfollow yourself.",
    });
  });

  it("trims whitespace from targetUserId before comparing", () => {
    expect(validateUnfollowInput(`  ${VALID_UUID}  `, VALID_UUID)).toEqual({
      error: "You cannot unfollow yourself.",
    });
  });

  it("accepts a valid UUID different from current user", () => {
    expect(
      validateUnfollowInput(
        "33333333-3333-3333-3333-333333333333",
        "44444444-4444-4444-4444-444444444444"
      )
    ).toEqual({ error: null });
  });
});
