# Image Proxy

## Phase
10 — Infrastructure Hardening

## What It Does
Proxies external OG images through a server-side endpoint so that share cards display images reliably. Instead of the client browser fetching images directly from third-party servers (which may block cross-origin requests, expire, or load slowly), the app fetches images through its own endpoint that handles these problems.

## User-Facing Behavior
Share card images load reliably. Images that would previously show as broken (due to CORS restrictions, hotlink protection, or expired URLs) now display correctly. Images load faster on repeat views because they're served from a cached proxy rather than the original slow third-party server.

When an image genuinely doesn't exist (404 from origin, permanently removed), the share card gracefully hides the image area (existing fallback behavior from the ShareCard component).

## Why This Is Needed

### Problem 1: CORS and Hotlink Protection
Many websites block cross-origin image requests or restrict hotlinking. The browser's `<img>` tag sends an `Origin` header, and the remote server may return a 403 or a "hotlink denied" placeholder. Proxying through our server avoids this because the server-side fetch doesn't send browser-specific headers.

### Problem 2: Expired or Rotated URLs
OG image URLs may use CDN paths that expire (signed URLs, time-limited tokens). Since we store the OG image URL at share creation time and display it hours or days later (archive views), the URL may no longer work when the user views the share card.

### Problem 3: Slow Third-Party Servers
Some origin servers are slow to respond, causing share card images to load noticeably after the text content. A caching proxy serves previously fetched images quickly.

## API Route

### `GET /api/image-proxy`

**Authentication:** Required (the user must be logged in). Reject unauthenticated requests with 401.

**Query parameter:**
```
GET /api/image-proxy?url=https://example.com/og-image.jpg
```

**Validation:**
- `url` must be present and non-empty.
- `url` must be a valid URL (parseable by `new URL()`).
- `url` scheme must be `http` or `https`.
- Return 400 for invalid input.

**Server-side fetch logic:**
1. Check the image cache for the normalized URL. On a hit, return the cached image bytes with the stored content type.
2. On a miss, fetch the URL with a timeout of 10 seconds.
3. Set a `User-Agent` header (e.g., `Memo/1.0 bot`).
4. Validate the response:
   - Status must be 2xx.
   - `Content-Type` must start with `image/` (reject non-image responses).
   - `Content-Length` (if present) must be under 5MB.
5. Read the response body up to 5MB. Abort if exceeded.
6. Store the image bytes and content type in the cache.
7. Return the image bytes with appropriate headers.

**Success response (200):**
- `Content-Type`: The original image's content type (e.g., `image/jpeg`, `image/png`, `image/webp`).
- `Cache-Control`: `public, max-age=86400, stale-while-revalidate=604800` (1-day fresh, 7-day stale-while-revalidate).
- Body: The raw image bytes.

**Error responses:**
- 400: Invalid or missing URL, disallowed scheme.
- 401: Not authenticated.
- 404: Origin returned 404 or non-image content type.
- 502: Origin fetch failed (timeout, network error, non-2xx status).

## Security Considerations

### SSRF Prevention
The image proxy fetches user-influenced URLs server-side, creating the same SSRF risk as the unfurl endpoint. Apply the same mitigations:
- Block private/reserved IP ranges after DNS resolution.
- Block `localhost` and hostnames resolving to blocked IPs.
- Do not follow redirects to blocked IPs.
- Limit redirect count to 3.

Reuse the SSRF protection logic from the unfurl endpoint (Phase 3). Extract it into a shared utility if not already shared.

### Content-Type Enforcement
Only proxy responses with `Content-Type` starting with `image/`. This prevents the proxy from being used to fetch arbitrary content types (HTML, JSON, etc.) which could lead to content injection attacks.

### Size Limit
The 5MB limit prevents the proxy from being used to download large files or consume excessive memory/bandwidth.

### URL Allowlist (Optional)
Consider restricting the proxy to URLs from domains that appeared in OG metadata from actual shares. This prevents abuse of the proxy as a general-purpose image fetcher. However, this adds complexity and is not required for Phase 10.

## Image Caching

### Cache Layer
The image proxy caches fetched images to avoid repeated origin fetches. The cache stores the raw image bytes and content type.

### Cache Entry Shape
```ts
type CachedImage = {
  bytes: Buffer;
  contentType: string;
  cached_at: number;
};
```

### Implementation Approach

#### Option A: Filesystem Cache (Recommended)
Store cached images on the local filesystem in a temporary directory (e.g., `/tmp/dossier-image-cache/`). The filename is a hash of the normalized URL.

**Pros:** Simple, large storage capacity (disk is cheap), survives process restarts on traditional servers.
**Cons:** Per-instance in serverless (Vercel's `/tmp` is ephemeral per invocation), no shared state.

#### Option B: Supabase Storage
Upload proxied images to a Supabase Storage bucket. Serve them via Supabase's CDN.

**Pros:** Persistent, shared across all instances, CDN-accelerated, built into the existing stack.
**Cons:** Storage costs, more complex implementation (upload + URL generation), requires Supabase Storage setup.

#### Option C: In-Memory Cache
Store image bytes in a `Map`. Same pattern as unfurl caching.

**Pros:** Fastest access, simplest implementation.
**Cons:** High memory usage (images are large), limited capacity, lost on restart.

> **Open Decision: Image cache backend.**
> Options:
> 1. **Filesystem** (Option A) — Reasonable for non-serverless deployments. On Vercel, `/tmp` is ephemeral but still provides within-invocation caching.
> 2. **Supabase Storage** (Option B) — Best for durability and CDN performance. Adds operational complexity.
> 3. **In-memory** (Option C) — Only viable with strict size limits (e.g., 50 images max).
>
> Recommendation: Option A (filesystem) for simplicity. If deploying on Vercel where `/tmp` is ephemeral, the proxy still works (just without persistent caching — each cold start re-fetches). Upgrade to Supabase Storage if image reliability becomes a user-reported issue.

### Cache TTL
Cached images expire after **7 days**. OG images change infrequently, and the longer TTL reflects this. A daily cleanup job removes expired files.

### Cache Size Limit
Cap total cache size at **500MB**. When the limit is reached, evict the oldest entries. Monitor actual usage — OG images are typically 50-200KB, so 500MB holds 2,500-10,000 images.

## Integration with ShareCard

### URL Rewriting
The ShareCard component currently renders OG images via:
```tsx
<img src={share.og_image_url} />
```

Change this to route through the proxy:
```tsx
<img src={`/api/image-proxy?url=${encodeURIComponent(share.og_image_url)}`} />
```

This change is made in the ShareCard component. No database changes needed — `og_image_url` still stores the original URL from the origin.

### Helper Function
Create a utility to generate proxy URLs:
```ts
// lib/image-proxy-url.ts
export function proxyImageUrl(originalUrl: string | null): string | null {
  if (!originalUrl) return null;
  return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
}
```

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| Origin image returns 404 | Proxy returns 404. ShareCard hides the image area (existing fallback behavior). |
| Origin image is very large (>5MB) | Proxy aborts the fetch after 5MB, returns 502. ShareCard falls back to no-image layout. |
| Origin returns non-image content type | Proxy returns 404. Prevents serving unexpected content through the image endpoint. |
| Origin is slow (>10s) | Proxy aborts, returns 502. ShareCard falls back to no-image layout. |
| Same image requested by multiple users simultaneously | First request fetches and caches. Subsequent requests (on the same instance) serve from cache. On different instances, each fetches independently. |
| Cached image is stale but origin is now unreachable | The `stale-while-revalidate` Cache-Control header allows the browser to use the stale version while attempting to revalidate in the background. On the server side, the cached copy is served until its 7-day TTL expires. |
| `og_image_url` was a `data:` URI (should have been filtered in Phase 3) | Proxy validation rejects non-http(s) schemes with 400. ShareCard falls back. |
| User requests a URL not from any share (abuse attempt) | The proxy fetches and returns it (if it's a valid image). The authentication requirement and rate limiting (from Phase 5) mitigate bulk abuse. An optional URL allowlist can be added later. |
| Image cache directory doesn't exist on startup | Create it on first write. |
| Disk is full (filesystem cache) | Filesystem write fails silently. The image is still served from the origin fetch. Log the error. |

## Data Model Changes
None. Image caching is application-layer. The `og_image_url` column on `shares` continues to store the original URL from the origin.

## File Structure
```
app/
  api/
    image-proxy/
      route.ts         # GET handler with auth, SSRF check, fetch, cache
lib/
  image-cache.ts       # Filesystem cache: get, set, cleanup, size management
  image-proxy-url.ts   # proxyImageUrl() helper for components
```

## Dependencies
- **ShareCard component** (`specs/share-card.md`): Modified to use proxy URLs for images.
- **SSRF protection** (from `specs/url-unfurling.md`): Shared utility for blocking private IPs.
- **Rate limiting** (`specs/rate-limiting.md`): Add entry for the image proxy endpoint (60 req/min per user — images load in parallel when the feed renders).
- **Authentication**: Required to prevent unauthenticated abuse.

## Acceptance Criteria
- [ ] `GET /api/image-proxy?url=...` exists and requires authentication.
- [ ] The endpoint fetches the requested image from the origin server and returns the bytes.
- [ ] Responses include `Content-Type` matching the origin image and `Cache-Control` headers.
- [ ] Non-image responses from the origin are rejected (returns 404).
- [ ] Images larger than 5MB are rejected.
- [ ] SSRF protections block private/reserved IP addresses.
- [ ] Fetched images are cached (filesystem or equivalent) with a 7-day TTL.
- [ ] Cached images are served without re-fetching from the origin.
- [ ] The ShareCard component uses proxy URLs instead of direct OG image URLs.
- [ ] A `proxyImageUrl()` helper generates proxy URLs from original image URLs.
- [ ] Broken or missing images are handled gracefully (ShareCard falls back to no-image layout).
- [ ] The endpoint is rate-limited (60 req/min per user).
