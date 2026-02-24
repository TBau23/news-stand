# Today's Share View

## Phase
3 — Sharing Flow

## What It Does
After a user submits their daily share, this page displays what they shared today — the unfurled content card and their note — with the ability to edit the note. It is also the destination when a user who has already shared tries to visit `/share`.

## User-Facing Behavior
The user lands on this page after submitting a share (redirect from the creation flow) or when navigating to `/share` after already having shared today. They see their share rendered as a card with the unfurled metadata (title, image, description, source) and their note below it. A small edit affordance (pencil icon or "Edit note" link) lets them modify the note. The content URL is locked and cannot be changed.

## Route

### Page: `/share/today`
A protected page under `app/(protected)/share/today/page.tsx`.

**Entry guard:** Check if the user has shared today (query `shares` where `user_id` = current user and `shared_date` = today in the user's timezone). If they have **not** shared, redirect to `/share` (the creation flow).

## Data Fetching

### Server Component Query
On page load, fetch the user's share for today:

```sql
SELECT * FROM shares
WHERE user_id = $1
AND shared_date = $2
```

Where `$2` is today's date computed from the user's timezone (same logic as in the share creation spec).

This runs as a server component query — no client-side fetch needed for the initial render.

## Note Editing

### Inline Edit Flow
1. The note is displayed as static text below the share card.
2. User clicks "Edit note" (or a pencil icon next to the note).
3. The note text switches to an editable text area, pre-filled with the current note (or empty if no note was set).
4. A character counter appears (same 280-char limit as creation).
5. Two buttons appear: **"Save"** and **"Cancel"**.
6. On save, a server action updates the note. On success, the text area collapses back to static text with the updated note.
7. On cancel, the text area collapses back to the original note text without saving.

### Server Action: `updateShareNote(formData)`
Located at `app/(protected)/share/today/actions.ts`.

**Input fields:**
- `share_id` (string, required) — the UUID of the share record
- `note` (string | null, max 280 chars) — the updated note text (empty string treated as null)

**Logic:**
1. Authenticate: get current user via `supabase.auth.getUser()`. Fail if not authenticated.
2. Fetch the share by `share_id`. Verify that `share.user_id` matches the authenticated user. Fail with "Not authorized" if it doesn't (prevents editing someone else's share).
3. Validate: `note` is at most 280 characters. Reject with error if exceeded.
4. Update the share:
   ```sql
   UPDATE shares SET note = $1, updated_at = now() WHERE id = $2
   ```
5. Revalidate the page path so the server component re-renders with the updated note.

**Return type:** `{ success: true }` or `{ error: string }`.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User hasn't shared today | Redirect to `/share` on page load. Do not render the view. |
| Share has no OG metadata (unfurl failed during creation) | Render a minimal card showing the URL's domain and "No preview available." The note and edit functionality still work normally. |
| Share has no note | Display "No note added" in muted text. The "Edit note" affordance is still visible — user can add a note after the fact. |
| Note edit fails (network error, server error) | Show an inline error message below the text area. Keep the text area open so the user can retry. Do not discard their edits. |
| Note validation fails (>280 chars) | Client-side: prevent typing beyond 280. Server-side: reject with error "Note must be 280 characters or fewer." |
| User opens edit, makes no changes, clicks Save | Accept it — update the record with the same value. This is a no-op in practice but simpler than diffing. |
| User opens edit then navigates away | Unsaved edits are lost. No draft concept. This is acceptable since notes are short. |
| Concurrent edit (user has two tabs open) | Last write wins. The page revalidation on save ensures both tabs see the latest note on next load. |
| Share was created with metadata but the external image URL is now broken | Render the card without an image (graceful degradation). Do not attempt to re-fetch metadata. |

## Data Model Changes
None. The `shares` table already has a `note TEXT` column and an `updated_at` timestamp. The `updateShareNote` action updates both fields.

## UI States

### Page Load
- **Loading:** Skeleton card with placeholder blocks for image, title, and note.
- **Not shared yet:** Redirect to `/share` (no flash of this page).
- **Shared:** Render the share card and note.

### Share Card
- **Full metadata:** Title, description (truncated to ~2 lines), image thumbnail, source domain. The content URL is displayed and clickable (opens in a new tab).
- **Partial metadata:** Render available fields; omit missing ones (no "N/A" placeholders).
- **No metadata:** Domain name extracted from URL, "No preview available" subtitle.

### Note Display (Read Mode)
- **Has note:** Note text rendered below the card. "Edit note" link or icon adjacent.
- **No note:** "No note added" in muted/secondary text. "Add a note" link.

### Note Editing (Edit Mode)
- **Editing:** Text area with current note text, character counter ("42 / 280"), "Save" and "Cancel" buttons.
- **Saving:** "Save" button shows a loading spinner and is disabled. "Cancel" is also disabled. Text area remains visible with the user's text.
- **Save success:** Text area collapses. Updated note appears as static text.
- **Save error:** Error message appears below the text area. Buttons re-enable. User's text is preserved.

### Contextual Message
After the share card and note, display a subtle message reinforcing the daily rhythm:
- "This is your share for today. Come back tomorrow to share something new."

## Navigation
- This page is reachable by:
  - Redirect from `/share` (after successful creation or if already shared).
  - Direct navigation to `/share/today`.
  - Eventually from the daily view (Phase 4) via a "View your share" link.
- The page should include a link back to the daily view (or dashboard, pre-Phase 4).

## Dependencies
- **Share Creation Flow** (`specs/share-creation-flow.md`): Redirects here after successful share submission.
- **Supabase auth & profiles:** For user identity and timezone computation.
- **Existing:** Protected layout (`app/(protected)/layout.tsx`) provides the auth guard.

## Acceptance Criteria
- [ ] `/share/today` page exists and is protected (requires auth + completed onboarding).
- [ ] If the user has NOT shared today (in their timezone), they are redirected to `/share`.
- [ ] The page displays the user's share for today as a card with available OG metadata.
- [ ] The content URL is displayed and opens the original content in a new tab when clicked.
- [ ] The note is displayed below the card (or "No note added" if empty).
- [ ] User can click "Edit note" to enter edit mode with a pre-filled text area.
- [ ] The text area has a 280-character limit with a visible counter.
- [ ] Saving the note updates the `shares` record and re-renders the page with the new note.
- [ ] The content URL cannot be changed from this page (no edit affordance for URL).
- [ ] Cancel discards unsaved edits and returns to read mode.
- [ ] The page handles shares with missing OG metadata gracefully (fallback card).
- [ ] The `updateShareNote` server action verifies ownership before updating.
