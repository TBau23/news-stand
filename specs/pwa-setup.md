# Progressive Web App Setup

## Phase
7 — Polish and Realtime

## What It Does
Configures the app as a Progressive Web App so it can be installed on a phone's home screen and launched like a native app — with its own icon, splash screen, and a standalone window (no browser chrome).

## User-Facing Behavior
On mobile Safari or Chrome, the user sees an "Add to Home Screen" option. After adding, the app appears on their home screen with a custom icon. Tapping it launches the app in a standalone window — no address bar, no tab bar, just the app. It feels like opening a native app. The app loads quickly on repeat visits thanks to cached assets.

## Web App Manifest

### File: `public/manifest.json`

```json
{
  "name": "Dossier",
  "short_name": "Dossier",
  "description": "Share one thing a day with the people you follow.",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a1a1a",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### Manifest Link
Add to the root layout's `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
```

### Key Choices

**`display: standalone`** — The app runs without browser chrome (address bar, tabs). This is the core PWA experience. Falls back to `browser` on unsupported platforms.

**`start_url: /dashboard`** — When launched from the home screen, opens directly to the daily view.

**`theme_color`** — Controls the status bar color on Android. Set to the app's primary dark color.

**`background_color`** — Shown during the splash screen before the app loads. Set to white (or the app's background color).

**`orientation: portrait-primary`** — The app is designed for portrait use. On phones this is natural; on tablets it allows rotation.

## App Icons

### Required Icon Sizes

| File | Size | Purpose |
|---|---|---|
| `public/icons/icon-192.png` | 192×192 | Standard home screen icon |
| `public/icons/icon-512.png` | 512×512 | Splash screen, app stores |
| `public/icons/icon-maskable-192.png` | 192×192 | Maskable (Android adaptive icons) |
| `public/icons/icon-maskable-512.png` | 512×512 | Maskable (Android adaptive icons) |
| `public/icons/apple-touch-icon.png` | 180×180 | iOS home screen icon |
| `public/favicon.ico` | 32×32 | Browser tab (already exists) |

### Maskable Icons
Android uses "maskable" icons that can be cropped into different shapes (circle, squircle, etc.). Maskable icons must have the important content within the "safe zone" — a centered circle with radius ~40% of the icon. The background extends to the edges and gets cropped.

### Apple Touch Icon
iOS does not use the manifest's icon list. It uses the `apple-touch-icon` link tag:
```html
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

> **Open Decision: Icon design.**
> The icon design itself (what it looks like) is a design task, not an engineering spec. Placeholder icons (solid color with "D" letter) should be created for development. Final icons are a design deliverable.

## iOS-Specific Meta Tags

Safari on iOS requires additional meta tags for PWA behavior:

```html
<!-- Enable standalone mode on iOS -->
<meta name="apple-mobile-web-app-capable" content="yes" />

<!-- Status bar style: default (black text on white) or black-translucent (white text, transparent bg) -->
<meta name="apple-mobile-web-app-status-bar-style" content="default" />

<!-- App title shown under the icon on home screen -->
<meta name="apple-mobile-web-app-title" content="Dossier" />
```

### iOS Status Bar Style

**`default`** — Black text, white background. Clean and safe.
**`black-translucent`** — White text, the app's background shows through the status bar area. More immersive but requires the app to handle the safe area inset at the top (header must have padding-top).

> **Open Decision: iOS status bar style.**
> Options:
> 1. `default` — simple, no layout changes needed.
> 2. `black-translucent` — more immersive, requires padding-top for safe area (covered in `specs/responsive-design.md`).
>
> Recommendation: `default` for Phase 7. Switch to `black-translucent` later if the visual design calls for it.

## iOS Splash Screens

iOS shows a splash screen when launching an installed PWA. Without explicit splash images, the user sees a white screen. iOS generates splash screens from the manifest's `background_color` and `icons`, but the result is basic.

For a polished experience, provide Apple-specific splash images via `<link rel="apple-touch-startup-image">` tags. However, this requires many size variants (one per device resolution).

> **Open Decision: iOS splash images.**
> Options:
> 1. Skip — rely on the auto-generated splash from manifest icon + background color. Simple, looks OK.
> 2. Provide explicit splash images for key iOS device sizes. More polished but maintenance-heavy.
>
> Recommendation: Option 1 (skip) for Phase 7. The auto-generated splash is acceptable. Custom splash images are a nice-to-have for later.

## Service Worker

### Purpose
A service worker enables offline caching of the app shell (HTML, CSS, JS) so the app loads quickly on repeat visits and shows something useful even without a network connection.

### Scope for Phase 7
A minimal service worker that caches the app shell (static assets) but does NOT cache API responses or dynamic data. The app is inherently online (it needs Supabase for auth and data), so full offline support is out of scope.

### Implementation: Next.js + `next-pwa` or Manual

**Option A: `next-pwa` (or `@ducanh2912/next-pwa`)** — A Next.js plugin that auto-generates a service worker using Workbox. Handles caching of static assets, pre-caching of pages, and runtime caching strategies.

**Option B: Manual service worker** — A hand-written `public/sw.js` that caches specific static assets on install and serves them from cache on fetch.

> **Open Decision: Service worker approach.**
> Options:
> 1. `@ducanh2912/next-pwa` — auto-configures Workbox, minimal setup, handles cache busting with Next.js build hashes.
> 2. Manual `public/sw.js` — full control, no dependency, but must manually handle cache invalidation.
> 3. No service worker — skip for Phase 7, add later. The manifest alone enables "Add to Home Screen" and standalone mode.
>
> Recommendation: Option 3 (no service worker for Phase 7). The core PWA value is standalone mode and the home screen icon. Caching adds complexity (stale assets, cache invalidation) that isn't needed yet. The app requires network connectivity regardless. Add a service worker in Phase 10 (Infrastructure Hardening) when caching strategy is more thought out.

### If Using a Service Worker (Deferred)

When eventually added, the service worker should:
- **Pre-cache:** Next.js static assets (`/_next/static/**`), manifest, icons.
- **Runtime cache:** Navigation requests → network-first (try network, fall back to cached shell).
- **Do NOT cache:** Supabase API calls, auth tokens, or dynamic data.
- **Cache invalidation:** Tie to the Next.js build hash. Each deploy invalidates the old cache.
- **Offline fallback:** Show a custom offline page ("You're offline. Connect to the internet to use Dossier.") instead of the browser's default offline error.

## Metadata in Root Layout

Consolidate all PWA-related meta tags and links in `app/layout.tsx`:

```tsx
export const metadata: Metadata = {
  title: 'Dossier',
  description: 'Share one thing a day with the people you follow.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Dossier',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  themeColor: '#1a1a1a',
}
```

Next.js 14+ supports the `metadata` export for generating these tags. This is cleaner than manually adding `<meta>` and `<link>` tags.

## Add-to-Home-Screen Prompt

### Android (Chrome)
Chrome shows a native install prompt ("Add to Home screen") when the PWA criteria are met:
1. Valid manifest with required fields.
2. Served over HTTPS.
3. Has a registered service worker (even a no-op one).

Without a service worker, Chrome won't show the automatic prompt, but users can still manually add the app via the browser menu (three dots → "Add to Home screen").

> **Note:** If we skip the service worker (recommended for Phase 7), the automatic Chrome install prompt won't fire. Users can still add the app manually. This is an acceptable trade-off for Phase 7.

### iOS (Safari)
iOS never shows an automatic install prompt. Users must manually use the Share sheet → "Add to Home Screen." There's no way to trigger or prompt this programmatically.

### In-App Install Hint
Consider showing a subtle, dismissable banner to mobile users who haven't installed the app:

"Add Dossier to your home screen for the best experience."

**Detection:** Check `window.matchMedia('(display-mode: standalone)').matches`. If `false`, the user is in the browser (not installed). Show the hint.

**Behavior:**
- Show once per session (use `sessionStorage` to track dismissal).
- Dismiss on tap or after 10 seconds.
- Only show on mobile viewports (< 640px).
- Do not show on desktop.

> **Open Decision: In-app install hint.**
> Options:
> 1. Show a dismissable banner suggesting installation.
> 2. Skip — let users discover the "Add to Home Screen" option naturally.
>
> Recommendation: Option 1, but make it extremely subtle and easy to dismiss. A single line at the top of the daily view, shown once.

## Standalone Mode Considerations

When the app runs in standalone mode (launched from home screen), the browser's navigation controls are absent. This affects:

### No Back Button
There's no browser back button. In-app navigation must handle going back:
- The daily view header should include a way to return to the daily view from sub-pages (share creation, today's share, profile, search).
- Use Next.js `<Link>` for client-side navigation (with the back button working via the browser's history API).
- The gesture-based "swipe back" still works on iOS in standalone mode.

### No URL Bar
Users can't type a URL or see the current URL. This is fine — the app is self-contained. But deep links (e.g., `/invite/[username]`) must still work when opened from outside the app (they'll open in the browser, not the installed PWA, which is expected).

### No Refresh
There's no pull-to-refresh or browser refresh button in standalone mode on all platforms. The realtime subscription (from `specs/realtime-feed.md`) handles live updates. For manual refresh, the user can navigate away and back. A dedicated refresh mechanism is deferred.

> **Open Decision: Manual refresh in standalone mode.**
> Options:
> 1. Implement pull-to-refresh via JavaScript for standalone mode.
> 2. Rely on realtime updates + navigation-based refresh.
>
> Recommendation: Option 2 for Phase 7. Realtime handles the primary use case (new shares appearing). A custom pull-to-refresh adds complexity and can conflict with mobile scrolling.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User adds to home screen but has no internet on next launch | App shell loads from browser cache (even without a service worker, the browser cache helps). Supabase calls fail. Show a "You're offline" message where the feed would be. Auth state may be stale. |
| Manifest file is missing or malformed | Browser ignores it. The app works normally but can't be installed. No user-facing error. |
| Icons are missing | Browser uses a default icon (screenshot of the page or generic icon). Not broken, just ugly. |
| User on desktop tries "Add to Home Screen" | Desktop PWA installation works on Chrome (creates a desktop app window). The experience is fine but not the primary target. |
| iOS user updates the app (deploys new version) | On next launch, iOS re-fetches the start URL. The app loads the latest version. No stale cache issue without a service worker. |
| Theme color doesn't match the app's actual header | Visual mismatch in the status bar area. Ensure `theme_color` matches the header background. |

## Data Model Changes
None. This is a configuration and metadata concern.

## New Dependencies

### If skipping service worker (recommended):
None. The manifest and meta tags are static files and built-in Next.js metadata.

### If adding service worker later:
- `@ducanh2912/next-pwa` (~adds Workbox to the build pipeline)
- Or a hand-written `public/sw.js` (no dependency)

## Dependencies
- **Root Layout** (`app/layout.tsx`): Where PWA metadata is added.
- **Responsive Design** (`specs/responsive-design.md`): Safe area handling and viewport configuration overlap.
- **Realtime Feed** (`specs/realtime-feed.md`): Compensates for the lack of manual refresh in standalone mode.

## Files to Create or Modify

| File | Action | Purpose |
|---|---|---|
| `public/manifest.json` | Create | Web app manifest |
| `public/icons/icon-192.png` | Create | Standard icon (192×192) |
| `public/icons/icon-512.png` | Create | Large icon (512×512) |
| `public/icons/icon-maskable-192.png` | Create | Maskable icon (192×192) |
| `public/icons/icon-maskable-512.png` | Create | Maskable icon (512×512) |
| `public/icons/apple-touch-icon.png` | Create | iOS home screen icon (180×180) |
| `app/layout.tsx` | Modify | Add PWA metadata export |

## Acceptance Criteria
- [ ] `public/manifest.json` exists with correct `name`, `short_name`, `start_url`, `display`, `icons`, and colors.
- [ ] Root layout links to the manifest via `<link rel="manifest">` or Next.js `metadata.manifest`.
- [ ] App icons exist at all required sizes (192, 512, maskable variants, apple-touch-icon).
- [ ] iOS meta tags are present (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`).
- [ ] `theme_color` meta tag matches the app's header color.
- [ ] The app can be added to an Android home screen and launched in standalone mode.
- [ ] The app can be added to an iOS home screen and launched in standalone mode (no Safari chrome).
- [ ] The `start_url` (`/dashboard`) loads correctly when launching from the home screen.
- [ ] In-app navigation works in standalone mode (no reliance on browser back button).
- [ ] A subtle, dismissable install hint is shown to mobile browser users (not installed, not desktop).
