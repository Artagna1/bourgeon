-- Bourgeon — base Supabase pour la synchronisation entre appareils.
-- À coller dans Supabase ▸ SQL Editor ▸ « New query », puis « Run ».
--
-- Une ligne par utilisateur et par module (journal, habits, focus, goals,
-- eisenhower, revisions, sport). Chaque utilisateur ne voit et ne modifie
-- QUE ses propres lignes (Row Level Security).

create table if not exists public.bourgeon_docs (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  section    text        not null,
  data       jsonb       not null,
  version    integer     not null default 1,
  changed_at timestamptz not null default now(),   -- heure de la modification sur l'appareil
  updated_at timestamptz not null default now(),   -- heure d'arrivée sur le serveur
  primary key (user_id, section)
);

alter table public.bourgeon_docs enable row level security;

drop policy if exists "bourgeon lecture"      on public.bourgeon_docs;
drop policy if exists "bourgeon ajout"        on public.bourgeon_docs;
drop policy if exists "bourgeon modification" on public.bourgeon_docs;
drop policy if exists "bourgeon suppression"  on public.bourgeon_docs;

create policy "bourgeon lecture" on public.bourgeon_docs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bourgeon ajout" on public.bourgeon_docs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bourgeon modification" on public.bourgeon_docs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "bourgeon suppression" on public.bourgeon_docs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- updated_at est toujours l'heure du serveur : elle sert à savoir ce qui a
-- changé depuis la dernière synchro. changed_at (heure de la modification sur
-- l'appareil) sert à départager deux appareils qui ont modifié le même module.
create or replace function public.bourgeon_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bourgeon_touch on public.bourgeon_docs;
create trigger bourgeon_touch
  before insert or update on public.bourgeon_docs
  for each row execute function public.bourgeon_touch();
