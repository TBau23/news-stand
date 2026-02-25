-- Phase 5: Followers-Only Share Visibility
-- Tightens RLS so shares are only visible to the owner and their followers.
-- Scopes follows reads to authenticated users only.
-- Profiles remain publicly readable (needed for search, invite links, etc.).

-- ============================================================
-- 1. Shares: Replace public-read with owner + followers-only
-- ============================================================

-- Remove the public-read policy
DROP POLICY "Shares are publicly readable" ON shares;

-- Users can always read their own shares
CREATE POLICY "Users can read own shares"
  ON shares FOR SELECT
  USING (auth.uid() = user_id);

-- Followers can read shares of people they follow
-- (Postgres evaluates multiple SELECT policies with OR semantics)
CREATE POLICY "Followers can read shares"
  ON shares FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM follows
      WHERE follows.follower_id = auth.uid()
        AND follows.following_id = shares.user_id
    )
  );

-- ============================================================
-- 2. Follows: Replace public-read with authenticated-only
-- ============================================================

DROP POLICY "Follows are publicly readable" ON follows;

CREATE POLICY "Authenticated users can read follows"
  ON follows FOR SELECT
  USING (auth.uid() IS NOT NULL);
