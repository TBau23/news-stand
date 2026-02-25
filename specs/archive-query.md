# Archive Query — Historical Share Retrieval

## Phase
8 — History and Discovery

## What It Does
Fetches shares from followed users for a specific past date. This is the data layer that powers the archive page, allowing users to browse what people shared on any given day.

## User-Facing Behavior
When the user navigates to a past date in the archive, they see all shares from people they follow that were posted on that date. Unlike the daily view (which filters by timezone-based expiration), the archive shows all shares for the date — the day is over, nothing expires.

## Query Logic

### Core Rule
A share belongs to a date based on its `shared_date` column, which was computed in the sharer's timezone at creation time. The archive query matches shares where `shared_date` equals the requested date.

No expiration logic is needed. Historical shares are always "complete" — the sharer's day has ended.

### Date Selection
The viewer selects a date in their own timezone. This maps directly to `shared_date` values stored on shares (which are in the sharer's timezone). Since `shared_date` is a plain `DATE` (no timezone offset), a share posted on "2026-02-20" in any timezone matches a request for "2026-02-20."

> **Note:** This means a NYC user and an LA user both selecting "Feb 20" see the same set of shares. This is the simplest, most intuitive behavior. Edge cases where timezone differences cause a share to "belong" to a different date than the viewer expects are minor and not worth the complexity of cross-timezone date mapping.

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
WHERE f.follower_id = $1         -- current user
  AND s.shared_date = $2         -- requested date
ORDER BY s.created_at DESC
```

### Implementation Approach: Supabase RPC

Like the feed query, a database function called via RPC keeps the query logic in one place and aligns with the existing pattern.

```sql
CREATE OR REPLACE FUNCTION get_archive_shares(p_user_id UUID, p_date DATE)
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
    AND s.shared_date = p_date
  ORDER BY s.created_at DESC;
$$ LANGUAGE sql STABLE;
```

Called via: `supabase.rpc('get_archive_shares', { p_user_id: userId, p_date: '2026-02-20' })`

### SECURITY INVOKER vs. DEFINER

Follow the same decision as `get_active_feed_shares` (Phase 4). If Phase 5's followers-only RLS is in place before this ships, the function inherits the RLS rules automatically under `SECURITY INVOKER` — the `WHERE f.follower_id` clause already scopes access correctly.

### Return Type

Identical to the feed query return type. The TypeScript type:

```ts
// Reuse FeedShare from Phase 4 — same shape.
type ArchiveShare = FeedShare;
```

### Viewer's Own Share for the Date

The archive page also needs to know if the current user shared on the selected date. This is a separate simple query (not part of the RPC):

```sql
SELECT id, content_url, title, description, og_image_url, og_site_name, note, shared_date, created_at
FROM shares
WHERE user_id = $1 AND shared_date = $2
LIMIT 1
```

This mirrors the "has user shared today" query from the daily view page.

### Date Range Query (Deferred)

A future enhancement could support fetching shares across a date range (e.g., a week view). This is not needed for Phase 8's single-date archive. The function accepts a single date; range queries can be added later as a separate function or by modifying the parameter.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User follows no one | Returns empty array. Not an error. |
| No followed users shared on the requested date | Returns empty array. Not an error. |
| Date is today | Returns shares for today from followed users. Note: this overlaps with the feed query, but the archive query does NOT apply timezone expiration. Both are valid — the archive shows all shares posted for today's date, while the feed shows only unexpired ones. The archive page should discourage navigating to today (the daily view is the canonical today experience). |
| Date is in the future | Returns empty array. The archive page should prevent navigating to future dates, but the query handles it gracefully. |
| Date is very old (before the app existed) | Returns empty array. No special handling. |
| User follows someone who later unfollowed them | The `follows` JOIN ensures only current follows are shown. Shares from people you no longer follow are excluded. |
| User follows someone who blocked them | Phase 5 blocking removes the follow relationship, so the `follows` JOIN naturally excludes them. |
| Large number of follows (50+) | Max shares per date = number of follows. The `UNIQUE(user_id, shared_date)` constraint caps results. |
| The user's own share | Does NOT appear in the feed results (same as the daily view). The viewer's own share is fetched separately. |

## Data Model Changes

### New Migration Required
Create the `get_archive_shares` database function. No table changes needed.

### Index Consideration
The existing composite unique index on `shares(user_id, shared_date)` efficiently supports the `WHERE shared_date = $2` predicate combined with the `JOIN` on `user_id`. No new indexes needed.

## Dependencies
- **`follows` table** (Phase 1): Determines who the user follows.
- **`shares` table** (Phases 1-2): Source of share data.
- **`profiles` table** (Phases 1-2): Provides display info.
- **Phase 5 (RLS)**: Followers-only visibility should be in place before this ships, but the query works regardless since it already scopes to followed users.
- **Phase 3 (Sharing Flow)**: Must be implemented so historical shares exist. Can use mock data during development.

## Acceptance Criteria
- [ ] A database function fetches shares from followed users for a specific date.
- [ ] Shares are matched by `shared_date` equality (no timezone expiration logic).
- [ ] Shares from users the current user does NOT follow are excluded.
- [ ] The user's own shares are excluded from the main query.
- [ ] A separate query can fetch the viewer's own share for the date.
- [ ] Results include sharer profile info (username, display_name, avatar_url).
- [ ] Results are ordered by creation time (newest first).
- [ ] Returns empty array (not an error) for dates with no shares.
- [ ] Returns empty array (not an error) for future dates.
- [ ] The return type is compatible with `FeedShare` / `ShareCard` props.
- [ ] The query performs acceptably with realistic data (target: <100ms for 50 follows).
