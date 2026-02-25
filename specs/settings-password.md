# Settings — Password Change

## Phase
9 — Account Management & Settings

## What It Does
Allows authenticated users to change their password from the settings area. Uses Supabase Auth's built-in password update flow. No email verification is required since the user is already authenticated.

## User-Facing Behavior
The user navigates to `/settings/password` from the settings page. They enter their new password twice (for confirmation), then click "Update Password." On success, they see a confirmation message and can navigate back to settings. The user stays logged in after changing their password.

### Why No "Current Password" Field
Supabase's `updateUser({ password })` API updates the password for the currently authenticated session. Since the user is already logged in (verified by the auth guard), requiring the old password adds friction without meaningful security benefit — if an attacker has the session, they could also use "forgot password." This is the standard Supabase pattern.

> **Open Decision: Require current password?**
> Options:
> 1. **New password only** (recommended) — Simpler UX, consistent with Supabase's `updateUser` API. The auth session is the proof of identity.
> 2. **Current + new password** — More traditional. Requires calling `signInWithPassword` first to verify the current password, then `updateUser` for the new one. Protects against session hijacking but adds a second round-trip.
>
> Recommendation: Option 1. Keep it simple. Revisit if security audits require it.

## Route

### Page: `/settings/password`
A protected page under `app/(protected)/settings/password/page.tsx`.

## Server Action

### `changePassword(formData)`
Located at `app/(protected)/settings/password/actions.ts`.

**Input fields (from form):**
- `new_password` (string, required)
- `confirm_password` (string, required)

**Logic:**
1. Authenticate: get current user via `supabase.auth.getUser()`. Fail if not authenticated.
2. Validate:
   - `new_password` and `confirm_password` match. If not: return `{ error: "Passwords do not match." }`.
   - `new_password` is at least 8 characters. If not: return `{ error: "Password must be at least 8 characters." }`.
3. Call Supabase Auth to update the password:
   ```ts
   const { error } = await supabase.auth.updateUser({
     password: newPassword,
   });
   ```
4. On success: return `{ success: true }`.
5. On error: return `{ error: error.message }` (Supabase provides descriptive error messages for weak passwords, rate limits, etc.).

**Return type:** `{ success: true }` or `{ error: string }`.

> **Implementation note:** `supabase.auth.updateUser()` uses the server client with cookies, so the session is already available. No re-authentication needed.

## Layout

### Page Structure

```
┌──────────────────────────────────────────┐
│ Header                                   │
│   "Dossier"              [Share] [User]  │
├──────────────────────────────────────────┤
│ ← Back to settings                       │
│                                          │
│ Change Password                          │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ New Password     [________________]  │ │
│ │ Confirm Password [________________]  │ │
│ │                                      │ │
│ │              [Update Password]       │ │
│ └──────────────────────────────────────┘ │
│                                          │
└──────────────────────────────────────────┘
```

### Back Link
A "← Back to settings" link at the top navigates to `/settings`.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| Passwords don't match | Client-side and server-side: "Passwords do not match." |
| Password too short (< 8 characters) | Client-side and server-side: "Password must be at least 8 characters." |
| Supabase rejects the password (e.g., same as current) | Show the error from Supabase. |
| User signed up with OAuth (no password) | Supabase's `updateUser` sets a password even for OAuth users. This effectively adds a password login method. This is acceptable behavior — no special handling needed. |
| Network error | Show a generic error: "Something went wrong. Please try again." |
| Rate limited by Supabase Auth | Supabase returns a rate limit error. Surface it: "Too many attempts. Please try again later." |
| Session expired during form fill | The `supabase.auth.updateUser()` call fails with an auth error. Return "Session expired. Please log in again." and redirect to `/login`. |

## Data Model Changes
None. Password management is handled entirely by Supabase Auth. No changes to the `profiles` table or any other application table.

## UI States

### Page Load
- **Ready:** Empty form with two password fields and the "Update Password" button.

### Form Interaction
- **Empty:** "Update Password" button is disabled.
- **Valid input:** "Update Password" button is enabled.
- **Submitting:** Button shows loading state (spinner + disabled).
- **Success:** Form clears. Success message appears: "Password updated successfully." with a link back to settings.
- **Error (validation):** Inline error below the relevant field.
- **Error (server):** Error message below the form.

### Password Strength (Optional Enhancement)
No password strength meter in Phase 9. The minimum requirement is 8 characters. Supabase Auth may enforce additional rules depending on project configuration.

## Dependencies
- **Phase 1 (Supabase Auth):** `supabase.auth.updateUser()` API. Already available via the server client.
- **Phase 9 (settings-profile):** The settings page links to this page.
- **Rate limiting (Phase 5):** Add `changePassword` to the rate limit table: 5 req/min per user. Prevents brute-force password testing.

## Acceptance Criteria
- [ ] `/settings/password` page exists as a protected route.
- [ ] User can enter a new password and confirm it.
- [ ] Passwords must match — mismatch shows an error.
- [ ] Password must be at least 8 characters.
- [ ] On success, the password is updated via Supabase Auth.
- [ ] Success message is shown after update.
- [ ] The user remains logged in after changing their password.
- [ ] A "Back to settings" link navigates to `/settings`.
- [ ] Server-side validation prevents weak or mismatched passwords.
- [ ] Supabase Auth errors are surfaced to the user.
