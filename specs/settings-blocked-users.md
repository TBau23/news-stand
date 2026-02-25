# Settings — Blocked Users Management

## Phase
9 — Account Management & Settings

## What It Does
Provides a page where users can view their list of blocked users and unblock them. This is the management UI for the blocking mechanics built in Phase 5 (`specs/user-blocking.md`). Phase 5 provides the data model and server actions; this spec provides the dedicated settings interface.

## User-Facing Behavior
The user navigates to `/settings/blocked` from the settings page. They see a list of users they've blocked, each with the blocked user's avatar, display name, username, and an "Unblock" button. Clicking "Unblock" shows a brief confirmation, then removes the block. The list updates immediately (optimistic update). If the user has no blocked users, an empty state message appears.

### Unblock Flow
1. User clicks "Unblock" next to a blocked user.
2. A confirmation appears: **"Unblock @username? They'll be able to follow you again, but previous follows are not restored."**
3. On confirm, the `unblockUser` server action (from Phase 5) is called.
4. The user is removed from the list with a fade-out.
5. On error, the user reappears in the list with an error message.

## Route

### Page: `/settings/blocked`
A protected page under `app/(protected)/settings/blocked/page.tsx`.

## Data Fetching

### Server Component
The page is a server component that fetches the user's blocked list using the `getBlockedUsers` action defined in Phase 5:

```sql
SELECT b.blocked_id, b.created_at, p.username, p.display_name, p.avatar_url
FROM blocks b
JOIN profiles p ON p.id = b.blocked_id
WHERE b.blocker_id = $1
ORDER BY b.created_at DESC
```

This returns a list of blocked profiles ordered by most recently blocked first.

## Server Actions
This spec uses the existing server actions from Phase 5 (`specs/user-blocking.md`):
- `getBlockedUsers()` — fetches the list.
- `unblockUser(userId: string)` — removes a block.

No new server actions needed.

## Layout

### Page Structure

```
┌──────────────────────────────────────────┐
│ Header                                   │
│   "Dossier"              [Share] [User]  │
├──────────────────────────────────────────┤
│ ← Back to settings                       │
│                                          │
│ Blocked Users                            │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ (avatar) Jane Doe  @janedoe         │ │
│ │          Blocked Feb 20  [Unblock]  │ │
│ ├──────────────────────────────────────┤ │
│ │ (avatar) Bob Smith  @bobsmith       │ │
│ │          Blocked Feb 18  [Unblock]  │ │
│ └──────────────────────────────────────┘ │
│                                          │
└──────────────────────────────────────────┘
```

### Blocked User Row
Each row shows:
- **Avatar** (from `profiles.avatar_url`, or a default placeholder).
- **Display name** and **@username**.
- **Blocked date** formatted as a relative or short date (e.g., "Feb 20" or "2 days ago").
- **"Unblock" button** on the right side of the row.

### Back Link
A "← Back to settings" link at the top navigates to `/settings`.

## Empty State
When the user has no blocked users:
- **Heading:** "No blocked users"
- **Body:** "Users you block will appear here. You can unblock them at any time."

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User has no blocked users | Show empty state message. |
| User has many blocked users (50+) | Render all as a scrollable list. No pagination. The blocking mechanic makes this list self-limiting in practice. |
| Unblock fails (network error) | Revert the optimistic removal. Show an error: "Couldn't unblock this user. Please try again." |
| User unblocks then navigates to the unblocked user's profile | The unblock is already complete. They can now follow the user again. Profile page shows "Follow" button. |
| Blocked user deleted their account | The `ON DELETE CASCADE` on `blocks.blocked_id → profiles.id` removes the block row. The deleted user doesn't appear in the list. |
| Race condition: unblock called twice | The `unblockUser` action is idempotent (Phase 5 spec). Second call is a no-op. |

## Data Model Changes
None. Uses the `blocks` table and RLS policies from Phase 5. No new tables or migrations.

## UI States

### Page Load
- **Loading:** Skeleton list rows.
- **Populated:** List of blocked users with unblock buttons.
- **Empty:** "No blocked users" message.
- **Error:** "Something went wrong loading your blocked users." with a retry link.

### Unblock Action
- **Idle:** "Unblock" button visible.
- **Confirming:** Inline confirmation text replaces the button area.
- **Unblocking:** Optimistic removal — the row fades out. Button shows loading state during the action.
- **Error:** Row reappears with an error message.

## Dependencies
- **Phase 5 (user-blocking.md):** `blocks` table, `getBlockedUsers()` server action, `unblockUser()` server action. All must be built before this UI works.
- **Phase 9 (settings-profile.md):** The settings page links to this page.
- **Phase 6 (user profiles):** Clicking a username in the blocked list could link to their profile. Graceful degradation if profile pages don't exist yet (names are display-only, not links).

## Acceptance Criteria
- [ ] `/settings/blocked` page exists as a protected route.
- [ ] Displays a list of the user's blocked users with avatar, display name, username, and blocked date.
- [ ] Each blocked user has an "Unblock" button.
- [ ] Unblocking shows a confirmation before proceeding.
- [ ] Unblocking removes the user from the list with an optimistic update.
- [ ] If unblock fails, the row reappears with an error message.
- [ ] Empty state is shown when the user has no blocked users.
- [ ] The list is ordered by most recently blocked first.
- [ ] A "Back to settings" link navigates to `/settings`.
- [ ] The page handles loading and error states gracefully.
