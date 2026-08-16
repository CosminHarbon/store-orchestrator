-- Extend existing push_tokens for FCM while preserving OneSignal rows.
-- Do NOT drop onesignal_player_id or existing data.

ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'onesignal',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_provider_check'
  ) THEN
    ALTER TABLE public.push_tokens
      ADD CONSTRAINT push_tokens_provider_check
      CHECK (provider IN ('onesignal', 'fcm'));
  END IF;
END $$;

-- Globally unique device tokens so a device can be reassigned to the logged-in user.
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_device_token_uidx
  ON public.push_tokens (device_token);

CREATE INDEX IF NOT EXISTS push_tokens_user_active_idx
  ON public.push_tokens (user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS push_tokens_user_provider_idx
  ON public.push_tokens (user_id, provider)
  WHERE is_active = true;

COMMENT ON COLUMN public.push_tokens.provider IS 'onesignal (legacy) | fcm (Capacitor + Firebase)';
COMMENT ON COLUMN public.push_tokens.device_id IS 'Stable local device identifier for upsert/logout cleanup';
COMMENT ON COLUMN public.push_tokens.is_active IS 'Soft-deactivate invalid/expired FCM tokens without deleting history immediately';
