# Archive Page — Browse Past Days

## Phase
8 — History and Discovery

## What It Does
Displays shares from people you follow on any past date, with navigation to move between days. This is the browsing experience for the long-term artifact that the daily constraint produces.

## User-Facing Behavior
The user navigates to the archive and sees a date-labeled view of shares from a specific past day — the same curated-shelf feel as the daily view, but for history. They can step through days with prev/next arrows or jump to a specific date with a date picker. The archive lets you answer "what did people share last Tuesday?" or "what was everyone reading two weeks ago?"

## Route

### Page: `/archive/[date]`
A protected page under `app/(protected)/archive/[date]/page.tsx`. The `[date]` parameter is an ISO date string (e.g., `2026-02-20`).

- `/archive` (no date) redirects to `/archive/[yesterday]` where yesterday is computed in the viewer's timezone.
- `/archive/2026-02-20` shows shares from Feb 20, 2026.

The date parameter is validated server-side: must be a valid ISO date, must not be today or in the future.

### Why Not `/archive?date=2026-02-20`
A path segment makes each date a distinct, shareable, bookmarkable URL and works better with Next.js dynamic routes and caching.

## Data Fetching

### Server Component
The page is a server component that fetches three things:

1. **Archive shares:** Call `get_archive_shares` RPC from `specs/archive-query.md` with the date parameter.

2. **Viewer's own share for the date:** Query whether the current user shared on this date.
   ```sql
   SELECT id, content_url, title, description, og_image_url, og_site_name, note, shared_date, created_at
   FROM shares WHERE user_id = $1 AND shared_date = $2
   LIMIT 1
   ```

3. **User's profile** (for timezone): Needed to compute "yesterday" for the default redirect and to validate the date isn't in the future in the viewer's timezone.

## Layout

### Page Structure

```
┌──────────────────────────────────────────┐
│ Header                                   │
│   "Dossier"              [Share] [User]  │
├──────────────────────────────────────────┤
│ Date Navigation                          │
│   [←]  Tuesday, February 20, 2026  [→]  │
│              [Pick a date]               │
├──────────────────────────────────────────┤
│ Your Share (if you shared that day)      │
│   ┌──────────────────────────────────┐   │
│   │ Your share for this day          │   │
│   │ [Compact ShareCard]              │   │
│   └──────────────────────────────────┘   │
├──────────────────────────────────────────┤
│                                          │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│ │ ShareCard│ │ ShareCard│ │ ShareCard│  │
│ │          │ │          │ │          │  │
│ └──────────┘ └──────────┘ └──────────┘  │
│ ┌──────────┐ ┌──────────┐               │
│ │ ShareCard│ │ ShareCard│               │
│ │          │ │          │               │
│ └──────────┘ └──────────┘               │
│                                          │
└──────────────────────────────────────────┘
```

### Header
Same header as the daily view (consistent across protected pages). App name, share action, user indicator.

### Date Navigation Bar

- **Date display:** Formatted as a human-readable date: "Tuesday, February 20, 2026". Uses the viewer's locale for formatting.
- **Previous day arrow (`←`):** Navigates to `/archive/[date - 1 day]`. Always enabled (no lower bound enforced — empty states handle old dates gracefully).
- **Next day arrow (`→`):** Navigates to `/archive/[date + 1 day]`. Disabled when the next date would be today or in the future. When the next date is yesterday, the arrow navigates normally. When the current date IS yesterday, the arrow is replaced with a "Back to today" link to `/dashboard`.
- **"Pick a date" link:** Opens a native `<input type="date">` or a lightweight date picker. On selection, navigates to `/archive/[selected-date]`. Max date is yesterday.
- **"Back to today" link:** Below the date, a subtle link to `/dashboard` — always visible to provide a quick path back.

### Your Share Section
If the viewer shared on the selected date, show their share in a highlighted section above the feed grid:
- Label: "Your share" (no "for this day" needed — the date is in the nav bar).
- Renders as a `ShareCard` without the sharer header (same as `/share/today`).
- If the viewer did NOT share on that date, this section is omitted entirely.

### Feed Grid
Same responsive grid as the daily view:
- **Desktop (≥1024px):** 3 columns
- **Tablet (≥640px):** 2 columns
- **Mobile (<640px):** 1 column

Cards rendered using `ShareCard` with `sharer` prop, identical to the daily view.

## Empty States

### No Shares on This Date
The user follows people, but no one shared on the selected date. The grid area shows:
- **Heading:** "No shares on this date"
- **Body:** "Nobody you follow shared anything on [formatted date]."
- **Navigation hint:** "Try another day" with the prev/next arrows still available.

### User Follows No One
The user hasn't followed anyone. The grid area shows:
- **Heading:** "Your shelf is empty"
- **Body:** "Follow people to see their past shares here."
- Same message as the daily view's no-follows state — consistent language.

### Date is Today
If the user somehow navigates to today's date (e.g., by manually editing the URL):
- Redirect to `/dashboard` (the daily view). Today's experience is the daily view, not the archive.

### Date is in the Future
If the user navigates to a future date:
- Redirect to `/archive/[yesterday]` in the viewer's timezone.

## Navigation

### Getting to the Archive
- **From the daily view header:** An "Archive" or clock icon link in the header nav. This is a new addition to the header.
- **Direct URL:** `/archive` or `/archive/[date]`.

### From the Archive
- **Share card click** → opens original content URL in new tab (same as daily view).
- **"Back to today"** → `/dashboard`.
- **Date navigation arrows** → `/archive/[prev-or-next-date]`.
- **Date picker selection** → `/archive/[selected-date]`.
- **Sharer name/avatar click** → `/profile/[username]` (if Phase 6 profile pages exist).

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| Invalid date in URL (e.g., `/archive/not-a-date`) | Redirect to `/archive/[yesterday]`. |
| Date in URL is malformed but parseable (e.g., `2026-2-5`) | Normalize to ISO format and redirect to `/archive/2026-02-05`. |
| Very old date (years ago) | Show empty state. No lower bound enforced. |
| Date navigation overshoots today | Next arrow is disabled when next day would be today or future. |
| User navigates rapidly (clicking arrows fast) | Standard Next.js navigation. Each click triggers a new server render. No debouncing needed — the page is lightweight. |
| Archive query fails (database error) | Show error state: "Something went wrong loading the archive. Try refreshing." with a reload link. |
| User is on the archive and it crosses midnight in their timezone | No special handling. The archive is static history — it doesn't need to update at midnight. |
| Follows 50+ people who all shared on a date | Render all cards. No pagination. The one-share-per-day constraint caps the grid at the number of follows. |

## Data Model Changes
None. The `get_archive_shares` function is defined in `specs/archive-query.md`. This page only consumes that function.

## UI States

### Page Load
- **Loading:** Skeleton grid (via `loading.tsx` for client-side transitions). Date navigation bar renders immediately with the selected date.
- **Populated:** Date nav bar + optional "your share" section + grid of share cards.
- **Empty (no shares):** Date nav bar + "No shares on this date" message.
- **Empty (no follows):** Date nav bar + "Your shelf is empty" message.
- **Error:** Date nav bar + error message with reload link.

### Date Navigation
- **Previous arrow:** Always enabled (link to prev day).
- **Next arrow:** Enabled if next day < today. Disabled (grayed, no link) if next day ≥ today.
- **Date picker:** Standard native `<input type="date">` with `max` set to yesterday's date.

## Modifications to Existing Code
- **Header component** (from `specs/daily-view-page.md`): Add an "Archive" link (clock icon or text) to the header nav, between the app name and the share action. This gives the archive a persistent entry point from all protected pages.

## Dependencies
- **Archive Query** (`specs/archive-query.md`): Provides the share data for the grid.
- **Share Card** (`specs/share-card.md`): Renders individual shares in the grid. Already designed for reuse in Phase 8.
- **Daily View Page** (`specs/daily-view-page.md`): Shares the header layout and grid structure. The archive header should be consistent.
- **Phase 3 (Sharing Flow)**: Historical shares must exist in the database. Can use mock data during development.
- **Phase 6 (Profile Pages)**: For sharer name links in the grid. Graceful degradation if Phase 6 isn't built yet (names are display-only, not links).

## Acceptance Criteria
- [ ] Archive page exists at `/archive/[date]` as a protected route.
- [ ] `/archive` (no date) redirects to yesterday's date in the viewer's timezone.
- [ ] Displays share cards from followed users for the selected date using `ShareCard`.
- [ ] Cards arranged in responsive grid (1-3 columns, matching daily view).
- [ ] Date navigation bar shows the formatted date with prev/next arrows.
- [ ] Previous day arrow navigates to the prior date.
- [ ] Next day arrow is disabled when next day is today or future.
- [ ] Date picker allows jumping to any past date.
- [ ] "Back to today" link navigates to `/dashboard`.
- [ ] Shows viewer's own share for the date above the grid when present.
- [ ] Shows "No shares on this date" empty state when no followed users shared.
- [ ] Shows "Your shelf is empty" empty state when user follows no one.
- [ ] Redirects to `/dashboard` if the date is today.
- [ ] Redirects to yesterday if the date is in the future or invalid.
- [ ] Share card clicks open the original content URL in a new tab.
- [ ] Header includes an "Archive" link accessible from all protected pages.
- [ ] Page handles query errors with a user-friendly error message.
