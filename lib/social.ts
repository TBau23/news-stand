import { isValidUuid } from "@/lib/blocking";

export type FollowResult =
  | { success: true }
  | { error: "unable_to_follow" | "not_authenticated" | "invalid_user" | "rate_limited" };

export type UnfollowResult =
  | { success: true }
  | { error: "not_authenticated" | "rate_limited" };

export type BlockStatus = "none" | "viewer_blocked" | "blocked_by";

export function validateFollowInput(
  targetUserId: string | null | undefined,
  currentUserId: string
): { error: string | null } {
  if (!targetUserId || !targetUserId.trim()) {
    return { error: "User ID is required." };
  }

  const trimmed = targetUserId.trim();

  if (!isValidUuid(trimmed)) {
    return { error: "Invalid user ID." };
  }

  if (trimmed === currentUserId) {
    return { error: "You cannot follow yourself." };
  }

  return { error: null };
}

export function validateUnfollowInput(
  targetUserId: string | null | undefined,
  currentUserId: string
): { error: string | null } {
  if (!targetUserId || !targetUserId.trim()) {
    return { error: "User ID is required." };
  }

  const trimmed = targetUserId.trim();

  if (!isValidUuid(trimmed)) {
    return { error: "Invalid user ID." };
  }

  if (trimmed === currentUserId) {
    return { error: "You cannot unfollow yourself." };
  }

  return { error: null };
}
