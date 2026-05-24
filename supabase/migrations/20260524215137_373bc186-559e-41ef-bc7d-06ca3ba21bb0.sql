
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS telegram_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS telegram_username text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id bigint;

-- Allow users to update their own profile preferences (UPDATE policy already exists per schema).
-- Add INSERT policy so handle_new_user trigger continues working (it runs as SECURITY DEFINER so this is just defensive).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users insert own profile'
  ) THEN
    CREATE POLICY "Users insert own profile" ON public.profiles
      FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_telegram_username ON public.profiles (lower(telegram_username));
