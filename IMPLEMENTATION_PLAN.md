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

*Phases 1-2 are complete. Phases 3-4 are specced (not yet implemented). Phase 5 is specced. Phases 6-10 are not yet specced.*
