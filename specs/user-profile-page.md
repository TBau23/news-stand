# User Profile Page

## Phase
6 — Social Graph

## What It Does
Displays a public profile for any user, showing their identity (display name, username, avatar, bio), social stats (follower/following counts), and their current active share (if any). Serves as the anchor for social interactions — following, unfollowing, and (from Phase 5) blocking.

## User-Facing Behavior
A user navigates to another user's profile page (via search results, invite link, or share card). They see the person's basic info, whether they follow them or not, how many followers/following that user has, and that user's share for today (if active). The profile feels like a calling card, not a full social media profile — minimal, informative, and actionable.

## Route

### Page: `/profile/[username]`
A protected page under `app/(protected)/profile/[username]/page.tsx`. Uses the dynamic `[username]` segment to look up the profile.

## Data Fetching

### Server Component
The page is a server component that fetches:

1. **Profile data:** Look up the user by username.
   ```sql
   SELECT id, username, display_name, avatar_url, bio, timezone
   FROM profiles
   WHERE username = $1
   LIMIT 1
   ```

2. **Follower count:** Number of people who follow this user.
   ```sql
   SELECT count(*) FROM follows WHERE following_id = $1
   ```

3. **Following count:** Number of people this user follows.
   ```sql
   SELECT count(*) FROM follows WHERE follower_id = $1
   ```

4. **Follow status:** Whether the current viewer follows this user.
   ```sql
   SELECT 1 FROM follows
   WHERE follower_id = auth.uid() AND following_id = $1
   LIMIT 1
   ```

5. **Block status:** Whether the current viewer has blocked this user or vice versa (from Phase 5 `blocks` table).
   ```sql
   SELECT 1 FROM blocks
   WHERE (blocker_id = auth.uid() AND blocked_id = $1)
      OR (blocker_id = $1 AND blocked_id = auth.uid())
   LIMIT 1
   ```

6. **Active share:** The user's share for today (if still active in their timezone). Uses the same timezone-aware logic as the feed query.
   ```sql
   SELECT s.id, s.content_url, s.title, s.description, s.og_image_url, s.og_site_name, s.note, s.created_at
   FROM shares s
   JOIN profiles p ON p.id = s.user_id
   WHERE s.user_id = $1
     AND (s.shared_date::date + INTERVAL '1 day') AT TIME ZONE p.timezone > now()
   ORDER BY s.shared_date DESC
   LIMIT 1
   ```
   Note: This query must work under Phase 5 followers-only RLS. The viewer must follow the profile owner to see their share. If they don't follow, the query returns no rows (which is the correct behavior — don't reveal sharing activity to non-followers).

## Page Layout

```
┌──────────────────────────────────────────┐
│ ← Back                                   │
├──────────────────────────────────────────┤
│                                          │
│          [Avatar]                        │
│       Display Name                       │
│        @username                         │
│                                          │
│   Bio text goes here if they have one.   │
│                                          │
│   12 followers  ·  8 following           │
│                                          │
│   [  Follow  ] or [  Following ✓  ]     │
│                                          │
├──────────────────────────────────────────┤
│                                          │
│   Today's Share                          │
│   ┌──────────────────────────────────┐   │
│   │          ShareCard               │   │
│   │      (without sharer header)     │   │
│   └──────────────────────────────────┘   │
│                                          │
│   — or —                                 │
│                                          │
│   "No share today"                       │
│                                          │
└──────────────────────────────────────────┘
```

### Back Navigation
A back link or button at the top. Uses `router.back()` or links to `/dashboard` as a fallback. Keeps the user oriented since profiles are a detail view.

### Avatar
Large circular avatar (e.g., 80x80px). Falls back to an initial-letter circle if `avatar_url` is null or fails to load. Same pattern as the `ShareCard` avatar but larger.

### Identity
- **Display name:** Bold, primary text. Falls back to username if null.
- **Username:** Shown as `@username`, muted text.
- **Bio:** Below the username, normal weight. Omitted entirely if null (no "No bio yet" placeholder).

### Social Stats
Follower and following counts displayed inline. These are display-only — not tappable (follower/following list pages are out of scope for Phase 6).

### Follow Button
Rendered by the `FollowButton` component from `specs/follow-unfollow.md`. The profile page provides the `userId`, `isFollowing`, and `isBlocked` props.

### Today's Share
If the user has an active share today, render it using the `ShareCard` component (from `specs/share-card.md`) without the `sharer` prop (since the identity is already shown above). If no active share, show a quiet "No share today" message.

### Own Profile
When the viewer is looking at their own profile (`profile.id === auth.uid()`):
- The follow button is **not rendered** (can't follow yourself).
- The active share section shows their own share for today.
- No edit button for now — profile editing lands in Phase 9 (Settings).

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| Username not found | Show a 404 page: "User not found." with a link back to dashboard. Use Next.js `notFound()`. |
| Viewer is blocked by the profile owner | Profile info (name, username, avatar, bio, counts) is still visible (profiles are public). Follow button shows "Unable to follow" disabled state. Active share is not visible (RLS blocks it). |
| Viewer has blocked the profile owner | Profile info visible. Instead of follow button, show "Blocked" label with an "Unblock" option. Active share not visible (follow was removed on block). |
| Profile owner hasn't shared today | "No share today" message in the share section. |
| Profile owner's share has expired (past midnight in their timezone) | Same as "hasn't shared today" — the timezone-aware query returns nothing. |
| Viewer doesn't follow the profile owner | Profile info and counts visible. Follow button shows "Follow". Active share is not visible (followers-only RLS). Show "Follow to see their shares" in the share section instead of "No share today". |
| Profile has no avatar | Initial-letter circle fallback. |
| Profile has no bio | Bio section omitted entirely. |
| Profile has no display name | Username used as the primary name. |
| Very long bio | Display full text. No truncation (bios should be short by convention; no character limit enforced yet). |
| Very long display name | Truncate with ellipsis after 1 line. |
| Follower/following counts are very large | Display the number. No abbreviation needed at this scale (the app encourages small graphs). |

## Data Model Changes
None. All required tables (`profiles`, `follows`, `blocks`, `shares`) exist from prior phases.

## API Routes or Server Actions
No new server actions for the profile page itself. It's a read-only server component. The follow/unfollow and block/unblock actions are defined in their respective specs (`specs/follow-unfollow.md`, `specs/user-blocking.md`).

## UI States

### Page Load
- **Loading:** Skeleton with avatar circle, name placeholder lines, and card placeholder. Provide a `loading.tsx` for client-side navigation.
- **Found:** Full profile with all available information.
- **Not Found:** 404 message.

### Share Section
- **Has active share (viewer follows or is owner):** ShareCard rendered.
- **Has active share (viewer doesn't follow):** "Follow to see their shares."
- **No active share:** "No share today."

### Follow Button States
Defined in `specs/follow-unfollow.md`. The profile page passes the necessary props.

## Dependencies
- **Follow/Unfollow** (`specs/follow-unfollow.md`): Provides the `FollowButton` component and server actions.
- **User Blocking** (`specs/user-blocking.md`): Block status determines UI state. Server actions for block/unblock.
- **Share Card** (`specs/share-card.md`): Renders the active share.
- **Followers-Only Visibility** (`specs/followers-only-visibility.md`): Determines whether the active share query returns results.
- **Phase 1-2**: `profiles`, `follows`, `shares` tables.
- **Phase 5**: `blocks` table and RLS policies.

## Acceptance Criteria
- [ ] Profile page exists at `/profile/[username]` as a protected route.
- [ ] Displays the user's avatar (or initial fallback), display name, username, and bio.
- [ ] Shows follower and following counts.
- [ ] Shows a follow/unfollow button for other users' profiles.
- [ ] Does not show a follow button on the viewer's own profile.
- [ ] Displays the user's active share for today using the `ShareCard` component.
- [ ] Shows "No share today" when the user has no active share.
- [ ] Shows "Follow to see their shares" when the viewer doesn't follow the profile owner.
- [ ] Handles blocked state — disabled follow for blocked-by, "Blocked" label for blocker.
- [ ] Returns 404 for non-existent usernames.
- [ ] Back navigation returns to the previous page or dashboard.
- [ ] Loading skeleton is provided for client-side navigation.
