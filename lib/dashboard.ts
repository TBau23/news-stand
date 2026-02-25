/**
 * Pure helper functions for the daily view (dashboard) page.
 */

/**
 * The type of empty state to render in the feed grid area.
 * - "welcome": No follows + hasn't shared today (combined welcome message)
 * - "no-follows": No follows, but has shared today
 * - "no-shares-today": Has follows, but no active shares in the feed
 * - null: Feed has active shares to display
 */
export type EmptyStateType =
  | "welcome"
  | "no-follows"
  | "no-shares-today"
  | null;

/**
 * Determines which empty state (if any) to show in the feed grid area.
 *
 * @param followCount - Number of users the current user follows.
 * @param hasSharedToday - Whether the current user has shared today.
 * @param feedShareCount - Number of active shares from followed users.
 * @returns The empty state type, or null if the feed grid should render.
 */
export function getEmptyStateType(
  followCount: number,
  hasSharedToday: boolean,
  feedShareCount: number
): EmptyStateType {
  if (followCount === 0 && !hasSharedToday) return "welcome";
  if (followCount === 0) return "no-follows";
  if (feedShareCount === 0) return "no-shares-today";
  return null;
}

/**
 * Returns the share navigation link based on whether the user has shared today.
 *
 * @param hasSharedToday - Whether the current user has shared today.
 * @returns "/share/today" if shared, "/share" if not.
 */
export function getShareLink(hasSharedToday: boolean): string {
  return hasSharedToday ? "/share/today" : "/share";
}
