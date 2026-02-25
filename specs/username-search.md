# Username Search

## Phase
6 — Social Graph

## What It Does
Provides a way for users to find other people on the app by searching for usernames or display names. Returns matching profiles with follow status so the user can follow directly from search results.

## User-Facing Behavior
The user opens a search interface (accessible from the daily view header), types a query, and sees a list of matching users. Each result shows the user's avatar, display name, username, and a follow button. Tapping a result navigates to that user's profile page. The search is fast, prefix-based, and requires at least 2 characters before querying.

## Route

### Page: `/search`
A protected page under `app/(protected)/search/page.tsx`. Accessible from the daily view header via a search icon or link.

Alternatively, search could be a modal or dropdown on the daily view page. A dedicated route is simpler to implement and more accessible (bookmarkable, shareable).

> **Open Decision: Search as page vs. overlay.**
> Options:
> 1. Dedicated `/search` page. Simple, standard, works on all screen sizes.
> 2. Dropdown/modal triggered from the header. Feels faster, no navigation. More complex (focus management, overlay positioning).
>
> Recommendation: Option 1 — dedicated page. Keeps the implementation straightforward. The search page can be enhanced to an overlay in Phase 7 (Polish) if desired.

## Search Input

### Behavior
- Auto-focused on page load.
- Queries fire after the user has typed at least 2 characters.
- Debounced: waits 300ms after the last keystroke before querying. This prevents excessive requests during fast typing.
- Clearing the input clears the results.
- No submit button — search is live as you type.

### Placeholder Text
"Search by username or name"

## Search Query

### Server Action: `searchUsers(query: string)`

Located at `app/(protected)/search/actions.ts`.

**Logic:**
1. Authenticate: get current user.
2. Validate: `query` is at least 2 characters, trimmed. Return empty results if not.
3. Sanitize: escape special characters for the `ILIKE` pattern (`%`, `_`, `\`).
4. Query profiles matching by username prefix OR display_name substring:
   ```sql
   SELECT id, username, display_name, avatar_url
   FROM profiles
   WHERE username IS NOT NULL
     AND (
       username ILIKE $1 || '%'
       OR display_name ILIKE '%' || $1 || '%'
     )
     AND id != auth.uid()
   ORDER BY
     CASE WHEN username ILIKE $1 || '%' THEN 0 ELSE 1 END,
     username ASC
   LIMIT 20
   ```
   - Username matches are prefix-based (typing "tom" matches "tombauer" but not "atomizer").
   - Display name matches are substring-based (typing "tom" matches "Tom Bauer" and "Atom").
   - Username prefix matches are sorted first (more relevant).
   - The current user is excluded from results.
   - Profiles without a username (incomplete onboarding) are excluded.
   - Results capped at 20 — the app encourages small social graphs, so large result sets are unlikely.

5. For each result, fetch the follow status:
   ```sql
   SELECT following_id FROM follows
   WHERE follower_id = auth.uid()
     AND following_id = ANY($1)
   ```
   Where `$1` is the array of result profile IDs. This is a single query for all results, not N+1.

6. Return results with follow status:
   ```ts
   type SearchResult = {
     id: string;
     username: string;
     display_name: string | null;
     avatar_url: string | null;
     is_following: boolean;
   };
   ```

**Notes on RLS:**
- Profiles have public-read RLS (unchanged in Phase 5), so this query works for all authenticated users.
- The `follows` table has authenticated-read RLS (from Phase 5), so the follow status check works.

### Index Considerations
The `idx_profiles_username` index (from Phase 1) supports the `username ILIKE prefix%` pattern efficiently — Postgres can use a B-tree index for prefix `ILIKE` when the collation is compatible. For `display_name` substring search, no index helps (it's `%pattern%`). At the expected scale (hundreds to low thousands of users), a sequential scan on `profiles` is acceptable.

If scale becomes an issue, a `pg_trgm` GIN index on `display_name` could be added. Document this as a future optimization, not a Phase 6 requirement.

## Search Results UI

### Layout
A vertical list of result rows. Each row contains:

```
┌──────────────────────────────────────────────┐
│ [Avatar]  Display Name          [ Follow ]   │
│           @username                          │
└──────────────────────────────────────────────┘
```

- **Avatar:** Small circle (32x32px). Initial-letter fallback if missing.
- **Display name:** Primary text. Falls back to username if null.
- **Username:** `@username`, muted text below or beside the display name.
- **Follow button:** Right-aligned. Uses the `FollowButton` component from `specs/follow-unfollow.md` with `initialIsFollowing` from the search result.
- **Row click:** Tapping the row (outside the follow button) navigates to `/profile/[username]`.

### Simplified FollowButton in Search
The `FollowButton` in search results does not need block status awareness. If a blocked user appears in search (profiles are public), the follow action will fail via RLS, and the button handles the error state. Passing `isBlocked: false` is acceptable — the error path handles the edge case.

> **Open Decision: Should blocked users be filtered from search results?**
> Options:
> 1. Show all matching profiles, including blocked users. The follow button fails gracefully. Simple.
> 2. Filter out users the viewer has blocked or been blocked by. Requires joining the `blocks` table. Slightly more private but adds query complexity.
>
> Recommendation: Option 2 — filter blocked users from results. It's a better experience (why show someone you blocked?), and the query overhead is minimal. Add:
> ```sql
> AND NOT EXISTS (
>   SELECT 1 FROM blocks
>   WHERE (blocks.blocker_id = auth.uid() AND blocks.blocked_id = profiles.id)
>      OR (blocks.blocker_id = profiles.id AND blocks.blocked_id = auth.uid())
> )
> ```

## Empty States

| State | Display |
|---|---|
| No query entered (initial page load) | "Search for people by username or name." |
| Query too short (1 character) | "Type at least 2 characters to search." |
| No results for query | "No users found matching '[query]'." |
| Results returned | List of result rows. |

## Navigation

### To Search
- From the daily view header: a search icon or "Find people" link.
- From invite link landing page: "Already have an account? Search for friends."
- Direct URL: `/search`.

### From Search
- Clicking a result row → `/profile/[username]`.
- Back navigation → previous page (daily view, typically).

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| Query contains only spaces | Trimmed to empty. Show initial empty state. |
| Query contains special SQL characters (`%`, `_`) | Escaped before building the ILIKE pattern. `%` becomes `\%`, `_` becomes `\_`. |
| User types very fast | Debounce (300ms) ensures only the final query fires. |
| Network error during search | Show "Something went wrong. Try again." with a retry action. |
| User navigates away while search is in-flight | No issue — the abandoned request returns to nothing. |
| Search returns the current user | Excluded by the `id != auth.uid()` filter. |
| Search returns a user with incomplete onboarding (no username) | Excluded by the `username IS NOT NULL` filter. |
| Very long query string (>100 chars) | Truncate to 100 characters before querying. Usernames are short; this is defense against abuse. |
| Follow action from search result fails | `FollowButton` handles the error state inline. Search results are not affected. |
| User follows/unfollows from search result, then navigates to profile | Profile page fetches fresh follow status server-side. No stale data. |

## Data Model Changes
None. The `profiles` table, `follows` table, and `blocks` table already exist with appropriate indexes and RLS.

## API Routes or Server Actions
- `searchUsers(query: string)` — new server action for the search query.

## UI States

### Page
- **Initial:** Search input focused, placeholder instruction text.
- **Typing (< 2 chars):** "Type at least 2 characters" hint.
- **Searching:** Subtle loading indicator (spinner below input or skeleton result rows).
- **Results:** List of matching users with follow buttons.
- **No results:** Friendly message with the query echoed back.
- **Error:** Error message with retry.

## Dependencies
- **Follow/Unfollow** (`specs/follow-unfollow.md`): `FollowButton` component for search results.
- **User Profile Page** (`specs/user-profile-page.md`): Navigation target for result clicks.
- **Phase 1** (`profiles` table): Source of searchable user data.
- **Phase 5** (`blocks` table, `follows` RLS): Block filtering and follow status queries.
- **Rate Limiting** (`specs/rate-limiting.md`): `searchUsers` should be rate-limited: 30 req/min per user.

## Acceptance Criteria
- [ ] Search page exists at `/search` as a protected route.
- [ ] Search input is auto-focused on page load.
- [ ] Search queries fire after 2+ characters with 300ms debounce.
- [ ] Results show avatar, display name, username, and follow button for each match.
- [ ] Username prefix matches are prioritized over display name substring matches.
- [ ] The current user is excluded from search results.
- [ ] Blocked users are filtered from search results (if that decision is taken).
- [ ] Users with incomplete onboarding are excluded from results.
- [ ] Clicking a result row navigates to `/profile/[username]`.
- [ ] Follow button in search results works correctly (follow/unfollow with optimistic update).
- [ ] Special characters in query are escaped for ILIKE.
- [ ] Empty, no-results, and error states are handled with appropriate messages.
- [ ] Results are capped at 20.
- [ ] Search action is rate-limited.
