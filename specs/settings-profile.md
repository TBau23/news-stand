# Settings — Profile Editing

## Phase
9 — Account Management & Settings

## What It Does
Provides a settings page where users can update their profile information: display name, username, and timezone. This is the primary surface for account management, housing navigation to other settings sections (password, blocked users, account deletion).

## User-Facing Behavior
The user navigates to `/settings` from their avatar or a menu in the header. They see their current profile information in editable fields. They can change their display name, username, or timezone and save the changes. The page also provides navigation links to the other settings sections.

### Editing Display Name
The user modifies the text field and clicks "Save." The display name updates immediately. Display names have no uniqueness constraint — any non-empty string works.

### Editing Username
The user modifies their username. Client-side validation enforces the same rules as onboarding: lowercase alphanumeric + underscores, minimum 3 characters. On save, the server validates uniqueness. If the new username is taken, an error appears: "That username is already taken."

### Editing Timezone
The user selects a new timezone from the same timezone picker used during onboarding. On save, the timezone updates. The settings page shows a warning when changing timezone: **"Changing your timezone affects when your daily share window resets. If you've already shared today, this won't affect today's share."**

## Route

### Page: `/settings`
A protected page under `app/(protected)/settings/page.tsx`.

## Data Fetching

### Server Component
The page is a server component that fetches the current user's profile:
```sql
SELECT username, display_name, timezone FROM profiles WHERE id = $1
```

The profile data is passed to a client component form for editing.

## Server Action

### `updateProfile(formData)`
Located at `app/(protected)/settings/actions.ts`.

**Input fields (from form):**
- `display_name` (string, required)
- `username` (string, required)
- `timezone` (string, required)

**Logic:**
1. Authenticate: get current user via `supabase.auth.getUser()`. Fail if not authenticated.
2. Validate `username`:
   - Trim and lowercase.
   - Must be ≥ 3 characters.
   - Must match `/^[a-z0-9_]+$/`.
3. Validate `display_name`:
   - Trim.
   - Must be non-empty.
   - Max 100 characters.
4. Validate `timezone`:
   - Must be a valid IANA timezone string. Validate by checking `Intl.supportedValuesOf('timeZone')` contains it (Node 18+).
5. Update `profiles`:
   ```sql
   UPDATE profiles SET username = $1, display_name = $2, timezone = $3
   WHERE id = auth.uid()
   ```
6. On success: return `{ success: true }`. The form shows a success indicator.
7. On unique constraint violation (username taken): return `{ error: "That username is already taken." }`.

**Return type:** `{ success: true }` or `{ error: string }`.

> **Implementation note:** Reuse the same validation logic as `completeOnboarding` in `app/(protected)/onboarding/actions.ts`. Extract shared validation into a utility function (e.g., `lib/validation.ts`) to avoid duplication.

## Layout

### Page Structure

```
┌──────────────────────────────────────────┐
│ Header                                   │
│   "Dossier"              [Share] [User]  │
├──────────────────────────────────────────┤
│ Settings                                 │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Profile                              │ │
│ │                                      │ │
│ │ Display Name  [________________]     │ │
│ │ Username      [________________]     │ │
│ │ Timezone      [▼ America/New_York]   │ │
│ │                                      │ │
│ │ ⚠ Changing your timezone affects...  │ │
│ │                                      │ │
│ │              [Save Changes]          │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ─────────────────────────────────────── │
│                                          │
│ Password             [Change password →] │
│ Blocked Users        [Manage →]          │
│ Account              [Manage account →]  │
│                                          │
└──────────────────────────────────────────┘
```

### Navigation Links
Below the profile form, navigation links to other settings sections:
- **Password** → `/settings/password`
- **Blocked Users** → `/settings/blocked`
- **Account** → `/settings/account`

These are simple links, not tabs. Each section is a separate page. This keeps each page focused and avoids a heavy single-page settings UI.

### Getting to Settings
The settings page is accessible from:
- The user avatar/menu in the header (all protected pages have this).
- Direct URL: `/settings`.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User changes username to one that's taken | Server returns error. Form shows "That username is already taken." The field retains the attempted value so the user can modify it. |
| User changes username to their current username | No-op at the database level (UPDATE sets the same value). Returns success. No special handling needed. |
| User clears display name | Client-side validation prevents submission. Error: "Display name is required." |
| User enters invalid username format | Client-side validation shows error inline: "Username can only contain lowercase letters, numbers, and underscores." Server validates too. |
| Username is fewer than 3 characters | Client-side and server-side: "Username must be at least 3 characters." |
| Invalid timezone value | Client-side: the timezone picker only shows valid IANA values, so this shouldn't happen. Server-side: reject with "Invalid timezone." |
| Timezone change after today's share | The share's `shared_date` is already written and does not change retroactively. The new timezone applies to future shares. Show a warning but allow the change. |
| Network error on save | Show a generic error: "Something went wrong. Please try again." |
| User navigates away with unsaved changes | No warning — the form is simple enough that losing changes is low-friction. No draft persistence. |

## Data Model Changes
None. The `profiles` table already has all required columns. The `updateProfile` action uses the existing `UPDATE` RLS policy.

## UI States

### Page Load
- **Loading:** Skeleton form fields while profile data loads.
- **Ready:** Form populated with current profile values.

### Form Interaction
- **Pristine:** "Save Changes" button is disabled (no changes detected).
- **Dirty:** "Save Changes" button is enabled. Optionally show which fields changed.
- **Submitting:** "Save Changes" button shows loading state (spinner + disabled).
- **Success:** Brief success indicator (green checkmark or "Saved!" text) that fades after 2-3 seconds.
- **Error (validation):** Inline error below the offending field.
- **Error (server):** Error message below the form.

## Dependencies
- **Phase 1 (profiles table + UPDATE RLS policy):** Already in place.
- **Phase 2 (onboarding):** Shares validation logic (username format, timezone). Extract shared logic.
- **Phase 4 (daily view header):** The header user menu should include a "Settings" link.
- **Phase 5 (blocked users):** The "Blocked Users" nav link on this page links to `specs/settings-blocked-users.md`.
- **Phase 9 (password, blocked users, account deletion):** This page links to the other Phase 9 settings sections.

## Acceptance Criteria
- [ ] `/settings` page exists as a protected route.
- [ ] Page displays the user's current display name, username, and timezone in editable fields.
- [ ] Display name can be updated with server-side validation (non-empty, max 100 chars).
- [ ] Username can be updated with the same validation rules as onboarding (lowercase alphanumeric + underscores, ≥ 3 chars, unique).
- [ ] Timezone can be changed using the same picker as onboarding.
- [ ] A warning about timezone change implications is shown near the timezone field.
- [ ] "Save Changes" button is disabled when no changes have been made.
- [ ] Success feedback appears after a successful save.
- [ ] Username uniqueness violations show a clear error message.
- [ ] Validation errors appear inline next to the relevant field.
- [ ] Navigation links to Password, Blocked Users, and Account settings sections are present.
- [ ] The header user menu includes a link to `/settings`.
- [ ] `updateProfile` server action validates all inputs server-side.
