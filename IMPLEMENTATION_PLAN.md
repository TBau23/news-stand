# Implementation Plan

## Phase 3 — Sharing Flow

Phase 3 builds the core share submission experience: pasting a URL, unfurling metadata, adding a note, confirming, and viewing the result. It is broken into three specs, each covering a single concern.

### Specs

| # | Spec File | Concern | Summary |
|---|---|---|---|
| 1 | [`specs/url-unfurling.md`](specs/url-unfurling.md) | URL metadata extraction | `POST /api/unfurl` route that fetches OG metadata from a user-supplied URL. Stateless, no DB writes. SSRF-protected. Can be built and tested independently. |
| 2 | [`specs/share-creation-flow.md`](specs/share-creation-flow.md) | Share submission | The `/share` page — URL entry, preview card, optional note, confirmation step, and `createShare` server action. Computes `shared_date` from the user's timezone. Redirects to Today's Share View on success. |
| 3 | [`specs/todays-share-view.md`](specs/todays-share-view.md) | Post-share view and note editing | The `/share/today` page — displays the user's share for today with OG metadata card and note. Provides inline note editing via `updateShareNote` server action. Redirect target from the creation flow. |

### Recommended Build Order

1. **URL Unfurling** — No dependencies on other Phase 3 specs. Delivers a standalone API route that the share creation flow calls. Likely requires adding an HTML parsing library (`cheerio` or `node-html-parser`).
2. **Share Creation Flow** — Depends on the unfurl endpoint for preview. Depends on Today's Share View as the redirect target (can use a placeholder redirect during development).
3. **Today's Share View** — Depends on shares existing in the database (created by the share creation flow). Can be built in parallel with the creation flow if using mock data.

### Data Model Changes
None required. The `shares` and `profiles` tables from Phases 1-2 already have all necessary columns.

### New Dependencies (to be installed)
- An HTML parsing library for the unfurl endpoint (e.g., `cheerio`, `node-html-parser`). Decision documented as open in the unfurl spec.

### Open Decisions
- **SSRF prevention approach** (documented in `specs/url-unfurling.md`): Manual DNS resolution + IP check vs. library vs. external service.
- **HTML parser choice**: `cheerio` (heavier, jQuery-like API) vs. `node-html-parser` (lighter, faster) vs. regex (fragile but zero-dep).

---

## Phase 4 — The Daily View

Phase 4 builds the core reading experience: the main screen where you see today's shares from people you follow. It introduces timezone-aware feed logic, a reusable share card component, and the primary landing page. Three specs, each covering a single concern.

### Specs

| # | Spec File | Concern | Summary |
|---|---|---|---|
| 1 | [`specs/feed-query.md`](specs/feed-query.md) | Timezone-aware feed data | Database function that fetches active shares from followed users, filtering out shares past midnight in the sharer's timezone. Returns share data joined with sharer profile info. |
| 2 | [`specs/share-card.md`](specs/share-card.md) | Share card component | Reusable `ShareCard` component that renders a single share with OG metadata, sharer identity, and note. Handles missing metadata gracefully. Designed for reuse across Phase 3 retrofit, Phase 6, and Phase 8. |
| 3 | [`specs/daily-view-page.md`](specs/daily-view-page.md) | Daily view page | The main `/dashboard` page — displays the feed grid of share cards, share status banner, header navigation, and handles three empty states (no follows, no shares today, combined welcome). |

### Recommended Build Order

1. **Feed Query** — No UI dependency. Create the database function and migration. Can be tested with mock data or manual inserts. Foundation for the page.
2. **Share Card** — Standalone presentational component. Can be built and tested with mock data from `lib/mock-data.ts` independently of the feed query.
3. **Daily View Page** — Wires together the feed query and share card. Depends on both previous specs. Also depends on Phase 3 routes (`/share`, `/share/today`) for navigation links.

### Data Model Changes
One new migration required:
- `get_active_feed_shares(p_user_id UUID)` — a database function (Supabase RPC) that performs the timezone-aware feed query with joins across `shares`, `follows`, and `profiles`.

No table schema changes needed.

### New Dependencies (to be installed)
None. Phase 4 uses existing libraries (Next.js, Supabase, Tailwind).

### Open Decisions
- **Route path** (documented in `specs/daily-view-page.md`): Replace `/dashboard` content vs. new `/feed` route vs. root `/`. Recommendation: replace `/dashboard`.
- **Layout style** (documented in `specs/daily-view-page.md`): Uniform grid vs. masonry. Recommendation: uniform CSS Grid, masonry deferred to Phase 7.
- **SECURITY DEFINER vs. INVOKER** (documented in `specs/feed-query.md`): For the feed function. Recommendation: SECURITY INVOKER for now, revisit in Phase 5 when RLS tightens.
- **Timestamp on share cards** (documented in `specs/share-card.md`): No timestamp vs. relative time vs. time-of-day label. Recommendation: soft time-of-day label.

---

## Phase 5 — Privacy & Security

Phase 5 hardens the app before opening it to more users. It tightens data access from public-read to followers-only, adds user blocking mechanics, and introduces rate limiting on API routes and server actions. Three specs, each covering a single concern.

### Specs

| # | Spec File | Concern | Summary |
|---|---|---|---|
| 1 | [`specs/followers-only-visibility.md`](specs/followers-only-visibility.md) | Share visibility via RLS | Replaces public-read RLS on `shares` with followers-only + owner policies. Scopes `follows` reads to authenticated users. Verifies all existing queries (feed, share creation, today's view) work under the new policies. |
| 2 | [`specs/user-blocking.md`](specs/user-blocking.md) | Block/unblock mechanics | New `blocks` table, server actions for block/unblock, follow removal on block, prevention of re-following via updated `follows` INSERT policy. Minimal UI via share card menu. |
| 3 | [`specs/rate-limiting.md`](specs/rate-limiting.md) | API rate limiting | In-memory sliding-window rate limiter applied per-user (authenticated) or per-IP (unauthenticated). Covers unfurl, share creation, note editing, blocking, login, and signup endpoints. |

### Recommended Build Order

1. **Followers-Only Visibility** — Pure database migration, no application code changes. Can be deployed and verified independently. Must land before blocking has its full privacy effect.
2. **User Blocking** — Depends on followers-only RLS being in place for the full privacy guarantee (blocking removes follows, which under followers-only RLS removes share visibility). Can be built in parallel with the migration if tested against the new policies.
3. **Rate Limiting** — Independent of the other two specs. Can be built in any order. Retrofits rate limit calls into existing and new endpoints.

### Data Model Changes
One migration required with:
- Dropped and replaced RLS policies on `shares` (public-read → followers-only + owner)
- Dropped and replaced RLS policy on `follows` (public-read → authenticated-only)
- Updated `follows` INSERT policy (block check)
- New `blocks` table with RLS, indexes, and constraints

No changes to existing table schemas.

### New Dependencies (to be installed)
None for the recommended in-memory approach. If upgrading to distributed rate limiting later: `@upstash/ratelimit` + `@upstash/redis`.

### Open Decisions
- **Follows read scope** (documented in `specs/followers-only-visibility.md`): All authenticated users vs. only participants in the relationship. Recommendation: all authenticated users.
- **Block trigger UI** (documented in `specs/user-blocking.md`): Share card three-dot menu in Phase 5 vs. defer to Phase 6 profiles. Recommendation: share card menu.
- **Rate limiting backend** (documented in `specs/rate-limiting.md`): In-memory vs. Upstash Redis vs. middleware. Recommendation: in-memory for Phase 5, document upgrade path.

---

## Phase 6 — Social Graph

Phase 6 builds the social layer: the ability to find, follow, and connect with other users. It introduces profile pages, follow/unfollow mechanics, username search, and invite links for bringing friends into the app. The social layer is intentionally minimal — this is a shared reading list, not a social network.

### Specs

| # | Spec File | Concern | Summary |
|---|---|---|---|
| 1 | [`specs/user-profile-page.md`](specs/user-profile-page.md) | User profile page | A `/profile/[username]` page showing a user's identity, social stats (follower/following counts), follow/block state, and their current active share. The anchor for social interactions. |
| 2 | [`specs/follow-unfollow.md`](specs/follow-unfollow.md) | Follow/unfollow mechanics | `followUser` and `unfollowUser` server actions, a reusable `FollowButton` component with optimistic updates, and integration with Phase 5 blocking. |
| 3 | [`specs/username-search.md`](specs/username-search.md) | Username search | A `/search` page with live-as-you-type search across usernames (prefix) and display names (substring). Returns matching profiles with follow status. |
| 4 | [`specs/invite-links.md`](specs/invite-links.md) | Invite links | Username-based invite URLs (`/invite/[username]`) with a public landing page for unauthenticated visitors. Post-signup flow directs new users to the inviter's profile to follow them. |

### Recommended Build Order

1. **Follow/Unfollow** — Server actions and `FollowButton` component. No UI host needed yet (can be tested standalone). Foundation for everything else in this phase.
2. **User Profile Page** — The primary surface for social interactions. Depends on `FollowButton`. Also renders `ShareCard` (from Phase 4) for the user's active share.
3. **Username Search** — Depends on `FollowButton` for search result actions and profile page as the navigation target for result clicks.
4. **Invite Links** — Depends on the profile page as the post-signup redirect target. Requires minor modifications to existing signup and onboarding actions to pass through the invite parameter.

### Data Model Changes
None. Phase 6 uses existing tables:
- `profiles` (Phase 1) — public-read RLS, searchable by username.
- `follows` (Phase 1, updated Phase 5) — follow relationships with block checks on INSERT.
- `blocks` (Phase 5) — block status queries for profile and follow button rendering.
- `shares` (Phase 1, updated Phase 5) — followers-only RLS, timezone-aware active share query.

### New Dependencies (to be installed)
None. Phase 6 uses existing libraries (Next.js, Supabase, Tailwind).

### Modifications to Existing Code
- **Daily view header** (`specs/daily-view-page.md`): Add search icon/link and user menu with "Invite a friend" action.
- **Signup action** (`app/(auth)/signup/actions.ts`): Pass through `invite` query parameter.
- **Onboarding action** (`app/(protected)/onboarding/actions.ts`): Accept optional `inviteUsername`, redirect to profile page when provided.
- **ShareCard sharer header** (`specs/share-card.md`): Make the sharer's name/username a link to `/profile/[username]`. Currently the header is not clickable (profile pages didn't exist).
- **Rate limiting** (`specs/rate-limiting.md`): Add entries for `followUser` (20 req/min), `unfollowUser` (20 req/min), and `searchUsers` (30 req/min).

### Open Decisions
- **Search as page vs. overlay** (documented in `specs/username-search.md`): Dedicated `/search` page vs. dropdown/modal from header. Recommendation: dedicated page for Phase 6, enhance to overlay in Phase 7.
- **Block direction awareness in FollowButton** (documented in `specs/follow-unfollow.md`): Single `isBlocked` boolean vs. `blockStatus` enum. Recommendation: `blockStatus` enum for differentiated UI.
- **Invite tracking** (documented in `specs/invite-links.md`): No tracking (stateless URLs) vs. `referred_by` column on profiles. Recommendation: no tracking for Phase 6.
- **Invite action location** (documented in `specs/invite-links.md`): Header icon vs. user menu vs. own profile. Recommendation: user menu dropdown from header avatar.
- **Blocked users in search results** (documented in `specs/username-search.md`): Show all vs. filter blocked. Recommendation: filter blocked users from results.
- **Unfollow hover state** (documented in `specs/follow-unfollow.md`): "Following" → "Unfollow" on hover vs. static. Recommendation: hover reveals "Unfollow" (Twitter/X pattern).

---

## Phase 7 — Polish and Realtime

Phase 7 makes the app feel alive and native. It adds live feed updates via Supabase Realtime, animations that bring the daily shelf to life, responsive layouts for mobile browsers, and Progressive Web App configuration so the app can be installed on a phone's home screen. Four specs, each covering a single concern.

### Specs

| # | Spec File | Concern | Summary |
|---|---|---|---|
| 1 | [`specs/realtime-feed.md`](specs/realtime-feed.md) | Live feed updates | Supabase Realtime subscription on `shares` for live share appearance. Client-side expiration timers for timezone-aware share removal. Reconnection handling with full feed re-fetch. Visibility-based refresh on tab return. |
| 2 | [`specs/feed-transitions.md`](specs/feed-transitions.md) | Animations and micro-interactions | Staggered entrance on page load, fade+scale entry for realtime shares, fade-out exit for expired shares, hover/press card states. CSS-only (no animation library). Respects `prefers-reduced-motion`. |
| 3 | [`specs/responsive-design.md`](specs/responsive-design.md) | Mobile-first responsive layout | Cross-cutting polish pass for all pages. 44px touch targets, iOS zoom prevention, safe area insets, mobile-compact header, per-page responsive behavior at three breakpoints (mobile/tablet/desktop). |
| 4 | [`specs/pwa-setup.md`](specs/pwa-setup.md) | Progressive Web App | Web app manifest, app icons (standard + maskable + Apple), iOS meta tags, standalone mode considerations. No service worker for Phase 7 (deferred to Phase 10). Dismissable in-app install hint. |

### Recommended Build Order

1. **Responsive Design** — Cross-cutting layout pass that touches all existing pages. Best done first since it establishes the mobile foundation for everything else. No dependencies on other Phase 7 specs.
2. **PWA Setup** — Configuration and metadata. Can be done in parallel with responsive design. Shares the viewport and safe area concerns.
3. **Feed Transitions** — CSS animations for the daily view. Depends on the daily view page (Phase 4) being built. Independent of realtime — the initial load animations and hover states work without realtime.
4. **Realtime Feed** — Supabase Realtime subscription. Depends on the daily view page (Phase 4) and integrates with feed transitions for entry/exit animations. Should be built last since it's the most complex and benefits from having animations ready.

### Data Model Changes
None. Phase 7 is entirely client-side and configuration. No database migrations, no table changes, no new functions.

### New Dependencies (to be installed)
None for the recommended approach. All features use CSS animations, built-in browser APIs, and existing Supabase JS SDK (which includes Realtime).

If the service worker is added later (deferred to Phase 10): `@ducanh2912/next-pwa` or a manual `public/sw.js`.

### Files to Create

| File | Spec |
|---|---|
| `public/manifest.json` | PWA Setup |
| `public/icons/icon-192.png` | PWA Setup |
| `public/icons/icon-512.png` | PWA Setup |
| `public/icons/icon-maskable-192.png` | PWA Setup |
| `public/icons/icon-maskable-512.png` | PWA Setup |
| `public/icons/apple-touch-icon.png` | PWA Setup |
| Client component for realtime feed (e.g., `FeedRealtime.tsx`) | Realtime Feed |
| CSS animation classes (in `globals.css` or component-scoped) | Feed Transitions |

### Modifications to Existing Code
- **Root layout** (`app/layout.tsx`): Add PWA metadata, manifest link, Apple meta tags, viewport-fit.
- **Daily view page** (`app/(protected)/dashboard/page.tsx`): Refactor to pass initial data to a client component for realtime. Add animation classes to share cards.
- **Share card** (`ShareCard` component): Add hover/press CSS transitions, animation state classes.
- **All page layouts**: Apply responsive breakpoint styles, touch target sizing, mobile typography.
- **Global CSS** (`app/globals.css`): Add animation keyframes, reduced-motion media query, overscroll behavior, safe area insets.

### Open Decisions
- **CSS-only vs. animation library** (documented in `specs/feed-transitions.md`): CSS keyframes/transitions vs. Framer Motion. Recommendation: CSS-only.
- **Service worker** (documented in `specs/pwa-setup.md`): Include in Phase 7 vs. defer to Phase 10. Recommendation: defer.
- **iOS status bar style** (documented in `specs/pwa-setup.md`): `default` vs. `black-translucent`. Recommendation: `default`.
- **Bottom navigation** (documented in `specs/responsive-design.md`): Header-only vs. bottom tab bar on mobile. Recommendation: header-only.
- **Sticky CTA approach** (documented in `specs/responsive-design.md`): `position: sticky` vs. `position: fixed` with keyboard awareness. Recommendation: sticky.
- **In-app install hint** (documented in `specs/pwa-setup.md`): Show dismissable banner vs. skip. Recommendation: show once, subtle.
- **Manual refresh in standalone mode** (documented in `specs/pwa-setup.md`): Pull-to-refresh vs. rely on realtime. Recommendation: rely on realtime.
- **RLS and Realtime** (documented in `specs/realtime-feed.md`): Client-side follow filtering now vs. rely on Phase 5 RLS. Recommendation: client-side now, simplify after Phase 5.

---

## Phase 8 — History and Discovery

Phase 8 adds the archive — a way to browse past days and rediscover what people shared last week or last month. It also introduces lightweight discovery patterns that surface connections across shares (same link shared by multiple people, popular sources). This is where the daily constraint starts producing a valuable long-term artifact.

### Specs

| # | Spec File | Concern | Summary |
|---|---|---|---|
| 1 | [`specs/archive-query.md`](specs/archive-query.md) | Historical share data retrieval | `get_archive_shares(p_user_id, p_date)` database function that fetches shares from followed users for a specific past date. No timezone expiration — historical shares are always complete. Mirrors the feed query pattern. |
| 2 | [`specs/archive-page.md`](specs/archive-page.md) | Archive browsing page | The `/archive/[date]` page — date navigation (prev/next arrows, date picker), share grid for the selected date, viewer's own share section, and empty states. The main browsing experience for history. |
| 3 | [`specs/share-patterns.md`](specs/share-patterns.md) | Discovery patterns and insights | Cross-user link overlap badges ("Also shared by Sarah and 2 others") on share cards, and a popular sources summary (top domains in the last 7 days) on the archive page. Lightweight discovery layer. |

### Recommended Build Order

1. **Archive Query** — No UI dependency. Create the database function and migration. Can be tested with mock data. Foundation for the page.
2. **Archive Page** — Depends on the archive query for data. Also reuses `ShareCard` from Phase 4. Can be built and tested with the query in place.
3. **Share Patterns** — Depends on the archive page as the display surface and the archive query for the base data. Supplements the archive with enrichment queries. Can be deferred or built incrementally after the archive page is functional.

### Data Model Changes
One migration required:
- `get_archive_shares(p_user_id UUID, p_date DATE)` — database function (Supabase RPC) for historical share retrieval.
- `get_popular_sources(p_user_id UUID, p_date DATE)` — database function for popular domain aggregation over a 7-day window.

No table schema changes needed.

### New Dependencies (to be installed)
None. Phase 8 uses existing libraries (Next.js, Supabase, Tailwind).

### Modifications to Existing Code
- **Header component** (from `specs/daily-view-page.md`): Add an "Archive" link/icon to the header navigation for access from all protected pages.
- **ShareCard component** (`specs/share-card.md`): Add optional `overlap` prop for the cross-user link overlap badge.
- **Rate limiting** (`specs/rate-limiting.md`): Add entries for archive page loads and pattern queries if needed (these are read-only server-component fetches, so rate limiting is less critical than for mutations).

### Open Decisions
- **Overlap scope** (documented in `specs/share-patterns.md`): All-time vs. rolling window for cross-user link overlap. Recommendation: all-time.
- **Popular sources surface** (documented in `specs/share-patterns.md`): Inline on archive page vs. dedicated discovery page. Recommendation: inline.
- **Domain filtering** (documented in `specs/share-patterns.md`): Clicking a popular source to filter the archive vs. display-only. Recommendation: defer filtering.

---

## Phase 9 — Account Management & Settings

Phase 9 adds the settings infrastructure: profile editing, password changes, blocked user management, and account deletion. It also optionally introduces freeform shares — content without a URL — for books, podcasts, and other offline content. Five specs, each covering a single concern.

### Specs

| # | Spec File | Concern | Summary |
|---|---|---|---|
| 1 | [`specs/settings-profile.md`](specs/settings-profile.md) | Profile editing | The `/settings` page — edit display name, username, and timezone. Also serves as the settings hub with navigation to other sections. Reuses onboarding validation logic. |
| 2 | [`specs/settings-password.md`](specs/settings-password.md) | Password change | The `/settings/password` page — new password + confirmation form. Uses Supabase Auth `updateUser` API. No current password required (session is the proof of identity). |
| 3 | [`specs/settings-blocked-users.md`](specs/settings-blocked-users.md) | Blocked users management | The `/settings/blocked` page — view blocked users list with unblock buttons. Consumes Phase 5 blocking server actions. Optimistic updates on unblock. |
| 4 | [`specs/account-deletion.md`](specs/account-deletion.md) | Account deletion | The `/settings/account` page — danger zone with username-confirmation deletion flow. Uses Supabase Admin API to delete auth user, cascading to all associated data. |
| 5 | [`specs/freeform-shares.md`](specs/freeform-shares.md) | Freeform content sharing | Extends the share creation page with a Link/Freeform toggle. Freeform shares have a title and optional type label (Book, Podcast, etc.) instead of a URL. Optional for Phase 9 — can be deferred. |

### Recommended Build Order

1. **Settings — Profile Editing** — The settings page is the hub for all other settings sections. Must land first since the other pages link back to it. Also establishes the `/settings` route group and layout pattern.
2. **Settings — Password Change** — Standalone form with no data model dependencies. Quick to build, provides immediate value.
3. **Settings — Blocked Users** — Depends on Phase 5 blocking being implemented. Consumes existing server actions; this is purely a UI spec.
4. **Account Deletion** — Requires a new admin Supabase client (`SUPABASE_SERVICE_ROLE_KEY`). Build after the settings hub exists. The destructive nature warrants careful testing.
5. **Freeform Shares** (optional) — The most complex spec — it modifies the share creation flow, the ShareCard component, and requires a migration. Build last, and only if the URL-based sharing loop is validated.

### Data Model Changes

One migration required (for freeform shares only — the other four specs need no schema changes):
- `ALTER TABLE shares ALTER COLUMN content_url DROP NOT NULL` — makes URL optional for freeform entries.
- `ALTER TABLE shares ADD COLUMN content_type TEXT DEFAULT 'link'` — distinguishes URL shares from freeform.
- `ALTER TABLE shares ADD COLUMN freeform_label TEXT` — optional type label for freeform shares.

If freeform shares are deferred, no migration is needed for Phase 9.

### New Code Required

| File | Spec | Purpose |
|---|---|---|
| `lib/supabase/admin.ts` | Account Deletion | Server-only Supabase client using `SUPABASE_SERVICE_ROLE_KEY`. Bypasses RLS for admin operations. |
| `lib/validation.ts` | Settings — Profile | Shared validation logic extracted from onboarding (username format, timezone validation). Avoids duplication between `completeOnboarding` and `updateProfile`. |

### New Dependencies (to be installed)
None. Phase 9 uses existing libraries (Next.js, Supabase, Tailwind).

### Environment Variables
- `SUPABASE_SERVICE_ROLE_KEY` — required for account deletion. Must be set in `.env.local` and the deployment environment. Available from the Supabase dashboard. **Must never be exposed to the client.**

### Modifications to Existing Code
- **Header component** (from `specs/daily-view-page.md`): Add a "Settings" link to the user menu/avatar dropdown.
- **Onboarding action** (`app/(protected)/onboarding/actions.ts`): Extract validation logic into `lib/validation.ts` and import from there. The onboarding action itself doesn't change behavior.
- **Share creation page** (`app/(protected)/share/page.tsx`): Add Link/Freeform mode toggle (freeform shares spec only).
- **ShareCard component** (`specs/share-card.md`): Add freeform rendering variant (freeform shares spec only).
- **`createShare` server action** (`app/(protected)/share/actions.ts`): Extend to handle freeform content type (freeform shares spec only).
- **Rate limiting** (`specs/rate-limiting.md`): Add entries for `updateProfile` (10 req/min), `changePassword` (5 req/min), `deleteAccount` (3 req/min).

### Open Decisions
- **Require current password for password change** (documented in `specs/settings-password.md`): New password only vs. current + new. Recommendation: new password only.
- **Settings page layout** (documented in `specs/settings-profile.md`): Single page with sections vs. sub-routes. Recommendation: sub-routes (`/settings`, `/settings/password`, `/settings/blocked`, `/settings/account`).
- **Freeform label storage** (documented in `specs/freeform-shares.md`): Application-level enum vs. database enum vs. free text. Recommendation: application-level enum (validate in server action, store as plain text).
- **Freeform shares deferral** (documented in `specs/freeform-shares.md`): Build in Phase 9 vs. defer. Recommendation: defer if the core URL sharing loop isn't validated yet.

---

*Phases 1-2 are complete. Phases 3-9 are specced (not yet implemented). Phase 10 is not yet specced.*
