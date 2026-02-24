# User Blocking

## Phase
5 — Privacy & Security

## What It Does
Allows a user to block another user. Blocking removes any existing follow relationship in both directions and prevents either party from re-following the other. A blocked user cannot see the blocker's shares (enforced by the follow removal — see `specs/followers-only-visibility.md`). Users can view and manage their blocked list and unblock users.

## User-Facing Behavior

### Blocking a User
The user triggers a "Block" action from another user's context (e.g., a share card menu, a profile page in Phase 6). A confirmation dialog appears: **"Block @username? They won't be able to see your shares, and you won't see theirs."** On confirm:
- Any follow relationship between the two users is removed (both directions).
- A block record is created.
- The blocked user's shares disappear from the blocker's feed (no follow = no visibility).
- The blocker's shares disappear from the blocked user's feed.

### Unblocking a User
The user goes to their blocked list (settings, Phase 9) and taps "Unblock" on a user. Unblocking removes the block record. It does **not** restore any follow relationships — both users must re-follow each other manually if they choose.

### For the Blocked User
The blocked user receives no notification. From their perspective:
- They can no longer see the blocker's shares (the follow is gone).
- If they try to follow the blocker, the follow fails silently or with a generic "unable to follow" message — not "you've been blocked."
- If they try to search for the blocker (Phase 6), the blocker's profile still appears (profiles are public) but the follow action fails.

## Data Model Changes

### New Table: `blocks`

```sql
CREATE TABLE blocks (
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id != blocked_id)
);
```

### Indexes

```sql
CREATE INDEX idx_blocks_blocker_id ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked_id ON blocks(blocked_id);
```

### RLS Policies

```sql
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- Users can read their own blocks (both as blocker and blocked)
CREATE POLICY "Users can read own blocks"
  ON blocks FOR SELECT
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

-- Users can create blocks
CREATE POLICY "Users can block others"
  ON blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Users can remove their own blocks (unblock)
CREATE POLICY "Users can unblock"
  ON blocks FOR DELETE
  USING (auth.uid() = blocker_id);
```

### Update `follows` INSERT Policy

The existing `follows` INSERT policy allows any authenticated user to follow anyone. Add a block check:

```sql
DROP POLICY "Authenticated users can follow others" ON follows;

CREATE POLICY "Authenticated users can follow others"
  ON follows FOR INSERT
  WITH CHECK (
    auth.uid() = follower_id
    AND NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocks.blocker_id = follower_id AND blocks.blocked_id = following_id)
         OR (blocks.blocker_id = following_id AND blocks.blocked_id = follower_id)
    )
  );
```

This prevents following in both directions: the blocker can't follow the blocked user, and the blocked user can't follow the blocker.

## Server Actions

### `blockUser(userId: string)`

Located at `app/(protected)/actions/blocking.ts` (or co-located with the UI that triggers it).

**Logic:**
1. Authenticate: get current user via `supabase.auth.getUser()`.
2. Validate: `userId` is a valid UUID, is not the current user's ID.
3. Insert into `blocks`: `INSERT INTO blocks (blocker_id, blocked_id) VALUES (auth.uid(), $1)`.
4. Delete follows in both directions:
   ```sql
   DELETE FROM follows
   WHERE (follower_id = auth.uid() AND following_id = $1)
      OR (follower_id = $1 AND following_id = auth.uid());
   ```
5. On unique constraint violation (already blocked): treat as success (idempotent).
6. Return success.

> **Implementation note:** Steps 3-4 should run in a transaction or be ordered so the block is inserted first. If the block insert succeeds but the follow delete fails, the block still prevents re-following (via the updated INSERT policy), which is the safe failure mode.

### `unblockUser(userId: string)`

**Logic:**
1. Authenticate.
2. Delete from `blocks WHERE blocker_id = auth.uid() AND blocked_id = $1`.
3. If no row deleted (wasn't blocked): treat as success (idempotent).
4. Return success.

> **Note:** Unblocking does NOT restore follows. The users must re-follow each other manually.

### `getBlockedUsers()`

**Logic:**
1. Authenticate.
2. Query: `SELECT blocked_id, created_at FROM blocks WHERE blocker_id = auth.uid() ORDER BY created_at DESC`.
3. Join with `profiles` to get username, display_name, avatar_url for display.
4. Return the list.

## Impact on Feed Query

The `get_active_feed_shares` function joins on `follows`, so when a block removes the follow rows, the blocked user's shares naturally disappear from the feed. **No changes needed to the feed function.**

If the block and follow deletion happen in the same request, the feed will reflect the change on the next page load.

## Impact on Existing Features

| Feature | Impact |
|---|---|
| Daily view (feed) | Blocked user's shares disappear because the follow is removed. No code change. |
| Today's share view | No impact — shows only the current user's own share. |
| Share creation | No impact. |
| Onboarding | No impact. |
| Profile pages (Phase 6) | Should show "Blocked" state and "Unblock" option instead of follow/unfollow. |
| Username search (Phase 6) | Blocked users' profiles still appear in search (profiles are public). Follow action will fail. |

## UI Considerations

### Phase 5 Scope (Minimal UI)
Phase 5 focuses on the backend mechanics. The full blocking UI (block button on profiles, blocked users list in settings) depends on features from Phase 6 (profiles) and Phase 9 (settings). For Phase 5:

- Implement the server actions and data model.
- Add a block option to the share card context menu (three-dot menu or long-press) as the initial trigger point.
- The blocked users list can be a simple page at `/settings/blocked` or deferred to Phase 9.

> **Open Decision: Block trigger UI in Phase 5.**
> Options:
> 1. Add a three-dot menu to ShareCard with a "Block @username" option. Minimal UI change to an existing component.
> 2. Defer all blocking UI to Phase 6 (when profiles exist) and only ship the data model + server actions now.
>
> Recommendation: Option 1. It gives the feature an entry point without waiting for profiles. The share card menu can also host "Report" in the future.

### Confirmation Dialog
A blocking action should always show a confirmation dialog. The user needs to understand the consequences:
- "Block @username?"
- "They won't be able to see your shares, and you won't see theirs."
- "You can unblock them later from settings."
- Buttons: "Block" (destructive styling) and "Cancel"

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User blocks someone they don't follow | Block is created. No follows to delete. Future follow attempts are prevented. |
| User blocks someone who doesn't follow them | Block is created. The one-directional follow (if any) from the current user is deleted. Future follow attempts from either side are prevented. |
| User blocks someone they mutually follow | Both follow rows are deleted. Block is created. |
| User tries to block themselves | Rejected by `no_self_block` constraint. Server action validates before hitting DB. |
| User blocks someone already blocked | Unique constraint on `(blocker_id, blocked_id)` catches this. Treat as success (idempotent). |
| User unblocks and then re-follows | Allowed. The block is removed, the follow INSERT policy no longer blocks, the user can follow again. |
| Blocked user tries to follow the blocker | Follow INSERT fails (RLS policy checks blocks table). Return a generic error: "Unable to follow this user." |
| User views feed right after blocking | On next page load, the blocked user's shares are gone. During the same page session, shares may still be visible until refresh. |
| Concurrent block + share view | No consistency issue. RLS ensures the blocked user can't read shares after the follow is deleted, regardless of timing. |

## Dependencies
- **Followers-only visibility** (`specs/followers-only-visibility.md`): Must be in place so that removing follows actually removes share visibility. If deployed before followers-only RLS, the block removes follows but shares remain publicly readable — the full privacy benefit depends on both specs.
- **Phase 1 follows table** (`20260205044659_init.sql`): Existing follow mechanics and RLS.
- **Phase 6 (Social Graph)**: Provides profile pages where blocking UI is most natural. Phase 5 provides a minimal entry point via share card menu.
- **Phase 9 (Settings)**: Provides the settings page for managing the blocked users list.

## Acceptance Criteria
- [ ] A `blocks` table exists with appropriate schema and constraints.
- [ ] RLS on `blocks` allows users to read, create, and delete only their own blocks.
- [ ] Blocking a user removes follow relationships in both directions.
- [ ] A blocked user cannot re-follow the blocker (INSERT policy enforced).
- [ ] The blocker cannot follow the blocked user (INSERT policy enforced).
- [ ] Blocking is idempotent (blocking someone already blocked is not an error).
- [ ] Unblocking removes the block record but does not restore follows.
- [ ] Unblocking is idempotent (unblocking someone not blocked is not an error).
- [ ] After blocking, the blocked user's shares no longer appear in the blocker's feed.
- [ ] After blocking, the blocker's shares no longer appear in the blocked user's feed.
- [ ] The blocked user receives no notification or indication of being blocked.
- [ ] Attempting to follow a user who has blocked you fails with a generic message.
- [ ] `blockUser`, `unblockUser`, and `getBlockedUsers` server actions work correctly.
- [ ] Self-blocking is prevented.
