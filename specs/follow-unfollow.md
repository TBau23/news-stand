# Follow / Unfollow

## Phase
6 — Social Graph

## What It Does
Provides the mechanics for one user to follow or unfollow another. Following is one-directional — you follow someone, they may or may not follow you back. Following someone makes their daily shares visible in your feed (subject to Phase 5 followers-only RLS). Unfollowing removes that visibility.

## User-Facing Behavior
A `FollowButton` component appears on profile pages and in search results. It shows the current relationship state and allows the user to toggle it with a single click. The action is immediate — no confirmation dialog for follow or unfollow (unlike blocking, which is destructive).

## Server Actions

### `followUser(userId: string)`

Located at `app/(protected)/actions/social.ts`.

**Logic:**
1. Authenticate: get current user via `supabase.auth.getUser()`.
2. Validate: `userId` is a non-empty string, is not the current user's ID.
3. Insert into `follows`:
   ```sql
   INSERT INTO follows (follower_id, following_id)
   VALUES (auth.uid(), $1)
   ```
4. On unique constraint violation (already following): treat as success (idempotent).
5. On RLS failure (blocked user): return `{ error: 'unable_to_follow' }`.
6. Return `{ success: true }`.

**Response type:**
```ts
type FollowResult =
  | { success: true }
  | { error: 'unable_to_follow' | 'not_authenticated' | 'invalid_user' }
```

**Notes:**
- The `follows` INSERT policy (updated in Phase 5 by `specs/user-blocking.md`) prevents following blocked users. The server action does not need to check the blocks table directly — RLS handles it.
- The `no_self_follow` constraint on the `follows` table prevents self-follows at the DB level. The server action validates this before hitting the database to provide a better error message.

### `unfollowUser(userId: string)`

**Logic:**
1. Authenticate.
2. Delete from `follows`:
   ```sql
   DELETE FROM follows
   WHERE follower_id = auth.uid() AND following_id = $1
   ```
3. If no row deleted (wasn't following): treat as success (idempotent).
4. Return `{ success: true }`.

**Response type:**
```ts
type UnfollowResult =
  | { success: true }
  | { error: 'not_authenticated' }
```

### `getFollowStatus(userId: string)`

A helper used by server components to check the follow relationship.

**Logic:**
1. Query:
   ```sql
   SELECT 1 FROM follows
   WHERE follower_id = auth.uid() AND following_id = $1
   LIMIT 1
   ```
2. Return `{ isFollowing: boolean }`.

This is not a standalone server action exposed to the client — it's a server-side utility called during page rendering (e.g., on the profile page or in search results).

## FollowButton Component

### Location
`app/components/FollowButton.tsx` — a client component.

### Props
```tsx
interface FollowButtonProps {
  userId: string;
  initialIsFollowing: boolean;
  isBlocked: boolean;
  isOwnProfile: boolean;
}
```

### Behavior

| `isOwnProfile` | `isBlocked` | `initialIsFollowing` | Render |
|---|---|---|---|
| `true` | any | any | Nothing (don't render the button at all). |
| `false` | `true` (viewer blocked them) | any | "Blocked" label, no button. |
| `false` | `true` (they blocked viewer) | any | "Follow" button, disabled. Tooltip or subtext: "Unable to follow this user." |
| `false` | `false` | `false` | "Follow" button, primary style. |
| `false` | `false` | `true` | "Following" button, secondary/outline style. |

> **Open Decision: Block direction awareness.**
> The `isBlocked` prop currently does not distinguish who initiated the block. Options:
> 1. Pass a single `isBlocked: boolean` — if any block exists between the two users, the follow button is disabled. Simple, but the viewer who blocked someone sees a disabled button instead of "Blocked" label.
> 2. Pass `blockStatus: 'none' | 'viewer_blocked' | 'blocked_by'` — allows differentiated UI.
>
> Recommendation: Option 2. The profile page already queries blocks directionally (it needs to know for the "Unblock" option), so the data is available. The FollowButton can render appropriately.

### Optimistic Updates
The button uses React `useOptimistic` or local state to immediately reflect the action:
- Click "Follow" → button immediately switches to "Following" style → server action runs in background.
- Click "Following" → button immediately switches to "Follow" style → server action runs.
- If the server action fails, revert the optimistic state and show a brief toast or inline error.

### Loading State
While the server action is in-flight:
- The button is disabled (prevents double-clicks).
- A subtle spinner or opacity change indicates the action is processing.
- The optimistic label is already showing the target state.

### Unfollow Confirmation
No confirmation dialog. Unfollowing is low-stakes — the user can re-follow at any time (unless blocked). This aligns with the "minimal social layer" philosophy.

> **Open Decision: Hover state for "Following" button.**
> Options:
> 1. On hover, "Following" text changes to "Unfollow" with a red/danger style. Common pattern (Twitter/X style).
> 2. "Following" stays as-is on hover. Less aggressive, but less discoverable.
>
> Recommendation: Option 1. It makes the action discoverable without requiring a separate menu.

## Where the FollowButton Appears

| Location | Props Source |
|---|---|
| User profile page (`/profile/[username]`) | Profile page fetches follow status and block status server-side, passes as props. |
| Username search results (`specs/username-search.md`) | Search results include follow status per result, passed as props. |
| Invite link landing page (`specs/invite-links.md`) | After signup, the inviter's profile includes a follow button. |

## Impact on Existing Features

| Feature | Impact |
|---|---|
| Daily view feed | Following a new user means their shares appear in the feed on the next page load. No real-time update (Phase 7). |
| Share visibility (Phase 5 RLS) | Following a user grants access to their shares. Unfollowing removes access. |
| Blocking (Phase 5) | If a block exists, the follow INSERT fails via RLS. The FollowButton reflects this. |
| Feed query (Phase 4) | No changes needed — it already queries based on the current follows state. |

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User tries to follow themselves | Server action rejects before DB query. FollowButton is not rendered on own profile. |
| User tries to follow someone they already follow | Unique constraint catches it. Treated as success (idempotent). |
| User tries to follow a blocked user | RLS INSERT policy rejects. Server action returns `unable_to_follow`. FollowButton shows disabled state. |
| User unfollows someone they don't follow | DELETE affects 0 rows. Treated as success (idempotent). |
| Rapid follow/unfollow toggling | Optimistic updates handle the visual state. Each click cancels the previous in-flight action conceptually (the last write wins). Debounce is not necessary since each action is idempotent. |
| Network failure during follow/unfollow | Optimistic state reverts. Brief inline error: "Something went wrong. Try again." |
| User's session has expired | Server action returns `not_authenticated`. Redirect to login. |
| Following count changes after follow/unfollow | The profile page's follower/following counts are server-rendered. They won't update until the next page load. Acceptable for Phase 6 — real-time count updates can be added in Phase 7. |

## Data Model Changes
None. The `follows` table from Phase 1 already has the correct schema, constraints, and indexes. The INSERT policy updated in Phase 5 (with block checks) is already in place.

## UI States

### FollowButton
- **Default (not following):** "Follow" button, primary style (filled).
- **Following:** "Following" button, secondary style (outline). On hover: "Unfollow" with danger style.
- **Loading:** Current label with disabled state and spinner.
- **Error:** Reverts to previous state with brief error message.
- **Blocked (viewer blocked them):** "Blocked" label (not a button).
- **Blocked (they blocked viewer):** "Follow" button, disabled, with "Unable to follow" subtext.
- **Own profile:** Not rendered.

## Dependencies
- **Phase 1** (`follows` table): Schema, constraints, indexes.
- **Phase 5** (`user-blocking.md`): Updated INSERT policy with block checks. `blocks` table for status queries.
- **User Profile Page** (`specs/user-profile-page.md`): Primary surface for the FollowButton.
- **Username Search** (`specs/username-search.md`): Secondary surface for the FollowButton.
- **Rate Limiting** (`specs/rate-limiting.md`): `followUser` and `unfollowUser` should be rate-limited. Add entries to the rate limiting config: 20 req/min per user for both actions.

## Acceptance Criteria
- [ ] `followUser` server action creates a follow relationship.
- [ ] `unfollowUser` server action removes a follow relationship.
- [ ] Both actions are idempotent (no errors on duplicate follow or unfollow of non-followed user).
- [ ] Self-follow is prevented (server action validates + DB constraint).
- [ ] Following a blocked user returns a generic error (RLS enforced).
- [ ] `FollowButton` renders appropriate state based on props.
- [ ] Optimistic update reflects the action immediately on click.
- [ ] Failed actions revert the optimistic state with an error indicator.
- [ ] "Following" button shows "Unfollow" on hover (if that decision is taken).
- [ ] FollowButton is not rendered on the user's own profile.
- [ ] Blocked state disables or hides the follow action appropriately.
- [ ] Follow/unfollow actions are rate-limited.
