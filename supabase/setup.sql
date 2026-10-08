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
  tz text not null default 'America/Toronto', -- the phone's time zone, kept up to date by the app
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

-- Outing checklist shared between both phones: one row per item (its label)
create table checklist (
  cle text primary key,
  fait boolean not null default false,
  maj timestamptz not null default now()
);
alter table checklist enable row level security;
create policy "app" on checklist for all to anon using (true) with check (true);

-- Shared settings (e.g. the indoor temperature on the "what to wear" screen)
create table reglages (
  cle text primary key,
  valeur jsonb not null,
  maj timestamptz not null default now()
);
alter table reglages enable row level security;
create policy "app" on reglages for all to anon using (true) with check (true);
insert into reglages (cle, valeur) values ('temp_interieur', '21');

-- Reminders: pg_cron calls the "rappels" function (supabase/functions/rappels/index.ts)
create extension if not exists pg_cron;
create extension if not exists pg_net;
insert into public.prive (cle, valeur) values ('cron', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (cle) do nothing;
-- Every half hour: each phone gets its reminder at 9:00, 12:30 and 17:30 in its own time zone
select cron.schedule('rappels-habitudes', '0,30 * * * *', $$
  select net.http_post(
    url := 'https://vvkkxphkyjejyhbcdcuw.supabase.co/functions/v1/rappels',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select valeur from public.prive where cle = 'cron')),
    body := '{}'::jsonb
  );
$$);
