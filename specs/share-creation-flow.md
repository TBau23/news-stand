# Share Creation Flow

## Phase
3 — Sharing Flow

## What It Does
The user creates their one daily share by entering a URL, previewing the unfurled content, optionally writing a short note, confirming their choice, and submitting. The entire journey lives on a single page that guides the user through a linear sequence of steps.

## User-Facing Behavior

### Step 1: URL Entry
The user navigates to the share page (e.g., `/share`). They see a prominent input field with placeholder text like "Paste a URL..." and a "Preview" button. They enter a URL and trigger the unfurl.

### Step 2: Preview & Note
Once the URL is unfurled, a preview card appears below the input showing the page title, description, image, and source domain. Below the preview card is an optional text area for a note (placeholder: "Why did you pick this?"). The note has a character limit of 280 characters with a visible counter. The URL input remains visible but is now paired with the preview. The user can clear the URL and start over at this point.

### Step 3: Confirmation
When the user clicks "Share," a confirmation dialog appears (modal or inline expansion). It displays:
- The preview card (smaller)
- Their note (if any)
- A clear warning: **"This is your share for today. You won't be able to change it."**
- Two buttons: **"Confirm"** and **"Go Back"**

### Step 4: Submission
On confirm, a server action inserts the share record. On success, the user is redirected to the Today's Share View (see `todays-share-view.md`). On failure, an error message appears and the user can retry.

## Route

### Page: `/share`
A protected page under `app/(protected)/share/page.tsx`.

**Entry guard:** Before rendering the form, check if the user has already shared today (query `shares` where `user_id` = current user and `shared_date` = today in user's timezone). If they have, redirect to `/share/today` (or wherever the Today's Share View lives).

## Server Action

### `createShare(formData)`
Located at `app/(protected)/share/actions.ts`.

**Input fields (from form):**
- `content_url` (string, required)
- `title` (string | null) — from unfurl
- `description` (string | null) — from unfurl
- `og_image_url` (string | null) — from unfurl
- `og_site_name` (string | null) — from unfurl
- `note` (string | null, max 280 chars)

**Logic:**
1. Authenticate: get current user via `supabase.auth.getUser()`. Fail if not authenticated.
2. Fetch the user's profile to get their `timezone`.
3. Compute today's date in the user's timezone:
   ```ts
   const now = new Date();
   const formatter = new Intl.DateTimeFormat('en-CA', {
     timeZone: profile.timezone,
     year: 'numeric', month: '2-digit', day: '2-digit'
   });
   const sharedDate = formatter.format(now); // "YYYY-MM-DD"
   ```
4. Validate:
   - `content_url` is present, non-empty, and a valid http(s) URL.
   - `note` is at most 280 characters (or null/empty).
   - `title`, `description`, `og_site_name` are each at most their max lengths (500, 1000, 200 chars). Truncate silently if exceeded.
   - `og_image_url` is a valid http(s) URL or null.
5. Insert into `shares`:
   ```sql
   INSERT INTO shares (user_id, content_url, title, description, og_image_url, og_site_name, note, shared_date)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
   ```
6. On success: redirect to the Today's Share View.
7. On unique constraint violation (`user_id, shared_date`): return an error "You've already shared today." This is a race condition guard — the page-level check should catch the normal case.

**Return type:** Redirect on success, or `{ error: string }` on failure.

## Shared Date Computation

This is a critical piece of logic that must be correct.

- The user's timezone is stored on `profiles.timezone` as an IANA string (e.g., `America/New_York`).
- `shared_date` is a `DATE` column formatted as `YYYY-MM-DD`.
- The date must represent "today" in the **user's** timezone, not UTC or the server's timezone.
- Example: A user in `America/Los_Angeles` shares at 11:30 PM PT on Feb 23. In UTC it's Feb 24. The `shared_date` must be `2026-02-23` because that's the user's local date.

> **Implementation note:** Use `Intl.DateTimeFormat` with `en-CA` locale (which produces `YYYY-MM-DD` format) and the user's timezone. This runs on the server, so Node.js ICU data must support IANA timezones (it does by default in Node 18+).

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User has already shared today | Redirect to Today's Share View on page load. Do not show the creation form. |
| URL unfurl fails | User can still submit. The share is saved with `content_url` populated but metadata fields as null. The preview area shows a fallback card. The user is not blocked from sharing. |
| User submits without previewing | Allowed. Metadata fields will be null. Consider auto-triggering unfurl on submit if metadata is missing, or accept the share without metadata. |
| Duplicate submission (race condition) | The `UNIQUE(user_id, shared_date)` constraint catches this. Server action returns an error and suggests viewing today's share. |
| User clears the URL after previewing | Reset the preview card and note. Return to Step 1. |
| URL is valid but not a web page (e.g., direct link to a PDF or image) | Accept it. The unfurl may return no metadata, but the URL itself is the content. |
| Note exceeds 280 characters | Client-side: prevent typing beyond 280. Server-side: reject with error if >280. |
| User navigates away mid-form | No data is saved. The form state is lost. This is expected — there's no draft concept. |
| Timezone edge case: user shares at 11:59 PM, server processes at 12:00 AM | Use the computed `shared_date` from the moment the server action runs. If it crossed midnight, the share counts for the new day. This is acceptable — the constraint is "one per calendar day in your timezone," and the server's computation is the source of truth. |
| User's profile has no timezone set | Fall back to `America/New_York` (the database default). This shouldn't happen post-onboarding but handle it defensively. |

## Data Model Changes
None. The `shares` table already has all required columns from Phase 1-2 migrations:
- `content_url TEXT NOT NULL`
- `title TEXT`
- `description TEXT`
- `og_image_url TEXT`
- `og_site_name TEXT`
- `note TEXT`
- `shared_date DATE NOT NULL`
- `UNIQUE(user_id, shared_date)`

## UI States

### Page Load
- **Loading:** Spinner or skeleton while checking if user has already shared today.
- **Already shared:** Redirect to Today's Share View (no flash of the form).
- **Ready:** Show the URL entry form.

### URL Entry (Step 1)
- **Empty:** Input field with placeholder, "Preview" button is disabled or absent.
- **Typing:** Input field has content, "Preview" button becomes active.
- **Invalid URL:** Inline validation error below the input (e.g., "Please enter a valid URL").

### Preview (Step 2)
- **Loading:** Skeleton card with pulsing placeholder blocks for image, title, description.
- **Success:** Full preview card with metadata. Note text area appears below.
- **Partial metadata:** Card renders available fields; missing fields are omitted (not shown as "N/A").
- **Unfurl failed:** Fallback card showing the domain extracted from the URL and "No preview available." Note text area still appears — user can still share.

### Note
- **Empty:** Placeholder text "Why did you pick this?" in a text area.
- **Typing:** Character count updates (e.g., "42 / 280").
- **At limit:** Counter turns red/warning color. Input prevents further typing.

### Confirmation (Step 3)
- **Dialog visible:** Preview card (compact), note text, warning message, "Confirm" and "Go Back" buttons.
- **Submitting:** "Confirm" button shows loading state (spinner + disabled). "Go Back" is also disabled.

### Post-Submission
- **Success:** Redirect to Today's Share View.
- **Error (duplicate):** Inline error "You've already shared today" with a link to view today's share.
- **Error (other):** Inline error with the message. "Try Again" button.

## Navigation
- The share page should be accessible from the main navigation (dashboard, daily view, or a persistent "Share" button).
- After Phase 4 (Daily View) is built, the share entry point will likely move to the daily view page. For now, `/share` is a standalone route.

## Dependencies
- **URL Unfurling API** (`specs/url-unfurling.md`): Called during Step 2 to fetch metadata.
- **Supabase auth & profiles:** For user identity and timezone.
- **Today's Share View** (`specs/todays-share-view.md`): Redirect target after successful submission and for the "already shared" guard.
- **Existing:** Protected layout (`app/(protected)/layout.tsx`) provides the auth guard.

## Acceptance Criteria
- [ ] `/share` page exists and is protected (requires auth + completed onboarding).
- [ ] If the user has already shared today (in their timezone), they are redirected away from the form.
- [ ] User can enter a URL and see an unfurled preview card.
- [ ] User can write an optional note (max 280 characters) with a visible character counter.
- [ ] A confirmation step appears before final submission with a clear warning about irrevocability.
- [ ] On confirm, the share is created with the correct `shared_date` computed from the user's timezone.
- [ ] The content URL is stored exactly as entered (not modified by unfurling).
- [ ] OG metadata from the unfurl is stored on the share record.
- [ ] On success, the user is redirected to Today's Share View.
- [ ] The `UNIQUE(user_id, shared_date)` constraint is handled gracefully if hit (error message, not crash).
- [ ] The form works even if unfurling fails (metadata fields are null, share still submits).
- [ ] Client-side validation prevents submission of empty URL or note >280 chars.
- [ ] Server-side validation rejects invalid URLs and oversized notes.
