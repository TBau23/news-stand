import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const DEFAULT_TIMEZONE = "America/New_York";

/**
 * A single share in the feed, with denormalized sharer profile info.
 * Matches the return type of the get_active_feed_shares database function.
 */
export type FeedShare = {
  id: string;
  user_id: string;
  content_url: string;
  title: string | null;
  description: string | null;
  og_image_url: string | null;
  og_site_name: string | null;
  note: string | null;
  shared_date: string;
  created_at: string;
  updated_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * Computes the UTC Date at which a share expires.
 *
 * A share expires at midnight at the end of `sharedDate` in the sharer's timezone.
 * This mirrors the SQL: (shared_date + INTERVAL '1 day') AT TIME ZONE timezone
 *
 * @param sharedDate - The share's date in YYYY-MM-DD format.
 * @param timezone - IANA timezone identifier (e.g., "America/New_York").
 * @returns The UTC Date when the share expires.
 */
export function computeShareExpiration(
  sharedDate: string,
  timezone: string | null | undefined
): Date {
  const tz = timezone || DEFAULT_TIMEZONE;

  // Parse the shared_date components
  const [year, month, day] = sharedDate.split("-").map(Number);

  // We need midnight at the START of the next day in the sharer's timezone.
  // That's the same as the end of shared_date in their timezone.
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));

  // Use Intl.DateTimeFormat to find the UTC offset at that local time.
  // We format the target local datetime and compare to get the offset.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // To find the UTC time that corresponds to midnight local on the next day,
  // we iteratively adjust. But a simpler approach: use a known reference point.
  //
  // Strategy: Create a date at the approximate UTC time and check what local
  // time it maps to, then adjust by the difference.
  //
  // Start with UTC midnight of the next day as our initial guess.
  const guess = nextDay.getTime();

  // Format that UTC time in the target timezone to see what local time it shows
  const parts = formatter.formatToParts(new Date(guess));
  const localYear = Number(parts.find((p) => p.type === "year")!.value);
  const localMonth = Number(parts.find((p) => p.type === "month")!.value);
  const localDay = Number(parts.find((p) => p.type === "day")!.value);
  const localHour = Number(parts.find((p) => p.type === "hour")!.value);
  const localMinute = Number(parts.find((p) => p.type === "minute")!.value);
  const localSecond = Number(parts.find((p) => p.type === "second")!.value);

  // Compute what local midnight (next day) would be in ms from epoch
  const localMidnight = Date.UTC(year, month - 1, day + 1, 0, 0, 0);
  // Compute what the guess maps to in local time in ms from epoch
  const localGuess = Date.UTC(
    localYear,
    localMonth - 1,
    localDay,
    localHour,
    localMinute,
    localSecond
  );

  // guess (UTC) displays as localGuess in the target timezone.
  // We want to find the UTC time that displays as localMidnight.
  // offset = localMidnight - localGuess tells us how much to shift.
  const offset = localMidnight - localGuess;
  return new Date(guess + offset);
}

/**
 * Determines if a share is currently active (not yet expired).
 *
 * A share is active when it's still the share's `shared_date` in the sharer's timezone.
 * Mirrors the SQL: (shared_date + INTERVAL '1 day') AT TIME ZONE timezone > now()
 *
 * @param sharedDate - The share's date in YYYY-MM-DD format.
 * @param timezone - IANA timezone identifier (e.g., "America/New_York").
 * @param now - Optional current time (defaults to Date.now). Useful for testing.
 * @returns true if the share is still active.
 */
export function isShareActive(
  sharedDate: string,
  timezone: string | null | undefined,
  now?: Date
): boolean {
  const expiration = computeShareExpiration(sharedDate, timezone);
  const currentTime = now ?? new Date();
  return expiration.getTime() > currentTime.getTime();
}

/**
 * Fetches active feed shares from the database via the get_active_feed_shares RPC.
 *
 * @param supabase - Authenticated Supabase client.
 * @param userId - The current user's UUID.
 * @returns Array of active feed shares or an error.
 */
export async function getFeedShares(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ data: FeedShare[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_active_feed_shares", {
    p_user_id: userId,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data as FeedShare[]) ?? [], error: null };
}
