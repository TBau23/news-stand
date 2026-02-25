# Performance Optimization

## Phase
10 — Infrastructure Hardening

## What It Does
Profiles the app's database queries, client bundle size, and rendering performance, then applies targeted optimizations to ensure the app loads quickly and responds snappily — especially on mobile devices with slower connections.

## User-Facing Behavior
The app feels fast. The daily view loads in under 2 seconds on a 4G connection. Share cards render without visible layout shift. Page transitions feel instant. The app uses less mobile data because the JavaScript bundle is smaller and images are appropriately sized.

## Performance Targets

| Metric | Target | Measurement |
|---|---|---|
| Largest Contentful Paint (LCP) | < 2.5s on 4G | Lighthouse, WebPageTest |
| First Input Delay (FID) | < 100ms | Lighthouse |
| Cumulative Layout Shift (CLS) | < 0.1 | Lighthouse |
| Time to Interactive (TTI) | < 3.5s on 4G | Lighthouse |
| Total JS bundle (initial load) | < 150KB gzipped | `next build` output, bundle analyzer |
| Feed query execution time | < 200ms for 50 follows | Supabase query profiler, `EXPLAIN ANALYZE` |
| Image proxy P95 latency | < 500ms (cache hit) | Server-side timing |

These targets align with Google's Core Web Vitals "good" thresholds. The 150KB JS budget is aggressive but achievable for an app with minimal client-side interactivity (most rendering is server-side).

## Area 1: Database Query Optimization

### Feed Query (`get_active_feed_shares`)
The feed query is the most critical — it runs on every daily view page load.

**Profiling steps:**
1. Run `EXPLAIN ANALYZE` on the feed query with realistic data (50+ follows, 30+ active shares).
2. Check for sequential scans, especially on the `shares` table.
3. Measure execution time with cold and warm PostgreSQL caches.

**Potential optimizations:**

#### Index on timezone-aware expiration
The `WHERE (s.shared_date + INTERVAL '1 day') AT TIME ZONE p.timezone > now()` clause involves a computed expression that can't use a simple index. Options:
- **Materialized/stored computed column:** Add a `expires_at TIMESTAMPTZ` column to `shares` that is computed at insert time. Index this column directly. The query becomes `WHERE s.expires_at > now()`.
- **Partial index on recent shares:** `CREATE INDEX idx_shares_recent ON shares (user_id, shared_date) WHERE shared_date >= CURRENT_DATE - INTERVAL '2 days'`. This narrows the scan to recent shares only.

> **Open Decision: Expiration optimization approach.**
> Options:
> 1. **`expires_at` column** — Denormalize the expiration timestamp at insert time. Simplest query, best index support. Requires a migration and updating the `createShare` server action.
> 2. **Partial index** — No schema change, but the index condition must be maintained.
> 3. **No change** — If `EXPLAIN ANALYZE` shows the query is already fast enough (<200ms for 50 follows), skip the optimization.
>
> Recommendation: Profile first. Only add the `expires_at` column if the query exceeds the 200ms target.

#### Archive query (`get_archive_shares`)
Similar to the feed query but for historical dates. Less performance-critical since archive browsing is lower-traffic.

**Profiling steps:**
1. Run `EXPLAIN ANALYZE` for a date 30 days ago with 50 follows.
2. Verify the `shares(shared_date)` index is being used.

### Popular sources query (`get_popular_sources`)
Aggregation over a 7-day window across all followed users' shares.

**Profiling steps:**
1. Run `EXPLAIN ANALYZE` with realistic data.
2. If slow (>500ms), consider caching the result per-user per-day (it only changes once per day).

## Area 2: Client Bundle Optimization

### Bundle Analysis
Run `@next/bundle-analyzer` to identify large modules contributing to the initial JS load.

**Setup:**
```bash
npm install --save-dev @next/bundle-analyzer
```

```ts
// next.config.ts (wrapped with analyzer when ANALYZE=true)
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withBundleAnalyzer(nextConfig);
```

Run: `ANALYZE=true npm run build` — opens a visual treemap of the bundle.

### Common Optimization Targets

**Supabase client:** `@supabase/supabase-js` includes realtime, storage, and other modules. If tree-shaking isn't eliminating unused code, consider importing sub-modules directly:
```ts
// Instead of:
import { createClient } from '@supabase/supabase-js';
// Consider:
import { createClient } from '@supabase/supabase-js/dist/module';
```
Verify this with the bundle analyzer before and after.

**HTML parser (Phase 3):** If `cheerio` was chosen for URL unfurling, it adds ~200KB to the server bundle. This doesn't affect client bundle size (unfurling runs server-side), but affects serverless cold start times. Consider `node-html-parser` (~30KB) if cold starts are slow.

**Date/timezone handling:** If any client-side date libraries were added (e.g., `date-fns`, `luxon`), verify they're tree-shaken. The app should primarily use `Intl.DateTimeFormat` (built-in, zero cost).

### Dynamic Imports
For code that's only needed on specific routes:
- **Share creation form** (URL input, preview, note editor): Only loaded on `/share`. Ensure Next.js code-splits this automatically via the app router.
- **Archive date picker**: Only loaded on `/archive/[date]`. Same — verify code splitting.
- **Settings forms**: Only loaded on `/settings/*`. Verify.

Next.js app router code-splits per route by default, but verify with the bundle analyzer that no shared module is pulling in route-specific code.

### Image Optimization
Share card OG images are the largest visual payload. Optimizations:
- **Next.js `<Image>` component:** Replace `<img>` tags with `next/image` for automatic resizing, format conversion (WebP/AVIF), and lazy loading.
- **Image proxy integration:** The image proxy (from `specs/image-proxy.md`) already improves reliability. Combining it with `next/image` provides both reliability and optimization.
- **Explicit dimensions:** Set `width` and `height` on all images to prevent layout shift (CLS).

> **Open Decision: `next/image` for OG images.**
> Options:
> 1. Use `next/image` with the image proxy URL as the `src`. Requires adding the proxy domain to `next.config.ts` `images.remotePatterns`.
> 2. Keep `<img>` tags with manual `loading="lazy"` and explicit dimensions.
>
> Recommendation: Option 1. `next/image` provides automatic WebP conversion, responsive srcset, and lazy loading with a single component change. Since images route through our proxy (same domain), there's no CORS issue.

## Area 3: Rendering Optimization

### Server Component Utilization
Verify that pages are server components by default. Only the following should be client components:
- Realtime feed subscription (Phase 7)
- Share creation form (interactive state)
- Onboarding form (interactive state)
- Settings forms (interactive state)
- Follow button (optimistic updates)
- Any component using `useState`, `useEffect`, or browser APIs

Everything else (share cards, profile pages, archive views) should be server components that render to HTML on the server.

**Audit:** Search for `'use client'` directives across the codebase. Each one should be justified.

### Streaming and Suspense
Use React Suspense boundaries on the daily view and archive pages to stream content:
```tsx
// app/(protected)/dashboard/page.tsx
import { Suspense } from 'react';

export default function Dashboard() {
  return (
    <>
      <Header />
      <ShareStatus />
      <Suspense fallback={<FeedSkeleton />}>
        <Feed />
      </Suspense>
    </>
  );
}
```

The header and share status render immediately. The feed (which requires a database query) streams in when ready. This improves perceived performance — the user sees the page structure instantly.

### Layout Shift Prevention
- Set explicit `width` and `height` or `aspect-ratio` on all images.
- Use `min-height` on the feed grid container to prevent collapse before share cards load.
- Reserve space for the share status banner (already shared / not shared) to prevent content jumping when it loads.

### Font Loading
The app uses Geist fonts (loaded in `app/layout.tsx`). Verify:
- Fonts are loaded with `display: swap` (text is visible immediately with a fallback font, then swaps to Geist when loaded).
- Fonts are preloaded via `<link rel="preload">` or Next.js font optimization.
- No layout shift from the font swap (Geist and the fallback should have similar metrics).

## Profiling Workflow

### Step 1: Baseline
Before any optimizations:
1. Run Lighthouse on the deployed app (production build, not dev).
2. Record LCP, FID, CLS, TTI, and total bundle size.
3. Run `EXPLAIN ANALYZE` on key queries and record execution times.
4. Run `ANALYZE=true npm run build` and review the bundle treemap.

### Step 2: Identify Bottlenecks
Review the baseline metrics against targets. Prioritize optimizations by impact:
1. Any metric in "poor" range (LCP >4s, CLS >0.25) — fix first.
2. Bundle size over budget — identify the largest modules.
3. Slow queries (>200ms) — add indexes or denormalize.

### Step 3: Apply Optimizations
Make targeted changes. Re-measure after each change to verify improvement and catch regressions.

### Step 4: Ongoing Monitoring
Set up Lighthouse CI or Vercel Analytics to track performance on each deployment. Catch regressions before they reach users.

> **Open Decision: Performance monitoring tool.**
> Options:
> 1. **Vercel Analytics** — Built-in for Vercel deployments. Tracks Core Web Vitals from real users.
> 2. **Lighthouse CI** — Runs Lighthouse in CI on each PR. Catches regressions before merge.
> 3. **Both** — Vercel Analytics for production monitoring, Lighthouse CI for pre-merge checks.
> 4. **Neither** — Rely on manual Lighthouse runs.
>
> Recommendation: Start with Vercel Analytics (zero setup if deploying on Vercel). Add Lighthouse CI if performance regressions become a pattern.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| Bundle analyzer shows no obvious large modules | The app may already be within budget. Document the baseline and move on. |
| `EXPLAIN ANALYZE` shows the feed query is already fast (<50ms) | No database optimization needed. Document the result and move on. |
| `next/image` breaks OG images from the proxy | Ensure the image proxy domain is listed in `next.config.ts` `images.remotePatterns`. If issues persist, fall back to `<img>` with manual optimizations. |
| Font swap causes visible layout shift | Adjust the fallback font metrics to match Geist. Next.js font optimization (from `next/font`) handles this automatically. |
| Suspense boundaries cause content flicker | Adjust the skeleton placeholder to match the final content dimensions closely. Use `min-height` to prevent collapse. |
| Performance regression after an optimization | Revert the change. Each optimization should be a separate, reviewable change. |

## Data Model Changes

### Conditional (only if profiling reveals need)
If the feed query exceeds the 200ms target:
```sql
ALTER TABLE shares ADD COLUMN expires_at TIMESTAMPTZ;

-- Backfill existing shares
UPDATE shares s
SET expires_at = (s.shared_date + INTERVAL '1 day') AT TIME ZONE p.timezone
FROM profiles p
WHERE s.user_id = p.id AND s.expires_at IS NULL;

-- Index for feed query
CREATE INDEX idx_shares_expires_at ON shares (expires_at) WHERE expires_at > now() - INTERVAL '2 days';
```

The `createShare` server action would also need to compute and store `expires_at` at insert time.

**This migration is conditional.** Only apply it if profiling data justifies it.

## New Dependencies

| Package | Purpose | When |
|---|---|---|
| `@next/bundle-analyzer` | Bundle size visualization | Always (dev dependency) |
| `@vercel/analytics` | Real-user performance monitoring | If deploying on Vercel |

## File Structure
```
next.config.ts            # Modified: bundle analyzer wrapper, next/image config
app/(protected)/
  dashboard/page.tsx      # Modified: Suspense boundaries
  archive/[date]/page.tsx # Modified: Suspense boundaries
components/
  ShareCard.tsx           # Modified: next/image, explicit dimensions
```

No new files are created (other than potential migration files). This spec is primarily about modifications to existing code.

## Dependencies
- **All previous phases**: Performance optimization is a cross-cutting pass that touches code from every phase.
- **Image Proxy** (`specs/image-proxy.md`): The `next/image` optimization depends on images routing through the proxy.
- **Feed Query** (`specs/feed-query.md`): The primary target for database optimization.
- **Service Worker** (`specs/service-worker.md`): Contributes to load performance via asset caching. Measure performance with and without the service worker.

## Acceptance Criteria
- [ ] A Lighthouse audit has been run and baseline metrics recorded.
- [ ] LCP is under 2.5 seconds on a simulated 4G connection.
- [ ] CLS is under 0.1 across all pages.
- [ ] Total initial JS bundle is under 150KB gzipped (or documented justification for exceeding).
- [ ] `EXPLAIN ANALYZE` has been run on `get_active_feed_shares` and `get_archive_shares` with realistic data.
- [ ] Feed query executes in under 200ms for 50 follows (or an optimization has been applied).
- [ ] `@next/bundle-analyzer` is installed and `ANALYZE=true npm run build` works.
- [ ] All OG images use `next/image` (or explicit `width`/`height`/`loading="lazy"` on `<img>` tags).
- [ ] The daily view and archive pages use Suspense boundaries for data-dependent sections.
- [ ] No unnecessary `'use client'` directives exist (audit completed).
- [ ] Font loading does not cause visible layout shift.
- [ ] Performance monitoring is set up (Vercel Analytics or equivalent).
