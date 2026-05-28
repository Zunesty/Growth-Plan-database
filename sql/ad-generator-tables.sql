-- Ad Generator: Supabase schema
-- Run this in Supabase → SQL Editor when bootstrapping a new project.
-- Matches the JSONB-per-row pattern the rest of the codebase uses.

-- ─── ad_batches ──────────────────────────────────────────────────────────
create table if not exists public.ad_batches (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_batches_created_at_idx
  on public.ad_batches (created_at desc);

-- ─── ad_creatives ────────────────────────────────────────────────────────
create table if not exists public.ad_creatives (
  id text primary key,
  batch_id text not null references public.ad_batches(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_creatives_batch_id_idx
  on public.ad_creatives (batch_id);

create index if not exists ad_creatives_created_at_idx
  on public.ad_creatives (created_at);

-- ─── Row-level security ──────────────────────────────────────────────────
-- We use the anon key from both the browser and Vercel server functions,
-- so anon needs full read+write. The app itself enforces access — this is
-- an internal tool behind the Zunesty domain.

alter table public.ad_batches    enable row level security;
alter table public.ad_creatives  enable row level security;

drop policy if exists "ad_batches: anon all" on public.ad_batches;
create policy "ad_batches: anon all"
  on public.ad_batches
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "ad_creatives: anon all" on public.ad_creatives;
create policy "ad_creatives: anon all"
  on public.ad_creatives
  for all
  to anon, authenticated
  using (true)
  with check (true);
