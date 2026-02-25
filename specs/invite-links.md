# Invite Links

## Phase
6 — Social Graph

## What It Does
Allows a user to generate a personal invite link that they can share with friends outside the app. When someone visits the link, they see a landing page about the inviter and are prompted to sign up. After signing up, the new user is directed to follow the inviter. This is the primary mechanism for growing the social graph intentionally.

## User-Facing Behavior

### Generating an Invite Link
The user taps "Invite a friend" from the daily view header or a dedicated spot in the UI. Their personal invite link is displayed (e.g., `https://memo.app/invite/tombauer`) and can be copied to the clipboard or shared via the native Web Share API. There is no limit on how many times the link can be shared — it's a permanent, personal URL tied to the user's username.

### Invite Landing Page (Unauthenticated Visitor)
Someone clicks the invite link and sees a simple page:
- The inviter's avatar, display name, and username.
- A brief explanation: "**@tombauer** uses Memo to share one great find every day. Join to see what they're reading."
- A prominent "Sign up" button.
- A secondary "Already have an account? Log in" link.

### Post-Signup Flow (Invited User)
After the new user signs up and completes onboarding:
1. They are redirected to the inviter's profile page (`/profile/[username]`).
2. The profile page shows the inviter's info and a "Follow" button.
3. The new user follows the inviter (manual action, not automatic — preserves the intentional follow mechanic).

### Already Authenticated Visitor
If a logged-in user visits an invite link, they are redirected directly to the inviter's profile page. The invite landing page is only for unauthenticated visitors.

## Route

### Landing Page: `/invite/[username]`
A **public** (unprotected) page under `app/invite/[username]/page.tsx`. This page lives outside the `(protected)` route group because it must be accessible to unauthenticated visitors.

### Why Username-Based, Not Token-Based
The invite link is simply the inviter's username embedded in a URL. No unique invite tokens, no tracking codes, no expiration.

Reasons:
- **Simplicity:** No new database table needed. No token generation, no token lookup.
- **Permanence:** The link never expires. The user can put it in their bio, email signature, etc.
- **Shareability:** The URL is human-readable and memorable.
- **Privacy:** No tracking of who invited whom (the app philosophy is minimal social mechanics).

The tradeoff is no invite analytics (can't count how many people signed up via a specific link). This is acceptable for the "shared reading list" ethos. If invite tracking becomes important later, a `referrer` column can be added to `profiles` to record who invited whom.

> **Open Decision: Should invites be tracked?**
> Options:
> 1. No tracking — username-based URLs, no database changes. Simple.
> 2. Track referrals — add `referred_by UUID REFERENCES profiles(id)` to `profiles`. Store the inviter's ID during signup when a `?ref=username` param is present. Enables "invited by @username" display and future analytics.
>
> Recommendation: Option 1 for Phase 6. The app intentionally avoids growth-hacking mechanics. If referral tracking is needed, add it as a lightweight addition later.

## Data Fetching

### Landing Page (Server Component)
Fetch the inviter's profile by username:
```sql
SELECT id, username, display_name, avatar_url
FROM profiles
WHERE username = $1
LIMIT 1
```

This uses the public-read RLS on `profiles` — no authentication required.

### Post-Signup Redirect
The invite landing page stores the inviter's username in the signup URL as a query parameter: `/signup?invite=tombauer`. The signup action reads this parameter and, after successful signup, redirects to `/onboarding?invite=tombauer`. After onboarding completes, the redirect goes to `/profile/tombauer` instead of `/dashboard`.

## Landing Page Layout

```
┌──────────────────────────────────────────┐
│                                          │
│              Memo                         │
│                                          │
│           [Avatar]                       │
│        Display Name                      │
│         @username                        │
│                                          │
│  @username uses Memo to share one great  │
│  find every day. Join to see what        │
│  they're reading.                        │
│                                          │
│        [ Sign up ]                       │
│                                          │
│    Already have an account? Log in       │
│                                          │
└──────────────────────────────────────────┘
```

### Design Notes
- The page should feel like an invitation, not a marketing page. Warm, simple, personal.
- The inviter's avatar and name make it feel like "someone you know invited you" rather than a generic signup page.
- No feature lists, no screenshots, no pricing. Just the person and a CTA.

## Generating and Sharing the Link

### "Invite a Friend" Entry Point
Located in the daily view header or a discoverable location in the UI.

> **Open Decision: Where does the invite action live?**
> Options:
> 1. In the daily view header (e.g., a share/invite icon next to the user avatar).
> 2. In a simple user menu dropdown from the header avatar.
> 3. On the user's own profile page.
>
> Recommendation: Option 2 — user menu. The header is already getting crowded (app name, share button, search icon, avatar). Putting "Invite" in a dropdown triggered by the avatar keeps the header clean. The menu can also hold "Sign out" and a future "Settings" link.

### Share Sheet
When the user triggers "Invite a friend":
1. Generate the URL: `${window.location.origin}/invite/${username}`.
2. If the Web Share API is available (`navigator.share`), invoke it with:
   - `title`: "Join me on Memo"
   - `text`: "I use Memo to share one great find every day. Follow me to see what I'm reading."
   - `url`: the invite URL
3. If the Web Share API is not available (desktop browsers), show a modal with:
   - The invite URL in a read-only input field.
   - A "Copy link" button that copies to clipboard and shows "Copied!" confirmation.

### No Server Action Needed
The invite URL is deterministic (based on the username), so no server-side generation is required. The client constructs the URL from the current user's username, which is available from the session.

## Signup Flow Modifications

### Updated Signup Page
The signup page at `/signup` accepts an optional `invite` query parameter. When present:
- The signup form is the same (email/password).
- After successful signup, the redirect includes `?invite=username` in the onboarding URL.

### Updated Onboarding Action
The `completeOnboarding` server action at `app/(protected)/onboarding/actions.ts` accepts an optional `inviteUsername` parameter. When present:
- After saving the profile, redirect to `/profile/[inviteUsername]` instead of `/dashboard`.
- If the invite username doesn't exist in the database, silently fall back to redirecting to `/dashboard`. No error — the invite link may have been from a deleted account.

### Updated Onboarding Page
The onboarding page reads the `invite` query parameter from the URL and passes it to the `completeOnboarding` action on form submission.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| Invite link with non-existent username | Landing page shows 404: "This invite link is no longer valid." with a link to the homepage and a "Sign up anyway" CTA. |
| Invite link with a user who has no display name | Show username as the primary name. The page still works. |
| Invite link visited by logged-in user | Redirect to `/profile/[username]`. Skip the landing page. |
| Invite link visited by logged-in user who already follows the inviter | They land on the profile page showing "Following" state. No issue. |
| `?invite=username` persists through signup to onboarding | Stored as a URL parameter at each step. If the user navigates away and comes back to onboarding without the param, they get the default flow (redirect to dashboard). No issue. |
| Invite username has been claimed by a different user since the link was created | Not possible — the link is always based on the current username, and usernames are unique and permanent (no username changes in Phase 6; editing comes in Phase 9). |
| User changes their username (Phase 9) | Old invite links break. This is a known limitation. Phase 9 could add username redirects or document this tradeoff. |
| Copy-to-clipboard fails (clipboard API not available) | Show the URL as selectable text so the user can manually copy it. |
| Web Share API fails | Fall back to the copy-link modal. |

## Data Model Changes
None. The invite system is stateless — it uses existing usernames as the link mechanism and query parameters for flow tracking.

## API Routes or Server Actions
No new server actions. Changes to existing actions:
- `signup` action in `app/(auth)/signup/actions.ts`: Pass through the `invite` query parameter to the post-signup redirect.
- `completeOnboarding` action in `app/(protected)/onboarding/actions.ts`: Accept optional `inviteUsername`, redirect to profile page when provided.

## UI States

### Landing Page
- **Loading:** Skeleton with avatar circle and text placeholders.
- **Valid inviter:** Full landing page with inviter info and CTAs.
- **Invalid username (404):** "This invite link is no longer valid" message.

### Share Sheet (Generating Link)
- **Web Share API available:** Native share sheet opens.
- **No Web Share API:** Modal with copyable URL and "Copy link" button.
- **Copied:** "Copy link" button briefly shows "Copied!" confirmation.

## Dependencies
- **User Profile Page** (`specs/user-profile-page.md`): Post-signup redirect target. The profile page with its follow button completes the invite flow.
- **Follow/Unfollow** (`specs/follow-unfollow.md`): The new user follows the inviter from the profile page.
- **Phase 2 (Onboarding)**: Onboarding page and action need minor modifications to support the invite parameter.
- **Phase 1 (Auth)**: Signup action needs to pass through the invite parameter.
- **Profiles public RLS**: The landing page fetches profile data without authentication.

## Acceptance Criteria
- [ ] Invite landing page exists at `/invite/[username]` as a public (unauthenticated) route.
- [ ] Landing page displays the inviter's avatar, display name, and username.
- [ ] Landing page shows a "Sign up" button that links to `/signup?invite=[username]`.
- [ ] Landing page shows a "Log in" link for existing users.
- [ ] Logged-in users visiting an invite link are redirected to `/profile/[username]`.
- [ ] Non-existent usernames show a 404 page with a signup fallback.
- [ ] "Invite a friend" action is accessible from the UI (header menu or similar).
- [ ] Invite URL uses the Web Share API when available, falls back to copy-to-clipboard.
- [ ] The `invite` query parameter persists through signup → onboarding → profile redirect.
- [ ] After completing onboarding via an invite, the user lands on the inviter's profile page.
- [ ] If the invite username is invalid at redirect time, the user falls back to the dashboard.
- [ ] No new database tables or columns are required.
