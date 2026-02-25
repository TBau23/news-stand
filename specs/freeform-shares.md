# Freeform Shares

## Phase
9 — Account Management & Settings

## What It Does
Extends the sharing flow to support freeform entries — content without a URL. Users can share books, podcast episodes, offline conversations, or anything that doesn't have a clean link. A freeform share has a user-provided title and an optional note, but no URL, no unfurling, and no clickable link.

> **This spec is optional for Phase 9.** The init spec notes that freeform entries "could also land here once the core loop is proven." If the URL-based sharing loop is working well and the constraint of one-share-per-day feels right, freeform shares add meaningful value. If the core loop isn't validated yet, defer this spec.

## User-Facing Behavior

### Sharing Freeform Content
On the `/share` page (Phase 3), the user sees a toggle or tab to switch between "Link" and "Freeform" modes. In freeform mode:
1. The URL input is replaced by a **title field** (required, max 200 characters). Placeholder: "What are you sharing?" (e.g., "Thinking, Fast and Slow" or "Reply All ep. 142").
2. An optional **type label** helps categorize the content. Presented as a selector with options: Book, Podcast, Article, Video, Other. Defaults to none/unselected.
3. The **note field** (same as URL shares, max 280 characters) is more important here since there's no link to speak for itself. The placeholder changes to: "Tell your friends about it."
4. No unfurl/preview step. The preview shows a styled card with the title and type label.
5. The same confirmation step applies: "This is your share for today. You won't be able to change it."

### Viewing Freeform Shares
On the daily view, archive, and profile pages, freeform shares render as `ShareCard` variants:
- **No link to open.** Tapping the card does nothing (or shows a tooltip: "This is a freeform share — no link to open").
- The card shows the **title** prominently, the **type label** as a subtle badge (e.g., "Book", "Podcast"), and the **note**.
- A distinct visual treatment differentiates freeform shares from URL shares — e.g., a different background tint, an icon, or a "freeform" tag. The card should feel intentional, not broken.
- No OG image, no source domain, no "open link" affordance.

## Data Model Changes

### Migration: Make `content_url` Nullable

```sql
ALTER TABLE shares ALTER COLUMN content_url DROP NOT NULL;
```

Currently `content_url` is `TEXT NOT NULL`. Freeform shares have no URL, so this column must become nullable.

### New Column: `content_type`

```sql
ALTER TABLE shares ADD COLUMN content_type TEXT DEFAULT 'link';
```

Possible values: `'link'` (default, existing URL-based shares), `'freeform'`.

This column distinguishes URL shares from freeform shares. The default ensures all existing shares are tagged as `'link'` without a data migration.

### New Column: `freeform_label`

```sql
ALTER TABLE shares ADD COLUMN freeform_label TEXT;
```

The optional type label for freeform shares: `'book'`, `'podcast'`, `'article'`, `'video'`, `'other'`, or `NULL`.

> **Open Decision: Enum vs. free text for the label.**
> Options:
> 1. **Application-level enum** (recommended) — Store as `TEXT`, validate allowed values in the server action. Easy to add new labels without a migration.
> 2. **Database enum** — `CREATE TYPE freeform_label_type AS ENUM (...)`. Strict, but requires a migration to add new values.
> 3. **Free text** — Let users type anything. Maximum flexibility but loses consistency and makes rendering harder.
>
> Recommendation: Option 1. Validate in the server action, store as plain text.

## Server Action Changes

### Modified: `createShare(formData)` (from `specs/share-creation-flow.md`)

The existing `createShare` action is extended to handle both content types:

**Additional input fields:**
- `content_type` (`'link'` | `'freeform'`, required, defaults to `'link'`)
- `freeform_label` (string | null, only for freeform)

**Modified logic:**
1. If `content_type === 'link'`:
   - Existing behavior — `content_url` is required, metadata fields are populated from unfurl.
2. If `content_type === 'freeform'`:
   - `content_url` must be null/absent. If provided, ignore it.
   - `title` is required (from the freeform title field, max 200 chars). This reuses the existing `title` column.
   - `freeform_label` is validated against allowed values: `['book', 'podcast', 'article', 'video', 'other']` or null.
   - `description`, `og_image_url`, `og_site_name` are set to null.
   - `note` is optional (same as URL shares, max 280 chars).
3. The `shared_date` computation and unique constraint logic is identical for both types.

### Modified: `updateShareNote(formData)` (from `specs/todays-share-view.md`)
No changes needed. The note is editable for both URL and freeform shares.

## Component Changes

### Modified: Share Creation Page (`/share`)

Add a mode toggle at the top of the form:

```
┌──────────────────────────────────────────┐
│ [Link]  [Freeform]                       │ ← Toggle/tab
│                                          │
│ (mode-specific form below)               │
└──────────────────────────────────────────┘
```

**Link mode:** Existing URL entry + unfurl flow (unchanged).

**Freeform mode:**
```
┌──────────────────────────────────────────┐
│ What are you sharing?                    │
│ [________________________] (title, req.) │
│                                          │
│ Type: [Book] [Podcast] [Article]         │
│       [Video] [Other]                    │
│                                          │
│ Tell your friends about it               │
│ [________________________] (note, opt.)  │
│ 0 / 280                                 │
│                                          │
│ Preview:                                 │
│ ┌──────────────────────────────────────┐ │
│ │ 📖 Book                             │ │
│ │ Thinking, Fast and Slow             │ │
│ │ "Changed how I think about..."      │ │
│ └──────────────────────────────────────┘ │
│                                          │
│              [Share]                      │
└──────────────────────────────────────────┘
```

### Modified: ShareCard Component (from `specs/share-card.md`)

The `ShareCard` must handle both content types:

**URL share (existing):** Title, description, OG image, source domain, clickable link.

**Freeform share (new):**
- Title displayed prominently.
- Type label as a badge (e.g., "Book" with a book icon).
- Note displayed below the title.
- No image area, no domain, no link affordance.
- Distinct visual: subtle background tint or left border to differentiate.
- The card is not clickable (no `<a>` wrapper).

The ShareCard can check `share.content_type` (or the presence of `content_url`) to determine rendering mode.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User switches from Link to Freeform mode mid-form | The URL input and preview are cleared. The freeform title field appears. Any note text is preserved (it's shared between modes). |
| User switches from Freeform to Link mode mid-form | The freeform title and label are cleared. The URL input appears. Note text is preserved. |
| Freeform share with empty title | Client-side and server-side: "Title is required for freeform shares." |
| Freeform share with a very long title | Client-side: character counter, capped at 200. Server-side: truncate or reject if > 200. |
| Freeform share submitted with a URL in the title field | Allowed. The title is free text — if someone types a URL as their title, that's their choice. It won't be clickable or unfurled. |
| Existing URL shares after migration | All existing shares have `content_type = 'link'` (the default) and `content_url` is not null. They render exactly as before. |
| Feed/archive query returns freeform shares | The query already returns all share columns. The ShareCard renders differently based on `content_type`. No query changes needed. |
| Freeform share with no note | Allowed. The card shows just the title and type label. |
| Freeform share with no type label | Allowed. The type badge is omitted. The card shows the title and note. |

## UI States

### Mode Toggle
- **Link (default):** URL input form. Standard unfurl flow.
- **Freeform:** Title input, type selector, note field. No unfurl step.
- **Switching modes:** Form fields for the other mode are cleared. Note is preserved.

### Freeform Preview
- **Empty title:** Preview area hidden.
- **Title entered:** Preview card appears with title, optional label badge, and optional note.

### ShareCard (Freeform Variant)
- **Full:** Title + label badge + note.
- **Minimal:** Title only (no label, no note).
- **Hover/press:** Subtle highlight, but no cursor:pointer or link behavior.

## Dependencies
- **Phase 3 (share-creation-flow.md):** The freeform mode extends the existing share creation page. The `createShare` server action must be modified.
- **Phase 3 (todays-share-view.md):** Today's share view must render freeform shares correctly.
- **Phase 4 (share-card.md):** The ShareCard component must support freeform rendering.
- **Phase 4 (daily-view-page.md):** No changes — the feed renders ShareCards, which handle both types.
- **Phase 8 (archive-page.md):** No changes — uses ShareCard.
- **Existing schema:** Requires a migration to make `content_url` nullable and add `content_type` and `freeform_label` columns.

## Acceptance Criteria
- [ ] The share creation page has a toggle between "Link" and "Freeform" modes.
- [ ] In freeform mode, the user enters a title (required, max 200 chars) instead of a URL.
- [ ] An optional type label (Book, Podcast, Article, Video, Other) can be selected.
- [ ] The note field works the same as for URL shares (optional, max 280 chars).
- [ ] A preview card shows the freeform share before confirmation.
- [ ] The same confirmation step applies ("This is your share for today...").
- [ ] Freeform shares are stored with `content_type = 'freeform'`, `content_url = NULL`.
- [ ] The `createShare` server action validates freeform inputs server-side.
- [ ] ShareCard renders freeform shares with a distinct visual treatment (no link, type badge).
- [ ] Freeform share cards are not clickable (no link to open).
- [ ] Existing URL-based shares are unaffected by the migration (`content_type` defaults to `'link'`).
- [ ] The one-share-per-day constraint applies equally to URL and freeform shares.
- [ ] Switching between Link and Freeform modes preserves the note but clears mode-specific fields.
- [ ] The `UNIQUE(user_id, shared_date)` constraint is enforced regardless of content type.
