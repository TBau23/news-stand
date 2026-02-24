# Share Card Component

## Phase
4 — The Daily View

## What It Does
Renders a single share as a visual card showing the unfurled content (title, image, description, source domain), the sharer's identity, and their note. Tapping the card opens the original content in a new tab.

## User-Facing Behavior
Each share in the daily view appears as a card. The card feels like an item on a curated shelf — something you'd pick up and examine — rather than a social media post to scroll past. Clicking the content area opens the original URL.

## Component Interface

```tsx
interface ShareCardProps {
  share: {
    id: string;
    content_url: string;
    title: string | null;
    description: string | null;
    og_image_url: string | null;
    og_site_name: string | null;
    note: string | null;
    created_at: string;
  };
  sharer?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}
```

When `sharer` is provided, the card includes a header with the sharer's identity. When omitted (e.g., on `/share/today` where the card shows the current user's own share), the header is not rendered.

## Visual Layout

```
┌─────────────────────────────────┐
│ [Avatar] Display Name           │  ← Sharer header (when sharer prop provided)
│          @username              │
├─────────────────────────────────┤
│                                 │
│        [OG Image]               │  ← Full-width image (if available)
│                                 │
├─────────────────────────────────┤
│ Page Title                      │  ← Bold, 1-2 lines max, truncated
│ Description text that may span  │  ← Muted color, 2-3 lines max, truncated
│ up to a couple of lines...      │
│ source.com                      │  ← Domain from og:site_name or URL
├─────────────────────────────────┤
│ "This article changed how I     │  ← Note (only if present)
│  think about..."                │
└─────────────────────────────────┘
```

## Rendering Rules

### Sharer Header
- **Avatar:** Small circular image. If `avatar_url` is null or fails to load, show a colored circle with the first letter of `display_name` (or `username` if no display name).
- **Name:** `display_name` if available, otherwise `username`.
- **Username:** Shown as `@username` below or beside the name.
- The header is not a link (profile pages come in Phase 6).

### Content Preview — Full Metadata
All OG fields present: render image, title, description, and source domain.

### Content Preview — Partial Metadata
Render only available fields. No placeholder text for missing fields.
- No image → card starts at the title. No empty image area.
- No title → use the domain name extracted from `content_url` as the title.
- No description → omit the description area entirely.
- No `og_site_name` → extract domain from `content_url` as fallback.

### Content Preview — No Metadata (Unfurl Failed)
Minimal card:
- Domain name extracted from `content_url` as the title.
- The full URL displayed in smaller text.
- Subtitle: "No preview available."

### Note
- When present: displayed below the content preview, visually differentiated (e.g., italic, different background, or quotation styling).
- When absent: no note section rendered. Do not show "No note" — just omit it.

### Source Domain Extraction
Extract the hostname from `content_url` via `new URL(content_url).hostname`. Strip `www.` prefix if present. Display in small, muted text.

## Click/Tap Behavior
- Clicking the **content preview area** (image, title, description, domain) opens `content_url` in a new tab (`target="_blank"`, `rel="noopener noreferrer"`).
- The **note area** is NOT a click target (users may want to select/copy note text).
- The **sharer header** is NOT a click target (no profile pages until Phase 6).

> **Open Decision: Should the card show when the share was posted?**
> Options:
> 1. No timestamp — keeps the experience timeless and anti-feed.
> 2. Relative time (e.g., "2h ago") — helps convey the "filling up throughout the day" feel.
> 3. Time of day (e.g., "this morning", "this afternoon") — softer than a precise timestamp.
>
> Recommendation: Option 3 — soft time-of-day label. Reinforces the daily rhythm without feeling like a feed timestamp.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| OG image fails to load (broken URL) | Hide the image area. Use `<img onError>` to set `display:none` or swap to no-image layout. Do not show a broken image icon. |
| Very long title (>100 chars) | Truncate with ellipsis after 2 lines (CSS `line-clamp: 2`). |
| Very long description (>300 chars displayed) | Truncate with ellipsis after 3 lines (CSS `line-clamp: 3`). |
| Note is exactly 280 characters | Display fully. No truncation on the read-only card. |
| Content URL is very long | Display only the extracted domain, not the full URL. |
| Avatar URL fails to load | Fall back to the initial-letter circle. |
| Non-Latin characters in title/description | Render normally. Line clamping works with any script. |
| `content_url` is not a valid URL (edge case from bad data) | Render the raw string as the title. Link still attempts to open it. |

## Data Model Changes
None. This is a purely presentational component.

## Dependencies
- **Feed Query** (`specs/feed-query.md`): Provides the data this component renders in the daily view.
- **Phase 3 (Today's Share View)**: The share card in `/share/today` is a simpler version. Consider refactoring Phase 3's card to use this shared component (passing `sharer` as undefined).

## Reuse Plan
This component will be used in:
- **Phase 4**: Daily view (with sharer header)
- **Phase 3 retrofit**: Today's share view (without sharer header)
- **Phase 6**: Profile pages (with or without sharer header)
- **Phase 8**: Archive/history view (with sharer header)

Building it as a reusable component from the start avoids duplication.

## Acceptance Criteria
- [ ] `ShareCard` component renders title, description, image, and source domain from OG metadata.
- [ ] Sharer header (avatar, display name, @username) renders when `sharer` prop is provided.
- [ ] Sharer header is omitted when `sharer` prop is not provided.
- [ ] Clicking the content area opens the original URL in a new tab.
- [ ] Missing OG metadata fields are handled gracefully (no placeholders, no broken layout).
- [ ] Broken OG images are hidden (not shown as broken image icons).
- [ ] Long titles and descriptions are truncated with ellipsis via CSS line-clamp.
- [ ] Note is displayed when present, omitted when absent.
- [ ] Domain is extracted from `content_url` as a fallback for missing `og_site_name`.
- [ ] Avatar falls back to an initial-letter circle when the image is missing or broken.
