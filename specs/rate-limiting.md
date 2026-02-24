# API Rate Limiting

## Phase
5 — Privacy & Security

## What It Does
Adds rate limiting to API routes and server actions to prevent abuse — brute-force attempts, scraping, and excessive resource consumption. Rate limits are applied per-user for authenticated endpoints and per-IP for unauthenticated ones.

## User-Facing Behavior
Under normal use, rate limits are invisible. A user making requests at a normal human pace never hits a limit. If a limit is hit (automated abuse, buggy client, etc.), the request returns HTTP 429 with a `Retry-After` header indicating when the user can try again. The UI shows a generic error: "Too many requests. Please try again in a moment."

## Routes and Limits

### Authenticated Endpoints (rate limited per user ID)

| Endpoint | Type | Limit | Window | Rationale |
|---|---|---|---|---|
| `POST /api/unfurl` | API Route | 30 requests | 1 minute | Each share attempt triggers 1-2 unfurl calls. 30/min allows retries and URL corrections. |
| `createShare` | Server Action | 10 requests | 1 minute | One share per day, but allow retries on failure. 10/min is generous. |
| `updateShareNote` | Server Action | 20 requests | 1 minute | Note editing may involve rapid save cycles. |
| `blockUser` | Server Action | 10 requests | 1 minute | Blocking is infrequent. |
| `unblockUser` | Server Action | 10 requests | 1 minute | Unblocking is infrequent. |
| `completeOnboarding` | Server Action | 5 requests | 1 minute | One-time action, very low expected volume. |

### Unauthenticated Endpoints (rate limited per IP)

| Endpoint | Type | Limit | Window | Rationale |
|---|---|---|---|---|
| `login` | Server Action | 10 requests | 15 minutes | Prevents brute-force password attempts. Stricter window. |
| `signup` | Server Action | 5 requests | 15 minutes | Prevents mass account creation. |
| Auth callback (`/auth/callback`) | API Route | 10 requests | 1 minute | Automated probing prevention. |

### Read-Only Pages (no rate limiting)
Server-rendered pages (`/dashboard`, `/share`, `/share/today`) are not individually rate-limited. They are protected by Supabase's built-in auth session handling and the natural overhead of server rendering. If needed, add page-level rate limiting later.

## Implementation Approach

### Option A: In-Memory Rate Limiting (Recommended for Phase 5)

Use an in-memory store (e.g., a `Map` with timestamps) in a utility function. Simple, no external dependencies, works for a single-server deployment.

```ts
// lib/rate-limit.ts

type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: Date;
};

function rateLimit(options: {
  key: string;         // e.g., "unfurl:<userId>" or "login:<ip>"
  limit: number;       // max requests in window
  windowMs: number;    // window duration in ms
}): RateLimitResult;
```

**Pros:** Zero dependencies, instant setup, sufficient for early-stage app.
**Cons:** Resets on server restart, doesn't work across multiple server instances (Vercel serverless functions each have isolated memory).

### Option B: Upstash Redis Rate Limiting

Use `@upstash/ratelimit` with Upstash Redis for distributed rate limiting that works across serverless function instances.

**Pros:** Works across Vercel serverless instances, persistent across deploys, battle-tested library.
**Cons:** External dependency (Upstash account + Redis instance), adds latency per request (Redis round-trip), cost.

### Option C: Next.js Middleware Rate Limiting

Apply rate limiting in Next.js middleware before requests reach route handlers. Centralized but limited — middleware runs on the edge and can't easily differentiate between route types.

**Pros:** Centralized, catches all requests early.
**Cons:** Edge runtime limitations, harder to customize per-route, can't access user ID without parsing the session.

> **Open Decision: Rate limiting backend.**
> Options:
> 1. **In-memory** (Option A) — Start here. Sufficient for a single-origin deployment. Swap to Upstash if/when scaling to multiple serverless instances becomes an issue.
> 2. **Upstash Redis** (Option B) — More robust, but adds infrastructure dependency.
> 3. **Middleware** (Option C) — Centralized but less granular.
>
> Recommendation: Option A (in-memory) for Phase 5. The app is pre-launch with a small user base. An in-memory approach is simple to implement and test. Document the upgrade path to Upstash for when serverless scaling matters.

### In-Memory Implementation Detail

The rate limiter uses a sliding window algorithm with a `Map<string, number[]>` storing timestamps of recent requests per key. Expired entries are cleaned up on access and periodically via a sweep interval.

```ts
// Pseudocode for the core logic
const store = new Map<string, number[]>();

function rateLimit({ key, limit, windowMs }: Options): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Get existing timestamps, filter to current window
  const timestamps = (store.get(key) ?? []).filter(t => t > windowStart);

  if (timestamps.length >= limit) {
    const oldestInWindow = timestamps[0];
    const resetAt = new Date(oldestInWindow + windowMs);
    return { success: false, remaining: 0, resetAt };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { success: true, remaining: limit - timestamps.length, resetAt: new Date(now + windowMs) };
}
```

### Memory Cleanup

To prevent unbounded growth of the store:
- On each `rateLimit()` call, prune expired timestamps for the accessed key.
- Run a periodic sweep (every 60 seconds) that removes keys with no timestamps in the current window.
- The sweep uses `setInterval` — in serverless environments this runs per-instance and is cleaned up when the instance is recycled.

## Integration Pattern

### For API Routes

```ts
// app/api/unfurl/route.ts
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { success, resetAt } = rateLimit({
    key: `unfurl:${user.id}`,
    limit: 30,
    windowMs: 60_000,
  });

  if (!success) {
    return Response.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString() },
      }
    );
  }

  // ... rest of the handler
}
```

### For Server Actions

```ts
// Server actions can't return HTTP status codes directly.
// Return an error object that the client renders.
import { rateLimit } from '@/lib/rate-limit';

export async function createShare(formData: FormData) {
  'use server';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { success } = rateLimit({
    key: `createShare:${user.id}`,
    limit: 10,
    windowMs: 60_000,
  });

  if (!success) {
    return { error: 'Too many requests. Please try again in a moment.' };
  }

  // ... rest of the action
}
```

### For Unauthenticated Actions (IP-based)

```ts
import { headers } from 'next/headers';

export async function login(formData: FormData) {
  'use server';

  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const { success } = rateLimit({
    key: `login:${ip}`,
    limit: 10,
    windowMs: 15 * 60_000, // 15 minutes
  });

  if (!success) {
    return { error: 'Too many login attempts. Please try again later.' };
  }

  // ... rest of the action
}
```

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User hits rate limit | Returns 429 (API routes) or `{ error: "..." }` (server actions) with retry timing. |
| Server restarts (in-memory store lost) | All rate limits reset. Acceptable for Phase 5 — the window is short enough that abuse resuming post-restart is low risk. |
| Multiple Vercel instances (in-memory limitation) | Each instance has its own store, so the effective limit is multiplied by the number of instances. For a small app this is acceptable. Document upgrade path to Upstash. |
| IP-based limiting behind a proxy | Use `x-forwarded-for` header. Vercel sets this correctly. If running behind another proxy, ensure it's configured to pass the real client IP. |
| Shared IP (NAT, corporate network) | Multiple users behind the same IP share the IP-based limit. The limits are generous enough (10 logins / 15 min) that this shouldn't be a problem in practice. |
| `x-forwarded-for` is missing | Fall back to `'unknown'` — all users without an IP share one bucket. This shouldn't happen on Vercel but is handled defensively. |
| Rate limit check itself fails (bug) | Fail open — allow the request. Log the error. A rate limit bug should not block legitimate users. |

## Data Model Changes

None. Rate limiting is purely application-layer logic with in-memory state. No database tables or migrations.

## File Structure

```
lib/
  rate-limit.ts    # rateLimit() function + in-memory store + cleanup
```

Single file, single export. The configuration (limits, windows) lives in the calling code, not in the rate limiter itself — keeps the utility generic and the limits discoverable at each call site.

## Dependencies
- **No external dependencies** for in-memory approach.
- If upgrading to Upstash later: `@upstash/ratelimit` + `@upstash/redis`.
- **All Phase 3-4 endpoints**: Rate limiting is added to each endpoint as it's built. If Phase 3-4 are already implemented when Phase 5 lands, retrofit the rate limit calls.
- **Auth routes** (`login`, `signup`): Already exist from Phase 1.

## Acceptance Criteria
- [ ] A `rateLimit()` utility function exists in `lib/rate-limit.ts`.
- [ ] The unfurl API route (`POST /api/unfurl`) is rate-limited at 30 req/min per user.
- [ ] The `createShare` server action is rate-limited at 10 req/min per user.
- [ ] The `updateShareNote` server action is rate-limited at 20 req/min per user.
- [ ] The `blockUser` and `unblockUser` server actions are rate-limited at 10 req/min per user.
- [ ] The `login` server action is rate-limited at 10 req/15min per IP.
- [ ] The `signup` server action is rate-limited at 5 req/15min per IP.
- [ ] Rate-limited API routes return HTTP 429 with a `Retry-After` header.
- [ ] Rate-limited server actions return a user-friendly error message.
- [ ] The in-memory store cleans up expired entries to prevent memory leaks.
- [ ] The rate limiter fails open (allows requests) if the limiter itself errors.
- [ ] Normal usage patterns never trigger rate limits.
