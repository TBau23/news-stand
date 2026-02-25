# Unfurl Response Caching

## Phase
10 — Infrastructure Hardening

## What It Does
Caches the results of URL unfurling server-side so that repeated requests for the same URL avoid redundant fetches to the origin server. When two users share the same article, or one user retries after a UI hiccup, the second unfurl request returns instantly from cache instead of making another outbound HTTP request.

## User-Facing Behavior
From the user's perspective, nothing changes. The unfurl preview still appears after pasting a URL. The difference is speed: cached URLs return in single-digit milliseconds instead of the 1-5 seconds an origin fetch takes. Cache hits feel instantaneous.

## How It Works

### Cache Layer
A server-side cache sits between the `POST /api/unfurl` route handler and the outbound HTTP fetch. Before fetching a URL from the origin, the handler checks the cache. On a hit, it returns the cached metadata immediately. On a miss, it fetches from the origin, stores the result, and returns it.

### Cache Key
The cache key is the **normalized URL**. Normalization:
1. Parse with `new URL(url)`.
2. Remove trailing slashes from the pathname.
3. Sort query parameters alphabetically.
4. Remove fragment (`#...`).
5. Lowercase the scheme and hostname.

This ensures `https://example.com/article` and `https://example.com/article/` produce the same cache key.

### Cache Entry Shape
```ts
type CachedUnfurl = {
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  url: string;
  cached_at: number;  // Date.now() timestamp
};
```

### TTL (Time to Live)
Cached entries expire after **24 hours**. OG metadata rarely changes within a day, and the app's daily cadence means most shares happen within hours of the unfurl. After expiry, the next request re-fetches from the origin.

### Cache Failures
If the origin fetch failed (timeout, DNS error, non-HTML response), the error result is **not** cached. Only successful unfurl results (HTTP 200 with parseable HTML) are cached. This ensures transient failures don't poison the cache.

## Implementation Approach

### Option A: In-Memory Cache (Recommended for Phase 10)
Use a `Map<string, CachedUnfurl>` in the same module as the unfurl handler. Simple, zero dependencies, matches the in-memory rate limiter pattern from Phase 5.

**Pros:** No external dependency, instant reads, sufficient for a single-server deployment.
**Cons:** Lost on server restart, per-instance in serverless (Vercel), no shared state across function invocations.

### Option B: Database Cache
Store unfurl results in a new `unfurl_cache` table. Durable across restarts and shared across instances.

**Pros:** Persistent, shared across all serverless instances.
**Cons:** Adds a DB round-trip per unfurl request (even cache hits), requires a migration, needs a cleanup job for expired entries.

### Option C: Upstash Redis
Use Upstash Redis for a distributed, persistent cache with built-in TTL support.

**Pros:** Fast (edge-deployed Redis), persistent, shared, built-in TTL expiry.
**Cons:** External service dependency, adds latency (Redis round-trip), cost.

> **Open Decision: Cache backend.**
> Options:
> 1. **In-memory** (Option A) — Start here. Matches the pattern established by the Phase 5 rate limiter. For a small-scale app, the per-instance limitation is acceptable since the primary benefit is reducing redundant fetches within the same function instance's lifetime.
> 2. **Database** (Option B) — More durable but slower per-hit.
> 3. **Upstash Redis** (Option C) — Best performance/durability balance, but adds infrastructure.
>
> Recommendation: Option A (in-memory) to start. If the app scales to multiple active serverless instances and cache hit rates are low, upgrade to Upstash Redis.

### In-Memory Implementation Detail

```ts
// lib/unfurl-cache.ts

const cache = new Map<string, CachedUnfurl>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getCachedUnfurl(url: string): CachedUnfurl | null {
  const key = normalizeUrl(url);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cached_at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedUnfurl(url: string, data: CachedUnfurl): void {
  const key = normalizeUrl(url);
  cache.set(key, { ...data, cached_at: Date.now() });
}

function normalizeUrl(raw: string): string {
  const parsed = new URL(raw);
  // Remove fragment
  parsed.hash = '';
  // Remove trailing slash
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  // Sort query params
  parsed.searchParams.sort();
  return parsed.toString().toLowerCase();
}
```

### Memory Cleanup
Run a periodic sweep (every 10 minutes) to evict expired entries, preventing unbounded growth. Same pattern as the Phase 5 rate limiter cleanup.

### Max Cache Size
Cap the in-memory cache at **1,000 entries**. When the cap is reached, evict the oldest entry (by `cached_at`). This bounds memory usage to a predictable amount (~500KB for 1,000 entries with average metadata sizes).

## Integration with Existing Unfurl Route

The change to `app/api/unfurl/route.ts` is minimal:

```ts
// Before the origin fetch:
const cached = getCachedUnfurl(url);
if (cached) {
  return Response.json(cached);
}

// After a successful origin fetch + parse:
const result = { title, description, image_url, site_name, url };
setCachedUnfurl(url, result);
return Response.json(result);
```

The cache check happens **after** authentication and rate limiting, so unauthenticated or rate-limited requests never hit the cache.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| Same URL unfurled by two users in quick succession | First request fetches from origin and caches. Second request (on the same instance) returns from cache. On different serverless instances, both fetch from origin (acceptable for in-memory). |
| URL returns different metadata on re-fetch (page updated) | Stale metadata served until TTL expires. 24-hour TTL is acceptable since shares are daily. |
| Cache entry exists but origin site changed OG tags | User sees the previously cached metadata. This is expected — the unfurl is a snapshot, not a live mirror. |
| Origin fetch fails for a URL that was previously cached | The stale cached result is not affected. The failure is returned to the current requester (failures are not cached). |
| URL with query parameters in different order | Normalization sorts query params, so `?b=2&a=1` and `?a=1&b=2` produce the same cache key. |
| URL with fragment | Normalization strips fragments, so `example.com/page#section` and `example.com/page` are the same key. |
| URL with mixed case | Normalization lowercases, so `Example.COM/Page` and `example.com/page` are the same key. |
| Cache reaches 1,000 entries | Oldest entry is evicted. No error, no performance degradation. |
| Server restart (in-memory cache lost) | Cache starts empty. First requests for each URL fetch from origin. Acceptable — the cache is an optimization, not a requirement. |

## Data Model Changes
None. The cache is entirely in application memory. No database tables or migrations.

## File Structure
```
lib/
  unfurl-cache.ts    # getCachedUnfurl(), setCachedUnfurl(), normalizeUrl(), cleanup
```

## Dependencies
- **URL Unfurling API** (`specs/url-unfurling.md`): The cache wraps the existing unfurl handler.
- **No external dependencies** for the in-memory approach.

## Acceptance Criteria
- [ ] A cache module exists at `lib/unfurl-cache.ts` with get/set/normalize functions.
- [ ] The unfurl API route checks the cache before fetching from the origin.
- [ ] Cached results are returned immediately without an outbound HTTP request.
- [ ] Cache entries expire after 24 hours (configurable TTL).
- [ ] Only successful unfurl results are cached (failures are not cached).
- [ ] URL normalization produces consistent cache keys regardless of trailing slashes, fragment, query param order, or case.
- [ ] The cache is bounded at 1,000 entries with LRU-style eviction.
- [ ] A periodic cleanup sweep removes expired entries.
- [ ] The cache does not interfere with authentication or rate limiting (those checks happen first).
- [ ] The unfurl API response shape is identical for cached and uncached results.
