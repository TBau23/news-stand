# Service Worker

## Phase
10 — Infrastructure Hardening

## What It Does
Adds a service worker that caches static app assets (JavaScript bundles, CSS, fonts, icons) and provides a custom offline fallback page. This was deferred from Phase 7 (PWA Setup) to be implemented alongside the broader infrastructure hardening work.

## User-Facing Behavior
The app loads faster on repeat visits because static assets are served from the service worker cache instead of the network. If the user opens the app with no network connection (e.g., in airplane mode or a dead zone), they see a custom offline page ("You're offline. Connect to the internet to use Dossier.") instead of the browser's default "No internet" error. When connectivity returns, the app resumes normally.

The service worker does **not** enable full offline functionality. The app requires Supabase for authentication and data — without a network, the user can't browse the feed or create shares. The service worker's value is faster repeat loads and a graceful offline experience.

## Caching Strategy

### Pre-Cache (Install Time)
On service worker install, pre-cache:
- The offline fallback page (`/offline`)
- App icons referenced in the manifest
- The web app manifest (`/manifest.json`)

Pre-cached assets are available immediately after the service worker installs, even without a network.

### Runtime Cache: Static Assets
Cache Next.js static assets (`/_next/static/**`) using a **cache-first** strategy:
1. Check the service worker cache for the asset.
2. If found, return from cache.
3. If not found, fetch from the network, cache the response, and return it.

Next.js static assets include content-hashed filenames (e.g., `_next/static/chunks/app-abc123.js`), so cache-first is safe — a new build produces new filenames, and old cached assets are never served for the new build.

### Runtime Cache: Navigation Requests
Handle navigation requests (HTML pages) using a **network-first** strategy:
1. Try to fetch from the network.
2. If the network responds, return the response (and optionally cache it).
3. If the network fails (offline, timeout), return the cached offline fallback page.

This ensures users always get the latest page content when online, but see the offline page instead of a browser error when offline.

### Runtime Cache: Image Proxy
Cache responses from `/api/image-proxy` using a **stale-while-revalidate** strategy:
1. Return the cached response immediately (if available).
2. In the background, fetch the latest version from the network and update the cache.

This gives instant image loads on revisits while keeping images relatively fresh.

### Do NOT Cache
- Supabase API calls (`*.supabase.co/*`)
- Authentication endpoints and tokens
- Server actions (`POST` requests to app routes)
- The unfurl API (`/api/unfurl`)

These are dynamic, session-specific, or mutation endpoints. Caching them would produce stale or incorrect data.

## Implementation Approach

### Option A: `@ducanh2912/next-pwa` (Recommended)
A maintained Next.js plugin that auto-generates a Workbox-based service worker. It handles:
- Pre-caching of Next.js build output
- Runtime caching strategies (configurable per route pattern)
- Cache versioning tied to the Next.js build hash
- Automatic cache cleanup on new deployments

**Pros:** Minimal configuration, handles Next.js-specific caching correctly (build hashes, route manifests), well-maintained.
**Cons:** External dependency, generated service worker is less transparent than hand-written.

### Option B: Manual `public/sw.js`
A hand-written service worker in `public/sw.js` with explicit `fetch` event handling and `Cache` API usage.

**Pros:** Full control, no dependency, transparent.
**Cons:** Must manually handle cache versioning and invalidation, easy to get wrong (stale caches are the #1 service worker pitfall), must track Next.js build hashes manually.

> **Open Decision: Service worker approach.**
> Options:
> 1. **`@ducanh2912/next-pwa`** (Option A) — Handles the hard parts (cache invalidation, build integration) automatically.
> 2. **Manual** (Option B) — Full control but higher maintenance burden.
>
> Recommendation: Option A. Service worker cache invalidation is notoriously tricky, and `@ducanh2912/next-pwa` solves this with Workbox integration. The plugin is lightweight and its configuration is declarative.

## Offline Fallback Page

### Route: `/offline`
A simple, static page that displays when the user is offline and the requested page is not cached.

**Content:**
- App icon (pre-cached)
- Heading: "You're offline"
- Body: "Connect to the internet to use Dossier."
- No interactive elements (no buttons, no links — they can't work offline)

**Styling:**
- Uses inline styles or pre-cached CSS to avoid style dependencies that might not be cached.
- Matches the app's visual theme (colors, fonts).
- Centered on the page, simple and clean.

### Route: `app/offline/page.tsx`
This is a Next.js page, but it's also pre-cached by the service worker. It must be self-contained — it cannot rely on server-side data or Supabase queries.

## Next.js Configuration

### With `@ducanh2912/next-pwa`

```ts
// next.config.ts
import withPWA from '@ducanh2912/next-pwa';

const nextConfig = {
  // existing config...
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // Disable in dev
  runtimeCaching: [
    {
      urlPattern: /^\/_next\/static\/.*/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    {
      urlPattern: /^\/api\/image-proxy\?.*/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'proxied-images',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
      },
    },
  ],
  fallbacks: {
    document: '/offline',
  },
})(nextConfig);
```

### `skipWaiting: true`
When a new service worker is installed (after a deployment), it activates immediately instead of waiting for all tabs to close. This ensures users get the latest cached assets quickly. The trade-off (a brief visual glitch if assets are swapped mid-session) is acceptable for this app.

### `disable` in Development
The service worker is disabled during `npm run dev` to avoid caching development assets. Stale caches during development cause confusing bugs.

## Cache Invalidation

### On New Deployment
Each Next.js build produces new content-hashed static asset filenames. The service worker (managed by Workbox) detects the new build and:
1. Pre-caches new assets.
2. Serves new assets for new requests.
3. Cleans up old cached assets that are no longer referenced.

### Manual Cache Bust
In an emergency (e.g., a broken deployment cached by service workers), force a cache clear by:
1. Incrementing a version string in the service worker configuration.
2. Deploying. The new service worker installs, activates, and clears old caches.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User is offline and opens the app | The service worker serves the offline fallback page. Auth state may be stale or missing — the offline page doesn't require auth. |
| User goes offline mid-session | Already-loaded pages continue to work (single-page navigation). New navigation requests show the offline page. Supabase real-time disconnects and reconnects when online (handled by Phase 7's realtime spec). |
| User has an old service worker from a previous build | `skipWaiting` ensures the new service worker activates immediately. Old caches are cleaned up by Workbox. |
| User clears browser cache/data | The service worker and its caches are removed. On next visit, the service worker re-installs and re-caches. |
| Service worker fails to install | The app works normally without caching. Service workers are progressive enhancement — they never block functionality. |
| Service worker caches a broken page | The next deployment installs a new service worker with updated cache entries. In the meantime, the user can hard-refresh (Ctrl+Shift+R) to bypass the service worker cache. |
| Development mode (`npm run dev`) | Service worker is disabled. No caching interference during development. |
| Multiple tabs open during deployment | `skipWaiting` activates the new worker across all tabs. Each tab's next navigation loads from the new cache. |

## Data Model Changes
None. The service worker is entirely a client-side and build-configuration concern.

## New Dependencies
- `@ducanh2912/next-pwa` — Next.js PWA plugin with Workbox integration (if Option A is chosen).

## File Structure
```
app/
  offline/
    page.tsx           # Offline fallback page
next.config.ts         # Modified to include PWA plugin
public/
  sw.js                # Generated by the PWA plugin (not hand-written)
  workbox-*.js         # Generated Workbox runtime (auto-managed)
```

## Dependencies
- **PWA Setup** (`specs/pwa-setup.md`): The service worker completes the PWA experience started in Phase 7. The manifest and icons from Phase 7 are already in place.
- **Image Proxy** (`specs/image-proxy.md`): Proxy responses are cached by the service worker for faster image loads.
- **Realtime Feed** (`specs/realtime-feed.md`): Handles reconnection after offline periods.

## Acceptance Criteria
- [ ] A service worker is registered and activates on production builds.
- [ ] The service worker is disabled during development (`npm run dev`).
- [ ] Next.js static assets (`/_next/static/**`) are cached with a cache-first strategy.
- [ ] Navigation requests use a network-first strategy with offline fallback.
- [ ] Image proxy responses are cached with stale-while-revalidate.
- [ ] Supabase API calls, auth endpoints, and server actions are NOT cached.
- [ ] An offline fallback page at `/offline` displays when the user is offline.
- [ ] The offline page is self-contained (no server-side data dependencies).
- [ ] New deployments invalidate old caches via Workbox's build-hash mechanism.
- [ ] `skipWaiting` is enabled so new service workers activate immediately.
- [ ] The app functions normally if the service worker fails to install (progressive enhancement).
- [ ] Repeat page loads are measurably faster due to cached static assets.
