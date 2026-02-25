const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function validateBlockInput(
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
    return { error: "You cannot block yourself." };
  }

  return { error: null };
}

export function validateUnblockInput(
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
    return { error: "You cannot unblock yourself." };
  }

  return { error: null };
}

export interface BlockedUser {
  blocked_id: string;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}
