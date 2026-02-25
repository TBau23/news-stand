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

1. ~~**URL Unfurling**~~ ✅ **DONE** — `POST /api/unfurl` route implemented with SSRF protection (`lib/ssrf.ts`), OG metadata extraction (`lib/unfurl.ts`), and comprehensive tests (29 tests passing). Used `node-html-parser` for parsing. Manual DNS resolution + IP check for SSRF prevention.
2. ~~**Share Creation Flow**~~ ✅ **DONE** — `/share` page with 3-step flow (URL entry → preview & note → confirmation). `createShare` server action with timezone-aware `shared_date` computation. Pure validation logic in `lib/shares.ts` with 26 tests. Entry guard redirects to `/share/today` if user already shared today. Redirects to `/share/today` on success.
3. ~~**Today's Share View**~~ ✅ **DONE** — `/share/today` page with entry guard (redirects to `/share` if no share exists). Displays share card with OG metadata and clickable URL. Inline note editing with `updateShareNote` server action (ownership-verified, 280-char limit). Pure `validateNoteUpdate` function in `lib/shares.ts` with 10 tests (36 total in shares.test.ts). `revalidatePath` on save for server component re-render.

### Data Model Changes
None required. The `shares` and `profiles` tables from Phases 1-2 already have all necessary columns.

### New Dependencies (installed)
- `node-html-parser` — lightweight HTML parser for OG metadata extraction in the unfurl endpoint.
- `esbuild-wasm` — (dev) WASM fallback for esbuild in environments where native binary is incompatible.

### Resolved Decisions
- **SSRF prevention approach**: Manual DNS resolution + IP check (option 1). Implemented in `lib/ssrf.ts`. Blocks private/reserved IP ranges, localhost, and validates each redirect hop.
- **HTML parser choice**: `node-html-parser` — lightweight, fast, sufficient for meta tag extraction.

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

1. ~~**Feed Query**~~ ✅ **DONE** — `get_active_feed_shares` database function in `supabase/migrations/20260225000000_add_get_active_feed_shares.sql`. Uses `SECURITY INVOKER` and `LANGUAGE sql STABLE`. TypeScript layer in `lib/feed.ts` with `FeedShare` type, `computeShareExpiration` (pure timezone→UTC expiration), `isShareActive` (pure active check), and `getFeedShares` (Supabase RPC wrapper). RPC type added to `lib/database.types.ts`. 22 tests covering timezone offsets (UTC, ET, PT, JST, IST, NPT), DST transitions (spring forward/fall back), boundary dates (year end, leap year), and default timezone fallback. 87 total tests passing.
2. ~~**Share Card**~~ ✅ **DONE** — Reusable `ShareCard` client component in `components/share-card.tsx`. Pure helper functions (`getTimeOfDayLabel`, `getAvatarColor`, `getInitial`) in `lib/share-card.ts` with 15 tests. Component renders OG metadata (image, title, description, domain), optional sharer header with avatar fallback (initial-letter circle with deterministic color), soft time-of-day label, and quoted note. Content area is a clickable link (`target="_blank"`); sharer header and note are not clickable. Handles three rendering modes: full metadata, partial metadata (graceful omission), and no metadata (domain + "No preview available"). Broken images hidden via `onError`. Exported `ShareCardProps` type for consumers. 102 total tests passing.
3. ~~**Daily View Page**~~ ✅ **DONE** — Replaced the scaffolding `/dashboard` page with the full daily view. Server component fetches feed shares (via `getFeedShares` RPC), user's sharing status, and follow count in parallel. Header with "Dossier" branding, contextual share link (`/share` or `/share/today`), user avatar initial circle, and sign-out dropdown. Share status banner (shared/not shared). Responsive CSS Grid feed (1/2/3 columns at mobile/tablet/desktop). Three empty states: combined welcome (no follows + no share), no-follows, no-shares-today. Error state for feed query failure. Pure helper functions (`getEmptyStateType`, `getShareLink`) in `lib/dashboard.ts` with 9 tests. Loading skeleton in `loading.tsx` for client-side transitions. 111 total tests passing.

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

1. ~~**Followers-Only Visibility**~~ ✅ **DONE** — Pure database migration in `supabase/migrations/20260226000000_followers_only_shares.sql`. Drops public-read SELECT policy on `shares` and replaces with two policies: "Users can read own shares" (`auth.uid() = user_id`) and "Followers can read shares" (EXISTS subquery on `follows`). Drops public-read SELECT policy on `follows` and replaces with authenticated-only (`auth.uid() IS NOT NULL`). Profiles remain publicly readable. No application code changes needed — existing feed query (`SECURITY INVOKER`), share creation guard, today's share view, and daily view all work under the new policies (verified by spec analysis). 111 existing tests still pass.
2. ~~**User Blocking**~~ ✅ **DONE** — Migration in `supabase/migrations/20260227000000_add_blocks_table.sql` creates `blocks` table with composite PK `(blocker_id, blocked_id)`, `no_self_block` constraint, indexes on both columns, and RLS policies (read own blocks, insert as blocker, delete as blocker). Updates `follows` INSERT policy to check for blocks in either direction. Pure validation functions (`isValidUuid`, `validateBlockInput`, `validateUnblockInput`) in `lib/blocking.ts` with `BlockedUser` type. Server actions (`blockUser`, `unblockUser`, `getBlockedUsers`) in `app/(protected)/actions/blocking.ts`. Block insert is ordered before follow deletion for safe failure mode. All operations are idempotent. 25 tests for pure functions. 136 total tests passing.
3. ~~**Rate Limiting**~~ ✅ **DONE** — In-memory sliding window rate limiter in `lib/rate-limit.ts`. Uses a `Map<string, number[]>` with per-key timestamp pruning and periodic background sweep (60s interval, unref'd). Fails open on internal errors. Integrated into all endpoints: `POST /api/unfurl` (30 req/min per user), `createShare` (10 req/min), `updateShareNote` (20 req/min), `blockUser` (10 req/min), `unblockUser` (10 req/min), `completeOnboarding` (5 req/min), `login` (10 req/15min per IP), `signup` (5 req/15min per IP), auth callback (10 req/min per IP). API routes return HTTP 429 with `Retry-After` header. Server actions return `{ error: "..." }`. 21 tests for pure rate limiter logic. 157 total tests passing.

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

1. ~~**Follow/Unfollow**~~ ✅ **DONE** — Pure validation functions (`validateFollowInput`, `validateUnfollowInput`) in `lib/social.ts`, reusing `isValidUuid` from `lib/blocking.ts`. Server actions (`followUser`, `unfollowUser`, `getFollowStatus`, `getBlockStatus`) in `app/(protected)/actions/social.ts` with rate limiting (20 req/min per user for both follow/unfollow). `FollowButton` client component in `components/follow-button.tsx` with optimistic updates via `useTransition`, hover "Unfollow" on "Following" button (Twitter/X pattern), and differentiated block states via `blockStatus: 'none' | 'viewer_blocked' | 'blocked_by'` enum (not single boolean). Types exported: `FollowResult`, `UnfollowResult`, `BlockStatus`. 18 tests for pure functions. 175 total tests passing.
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

## Phase 10 — Infrastructure Hardening

Phase 10 hardens the app for reliability and performance. It caches unfurl API responses to avoid redundant origin fetches, proxies OG images through the server to eliminate CORS and expiry issues, adds a service worker for faster repeat loads and offline fallback, and profiles + optimizes database queries, bundle size, and rendering. Four specs, each covering a single concern.

### Specs

| # | Spec File | Concern | Summary |
|---|---|---|---|
| 1 | [`specs/unfurl-caching.md`](specs/unfurl-caching.md) | Unfurl response caching | Server-side cache for the unfurl API. Repeated requests for the same URL return cached metadata instantly instead of re-fetching from the origin. Normalized URL keys, 24-hour TTL, bounded in-memory store. |
| 2 | [`specs/image-proxy.md`](specs/image-proxy.md) | OG image proxying | `GET /api/image-proxy?url=...` endpoint that fetches external images server-side and caches them. Eliminates CORS failures, broken images from expired URLs, and slow third-party servers. ShareCard component routes all images through the proxy. |
| 3 | [`specs/service-worker.md`](specs/service-worker.md) | Service worker and offline fallback | Caches static assets (JS, CSS, fonts) for faster repeat loads. Network-first navigation with a custom offline fallback page. Stale-while-revalidate for proxied images. Deferred from Phase 7. |
| 4 | [`specs/performance-optimization.md`](specs/performance-optimization.md) | Performance profiling and optimization | Database query profiling (feed query, archive query), client bundle analysis, rendering optimization (Suspense boundaries, `next/image`, layout shift prevention), and performance monitoring setup. |

### Recommended Build Order

1. **Unfurl Caching** — Self-contained change to the existing unfurl API route. No dependencies on other Phase 10 specs. Quick win for reducing outbound HTTP requests.
2. **Image Proxy** — New API route + ShareCard integration. Can be built in parallel with unfurl caching. Requires extracting SSRF protection into a shared utility (reused from Phase 3 unfurl endpoint).
3. **Performance Optimization** — Cross-cutting audit and targeted fixes. Should be done after the image proxy is in place since `next/image` integration depends on images routing through the proxy. The profiling step determines which optimizations are actually needed.
4. **Service Worker** — Build last. Benefits from having all other optimizations in place so the service worker caches the optimized assets. Also requires the image proxy to be working for the stale-while-revalidate image caching strategy.

### Data Model Changes

#### Definite
None of the four specs require mandatory schema changes.

#### Conditional (performance-driven)
If `EXPLAIN ANALYZE` shows the feed query exceeds the 200ms target for 50 follows:
- `ALTER TABLE shares ADD COLUMN expires_at TIMESTAMPTZ` — precomputed expiration timestamp, indexed for fast feed queries.
- `createShare` server action updated to compute `expires_at` at insert time.
- Backfill migration for existing shares.

This migration is only applied if profiling data justifies it.

### New Dependencies (to be installed)

| Package | Purpose | Spec |
|---|---|---|
| `@ducanh2912/next-pwa` | Service worker generation via Workbox | Service Worker |
| `@next/bundle-analyzer` | Bundle size visualization (dev only) | Performance Optimization |
| `@vercel/analytics` | Real-user performance monitoring (optional) | Performance Optimization |

### Modifications to Existing Code

- **Unfurl API route** (`app/api/unfurl/route.ts`): Add cache check before origin fetch, cache store after successful fetch.
- **ShareCard component** (`specs/share-card.md`): Replace direct `<img src={og_image_url}>` with proxy URLs via `proxyImageUrl()` helper. Optionally switch to `next/image`.
- **SSRF protection**: Extract from unfurl route into a shared `lib/ssrf.ts` utility. Reuse in the image proxy route.
- **Daily view page** (`app/(protected)/dashboard/page.tsx`): Add Suspense boundaries around data-dependent sections.
- **Archive page** (`app/(protected)/archive/[date]/page.tsx`): Add Suspense boundaries.
- **Root layout** (`app/layout.tsx`): Verify font loading strategy (`display: swap`).
- **Next.js config** (`next.config.ts`): Add bundle analyzer wrapper, PWA plugin, and `images.remotePatterns` for the proxy domain.
- **Rate limiting** (`specs/rate-limiting.md`): Add entry for image proxy (60 req/min per user).

### Open Decisions
- **Unfurl cache backend** (documented in `specs/unfurl-caching.md`): In-memory vs. database vs. Upstash Redis. Recommendation: in-memory.
- **Image cache backend** (documented in `specs/image-proxy.md`): Filesystem vs. Supabase Storage vs. in-memory. Recommendation: filesystem.
- **Service worker approach** (documented in `specs/service-worker.md`): `@ducanh2912/next-pwa` vs. manual `public/sw.js`. Recommendation: `@ducanh2912/next-pwa`.
- **Feed query optimization** (documented in `specs/performance-optimization.md`): `expires_at` column vs. partial index vs. no change. Recommendation: profile first, only optimize if needed.
- **`next/image` for OG images** (documented in `specs/performance-optimization.md`): `next/image` with proxy vs. manual `<img>` optimization. Recommendation: `next/image`.
- **Performance monitoring** (documented in `specs/performance-optimization.md`): Vercel Analytics vs. Lighthouse CI vs. both. Recommendation: Vercel Analytics.

---

*Phases 1-5 are complete. Phases 6-10 are specced (not yet implemented).*
