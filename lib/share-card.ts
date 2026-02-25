/**
 * Pure helper functions for the ShareCard component.
 * Kept separate from the component for testability in Node environment.
 */

const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
];

/**
 * Returns a deterministic Tailwind background color class for a username.
 * Used for the avatar fallback circle.
 */
export function getAvatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Returns the uppercase first character of the display name or username.
 * Used as the letter inside the avatar fallback circle.
 */
export function getInitial(
  displayName: string | null,
  username: string
): string {
  const name = displayName || username;
  return name.charAt(0).toUpperCase();
}

/**
 * Returns a soft time-of-day label based on the hour (0-23).
 *
 * - 5–11: "this morning"
 * - 12–16: "this afternoon"
 * - 17–20: "this evening"
 * - 21–4: "tonight"
 */
export function getTimeOfDayLabel(hour: number): string {
  if (hour >= 5 && hour < 12) return "this morning";
  if (hour >= 12 && hour < 17) return "this afternoon";
  if (hour >= 17 && hour < 21) return "this evening";
  return "tonight";
}
