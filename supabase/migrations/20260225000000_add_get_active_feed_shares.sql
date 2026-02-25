-- Phase 4: Feed Query — get_active_feed_shares database function
-- Fetches today's active shares from people the current user follows,
-- filtering out shares that have expired in the sharer's local timezone.

CREATE OR REPLACE FUNCTION get_active_feed_shares(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content_url TEXT,
  title TEXT,
  description TEXT,
  og_image_url TEXT,
  og_site_name TEXT,
  note TEXT,
  shared_date DATE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT
) AS $$
  SELECT
    s.id, s.user_id, s.content_url, s.title, s.description,
    s.og_image_url, s.og_site_name, s.note, s.shared_date,
    s.created_at, s.updated_at,
    p.username, p.display_name, p.avatar_url
  FROM shares s
  JOIN follows f ON s.user_id = f.following_id
  JOIN profiles p ON s.user_id = p.id
  WHERE f.follower_id = p_user_id
    AND (s.shared_date + INTERVAL '1 day') AT TIME ZONE p.timezone > now()
  ORDER BY s.created_at DESC;
$$ LANGUAGE sql STABLE;
