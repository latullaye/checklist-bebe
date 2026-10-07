-- THOMAS911: what runs in the Supabase project (already applied; kept here for reference).

-- One row per day and box (bouche-matin, perinee-soir, vitd, bain, ...)
create table habitudes (
  jour date not null,
  cle text not null,
  fait boolean not null default true,
  maj timestamptz not null default now(),
  primary key (jour, cle)
);
-- Phones that want the reminders (Web Push subscriptions)
create table abonnements (
  endpoint text primary key,
  abonnement jsonb not null,
  cree timestamptz not null default now()
);
-- Server-only settings (VAPID keys, cron token): no policy, so the public key can't read it
create table prive (
  cle text primary key,
  valeur text not null
);
alter table habitudes enable row level security;
alter table abonnements enable row level security;
alter table prive enable row level security;
-- The app uses the public key with no login: it may read and write these two tables only
create policy "app" on habitudes for all to anon using (true) with check (true);
create policy "app" on abonnements for all to anon using (true) with check (true);
revoke all on prive from anon, authenticated;

-- Reminders: pg_cron calls the "rappels" function (supabase/functions/rappels/index.ts)
create extension if not exists pg_cron;
create extension if not exists pg_net;
insert into public.prive (cle, valeur) values ('cron', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (cle) do nothing;
-- 9:00, 12:30, 17:30 Montréal = 13/14, 16/17, 21/22 UTC (summer/winter); the function keeps only the right ones
select cron.schedule('rappels-habitudes', '0,30 13,14,16,17,21,22 * * *', $$
  select net.http_post(
    url := 'https://vvkkxphkyjejyhbcdcuw.supabase.co/functions/v1/rappels',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select valeur from public.prive where cle = 'cron')),
    body := '{}'::jsonb
  );
$$);
