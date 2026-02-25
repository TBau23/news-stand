-- Phase 5: User Blocking
-- Creates the blocks table, RLS policies, and updates the follows INSERT policy
-- to prevent following when a block exists in either direction.

-- Create blocks table
CREATE TABLE blocks (
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id != blocked_id)
);

-- Indexes for lookup in both directions
CREATE INDEX idx_blocks_blocker_id ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked_id ON blocks(blocked_id);

-- Enable RLS
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- Users can read their own blocks (as blocker or blocked)
CREATE POLICY "Users can read own blocks"
  ON blocks FOR SELECT
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

-- Users can create blocks (only as the blocker)
CREATE POLICY "Users can block others"
  ON blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Users can remove their own blocks (unblock)
CREATE POLICY "Users can unblock"
  ON blocks FOR DELETE
  USING (auth.uid() = blocker_id);

-- Update follows INSERT policy to check for blocks in either direction
DROP POLICY "Authenticated users can follow others" ON follows;

CREATE POLICY "Authenticated users can follow others"
  ON follows FOR INSERT
  WITH CHECK (
    auth.uid() = follower_id
    AND NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocks.blocker_id = follower_id AND blocks.blocked_id = following_id)
         OR (blocks.blocker_id = following_id AND blocks.blocked_id = follower_id)
    )
  );
