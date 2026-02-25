# Realtime Feed Updates

## Phase
7 — Polish and Realtime

## What It Does
Adds live updates to the daily view so new shares from followed users appear without a page refresh, and expired shares fade out when they pass midnight in the sharer's timezone. The shelf "fills up throughout the day" in real time.

## User-Facing Behavior
The user opens the daily view and sees today's existing shares. As the day goes on, when someone they follow posts a new share, it appears on the shelf automatically — no refresh required. Conversely, when a share expires (midnight in the sharer's timezone), it disappears from the view. The experience feels alive and ambient rather than stale and snapshot-based.

## Technical Approach: Supabase Realtime

### Channel Setup
Subscribe to Postgres Changes on the `shares` table using Supabase Realtime. The subscription listens for `INSERT` events on the `shares` table.

```ts
const channel = supabase
  .channel('feed-shares')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'shares',
    },
    (payload) => handleNewShare(payload.new)
  )
  .subscribe()
```

### Why Only INSERT
- **INSERT**: A followed user posts a new share. This is the primary realtime event.
- **UPDATE**: Only note edits are allowed post-creation. Note changes don't need live propagation to the feed — the original note is sufficient until next load.
- **DELETE**: Shares are not deletable in the current spec. If this changes, add a DELETE listener.

### Filtering: Client-Side vs. Server-Side

Supabase Realtime supports server-side row filters, but the filter we need (the new share's `user_id` is in the viewer's follow list) cannot be expressed as a simple column equality filter.

**Approach: Broad listen, client-side filter.**

1. Listen for all `INSERT` events on `shares`.
2. On receipt, check if the new share's `user_id` is in the viewer's set of followed user IDs.
3. If yes, fetch the sharer's profile data (username, display_name, avatar_url) and add the share to the feed.
4. If no, discard silently.

The follow list is fetched once on page load and cached in component state. If the user follows/unfollows someone during the session (Phase 6), the follow list should be updated.

> **Open Decision: RLS and Realtime.**
> Supabase Realtime respects RLS policies when using `postgres_changes`. After Phase 5 tightens RLS to followers-only, only shares from followed users will trigger events for the subscribed user. This would eliminate the need for client-side follow-list filtering.
> **Recommendation:** Implement client-side filtering now (works with current public-read RLS). After Phase 5, verify that RLS-based filtering takes over and simplify the client logic if so.

### Handling New Shares

When a new share passes the follow-list filter:

1. Fetch the sharer's profile (if not already in the local profile cache):
   ```ts
   const { data: profile } = await supabase
     .from('profiles')
     .select('username, display_name, avatar_url')
     .eq('id', newShare.user_id)
     .single()
   ```
2. Construct a `FeedShare` object matching the existing feed data shape.
3. Add to the feed state array (prepend — newest first, matching the `ORDER BY created_at DESC` from the initial query).
4. Trigger an entry animation (see `specs/feed-transitions.md`).

### Share Expiration (Client-Side Timer)

Shares expire at midnight in the sharer's timezone. Rather than subscribing to a server event (there is no event — the share simply ages out), use client-side timers.

**On page load and when new shares arrive:**

For each share in the feed, compute its expiration time:
```ts
function getShareExpiration(sharedDate: string, timezone: string): Date {
  // The share expires at the start of the next day in the sharer's timezone.
  // Parse shared_date as "YYYY-MM-DD", add 1 day, convert to UTC.
  const nextDay = new Date(`${sharedDate}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);

  // Use Intl to find the UTC offset for the sharer's timezone at that moment.
  // Then compute the UTC timestamp of midnight-next-day in the sharer's zone.
  // (Implementation detail — may use a helper or the same AT TIME ZONE logic.)
}
```

Schedule a `setTimeout` for each share that triggers removal from the feed when it expires. When a share expires:
1. Trigger an exit animation (fade-out, see `specs/feed-transitions.md`).
2. Remove the share from the feed state array after the animation completes.

**Timer management:**
- Store timeout IDs in a `Map<shareId, timeoutId>` ref.
- Clear all timeouts on unmount.
- If a share is already expired when received (edge case — realtime delivers a share that's already past midnight for the sharer), discard it immediately.

### Profile Caching

Maintain a client-side cache of sharer profiles to avoid redundant fetches:
```ts
const profileCache = useRef<Map<string, SharerProfile>>(new Map())
```

When a realtime share arrives from a user whose profile is already cached (e.g., from the initial feed load or a previous realtime event today), use the cached profile instead of fetching.

## Component Architecture

### Client Component Wrapper
The daily view page is currently a server component (per Phase 4 spec). Realtime requires a client component. The approach:

1. **Server component** (`page.tsx`) fetches initial feed data and follow list via SSR.
2. **Client component** (`FeedRealtime.tsx` or similar) receives initial data as props and:
   - Renders the feed grid with `ShareCard` components.
   - Sets up the Supabase Realtime subscription.
   - Manages local feed state (additions, removals).
   - Handles expiration timers.

```tsx
// app/(protected)/dashboard/page.tsx (server component)
export default async function DashboardPage() {
  const initialShares = await fetchFeedShares(userId)
  const followedIds = await fetchFollowedUserIds(userId)
  return <FeedRealtime initialShares={initialShares} followedIds={followedIds} />
}
```

### State Management
The client component manages:
- `shares: FeedShare[]` — the current feed state, initialized from SSR data.
- `followedIds: Set<string>` — the user's follow list, used for client-side filtering.
- `profileCache: Map<string, SharerProfile>` — cached sharer profiles.
- `expirationTimers: Map<string, NodeJS.Timeout>` — scheduled removal timers.

## Connection Lifecycle

### Subscribe on Mount
Set up the Supabase channel when the client component mounts. Store the channel reference for cleanup.

### Reconnection
Supabase Realtime handles reconnection automatically. However, shares posted during a disconnect window will be missed. On reconnection:

1. Re-fetch the full feed via `get_active_feed_shares` RPC.
2. Diff against current local state.
3. Add any new shares that arrived during the disconnect.
4. Remove any shares that expired during the disconnect.

Listen for the channel's `SUBSCRIBED` and `CHANNEL_ERROR` states:
```ts
channel.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    // Connection established or re-established
    refetchFeed()
  }
  if (status === 'CHANNEL_ERROR') {
    // Log error, Supabase will auto-retry
  }
})
```

### Unsubscribe on Unmount
Remove the channel subscription and clear all expiration timers on component unmount.

```ts
useEffect(() => {
  const channel = setupRealtimeSubscription()
  return () => {
    supabase.removeChannel(channel)
    expirationTimers.current.forEach(clearTimeout)
  }
}, [])
```

### Visibility-Based Refresh
When the user returns to the tab after it's been in the background (e.g., switched tabs, phone locked), the feed may be stale. Use the `visibilitychange` event:

```ts
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refetchFeed()
  }
})
```

This ensures the feed is fresh even if the realtime connection was paused or lost while the tab was hidden.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User follows no one | No subscription needed. Skip realtime setup entirely. If the user later follows someone (Phase 6), they need to refresh or the follow list needs live updates too. |
| Realtime share from a user the viewer just unfollowed | Client-side filter rejects it (user no longer in `followedIds`). No issue. |
| Realtime share arrives but profile fetch fails | Skip adding the share silently. It will appear on next full page load. Do not show a broken card. |
| Share expires exactly at page load time | The expiration timer fires immediately (timeout of 0 or negative). The share is removed from the feed via the exit animation. |
| Multiple shares arrive in rapid succession | Each is processed independently. Animations may overlap (see `specs/feed-transitions.md` for staggering). |
| User has 50+ follows, all share within seconds | Each share is added to the feed independently. No batching needed — the one-per-day constraint limits this to at most ~50 events per day. |
| Browser tab in background for hours | `visibilitychange` handler re-fetches the feed on return. Expiration timers fire normally even in background tabs (though browsers may throttle them). |
| Supabase Realtime is unavailable (outage) | The page still works — the initial SSR fetch provides the feed. Users just won't see live updates until the connection recovers. No error banner needed for a transient realtime issue. |
| Network disconnect | Supabase SDK auto-retries. On reconnection, a full feed re-fetch reconciles state. |

## Data Model Changes
None. This is a client-side feature using existing Supabase Realtime infrastructure and the existing `shares` table.

## Dependencies
- **Daily View Page** (`specs/daily-view-page.md`): The page this feature enhances. Must be built first.
- **Feed Query** (`specs/feed-query.md`): Used for initial fetch and reconnection re-fetch.
- **Feed Transitions** (`specs/feed-transitions.md`): Provides entry/exit animations for shares appearing/disappearing.
- **Supabase Realtime**: Included in `@supabase/supabase-js`. No additional dependencies.
- **Phase 5 (Privacy)**: After Phase 5 tightens RLS, verify that Realtime only delivers shares the user is allowed to see. This may simplify client-side filtering.

## Supabase Configuration
Supabase Realtime must be enabled for the `shares` table. In the Supabase dashboard or via config:
- Enable Realtime on the `shares` table (it may be off by default).
- This is a one-time configuration step, not a code change.

> **Note:** The Supabase local dev instance (`npx supabase start`) has Realtime enabled by default. Production may need explicit enablement via the dashboard.

## Acceptance Criteria
- [ ] A Supabase Realtime subscription is active on the daily view for `INSERT` events on `shares`.
- [ ] When a followed user posts a new share, it appears in the feed without a page refresh.
- [ ] Shares from non-followed users are silently discarded (client-side filter).
- [ ] New shares appear with an entry animation (delegated to feed-transitions spec).
- [ ] Shares that expire (midnight in sharer's timezone) are removed from the feed with an exit animation.
- [ ] Expiration timers are correctly computed from the share's `shared_date` and the sharer's `timezone`.
- [ ] All timers and subscriptions are cleaned up on component unmount.
- [ ] When the browser tab becomes visible after being hidden, the feed is re-fetched to reconcile state.
- [ ] On Realtime reconnection, a full feed re-fetch is triggered to catch missed events.
- [ ] The page still works (with SSR data) if Realtime is unavailable.
- [ ] Profile data for new shares is fetched and cached to avoid redundant requests.
