# Account Deletion

## Phase
9 — Account Management & Settings

## What It Does
Allows a user to permanently delete their account and all associated data. This is an irreversible, destructive action that removes the user's auth record, profile, shares, follows, and blocks. The user is signed out and redirected to the home page after deletion.

## User-Facing Behavior
The user navigates to `/settings/account` from the settings page. They see a "danger zone" section with account deletion. To delete their account, they must type their username to confirm (a friction pattern that prevents accidental deletion). On confirmation, their account is deleted and they're signed out.

### Deletion Flow
1. User navigates to `/settings/account`.
2. User clicks "Delete my account."
3. An inline confirmation area expands with:
   - A warning: **"This will permanently delete your account, all your shares, and all your connections. This cannot be undone."**
   - A text field: **"Type your username to confirm: @username"**
   - A "Delete Account" button (destructive styling, disabled until username matches).
   - A "Cancel" button.
4. User types their username and clicks "Delete Account."
5. Their account is deleted.
6. They are signed out and redirected to the home page (`/`).

### What Gets Deleted
All data associated with the user is removed via cascade deletes:
- **auth.users record** — the root record. Deleting this cascades to:
  - **profiles** — `ON DELETE CASCADE` from `auth.users`.
    - **follows** (both directions) — `ON DELETE CASCADE` from `profiles`.
    - **shares** — `ON DELETE CASCADE` from `profiles`.
    - **blocks** (both directions) — `ON DELETE CASCADE` from `profiles`.

The cascade chain handles all cleanup automatically. No manual multi-table deletion is needed.

## Route

### Page: `/settings/account`
A protected page under `app/(protected)/settings/account/page.tsx`.

## Data Fetching

### Server Component
The page fetches the user's username (needed for the confirmation check):
```sql
SELECT username FROM profiles WHERE id = $1
```

## Server Action

### `deleteAccount(formData)`
Located at `app/(protected)/settings/account/actions.ts`.

**Input fields (from form):**
- `confirmation_username` (string, required) — the username the user typed to confirm.

**Logic:**
1. Authenticate: get current user via `supabase.auth.getUser()`. Fail if not authenticated.
2. Fetch the user's profile to get their actual username.
3. Compare `confirmation_username` (trimmed, lowercased) to the profile's `username`. If they don't match: return `{ error: "Username doesn't match. Please try again." }`.
4. Delete the user's auth record using the Supabase Admin API:
   ```ts
   const supabaseAdmin = createAdminClient(); // uses SUPABASE_SERVICE_ROLE_KEY
   const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
   ```
5. On success: sign out the current session and redirect to `/`.
6. On error: return `{ error: "Something went wrong. Please try again or contact support." }`.

**Return type:** Redirect on success, or `{ error: string }` on failure.

> **Critical implementation note:** Deleting a Supabase auth user requires the **service role key** (`SUPABASE_SERVICE_ROLE_KEY`), not the anon/publishable key. The admin client must be created with the service role key and should ONLY be used server-side, never exposed to the client. This is a new utility — see "New Code Required" below.

### Admin Client

A new server-only Supabase client for admin operations:

```ts
// lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

This client bypasses RLS and has full database access. It must:
- Only be imported in server actions (never in client components).
- Only be used for operations that require admin privileges (account deletion).
- Use the `SUPABASE_SERVICE_ROLE_KEY` environment variable, which must be set in `.env.local` and the deployment environment.

## Layout

### Page Structure

```
┌──────────────────────────────────────────┐
│ Header                                   │
│   "Dossier"              [Share] [User]  │
├──────────────────────────────────────────┤
│ ← Back to settings                       │
│                                          │
│ Account                                  │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ ⚠ Danger Zone                       │ │
│ │                                      │ │
│ │ Delete your account                  │ │
│ │ This permanently removes your        │ │
│ │ account and all your data.           │ │
│ │                                      │ │
│ │         [Delete my account]          │ │
│ └──────────────────────────────────────┘ │
│                                          │
└──────────────────────────────────────────┘
```

### Expanded Confirmation (after clicking "Delete my account")

```
┌──────────────────────────────────────────┐
│ │ ⚠ Danger Zone                       │ │
│ │                                      │ │
│ │ This will permanently delete your    │ │
│ │ account, all your shares, and all    │ │
│ │ your connections. This cannot be     │ │
│ │ undone.                              │ │
│ │                                      │ │
│ │ Type your username to confirm:       │ │
│ │ @username                            │ │
│ │ [________________________]           │ │
│ │                                      │ │
│ │ [Cancel]     [Delete Account]        │ │
│ └──────────────────────────────────────┘ │
```

The "Delete Account" button is visually destructive (red) and disabled until the typed username matches.

### Back Link
A "← Back to settings" link at the top navigates to `/settings`.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User types wrong username | "Delete Account" button remains disabled. No error shown until they click — the button simply isn't clickable. |
| User types username with wrong case | Trim and lowercase the input before comparison. `JaneDoe` matches `janedoe`. |
| Admin deleteUser call fails | Return error: "Something went wrong. Please try again or contact support." The account is NOT deleted — the user remains logged in. |
| Cascade delete partially fails | This shouldn't happen — PostgreSQL cascades are atomic. If the auth user is deleted, all cascaded data is deleted in the same transaction. |
| User has active Supabase Realtime subscriptions | Client disconnects when the session is invalidated by deletion. No cleanup needed — Supabase handles this. |
| User's shares are visible to others when deletion happens | Shares are immediately gone after deletion (cascade). Other users' next feed load shows no shares from the deleted user. Active Realtime clients won't be notified of the removal — the shares simply won't appear on next fetch. |
| SUPABASE_SERVICE_ROLE_KEY is not set | The admin client creation fails. The server action returns a generic error. The user cannot delete their account until the env var is configured. Log this error server-side. |
| User tries to delete account right after creating it | Allowed. No minimum account age. |

## Data Model Changes
None. The cascade delete chain already exists in the schema:
- `profiles.id` → `auth.users(id) ON DELETE CASCADE`
- `follows.follower_id` / `following_id` → `profiles(id) ON DELETE CASCADE`
- `shares.user_id` → `profiles(id) ON DELETE CASCADE`
- `blocks.blocker_id` / `blocked_id` → `profiles(id) ON DELETE CASCADE` (Phase 5)

## New Code Required

### Admin Supabase Client
A new file `lib/supabase/admin.ts` providing a Supabase client initialized with the service role key. This is a server-only utility.

### Environment Variable
`SUPABASE_SERVICE_ROLE_KEY` must be added to:
- `.env.local` (for local development — available from the Supabase dashboard)
- Vercel environment variables (for production)

> **Security note:** The service role key bypasses all RLS. It must never be exposed to the client. The `lib/supabase/admin.ts` file should only be imported in server actions (files with `'use server'`). Consider adding an ESLint rule or comment to flag client-side imports.

## UI States

### Page Load
- **Ready:** Danger zone section with "Delete my account" button.

### Deletion Flow
- **Idle:** "Delete my account" button visible. Confirmation area hidden.
- **Confirming:** Confirmation area expanded with username input and action buttons.
- **Typing username:** "Delete Account" button disabled until input matches.
- **Username matches:** "Delete Account" button becomes enabled (destructive styling).
- **Deleting:** "Delete Account" button shows loading state. Both buttons disabled. A message appears: "Deleting your account..."
- **Success:** Redirect to `/` (user is signed out).
- **Error:** Error message in the confirmation area. Buttons re-enabled.

## Dependencies
- **Phase 1 (Supabase Auth + cascade schema):** The `ON DELETE CASCADE` chain must be in place. Already set up in the init migration.
- **Phase 5 (blocks table):** The `blocks` table cascade depends on Phase 5 being implemented. If Phase 5 hasn't landed, blocks won't exist and the cascade is a no-op for that table.
- **Phase 9 (settings-profile.md):** The settings page links to this page.
- **Rate limiting (Phase 5):** Add `deleteAccount` to the rate limit table: 3 req/min per user. Prevents abuse.

## Acceptance Criteria
- [ ] `/settings/account` page exists as a protected route.
- [ ] The page shows a danger zone section with account deletion.
- [ ] User must type their username to confirm deletion.
- [ ] The "Delete Account" button is disabled until the username matches.
- [ ] On confirmation, the user's auth record is deleted via Supabase Admin API.
- [ ] All associated data (profile, shares, follows, blocks) is removed by cascade.
- [ ] The user is signed out and redirected to `/` after successful deletion.
- [ ] The admin client uses `SUPABASE_SERVICE_ROLE_KEY` and is server-only.
- [ ] Errors during deletion are surfaced to the user without completing the deletion.
- [ ] A "Back to settings" link navigates to `/settings`.
- [ ] The confirmation can be cancelled without side effects.
