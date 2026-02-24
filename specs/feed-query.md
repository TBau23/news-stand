# Feed Query — Timezone-Aware Share Fetching

## Phase
4 — The Daily View

## What It Does
Fetches today's active shares from people the current user follows, filtering out shares that have expired in the sharer's local timezone. This is the data layer that powers the daily view.

## User-Facing Behavior
When the user opens the daily view, they see shares from the people they follow. A share disappears from the feed once midnight passes in the sharer's timezone — east coast shares cycle off before west coast ones. The feed has a rolling, timezone-aware quality throughout the day.

## Query Logic

### Core Rule
A share is "active" when it's still the share's `shared_date` in the **sharer's** timezone. Specifically:
- Look at the share's `shared_date` (e.g., `2026-02-24`)
- Look at the sharer's `profiles.timezone` (e.g., `America/New_York`)
- The share expires at midnight at the **end** of `shared_date` in the sharer's timezone
- If the current UTC time has passed that expiration moment, the share is no longer active

### Computing Expiration in SQL

```sql
-- The share expires at the start of the NEXT day in the sharer's timezone.
-- Convert that to a UTC timestamp for comparison with now().
(shared_date + INTERVAL '1 day') AT TIME ZONE profiles.timezone
```

Example: `shared_date = '2026-02-24'`, `timezone = 'America/New_York'`:
- `shared_date + INTERVAL '1 day'` → `2026-02-25` (midnight local)
- `AT TIME ZONE 'America/New_York'` → `2026-02-25 05:00:00 UTC`
- If `now()` is before `2026-02-25 05:00:00 UTC`, the share is active.

### Full Query

```sql
SELECT
  s.id, s.user_id, s.content_url, s.title, s.description,
  s.og_image_url, s.og_site_name, s.note, s.shared_date,
  s.created_at, s.updated_at,
  p.username, p.display_name, p.avatar_url
FROM shares s
JOIN follows f ON s.user_id = f.following_id
JOIN profiles p ON s.user_id = p.id
WHERE f.follower_id = $1  -- current user
  AND (s.shared_date + INTERVAL '1 day') AT TIME ZONE p.timezone > now()
ORDER BY s.created_at DESC
```

### Implementation Approach: Supabase RPC

The timezone expiration involves a computed expression that doesn't map cleanly to the Supabase query builder. A database function called via RPC is the recommended approach.

```sql
CREATE OR REPLACE FUNCTION get_active_feed_shares(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content_url TEXT,
  title TEXT,
  description TEXT,
  og_image_url TEXT,
  og_site_name TEXT,
  note TEXT,
  shared_date DATE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT
) AS $$
  SELECT
    s.id, s.user_id, s.content_url, s.title, s.description,
    s.og_image_url, s.og_site_name, s.note, s.shared_date,
    s.created_at, s.updated_at,
    p.username, p.display_name, p.avatar_url
  FROM shares s
  JOIN follows f ON s.user_id = f.following_id
  JOIN profiles p ON s.user_id = p.id
  WHERE f.follower_id = p_user_id
    AND (s.shared_date + INTERVAL '1 day') AT TIME ZONE p.timezone > now()
  ORDER BY s.created_at DESC;
$$ LANGUAGE sql STABLE;
```

Called via: `supabase.rpc('get_active_feed_shares', { p_user_id: userId })`

> **Open Decision: SECURITY DEFINER vs. SECURITY INVOKER.**
> Currently RLS on `shares` is public-read, so `SECURITY INVOKER` works. After Phase 5 tightens RLS to followers-only, the function may need `SECURITY DEFINER` with the `WHERE f.follower_id` clause providing access control.
> **Recommendation:** Use `SECURITY INVOKER` for now. Revisit in Phase 5.

> **Open Decision: Supabase RPC vs. query builder with raw filter.**
> RPC is recommended for clarity. The timezone computation is complex enough that embedding it in a query builder call would be fragile and hard to test.

### Return Type

The function returns a flat row per share with profile columns denormalized. The TypeScript type:

```ts
type FeedShare = {
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
```

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User follows no one | Returns empty array. Not an error. |
| User follows people but none have shared today | Returns empty array. Not an error. |
| A share was posted just before midnight in the sharer's timezone | Remains active until midnight passes. Correct behavior. |
| Sharer's timezone is ahead of the viewer's | Sharer's shares may expire while it's still "today" for the viewer. This is by design — the share's lifetime is governed by the sharer's day. |
| Sharer has no timezone set | Falls back to `America/New_York` (the DB column default). |
| User follows someone who hasn't completed onboarding | That user has no shares, so they won't appear. No special handling needed. |
| Large number of follows (50+) | The natural daily limit (one share per person) caps the result set at the number of follows. The `UNIQUE(user_id, shared_date)` constraint ensures at most one share per followed user per day. The index on `follows.follower_id` and `shares.user_id` keeps the query fast. |
| The user's own share | Does NOT appear in the feed. The query only returns shares from `follows.following_id`, and users can't follow themselves (enforced by `no_self_follow` constraint). |

## Data Model Changes

### New Migration Required
Create the `get_active_feed_shares` database function. No table changes needed.

### Index Consideration
The existing indexes (`shares_user_id_idx`, `shares_shared_date_idx`, `follows_follower_id_idx`) should be sufficient. Monitor query performance and add a composite index on `shares(user_id, shared_date)` if needed (though the UNIQUE constraint already creates one).

## Dependencies
- **`follows` table** (Phase 1): Determines who the user follows.
- **`shares` table** (Phases 1-2): Source of share data.
- **`profiles` table** (Phases 1-2): Provides timezone and display info.
- **Phase 3 (Sharing Flow)**: Must be implemented so shares exist. Can use mock data during development.

## Acceptance Criteria
- [ ] A database function (or equivalent query) fetches shares from followed users.
- [ ] Shares are filtered by timezone: a share is only returned while it's still the `shared_date` in the sharer's timezone.
- [ ] Shares from users the current user does NOT follow are excluded.
- [ ] The user's own shares are excluded.
- [ ] Results include sharer profile info (username, display_name, avatar_url).
- [ ] Results are ordered by creation time (newest first).
- [ ] Returns empty array (not an error) when the user follows no one.
- [ ] Returns empty array (not an error) when no followed users have active shares.
- [ ] The query performs acceptably with a realistic number of follows (target: <200ms for 50 follows).
