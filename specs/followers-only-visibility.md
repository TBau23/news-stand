# Followers-Only Share Visibility

## Phase
5 — Privacy & Security

## What It Does
Tightens Row Level Security so that a user's shares are only visible to people who follow them (and to the user themselves). Currently all three tables — `profiles`, `follows`, and `shares` — have public-read RLS policies. This spec replaces the `shares` SELECT policy with a followers-only policy, updates the feed query function to work under the new RLS, and scopes the `follows` table reads to authenticated users.

## User-Facing Behavior
No visible UI changes. The app works the same way from the user's perspective. The difference is at the data layer: unauthenticated requests and authenticated users who don't follow the sharer can no longer read that user's shares. This prevents data leakage before the app opens to more users.

## Current State

### Existing RLS Policies (from `20260205044659_init.sql`)

**profiles:**
- SELECT: `USING (true)` — public read

**follows:**
- SELECT: `USING (true)` — public read
- INSERT: `WITH CHECK (auth.uid() = follower_id)`
- DELETE: `USING (auth.uid() = follower_id)`

**shares:**
- SELECT: `USING (true)` — public read
- INSERT: `WITH CHECK (auth.uid() = user_id)`
- UPDATE: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
- DELETE: `USING (auth.uid() = user_id)`

### What Changes

| Table | Policy | Before | After |
|---|---|---|---|
| `shares` | SELECT | Public read (`true`) | Owner OR follower of the owner |
| `follows` | SELECT | Public read (`true`) | Authenticated users only |
| `profiles` | SELECT | Public read (`true`) | No change — profiles remain publicly readable (needed for username search in Phase 6, invite links, etc.) |

## Migration

### New Migration File
`supabase/migrations/<timestamp>_followers_only_shares.sql`

### Shares SELECT Policy

Drop the existing public-read policy and replace it:

```sql
-- Remove public-read policy on shares
DROP POLICY "Shares are publicly readable" ON shares;

-- Users can read their own shares
CREATE POLICY "Users can read own shares"
  ON shares FOR SELECT
  USING (auth.uid() = user_id);

-- Followers can read shares of people they follow
CREATE POLICY "Followers can read shares"
  ON shares FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM follows
      WHERE follows.follower_id = auth.uid()
        AND follows.following_id = shares.user_id
    )
  );
```

Two separate policies rather than one combined with `OR` — Postgres evaluates SELECT policies with OR semantics automatically (if any policy passes, the row is visible). This is clearer and easier to reason about.

### Follows SELECT Policy

Scope reads to authenticated users. The follow graph doesn't need to be public.

```sql
DROP POLICY "Follows are publicly readable" ON follows;

CREATE POLICY "Authenticated users can read follows"
  ON follows FOR SELECT
  USING (auth.uid() IS NOT NULL);
```

> **Open Decision: Should follows be further scoped?**
> Options:
> 1. Authenticated users can read all follows (proposed above). Simple, and needed for profile pages showing follower/following counts.
> 2. Users can only read follows involving themselves (`follower_id = auth.uid() OR following_id = auth.uid()`). More private but breaks follower count displays on other profiles.
>
> Recommendation: Option 1. The follow graph is low-sensitivity data and restricting it complicates Phase 6 (social graph features, profile pages showing follower counts).

### Profiles SELECT Policy

No change. Profiles stay publicly readable. This is required for:
- Username search (Phase 6)
- Invite links showing who invited you (Phase 6)
- Displaying sharer info on share cards (already denormalized in the feed query, but profile lookups happen elsewhere)

## Impact on Feed Query Function

The `get_active_feed_shares` function (from `specs/feed-query.md`) is defined as `LANGUAGE sql STABLE` and currently uses `SECURITY INVOKER` (the default). Under the new RLS:

- The function runs as the calling user.
- The `shares` table SELECT policy now requires the caller to be a follower of the sharer.
- The function's `WHERE f.follower_id = p_user_id` clause already ensures this — it only joins shares from followed users.
- **However**, `SECURITY INVOKER` means the `auth.uid()` in the RLS policy must match. When called via `supabase.rpc()` from a server component with the authenticated server client, `auth.uid()` is set correctly.

**Verdict: No change needed to the feed function.** The existing `SECURITY INVOKER` + the `WHERE` clause naturally satisfies the new RLS. The RLS check is redundant with the query's own filter, which is fine — defense in depth.

### Verification Query

After the migration, verify with:
```sql
-- As user A who does NOT follow user B:
-- This should return 0 rows
SELECT * FROM shares WHERE user_id = '<user_b_id>';

-- As user A who DOES follow user B:
-- This should return user B's shares
SELECT * FROM shares WHERE user_id = '<user_b_id>';

-- As user B (the owner):
-- This should return their own shares
SELECT * FROM shares WHERE user_id = '<user_b_id>';
```

## Impact on Existing Queries

### Today's Share View (`/share/today`)
Queries `shares WHERE user_id = auth.uid()` — passes the "own shares" policy. **No change needed.**

### Share Creation Flow (`/share`)
Queries `shares WHERE user_id = auth.uid() AND shared_date = today` to check if already shared — passes the "own shares" policy. **No change needed.**

### Daily View Page (`/dashboard`)
Calls `get_active_feed_shares` RPC — addressed above. **No change needed.**

### Today's share check on daily view
Queries `shares WHERE user_id = auth.uid() AND shared_date = today` — passes the "own shares" policy. **No change needed.**

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| Unauthenticated request queries shares | Returns empty set (no `auth.uid()`, neither policy passes). |
| User queries shares of someone they don't follow | Returns empty set. The "followers can read" policy fails, and "own shares" policy fails. |
| User queries their own shares | Returns their shares. The "own shares" policy passes. |
| User unfollows someone then queries their shares | Returns empty set. The follow row is gone, so the policy fails. |
| Feed function called without auth context | Returns empty set. `auth.uid()` is null, no policies pass. Not an error. |
| Blocking (Phase 5, separate spec) | When a block removes the follow, shares immediately become invisible to the blocked user. The RLS policy naturally handles this since the follow row no longer exists. |

## Data Model Changes

No table schema changes. Only RLS policy changes (drop + create).

## Dependencies
- **Phase 1 migration** (`20260205044659_init.sql`): Defines the policies being replaced.
- **Phase 4 feed query** (`specs/feed-query.md`): Must work under the new RLS (verified above).
- **User Blocking** (`specs/user-blocking.md`): Removing follows via blocking automatically makes shares invisible — no special integration needed.

## Acceptance Criteria
- [ ] The `shares` public-read SELECT policy is removed.
- [ ] A user can read their own shares.
- [ ] A user can read shares from people they follow.
- [ ] A user cannot read shares from people they do not follow.
- [ ] Unauthenticated requests return no shares.
- [ ] The `follows` table is only readable by authenticated users.
- [ ] The `profiles` table remains publicly readable.
- [ ] The `get_active_feed_shares` feed function works correctly under the new policies.
- [ ] The `/share` page (already-shared check) works correctly under the new policies.
- [ ] The `/share/today` page works correctly under the new policies.
- [ ] The daily view page works correctly under the new policies.
- [ ] No existing functionality is broken by the migration.
