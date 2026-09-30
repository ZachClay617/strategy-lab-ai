-- Strategy Lab AI v31 migration. Run this ONCE in the Supabase SQL Editor.
-- Records when (and which version of) the Terms of Service, Privacy Policy,
-- and Investment & Trading Disclaimer a user accepted at signup. The signup
-- form now requires an explicit, unchecked-by-default consent checkbox
-- (Disclaimer §16.6) and stores the acceptance here as evidence.
alter table public.profiles add column if not exists accepted_legal_at timestamptz;
alter table public.profiles add column if not exists accepted_legal_version text;
