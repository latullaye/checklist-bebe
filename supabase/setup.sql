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
-- The family itself, kept out of this public code: entered once in the database, read by the screens (behind the family
-- code), the assistant, the Claude connector and the calendar reading. Fill in your own values.
-- insert into reglages (cle, valeur) values ('famille', jsonb_build_object(
--   'prenom', '<prénom du bébé>', 'naissance', '<AAAA-MM-JJTHH:MM:00-04:00>', 'jour', '<AAAA-MM-JJ>', 'fuseau', 'America/Toronto',
--   'ville', '<ville>', 'parents', jsonb_build_array('<parent 1>', '<parent 2>'), 'lieux_france', jsonb_build_array('<lieu>', '<lieu>')));

-- Growth measures (weight to the gram; length and head circumference optional).
-- pese_le: exact time of the measure (gain per day is computed from it); fuseau: the phone's time zone then;
-- jour: the local date, used for the age in days of the WHO percentiles; lieu: where it was taken (scales differ).
create table mesures (
  id uuid primary key default gen_random_uuid(),
  jour date not null,
  pese_le timestamptz not null,
  fuseau text,
  poids_g integer check (poids_g between 500 and 40000),
  taille_cm numeric(4,1) check (taille_cm between 30 and 150),
  pc_cm numeric(4,1) check (pc_cm between 25 and 65),
  note text,
  lieu text check (lieu in ('clsc', 'medecin', 'maison')),
  cree timestamptz not null default now()
);
alter table mesures enable row level security;
create policy "app" on mesures for all to anon using (true) with check (true);
create index mesures_jour on mesures (jour);
create index mesures_pese_le on mesures (pese_le);
-- The growth screen also keeps its milk settings in reglages, key "lait": { cible: "P50" | "naissance" | grams, boires }

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

-- ---------- Family code ----------
-- The app sends the family code in the x-famille header (famille.js); only its SHA-256 is kept, in prive (key famille_sha256).
-- Every table the app uses opens only with it.
create or replace function public.famille_ok() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    encode(extensions.digest(coalesce(current_setting('request.headers', true)::json ->> 'x-famille', ''), 'sha256'), 'hex')
      = (select valeur from public.prive where cle = 'famille_sha256'),
    false)
$$;
grant execute on function public.famille_ok() to anon, authenticated;
-- The first tables (open until the app sent the code) get the same lock, on their policy "app" (applied after PR #29):
alter policy "app" on habitudes using ((select famille_ok())) with check ((select famille_ok()));
alter policy "app" on abonnements using ((select famille_ok())) with check ((select famille_ok()));
alter policy "app" on checklist using ((select famille_ok())) with check ((select famille_ok()));
alter policy "app" on reglages using ((select famille_ok())) with check ((select famille_ok()));
alter policy "app" on mesures using ((select famille_ok())) with check ((select famille_ok()));

-- ---------- Health ----------
-- Problems: start as a symptom ("Diarrhée"), get a diagnosis later ("Gastro-entérite").
create table sante_problemes (
  id uuid primary key default gen_random_uuid(),
  titre text not null, diagnostic text, debut date not null, fin date, notes text,
  par text, cree timestamptz not null default now(), maj timestamptz not null default now()
);
-- What was seen, when: symptoms [{k, n?}] (counts since the note before), temperature, wet diapers, observations, what was done.
create table sante_notes (
  id uuid primary key default gen_random_uuid(),
  probleme uuid references sante_problemes(id) on delete cascade,
  le timestamptz not null, jour date not null, fuseau text,
  symptomes jsonb not null default '[]'::jsonb,
  temperature numeric(3,1) check (temperature between 34 and 43), couches smallint check (couches between 0 and 30),
  observe text, fait text, par text, cree timestamptz not null default now()
);
-- Appointments, past or to come; agenda_uid: the event of the Family calendar it comes from.
create table sante_rdv (
  id uuid primary key default gen_random_uuid(),
  le timestamptz not null, fuseau text,
  type text not null default 'medecin' check (type in ('medecin', 'clsc', 'hopital', 'urgences', 'telephone', 'soin', 'autre')),
  lieu text, pro text, motif text, compte_rendu text, diagnostic text, suivi text,
  problemes uuid[] not null default '{}', annule boolean not null default false, agenda_uid text unique,
  par text, cree timestamptz not null default now(), maj timestamptz not null default now()
);
-- Medications as prescribed: every N hours, at set times (on the clock of fuseau), or when needed.
create table sante_medicaments (
  id uuid primary key default gen_random_uuid(),
  nom text not null, dose text,
  mode text not null default 'intervalle' check (mode in ('intervalle', 'heures', 'besoin')),
  toutes_h numeric(4,1) check (toutes_h > 0 and toutes_h <= 168), heures text[], max_jour smallint check (max_jour between 1 and 24),
  debut timestamptz not null, fuseau text, fin date, arrete timestamptz,
  probleme uuid references sante_problemes(id) on delete set null, rdv uuid references sante_rdv(id) on delete set null,
  consignes text, notes text, rappels boolean not null default true,
  par text, cree timestamptz not null default now(), maj timestamptz not null default now()
);
-- Each dose given.
create table sante_prises (
  id uuid primary key default gen_random_uuid(),
  medicament uuid not null references sante_medicaments(id) on delete cascade,
  le timestamptz not null, fuseau text, dose text, note text, par text, cree timestamptz not null default now()
);
-- Health-looking events read from the Family calendar (the "sante" function), waiting for "for Thomas" or "ignore".
create table agenda (
  uid text primary key, debut timestamptz not null, fin timestamptz, journee boolean not null default false,
  titre text not null, lieu text, fuseau text, decision text check (decision in ('ajoute', 'ignore')), vu timestamptz not null default now()
);
-- Reminders already sent (a 5-minute tick never sends one twice); server only.
create table rappels_envoyes (cle text primary key, le timestamptz not null default now());
alter table sante_problemes enable row level security; alter table sante_notes enable row level security;
alter table sante_rdv enable row level security; alter table sante_medicaments enable row level security;
alter table sante_prises enable row level security; alter table agenda enable row level security;
alter table rappels_envoyes enable row level security;
create policy famille on sante_problemes for all to anon using ((select famille_ok())) with check ((select famille_ok()));
create policy famille on sante_notes for all to anon using ((select famille_ok())) with check ((select famille_ok()));
create policy famille on sante_rdv for all to anon using ((select famille_ok())) with check ((select famille_ok()));
create policy famille on sante_medicaments for all to anon using ((select famille_ok())) with check ((select famille_ok()));
create policy famille on sante_prises for all to anon using ((select famille_ok())) with check ((select famille_ok()));
create policy famille on agenda for all to anon using ((select famille_ok())) with check ((select famille_ok()));
-- The Family calendar's secret iCal address goes in prive, key agenda_ical (never in the code).
-- Every 5 minutes: dose and appointment reminders, the evening note; once an hour, the calendar
select cron.schedule('sante', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://vvkkxphkyjejyhbcdcuw.supabase.co/functions/v1/sante',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select valeur from public.prive where cle = 'cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);

-- ---------- Photos and the assistant ----------
-- Photos of the notes and appointments: object names (<uuid>.jpg) in a private bucket that opens with the family code
-- (Storage passes the request headers to famille_ok() too). The phone sends them, and deletes them with their note.
alter table sante_notes add column photos text[];
alter table sante_rdv add column photos text[];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sante-photos', 'sante-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);
create policy "famille lit les photos" on storage.objects for select to anon
  using (bucket_id = 'sante-photos' and (select public.famille_ok()));
create policy "famille ajoute des photos" on storage.objects for insert to anon
  with check (bucket_id = 'sante-photos' and (select public.famille_ok()));
create policy "famille supprime des photos" on storage.objects for delete to anon
  using (bucket_id = 'sante-photos' and (select public.famille_ok()));
-- What the assistant (function "assistant", Claude) was asked, without the content: when, who, which sheet, tokens, time.
-- Server only. Its Anthropic key goes in prive, key anthropic_api_key (or the function's secret ANTHROPIC_API_KEY), never in the code.
create table assistant_journal (
  id bigint generated always as identity primary key, le timestamptz not null default now(),
  par text, sorte text, modele text, entree integer, sortie integer, ms integer, refus boolean not null default false
);
alter table assistant_journal enable row level security;

-- ---------- The address book ----------
-- Health professionals and places (personne false: a CLSC, a hospital), to pick for an appointment: it takes their type,
-- place and name. mots: other words the Family calendar uses for them ("GMF HMR"). actif false: not followed any more,
-- hidden from the choice, kept for the past appointments. Filled from the family's emails and calendar (not in this file).
create table sante_pros (
  id uuid primary key default gen_random_uuid(),
  nom text not null, role text,
  type text not null default 'medecin' check (type in ('medecin', 'clsc', 'hopital', 'urgences', 'telephone', 'soin', 'autre')),
  personne boolean not null default true,
  lieu text, adresse text, telephone text, courriel text, site text, notes text,
  mots text[] not null default '{}',
  actif boolean not null default true,
  par text, cree timestamptz not null default now(), maj timestamptz not null default now()
);
alter table sante_pros enable row level security;
create policy famille on sante_pros for all to anon using ((select famille_ok())) with check ((select famille_ok()));
alter table sante_rdv add column pro_id uuid references sante_pros(id) on delete set null;
create index sante_rdv_pro_id on sante_rdv (pro_id);

-- ---------- Clean-up after the security review (2026-10) ----------
-- The test bucket "essai-entete" is closed (its three policies say false); the duplicate Anthropic key is emptied
-- (the function reads its secret ANTHROPIC_API_KEY). To remove them for good, in the SQL Editor:
--   drop policy "essai entete ajoute" on storage.objects; drop policy "essai entete lit" on storage.objects;
--   drop policy "essai entete supprime" on storage.objects;
--   delete from prive where cle = 'anthropic_api_key_a_supprimer';
--   then delete the empty bucket "essai-entete" in Storage.
