# URL Unfurling

## Phase
3 — Sharing Flow

## What It Does
When a user pastes a URL into the share form, the server fetches OpenGraph metadata (title, description, image, site name) from that URL and returns it so the client can display a rich preview card.

## User-Facing Behavior
1. User pastes or types a URL into the share input.
2. After the URL field loses focus (or user presses Enter / clicks a "Preview" button), a request fires to the server.
3. A loading skeleton appears in the preview area while the server fetches metadata.
4. On success, a preview card renders showing the page title, description (truncated), image thumbnail, and source domain.
5. On failure (bad URL, no OG tags, timeout), the preview area shows a minimal fallback card with just the URL's domain and a message like "No preview available."

## API Route

### `POST /api/unfurl`

**Authentication:** Required (the user must be logged in). Reject unauthenticated requests with 401.

**Request body:**
```json
{ "url": "https://example.com/article" }
```

**Validation:**
- `url` must be present and non-empty.
- `url` must be a valid URL (parseable by `new URL()`).
- `url` scheme must be `http` or `https`. Reject `file://`, `javascript:`, `data:`, `ftp://`, etc.
- Return 400 with a descriptive error for invalid input.

**Server-side fetch logic:**
1. Fetch the URL with a timeout of 5 seconds.
2. Set a `User-Agent` header identifying the app (e.g., `Memo/1.0 bot`).
3. Only read the first ~50KB of the response body (stop reading after that to avoid downloading large files).
4. Parse the HTML for `<meta property="og:...">` and `<meta name="...">` tags.
5. Extract: `og:title`, `og:description`, `og:image`, `og:site_name`. Fall back to `<title>` tag if `og:title` is missing. Fall back to `meta[name="description"]` if `og:description` is missing.
6. If `og:image` is a relative URL, resolve it against the page URL.

**Success response (200):**
```json
{
  "title": "Page Title",
  "description": "A description of the page...",
  "image_url": "https://example.com/og-image.jpg",
  "site_name": "Example",
  "url": "https://example.com/article"
}
```
All fields except `url` may be `null` if not found.

**Error responses:**
- 400: Invalid or missing URL, disallowed scheme.
- 401: Not authenticated.
- 422: URL was valid but could not be fetched (network error, timeout, non-HTML response, DNS failure).
- 500: Unexpected server error.

## Security Considerations

### SSRF Prevention
The unfurl endpoint fetches arbitrary user-supplied URLs server-side, which creates a Server-Side Request Forgery risk.

**Mitigations:**
- Block private/reserved IP ranges after DNS resolution: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `0.0.0.0/8`, `::1`, `fc00::/7`, `fe80::/10`.
- Block `localhost` and any hostname that resolves to a blocked IP.
- Do not follow redirects to blocked IPs (validate each redirect target).
- Limit redirect count to 3.

> **Open Decision:** Choose an SSRF-safe fetch approach. Options:
> 1. Manually resolve DNS and check IPs before connecting.
> 2. Use a library like `ssrf-req-filter` or equivalent.
> 3. Rely on an external unfurling service/API.
>
> Document the chosen approach before implementation.

### Input Sanitization
- Sanitize all extracted metadata before returning it. Strip HTML tags from title and description.
- Do not return metadata fields that exceed reasonable lengths (title: 500 chars, description: 1000 chars, site_name: 200 chars, image_url: 2000 chars).

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| URL returns non-HTML content type (PDF, image, video) | Return 422 with message "URL does not point to an HTML page." Consider extracting filename as title for known types. |
| URL returns HTML but has zero OG tags and no `<title>` | Return 200 with all metadata fields as `null`. Client shows fallback card with domain only. |
| URL takes longer than 5s to respond | Abort the fetch. Return 422 with message "The page took too long to respond." |
| URL redirects more than 3 times | Abort. Return 422 with "Too many redirects." |
| URL redirects to a blocked (private) IP | Abort. Return 422 with generic "Could not fetch URL." (do not reveal SSRF detail). |
| URL returns a 4xx or 5xx status | Return 422 with "The page returned an error." |
| URL has unusual encoding (IDN domain, encoded characters) | Normalize using `new URL()` before fetching. |
| Response body is extremely large (>50KB head) | Stop reading after 50KB and parse what was received. OG tags are almost always in `<head>`. |
| `og:image` is a relative path | Resolve against the page URL to produce an absolute URL. |
| `og:image` is a `data:` URI | Discard it — treat as no image. |
| User submits the same URL twice quickly (double-click) | Client should debounce. Server handles idempotently (no side effects). |

## Data Model Changes
None. The unfurl endpoint is stateless — it does not write to the database. Metadata is stored on the `shares` record only when the share is actually submitted (handled by the Share Creation Flow spec).

## Dependencies
- **Existing:** Supabase auth (for authenticating the request).
- **New library (likely):** An HTML parser for extracting meta tags server-side. Options: `cheerio`, `node-html-parser`, or a lightweight regex-based approach for just OG tags.
- **No dependency on other Phase 3 specs** — this endpoint can be built and tested independently.

## UI States
This spec only covers the API route. The client-side preview UI that calls this endpoint is defined in the Share Creation Flow spec. However, the API contract here determines the loading/success/error states the UI must handle:

- **Loading:** Client shows a skeleton card while waiting for the response.
- **Success:** Client renders the preview card with returned metadata.
- **Partial success:** Some fields are null — client renders what's available, falls back gracefully.
- **Error (422):** Client shows the URL with a "No preview available" message and the error reason.
- **Error (400):** Client shows an inline validation error on the URL input field.

## Acceptance Criteria
- [ ] `POST /api/unfurl` exists and requires authentication.
- [ ] Returns OG metadata (title, description, image, site_name) for a valid URL with OG tags.
- [ ] Falls back to `<title>` and `meta[name="description"]` when OG tags are missing.
- [ ] Returns all-null metadata (not an error) when no metadata is found at all.
- [ ] Rejects non-http(s) schemes with 400.
- [ ] Times out after 5 seconds and returns 422.
- [ ] Does not fetch private/internal IP addresses (SSRF protection).
- [ ] Strips HTML from returned metadata fields.
- [ ] Truncates metadata fields to reasonable lengths.
- [ ] Resolves relative `og:image` URLs to absolute.
- [ ] Handles non-HTML responses gracefully (422).
- [ ] Response shape matches the documented contract.
