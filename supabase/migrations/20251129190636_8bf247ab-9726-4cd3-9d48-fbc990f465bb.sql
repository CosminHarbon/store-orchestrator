-- Add setup_completed flag to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT false;

-- Add welcome_dismissed flag for users who want to skip wizard
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_dismissed BOOLEAN DEFAULT false;