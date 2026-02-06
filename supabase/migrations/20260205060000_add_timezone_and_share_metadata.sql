-- Add timezone to profiles (IANA timezone identifier, e.g. 'America/Chicago')
ALTER TABLE profiles
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/New_York';

-- Add user note and OG metadata columns to shares
ALTER TABLE shares
  ADD COLUMN note TEXT,
  ADD COLUMN og_image_url TEXT,
  ADD COLUMN og_site_name TEXT;

-- Remove the CURRENT_DATE default on shared_date.
-- The application must compute this from the user's timezone before insert.
ALTER TABLE shares
  ALTER COLUMN shared_date DROP DEFAULT;
