dossier — Product Spec
What is it?
dossier is a social app where each user shares exactly one piece of content per day — an article, a tweet, a video, a book passage, whatever they found most valuable. That's the whole constraint: you get one slot, so you have to choose.
Your friends' picks appear on a shared visual surface (think newsstand, bookshelf, or reading table) that fills up throughout the day. You check in, see what people chose, and discover things you wouldn't have found on your own.
Why?
Most social feeds reward volume. The more you post and scroll, the more the platform wins. dossier inverts that. The constraint forces curation — you're not sharing everything, you're sharing the best thing. That makes every share a signal worth paying attention to.
It's also a quiet, ambient social experience. There's no feed to infinite-scroll, no likes to chase, no algorithm deciding what you see. You open it, see what your people shared today, maybe tap into something interesting, and close it. Done.
Core Mechanics
One share per day. Each user gets a single slot that resets daily. They fill it with a URL or a freeform entry (for books, podcasts, offline content — anything without a clean link). Optionally, they add a short note — a line or two on why they picked it. Once posted, the content is locked — you can edit the note, but you can't swap the share itself. A confirmation step before posting reinforces the weight of the choice.
The daily surface. When you open the app, you see today's shares from the people you follow. The visual treatment should feel more like browsing a curated shelf than scrolling a feed. Early in the day it's sparse; by evening it's full. That rhythm is part of the experience.
Timezone-aware days. Each user's "day" runs midnight-to-midnight in their own timezone. When viewing your feed, a share disappears when it expires in the sharer's timezone — not yours. This means the feed has a rolling quality: east coast shares cycle off first, west coast last. Users set their timezone during profile setup; it's stored on their profile.
Small social graph. This works best with a tight group — closer to a group chat than a follower count. The design should encourage intentional connections over mass following. Following is one-directional — you follow someone, they may or may not follow you back. This keeps things flexible as the graph grows.
Visibility. Shares are visible only to people who follow you. The app is not a public broadcast tool — it's a shared space for people who've opted into each other's curation.
Link unfurling. When someone shares a URL, the app pulls the title, image, and description automatically so each share has a rich visual presence without the user doing any work.

Development Phases

Phase 1 — Foundation ✓ COMPLETE
Stand up the project infrastructure and core data model. Next.js app with TypeScript, Supabase for auth and database, deploy pipeline to Vercel. Design the database schema (users, follows, shares) and implement the one-per-day constraint at the database level. Get Supabase auth working (email/magic link to start). The goal is a deployed app you can log into that reads and writes to a real database, even if there's no real UI yet.

**Implemented:**
- Next.js 16 app with TypeScript and Tailwind
- Supabase integration (`@supabase/supabase-js`, `@supabase/ssr`)
- Database schema with three tables:
  - `profiles` - user profiles linked to auth.users (id, username, display_name, avatar_url, bio)
  - `follows` - follower/following relationships with no-self-follow constraint
  - `shares` - daily content shares with `UNIQUE(user_id, shared_date)` constraint for one-per-day
- Auto-create profile trigger on user signup
- Row Level Security (public read, authenticated write for own data)
- Email/password authentication (signup + login)
- Auth callback route for session handling
- Protected route layout with auth guard
- Dashboard showing user email and profile ID
- Sign out functionality
- Middleware for session refresh

**File structure:**
```
lib/
  supabase/
    client.ts       # Browser client
    server.ts       # Server client with cookies
    middleware.ts   # Session refresh helper
  database.types.ts # TypeScript types for DB tables
middleware.ts       # Next.js middleware for auth
app/
  page.tsx          # Home page with auth-aware links
  (auth)/
    login/          # Email/password login
    signup/         # Email/password signup
    auth/callback/  # Auth redirect handler
  (protected)/
    layout.tsx      # Auth guard
    dashboard/      # User dashboard
supabase/
  migrations/
    20260205044659_init.sql
```

**Local dev:** `npx supabase start` then `npm run dev`
Phase 2 — Profile Onboarding & Timezone ✓ COMPLETE
Extend the signup flow so new users set up their profile (username, display name) and select their timezone. The timezone is stored on the `profiles` table and drives when a user's daily share window resets. Add a `timezone` column to profiles. Update the auto-create profile trigger or add a post-signup onboarding step. This must land before sharing works, since `shared_date` is derived from the user's timezone.

**Implemented:**
- Migration adding `timezone` (IANA format, default `America/New_York`) to `profiles`, plus `note`, `og_image_url`, `og_site_name` on `shares`. Dropped `shared_date` DB default so app code must compute it from the user's timezone.
- Onboarding page at `/onboarding` with form for username, display name, and timezone selector
- Auto-detects browser timezone via `Intl.DateTimeFormat`
- Server action validates username format (lowercase alphanumeric + underscores, 3+ chars), handles unique constraint violations
- Protected layout guard: checks if `profiles.username` is null and redirects to `/onboarding` (skips when already on that page)
- Signup action redirects to `/onboarding` instead of `/dashboard`
- Middleware sets `x-pathname` header for server components to read the current route
- Regenerated `database.types.ts` from Supabase (includes `Relationships`, `__InternalSupabase`, and helper types required by Supabase JS v2.94+)

**New/modified files:**
```
app/(protected)/onboarding/
  page.tsx              # Onboarding form (client component)
  actions.ts            # completeOnboarding server action
app/(protected)/layout.tsx  # Added onboarding guard
app/(auth)/signup/actions.ts # Redirect to /onboarding
lib/supabase/middleware.ts   # x-pathname header
lib/database.types.ts        # Regenerated from Supabase
supabase/migrations/
  20260205060000_add_timezone_and_share_metadata.sql
```

Phase 3 — Sharing Flow
Build the share submission experience. User pastes a URL, the app unfurls it (pulls OG metadata via a server-side route), user optionally adds a short note, and submits. Before saving, show a confirmation step — "This is your share for today. You won't be able to change it." Once posted, the content URL is locked; the note remains editable. If you've already shared today, show what you shared with the option to edit the note. Freeform entries (for content without a URL) are deferred to a later phase.

Phase 4 — The Daily View
Build the main screen — the surface where you see today's shares from people you follow. Each share rendered as a card with the unfurled content (title, image, source) and the sharer's note. Tapping a card opens the original content. Shares are filtered by the sharer's timezone — a share disappears from your feed when it expires in the sharer's local midnight. This is the core experience so it needs to feel good even if it's visually simple at first. Must handle empty states: no follows yet, no shares yet today, you haven't shared yet.

Phase 5 — Privacy & Security
Update Row Level Security from public-read to followers-only. Shares should only be visible to authenticated users who follow the sharer. Update all queries to respect this. Add blocking — a user can block someone, which removes the follow relationship and prevents re-following. Rate limiting on API routes. This phase hardens the app before opening it up to more users.

Phase 6 — Social Graph
Follow/unfollow mechanics. Invite links — generate a personal link, share it with a friend, they sign up and can find/follow you. Username search for finding people already on the app. A simple profile page showing a user's current share and basic info. Keep the social layer minimal — this isn't a social network, it's a shared reading list.

Phase 7 — Polish and Realtime
Supabase realtime subscriptions so new shares appear on the daily view without refreshing. Transitions and micro-interactions that make the shelf feel alive as it fills up. Responsive design that works well on mobile browsers. PWA setup (manifest, icons, add-to-home-screen prompt) so it feels app-like on a phone.

Phase 8 — History and Discovery
An archive view — browse past days to see what people shared last Tuesday, last week, last month. Maybe surface patterns: "Sarah has shared 3 articles from this author" or "this link was shared by 4 people." This is the phase where the daily constraint starts producing a valuable long-term artifact.

Phase 9 — Account Management & Settings
Settings screen for updating profile (display name, username, timezone), changing password, and managing blocked users. Account deletion with data cleanup. Freeform share entries could also land here once the core loop is proven.

Phase 10 — Infrastructure Hardening
OG metadata caching — store unfurled metadata on the share record so we're not re-fetching on every render. Image proxying or storage so unfurled images don't break from CORS, expiry, or slow third-party servers. Performance profiling and optimization.