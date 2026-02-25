# Share Patterns — Discovery Insights

## Phase
8 — History and Discovery

## What It Does
Surfaces patterns across historical shares that make the archive more than a flat list. Detects when the same link was shared by multiple people, identifies frequently shared sources (domains), and displays these insights inline on the archive page.

## User-Facing Behavior
When browsing the archive, the user notices small signals that connect shares across people and time. A share card might show "Also shared by Sarah and 2 others." A sidebar or summary section on the archive page might highlight "Most shared source this week: nytimes.com (8 shares)." These patterns turn the archive into a discovery tool — you can see what your network collectively found interesting.

## Pattern Types

### 1. Cross-User Link Overlap
When the same URL (`content_url`) was shared by multiple people the user follows, surface this on the share card.

**Display:** A subtle badge or line below the card content:
- "Also shared by [name]" (1 other person)
- "Also shared by [name] and [name]" (2 others)
- "Also shared by [name] and N others" (3+ others)

**Scope:** All-time overlap, not limited to a single date. If Sarah shared a link on Feb 10 and Tom shared the same link on Feb 18, the overlap is surfaced on both dates when the viewer encounters either share.

**Query Logic:**
```sql
-- Given a set of share IDs currently displayed, find overlapping shares.
-- Run AFTER the archive query returns results.
SELECT
  s.content_url,
  s.user_id,
  p.username,
  p.display_name,
  s.shared_date
FROM shares s
JOIN follows f ON s.user_id = f.following_id
JOIN profiles p ON s.user_id = p.id
WHERE f.follower_id = $1                -- current user
  AND s.content_url = ANY($2)           -- URLs from currently displayed shares
  AND s.id != ALL($3)                   -- exclude the currently displayed share IDs
ORDER BY s.shared_date DESC
```

This is a supplementary query — it runs after the main archive query and enriches the displayed cards. It does NOT need to be a database function; the Supabase query builder can handle it.

### 2. Popular Sources Summary
Aggregate shares by domain over a rolling time window to show which sources are most shared among the people you follow.

**Display:** A summary section on the archive page (below the date nav, above or beside the grid):
- "Popular this week" or "Top sources" heading.
- List of 3-5 top domains with share counts.
- Each domain entry: "nytimes.com — 8 shares" or "youtube.com — 5 shares".
- Clickable: tapping a domain could filter the archive to shares from that domain (deferred — see Open Decisions).

**Time Window:** Last 7 days from the currently viewed archive date. This gives temporal context — "what was popular around this date" rather than all-time stats.

**Query Logic:**
```sql
SELECT
  s.og_site_name,
  count(*) AS share_count
FROM shares s
JOIN follows f ON s.user_id = f.following_id
WHERE f.follower_id = $1
  AND s.shared_date BETWEEN ($2 - INTERVAL '6 days')::date AND $2
GROUP BY s.og_site_name
HAVING count(*) > 1
ORDER BY share_count DESC
LIMIT 5
```

Where `$2` is the currently viewed archive date.

**Fallback:** When `og_site_name` is null, extract the domain from `content_url`. This means the query should normalize to domain when `og_site_name` is missing. A database function handles this cleanly:

```sql
CREATE OR REPLACE FUNCTION get_popular_sources(p_user_id UUID, p_date DATE)
RETURNS TABLE (
  source_name TEXT,
  share_count BIGINT
) AS $$
  SELECT
    COALESCE(s.og_site_name, regexp_replace(s.content_url, '^https?://([^/]+).*', '\1')) AS source_name,
    count(*) AS share_count
  FROM shares s
  JOIN follows f ON s.user_id = f.following_id
  WHERE f.follower_id = p_user_id
    AND s.shared_date BETWEEN (p_date - INTERVAL '6 days')::date AND p_date
  GROUP BY source_name
  HAVING count(*) > 1
  ORDER BY share_count DESC
  LIMIT 5;
$$ LANGUAGE sql STABLE;
```

## What This Spec Does NOT Include

The init spec mentions patterns like "Sarah has shared 3 articles from this author." Per-user source analysis, author tracking, and personalized recommendations are deferred. They require more complex aggregation, dedicated UI surfaces (profile stats, recommendation panels), and more historical data to be useful. They are better suited for a future phase once the archive has been in use and the most valuable patterns become clear.

Specifically deferred:
- **Per-user source frequency** ("Sarah shares a lot from nytimes.com") — better surfaced on profile pages, not the archive.
- **Author-level tracking** — requires extracting author info from OG metadata, which the current schema doesn't store.
- **Trend detection** ("This link is trending today") — requires more users and data volume to be meaningful.
- **Domain filtering in archive** — tapping a popular source to filter the archive to that domain. Could be added as a follow-up to this spec.

## Component Integration

### ShareCard Enhancement
The `ShareCard` component (from `specs/share-card.md`) needs to accept an optional `overlap` prop for the cross-user badge:

```tsx
interface ShareCardProps {
  share: { /* existing */ };
  sharer?: { /* existing */ };
  overlap?: {
    users: Array<{ username: string; display_name: string | null }>;
  };
}
```

When `overlap` is provided and `overlap.users.length > 0`, render the "Also shared by..." line below the note section (or below the content if no note).

### PopularSources Component
A new presentational component for the popular sources summary:

```tsx
interface PopularSourcesProps {
  sources: Array<{
    source_name: string;
    share_count: number;
  }>;
  dateLabel: string; // e.g., "this week"
}
```

Renders as a compact horizontal list or a small card. Designed to sit in the archive page between the date nav and the grid.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| No cross-user overlaps for any displayed share | No overlap badges rendered. No indication of the feature — it only appears when relevant. |
| Overlap query returns many results for one URL | Cap display at 3 names ("Also shared by A, B, and 5 others"). |
| Popular sources query returns no results (no source shared more than once) | Omit the popular sources section entirely. No "no data" message. |
| `og_site_name` is null for all shares | Domain extracted from `content_url` is used as the source name. |
| `content_url` is malformed (can't extract domain) | Use the raw `content_url` as the source name. Unlikely given Phase 3 validation. |
| Overlap query is slow (many shares, many URLs) | The overlap query only runs for URLs in the current page's results (max ~50 URLs). This bounds the `ANY($2)` clause. If still slow, add an index on `shares(content_url)`. |
| Popular sources window has very few days of data (new user or app) | The query works with any number of days in the window. If only 2 days of data exist, results reflect just those 2 days. The heading can adapt: "Popular recently" instead of "Popular this week." |
| The viewer's own shares | The viewer's own shares are NOT included in overlap or popular sources queries (they're fetched separately by the archive page). Cross-user overlap means other people — not yourself. |

## Data Model Changes

### New Migration Required
Create the `get_popular_sources` database function. No table changes needed.

### Index Consideration
The overlap query uses `content_url = ANY(...)` across the `shares` table filtered by follows. If performance is an issue, consider an index on `shares(content_url)`. However, the query is bounded by the number of URLs on the current page (max ~50), so performance should be acceptable without a new index.

## UI States

### Overlap Badge (on ShareCard)
- **Has overlap:** "Also shared by..." line in muted text below the note/content.
- **No overlap:** Nothing rendered. No placeholder.

### Popular Sources Section (on Archive Page)
- **Has data (2+ results):** Section visible with heading and source list.
- **Has data (1 result):** Still show it — "nytimes.com — 3 shares this week" is useful even as a single entry.
- **No data:** Section hidden entirely.
- **Loading:** The section can load after the main grid (secondary data). A subtle shimmer placeholder or no placeholder — the grid is the primary content.
- **Error:** Silently omit the section. Popular sources is supplementary — a failure here should not block the archive page.

## Dependencies
- **Archive Query** (`specs/archive-query.md`): Provides the base share data that patterns are computed from.
- **Archive Page** (`specs/archive-page.md`): Host page where patterns are displayed.
- **Share Card** (`specs/share-card.md`): Needs an `overlap` prop extension for the cross-user badge.
- **Phase 5 (RLS)**: Followers-only visibility ensures pattern queries only include shares from followed users.

## Open Decisions

> **Open Decision: Overlap scope — all-time vs. rolling window.**
> Options:
> 1. All-time: Show overlap if the same URL was ever shared by another followed user.
> 2. Rolling window (e.g., 30 days): Only show overlap within a recent timeframe.
>
> Recommendation: All-time. Link overlap is rare enough that showing all-time connections is more useful than restricting to recent. If the same nytimes article was shared 6 months apart by two friends, that's an interesting signal worth surfacing.

> **Open Decision: Popular sources — archive page vs. dedicated discovery page.**
> Options:
> 1. Inline on the archive page as a summary section.
> 2. Dedicated `/discover` page with expanded analytics.
>
> Recommendation: Inline on the archive page. Keep it lightweight for Phase 8. A dedicated discovery page can be added later if usage data shows demand.

> **Open Decision: Domain filtering in archive.**
> When the user taps a popular source domain, should the archive filter to only show shares from that domain?
> Options:
> 1. Yes — add a `?source=nytimes.com` query parameter to filter the archive grid.
> 2. No — popular sources are informational only, no click action.
>
> Recommendation: Defer filtering to a follow-up. For Phase 8, popular sources are display-only. Filtering adds URL state management and query complexity that can be layered on later.

## Acceptance Criteria
- [ ] Cross-user overlap is detected when the same URL was shared by multiple followed users.
- [ ] Overlap badge appears on share cards as "Also shared by [names]".
- [ ] Overlap badge handles 1, 2, and 3+ other sharers with appropriate formatting.
- [ ] Overlap badge is not shown when there are no other sharers.
- [ ] Popular sources section displays top domains shared by followed users in the last 7 days.
- [ ] Popular sources handles null `og_site_name` by extracting domain from URL.
- [ ] Popular sources section is hidden when no domain has more than one share.
- [ ] Popular sources failure does not block the archive page from rendering.
- [ ] Overlap query is bounded by the current page's URLs (performance guard).
- [ ] ShareCard component accepts optional `overlap` prop without breaking existing usage.
- [ ] Popular sources section renders as a compact summary (not a full-page feature).
