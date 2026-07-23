-- Follow-Up Agent: Supabase schema
-- Run this in Supabase → SQL Editor when bootstrapping a new project.
-- Matches the JSONB-per-row pattern the rest of the codebase uses.
--
-- One row per profile. `data` holds settings, encrypted secrets (Fathom key),
-- encrypted Gmail tokens, encrypted webhook secret, and the "drafted" dedupe
-- markers — everything profiles.js in the source app kept in one KV doc.
-- Secrets are encrypted at rest by the app (AES-256-GCM); this table never
-- stores plaintext.

create table if not exists public.followup_profiles (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists followup_profiles_created_at_idx
  on public.followup_profiles (created_at);

-- ─── Row-level security ──────────────────────────────────────────────────
-- We use the anon key from Vercel server functions only (this table is never
-- read/written from the browser — see followup-store.ts). Internal tool
-- behind the Zunesty domain, same posture as ad_batches/ad_creatives.

alter table public.followup_profiles enable row level security;

drop policy if exists "followup_profiles: anon all" on public.followup_profiles;
create policy "followup_profiles: anon all"
  on public.followup_profiles
  for all
  to anon, authenticated
  using (true)
  with check (true);
