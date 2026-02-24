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

*Phases 1-2 are complete. Phases 4-10 are not yet specced.*
