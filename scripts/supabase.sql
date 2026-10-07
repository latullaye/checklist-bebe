-- THOMAS911: tables for the good-habits tracking. Paste into Supabase → SQL Editor → Run.

-- One row per day and box (bouche-matin, perinee-soir, bain, ...)
create table if not exists habitudes (
  jour date not null,
  cle text not null,
  fait boolean not null default true,
  maj timestamptz not null default now(),
  primary key (jour, cle)
);

-- Phones that want the reminders (Web Push subscriptions)
create table if not exists abonnements (
  endpoint text primary key,
  abonnement jsonb not null,
  cree timestamptz not null default now()
);

-- The app uses the public key with no login: let it read and write these two tables only.
alter table habitudes enable row level security;
alter table abonnements enable row level security;
drop policy if exists "app" on habitudes;
drop policy if exists "app" on abonnements;
create policy "app" on habitudes for all to anon using (true) with check (true);
create policy "app" on abonnements for all to anon using (true) with check (true);
