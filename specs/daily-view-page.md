# Daily View Page

## Phase
4 — The Daily View

## What It Does
Displays the main screen of the app — a surface where you see today's shares from people you follow, filling up throughout the day as people post. This is the core experience of Dossier.

## User-Facing Behavior
When the user opens the app, they see share cards from people they follow arranged on a visual surface. Early in the day it's sparse; by evening it's full. The feel is "browsing a curated shelf" rather than scrolling an infinite feed. The user also sees their own sharing status (whether they've shared today) and can navigate to create or view their share.

## Route

### Page: `/dashboard` (replaces current content)
A protected page under `app/(protected)/dashboard/page.tsx`. This replaces the current minimal dashboard (which shows email and profile ID) as the primary landing page after login and onboarding.

> **Open Decision: Route path.**
> Options:
> 1. Replace `/dashboard` content with the daily view (keep the route).
> 2. Create a new `/feed` route and update redirects.
> 3. Use the root `/` for logged-in users via middleware redirect.
>
> Recommendation: Option 1 — replace `/dashboard`. It's already the post-login destination, so no redirect changes are needed. The current dashboard content (email, profile ID) is developer scaffolding that can be removed.

## Data Fetching

### Server Component
The page is a server component that fetches two things on load:

1. **Feed shares:** Call the `get_active_feed_shares` RPC from `specs/feed-query.md` to get active shares from followed users.

2. **User's sharing status for today:** Query whether the current user has shared today.
   ```sql
   SELECT id FROM shares
   WHERE user_id = $1 AND shared_date = $2
   LIMIT 1
   ```
   Where `$2` is today's date computed in the user's timezone (same `Intl.DateTimeFormat('en-CA', { timeZone })` logic from Phase 3).

3. **User's follow count:** Query the number of people the user follows.
   ```sql
   SELECT count(*) FROM follows WHERE follower_id = $1
   ```
   This determines whether to show the "no follows" empty state.

## Layout

### Visual Treatment
Shares are displayed in a responsive grid:
- **Desktop (≥1024px):** 3 columns
- **Tablet (≥640px):** 2 columns
- **Mobile (<640px):** 1 column

Cards are rendered using the `ShareCard` component from `specs/share-card.md` with the `sharer` prop populated from the feed query results.

> **Open Decision: Layout style.**
> Options:
> 1. Uniform grid — all cards same height, simpler CSS.
> 2. Masonry — variable-height cards based on content, more visual variety.
>
> Recommendation: Start with a uniform CSS Grid. Masonry can be explored in Phase 7 (Polish).

### Page Structure

```
┌──────────────────────────────────────────┐
│ Header                                   │
│   "Dossier"              [Share] [User]  │
├──────────────────────────────────────────┤
│ Share Status Banner                      │
│   "You haven't shared yet today." [→]    │
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
- App name: "Dossier" (left-aligned).
- Right side: "Share" button/link + user avatar or initial circle.
- "Share" links to `/share` if the user hasn't shared today, or `/share/today` if they have.
- User avatar is display-only for now (links to settings in Phase 9).

### Share Status Banner
A subtle bar between the header and the feed grid that shows the user's own sharing status:

- **Not shared yet:** "You haven't shared yet today." with a "Share something" link to `/share`. Visually prominent enough to notice but not overwhelming.
- **Already shared:** "You shared today." with a "View your share" link to `/share/today`. More subtle than the "not shared" state.

## Empty States

Three distinct conditions that can combine. Each produces a different full-page or partial-page treatment.

### 1. No Follows Yet
The user hasn't followed anyone. The feed grid area shows:
- **Heading:** "Your shelf is empty"
- **Body:** "Follow people to see what they're reading and watching today."
- **Note:** Since follow/invite mechanics don't land until Phase 6, include a brief placeholder: "Invite and follow features are coming soon."

This is a **full-page** empty state (replaces the grid area entirely).

### 2. Follows Exist, No Shares Today
The user follows people, but none have active shares right now. The feed grid area shows:
- **Heading:** "Nothing here yet today"
- **Body:** "The people you follow haven't shared anything yet. Check back later — the shelf fills up as the day goes on."

This is a **full-page** empty state (replaces the grid area).

### 3. User Hasn't Shared Yet
This is NOT a full-page empty state. It appears in the **Share Status Banner** area regardless of whether the feed has content. The banner's "not shared yet" variant handles this.

### Combined: No Follows + Haven't Shared
When the user follows no one AND hasn't shared, show a combined welcome message:
- **Heading:** "Welcome to Dossier"
- **Body:** "Share one thing today — your best find, your favorite read, the thing you'd tell a friend about."
- **Action:** Prominent "Share something" button linking to `/share`.
- **Secondary:** "Once you follow people, their daily picks will appear here."

## Navigation

### From the Daily View
- **Share card click** → opens original content URL in new tab.
- **"Share something"** → `/share` (create a share).
- **"View your share"** → `/share/today` (view/edit note).
- **Sign out** → should remain accessible (currently in dashboard, keep it in the header or user menu).

### To the Daily View
- **Post-login redirect:** Currently points to `/dashboard` — no change needed if we keep the route.
- **Post-onboarding redirect:** Currently points to `/dashboard` — no change needed.
- **Post-share creation:** `/share/today` is the immediate redirect, but `/share/today` should link back to the daily view.

### Redirect Updates
- Update `app/(auth)/signup/actions.ts` if the post-signup flow changes.
- Update `app/(protected)/onboarding/actions.ts` if the post-onboarding destination changes.
- These only need updating if the route changes from `/dashboard`.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User has many follows (50+) with active shares | Render all in the grid. No pagination. The one-share-per-day constraint naturally limits volume (max shares = number of follows). |
| Shares expire while user is viewing the page | Shares remain visible until next page load or navigation. No real-time removal in Phase 4 (that's Phase 7). |
| Feed query fails (database error) | Show an error state: "Something went wrong loading your feed. Try refreshing." with a reload link. |
| User's profile fetch fails | Redirect to login (session may be expired). |
| Slow page load (many shares) | Render a loading skeleton: grid of placeholder cards with pulsing animation. The server component itself won't show skeletons (it's SSR), but if client-side navigation is used (e.g., via Next.js Link), a loading.tsx file can provide the skeleton. |
| Mix of shares with and without OG metadata | ShareCard handles this via its fallback rendering. No special handling needed at the page level. |
| Very early morning (few shares) | The sparse grid IS the experience. "Early in the day it's sparse" is a feature, not a bug. Don't show a "no shares yet" message if there are any shares at all, even just one. |

## Data Model Changes

### Database Function Migration
The `get_active_feed_shares` function defined in `specs/feed-query.md` requires a new migration file. This is the only schema change for Phase 4.

### No Table Changes
All necessary columns and constraints exist from Phases 1-2.

## UI States

### Page Load
- **Loading:** Skeleton grid (if using `loading.tsx` for client-side transitions).
- **Authenticated + has follows + has shares:** Full daily view with share cards.
- **Authenticated + has follows + no shares:** "Nothing here yet today" empty state.
- **Authenticated + no follows:** "Your shelf is empty" empty state.
- **Authenticated + no follows + not shared:** Combined welcome empty state.

### Share Status Banner
- **Not shared:** Visible, prominent, with CTA to share.
- **Already shared:** Visible, subtle, with link to view share.

### Feed Grid
- **Populated:** Grid of ShareCard components.
- **Empty:** Appropriate empty state message (see Empty States section).

## Dependencies
- **Feed Query** (`specs/feed-query.md`): Provides the share data for the grid.
- **Share Card** (`specs/share-card.md`): Renders individual shares in the grid.
- **Phase 3 (Sharing Flow)**: Creates the shares and provides `/share` and `/share/today` routes that this page links to.
- **Supabase auth & profiles**: For user identity, timezone, and follow count.
- **Existing:** Protected layout (`app/(protected)/layout.tsx`) provides the auth and onboarding guard.

## Acceptance Criteria
- [ ] Daily view page exists at a protected route and is the primary post-login landing page.
- [ ] Displays share cards from followed users using the `ShareCard` component.
- [ ] Only shows shares that are still active (not past midnight in the sharer's timezone).
- [ ] Share cards are arranged in a responsive grid (1-3 columns based on viewport).
- [ ] Indicates whether the user has shared today via a status banner.
- [ ] Banner links to `/share` (if not shared) or `/share/today` (if shared).
- [ ] Shows "Your shelf is empty" empty state when user follows no one.
- [ ] Shows "Nothing here yet today" empty state when followed users have no active shares.
- [ ] Shows combined welcome state when user has no follows and hasn't shared.
- [ ] Share card clicks open the original content URL in a new tab.
- [ ] Header includes app name, share action, and user indicator.
- [ ] Sign out functionality remains accessible.
- [ ] Page handles feed query errors with a user-friendly error message.
