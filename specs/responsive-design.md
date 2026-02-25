# Responsive Design for Mobile Browsers

## Phase
7 — Polish and Realtime

## What It Does
Ensures every page in the app works well on mobile browsers — proper touch targets, mobile-appropriate navigation, and layouts that adapt from phone screens to desktops. This is a cross-cutting polish pass, not a new feature.

## User-Facing Behavior
The app feels native on a phone. Navigation is within thumb reach. Touch targets are large enough to hit reliably. Text is readable without zooming. Forms are comfortable to fill out on a phone keyboard. The "curated shelf" feel of the daily view translates to a vertical card list on small screens that still feels intentional, not cramped.

## Breakpoints

Use the three breakpoints already established in the Phase 4 daily view spec:

| Name | Width | Grid Columns | Context |
|---|---|---|---|
| Mobile | < 640px | 1 column | Phones (portrait) |
| Tablet | 640px – 1023px | 2 columns | Tablets, landscape phones |
| Desktop | ≥ 1024px | 3 columns | Laptops, desktops |

These are Tailwind's `sm` (640px) and `lg` (1024px) breakpoints. Design mobile-first: the base styles target mobile, with `sm:` and `lg:` variants for larger screens.

## Page-by-Page Responsive Behavior

### Daily View (`/dashboard`)

**Mobile:**
- Single-column card list with full-width cards.
- Header simplifies: app name on the left, share action icon + user avatar on the right. No text labels — icons only.
- Share status banner: full-width, compact. "Share something" is a tappable button, not a text link.
- Cards have horizontal padding (16px) to avoid edge-to-edge contact with the screen.

**Tablet:**
- Two-column grid with 16px gap.
- Header shows text labels alongside icons.

**Desktop:**
- Three-column grid with 20px gap.
- Full header with text labels.

### Share Creation (`/share`)

**Mobile:**
- URL input is full-width with large text (16px minimum to prevent iOS zoom on focus).
- "Preview" button is full-width below the input.
- Preview card is full-width.
- Note textarea is full-width.
- Character counter is right-aligned below the textarea.
- "Share" button is full-width, fixed to the bottom of the viewport (sticky CTA).
- Confirmation dialog: full-screen overlay on mobile (not a centered modal that's hard to tap).

**Tablet/Desktop:**
- Centered form with max-width (600px).
- Side-by-side layout possible for URL input + Preview button.
- Modal confirmation dialog (centered).

### Today's Share View (`/share/today`)

**Mobile:**
- Full-width share card.
- Note editing: inline textarea expands to fill the width.
- "Save" button for note editing is full-width.

**Tablet/Desktop:**
- Centered card with max-width (600px).

### Onboarding (`/onboarding`)

**Mobile:**
- Full-width form fields.
- Timezone selector: native `<select>` element (uses the OS picker on mobile, which is much better than a custom dropdown).
- "Complete Setup" button is full-width.

**Tablet/Desktop:**
- Centered form with max-width (480px).

### Login/Signup (`/login`, `/signup`)

**Mobile:**
- Full-width form fields.
- Submit button is full-width.
- Link to alternate page ("Don't have an account? Sign up") is full-width and easily tappable.

**Tablet/Desktop:**
- Centered form with max-width (400px).

### Profile Page (`/profile/[username]`, Phase 6)

**Mobile:**
- Avatar, name, and bio stack vertically, centered.
- Follow/block buttons are full-width.
- Active share card is full-width below the profile info.

**Tablet/Desktop:**
- Horizontal layout: avatar on the left, info on the right.
- Follow/block buttons are inline, auto-width.

### Search (`/search`, Phase 6)

**Mobile:**
- Search input is full-width, sticky at the top.
- Results are a full-width vertical list.
- Each result row: avatar, name, username, follow button — all in a single row with the follow button right-aligned.

**Tablet/Desktop:**
- Centered search with max-width (600px).
- Results in a centered column.

## Touch Targets

All interactive elements must meet minimum touch target sizes:

| Element | Minimum Size | Notes |
|---|---|---|
| Buttons | 44px × 44px | Apple HIG and WCAG 2.5.5 recommendation |
| Icon buttons (header) | 44px × 44px | Padding around the icon to reach 44px |
| List items (search results) | 44px height | Full-width tap area |
| Links (inline text links) | 44px vertical padding | Extend the tap area with padding |
| Share card | Full card area | Already large enough |

Implementation: Use Tailwind's `min-h-11` (44px) and `min-w-11` for touch targets. For icon buttons, use `p-2` or `p-3` to extend the tappable area beyond the icon itself.

## Typography Scaling

**Base font sizes (mobile):**
- Body text: 16px (prevents iOS auto-zoom on form inputs)
- Card title: 18px
- Card description: 14px
- Card note: 14px, italic
- Source domain: 12px
- Header app name: 20px

**Tablet/Desktop adjustments:**
- Body text: 16px (no change)
- Card title: 20px
- Card description: 15px
- Header app name: 24px

Use Tailwind's responsive typography: `text-base lg:text-lg` etc.

## Form Input Behavior

### iOS Zoom Prevention
iOS Safari zooms in when focusing an input with `font-size` less than 16px. All form inputs must have a minimum font-size of 16px.

```css
input, textarea, select {
  font-size: 16px; /* Prevents iOS zoom */
}
```

### Keyboard-Aware Layout
When the mobile keyboard opens, the visible viewport shrinks. The sticky "Share" CTA button on the share creation page should:
- Use `position: sticky; bottom: 0` rather than `position: fixed; bottom: 0`.
- This way, it scrolls with the content rather than overlapping the keyboard.

Alternatively, use the CSS `env(keyboard-inset-bottom)` (or `visualViewport` API) where supported to push content above the keyboard.

> **Open Decision: Sticky CTA approach.**
> Options:
> 1. `position: sticky` on the CTA — simplest, works everywhere, but scrolls with content.
> 2. `position: fixed` with `env(safe-area-inset-bottom)` + `visualViewport` resize listener — stays visible above the keyboard but more complex.
>
> Recommendation: Option 1 (sticky) for simplicity. The CTA is important but the user can scroll to it.

## Viewport and Safe Areas

### Viewport Meta Tag
The root layout should include:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

`viewport-fit=cover` enables edge-to-edge rendering on devices with notches/cutouts (iPhone X+, etc.).

### Safe Area Insets
On devices with notches or rounded corners, content must not be obscured. Apply safe area padding to the page shell:

```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

Or more selectively, apply safe area padding only to the header and footer/CTA areas.

## Navigation Pattern

### Current State
The Phase 4 header spec defines: app name (left), share button + user avatar (right). This works for desktop. For mobile, the header needs to be more compact.

### Mobile Header
- **Left:** "Dossier" (text, links to `/dashboard`).
- **Right:** Share icon (links to `/share` or `/share/today`) + User avatar (tappable, opens a dropdown or navigates to settings).
- **Height:** 56px (standard mobile app bar height).
- **Sticky:** `position: sticky; top: 0; z-index: 50` so it stays visible while scrolling the feed.

### No Bottom Navigation (For Now)
A bottom tab bar is a common mobile pattern but adds complexity and doesn't align with the current page count (daily view, share, profile, search, settings). The header is sufficient for Phase 7.

> **Open Decision: Bottom navigation.**
> Options:
> 1. Stick with header-only navigation.
> 2. Add a bottom tab bar for mobile (Daily View, Search, Share, Profile).
>
> Recommendation: Header-only for Phase 7. Revisit in Phase 9 (Settings) when there are more destinations. The app's core loop (open → view feed → maybe share → close) doesn't need persistent navigation to multiple sections.

## Scrolling Behavior

### Overscroll
Prevent rubber-band overscroll on the main page body (it feels web-like, not app-like):
```css
html {
  overscroll-behavior: none;
}
```

### Scroll Restoration
Next.js handles scroll restoration by default for client-side navigation. Verify that navigating from a share card's content (external tab) and returning to the app preserves scroll position.

### Pull-to-Refresh
Do not implement custom pull-to-refresh. The browser's native pull-to-refresh (on mobile Chrome/Safari) works and triggers a full page reload, which re-fetches the feed. This is acceptable. The PWA spec (`specs/pwa-setup.md`) may revisit this if the app runs in standalone mode (where native pull-to-refresh is often disabled).

## Image Handling

### OG Images in Share Cards
OG images in cards should be responsive:
- **Mobile:** Full card width, aspect ratio preserved. Use `aspect-ratio: 1200/630` (common OG image ratio) as a fallback if the image hasn't loaded.
- **All sizes:** `object-fit: cover` to avoid letterboxing.
- Lazy load images below the fold: `loading="lazy"` on `<img>` tags.

### Avatar Images
- Always circular, fixed size: 32px on mobile, 36px on tablet/desktop.
- Use `aspect-ratio: 1` and `border-radius: 50%`.

## Testing Considerations

Since this is a cross-cutting spec, it should be verified on:
- **Devices:** iPhone SE (small), iPhone 14 Pro (standard), iPad (tablet), desktop browser.
- **Browsers:** Safari (iOS), Chrome (Android), Chrome/Firefox (desktop).
- **States:** All empty states, populated states, and form states should be checked at each breakpoint.

Use browser DevTools responsive mode for initial testing. Real device testing (or BrowserStack) for iOS Safari specifics (zoom, safe areas, momentum scrolling).

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| Very small screen (< 320px) | Content should not overflow. Use `min-width: 320px` on the body as a floor. Below that, horizontal scroll is acceptable. |
| Landscape phone | Two-column grid activates (≥ 640px). Header stays single-row. |
| Large font / accessibility zoom | Layouts should not break with up to 200% zoom. Use relative units (`rem`, `em`) for spacing and sizes. |
| Keyboard open on share creation page | CTA button stays accessible (sticky positioning). Content above the keyboard is scrollable. |
| Notch / Dynamic Island (iPhone 14 Pro+) | Safe area insets prevent content from being hidden behind the notch. |
| Split-screen multitasking (iPad) | The responsive grid adapts to the available width. At 50% split, it likely shows the mobile (single-column) layout. |

## Data Model Changes
None. This is a purely presentational concern.

## Dependencies
- **All existing page specs**: This spec applies responsive rules to pages defined in Phases 3-6.
- **Share Card** (`specs/share-card.md`): Card sizing and image handling details.
- **Daily View Page** (`specs/daily-view-page.md`): Grid layout and header structure.
- **PWA Setup** (`specs/pwa-setup.md`): Viewport and safe area considerations overlap.

## Acceptance Criteria
- [ ] All pages render correctly at mobile (< 640px), tablet (640-1023px), and desktop (≥ 1024px) breakpoints.
- [ ] Daily view grid is 1 column on mobile, 2 on tablet, 3 on desktop.
- [ ] All touch targets are at least 44px × 44px.
- [ ] Form inputs have a minimum font-size of 16px (prevents iOS zoom).
- [ ] The header is sticky on mobile and compact (icons only, no text labels for actions).
- [ ] Safe area insets are respected on notched devices.
- [ ] The viewport meta tag includes `viewport-fit=cover`.
- [ ] All animations respect `prefers-reduced-motion` (see `specs/feed-transitions.md`).
- [ ] OG images in share cards are responsive and lazy-loaded.
- [ ] The share creation CTA is easily accessible when the mobile keyboard is open.
- [ ] Content is readable and usable at up to 200% browser zoom.
- [ ] Overscroll rubber-banding is suppressed on the main page.
