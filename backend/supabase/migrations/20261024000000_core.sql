-- epstein files: core schema. Two schemas: public holds what the app may see (behind RLS), private holds everything
-- that would let someone game the waitlist (sources, truth, quality, settings). Every write goes through a
-- security-definer RPC; clients never insert into labelling tables directly.

create extension if not exists pg_cron;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- storage policies call private.can_see as the signed-in user; nothing else in private is executable by them
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------------------------
-- helpers

create table private.settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);
alter table private.settings enable row level security;

insert into private.settings (key, value) values
  ('target_votes', 12),          -- submissions an item needs before it is scored
  ('max_votes', 20),             -- never serve an item beyond this
  ('daily_goal', 20),
  ('combo_idle_s', 300),         -- the five-in-a-row combo resets after this long without a submission
  ('min_listen_ms', 1500),       -- an audio answer needs at least this much playback
  ('assignment_minutes', 20),
  ('repeat_rate', 0.03),         -- hidden retests of an item you already answered
  ('control_rate', 0.04),        -- items with a known answer
  ('audited_repeat_rate', 0.12),
  ('audited_control_rate', 0.15),
  ('repeat_gap', 25),            -- submissions between the first answer and the retest
  ('rush_s', 2.0),
  ('quality_min_refs', 15),
  ('quality_watch_follow', 0.1),
  ('quality_weak_follow', 0.1),
  ('hide_weak', 1),              -- weak labellers leave the public waitlist while they are reviewed
  ('accuracy_min_scored', 30),
  ('accuracy_percentile', 0.9),
  ('grid', 32);                  -- image shapes are rasterised onto a grid x grid mask for IoU

create function private.setting(p_key text, p_default numeric)
returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value from private.settings s where s.key = p_key), p_default);
$$;

create function private.jaccard(a text[], b text[])
returns real
language sql immutable as $$
  select case when coalesce(cardinality(a), 0) + coalesce(cardinality(b), 0) = 0 then 1
              else (select count(distinct x) from unnest(a) x where x = any (b))::real
                   / (select count(distinct y) from unnest(coalesce(a, '{}') || coalesce(b, '{}')) y) end;
$$;

-- a request through the API always carries a role claim; no claim means a direct database connection (migrations,
-- cron, psql), which is already trusted. current_user cannot be used: inside security definer it is the owner.
create function private.require_service_role()
returns void
language plpgsql stable as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'service role only' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- app config: the few switches the app itself reads (audio alpha/beta, the audio/image mix). Readable by everyone,
-- written only by admins through admin_set_config.

create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
create policy "config is public" on public.app_config for select using (true);
grant select on public.app_config to anon, authenticated;

insert into public.app_config (key, value) values
  ('audio_version', '"alpha"'),
  ('image_share', '0.5');

-- ---------------------------------------------------------------------------------------------------------------
-- people

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) between 1 and 40),
  avatar_url text check (avatar_url ~ '^(https://|avatars/)'),
  onboarded boolean not null default false,
  guest boolean not null default false,
  is_admin boolean not null default false,   -- set by the service role only; unlocks /admin RPCs
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  banned_at timestamptz
);
alter table public.profiles enable row level security;

-- gamification and integrity counters, never readable through the API
create table private.people (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seq integer not null default 0,            -- running count of submissions (retest gaps are measured in it)
  combo integer not null default 0,
  combo_at timestamptz,
  accuracy_shown_week date,
  trust real not null default 1
);
alter table private.people enable row level security;

create policy "profiles are public" on public.profiles for select using (deleted_at is null);
create policy "create own profile" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and not is_admin and banned_at is null);
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select (id, username, display_name, avatar_url, onboarded, guest, is_admin, created_at) on public.profiles to anon, authenticated;
grant insert (id, username, display_name, avatar_url, onboarded) on public.profiles to authenticated;
grant update (username, display_name, avatar_url, onboarded) on public.profiles to authenticated;

create function private.new_person()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.people (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger profiles_new_person after insert on public.profiles
  for each row execute function private.new_person();

create function private.clear_guest()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.guest and exists (select 1 from auth.users u where u.id = new.id and not u.is_anonymous) then
    new.guest := false;
  end if;
  return new;
end $$;
create trigger profiles_clear_guest before update on public.profiles
  for each row execute function private.clear_guest();

create function private.require_admin()
returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then return; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin and p.deleted_at is null) then
    raise exception 'admins only' using errcode = '42501';
  end if;
end $$;

create function private.require_labeller()
returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.deleted_at is null) then
    raise exception 'finish your profile first' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = uid and p.banned_at is not null) then
    raise exception 'this account can no longer label' using errcode = '42501';
  end if;
  return uid;
end $$;

-- a visitor without an account gets an anonymous auth user and a guest profile, so serving works the same
create function public.start_guest()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from auth.users u where u.id = uid and u.is_anonymous) then
    raise exception 'only guest sessions start as guests' using errcode = '42501';
  end if;
  insert into public.profiles (id, username, guest, onboarded)
  values (uid, 'guest_' || substr(replace(uid::text, '-', ''), 1, 12), true, true)
  on conflict (id) do nothing;
end $$;

create function public.account_status(p_email text)
returns text
language sql stable security definer set search_path = '' as $$
  select 'ok'::text;
$$;

create function public.delete_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  update public.profiles p
  set deleted_at = now(), username = 'deleted_' || substr(md5(p.id::text || clock_timestamp()::text), 1, 12),
      display_name = null, avatar_url = null
  where p.id = uid and p.deleted_at is null;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- items: one audio clip or image to label. The app sees only an opaque id, the media path of the item it is
-- assigned, and the options to choose from. Where it came from (and any known answer) lives in private.item_sources.

create table public.items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('audio', 'image')),
  media_path text not null unique,           -- object in the 'clips' (audio) or 'images' bucket
  batch text not null default 'default',
  class_options text[] not null check (cardinality(class_options) between 1 and 24),
  duration_s real,
  width integer,
  height integer,
  target_votes smallint not null default 12,
  votes integer not null default 0,
  priority real not null default 0,
  active boolean not null default true,
  scored_at timestamptz,
  created_at timestamptz not null default now()
);
create index items_serving on public.items (kind, active, votes);
alter table public.items enable row level security;
revoke all on public.items from anon, authenticated;

create table private.item_sources (
  item_id uuid primary key references public.items (id) on delete cascade,
  source_uid text not null unique,
  role text not null default 'task' check (role in ('task', 'control')),
  truth text[],                              -- tokens of the known answer, controls only
  info jsonb not null default '{}'
);
alter table private.item_sources enable row level security;

create table public.assignments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  attempt smallint not null default 1,
  state text not null default 'open' check (state in ('open', 'done', 'skipped', 'expired')),
  audio_version text,
  assigned_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, item_id, attempt)
);
create index assignments_open on public.assignments (user_id) where state = 'open';
alter table public.assignments enable row level security;
create policy "own assignments" on public.assignments for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.assignments from anon, authenticated;

create table public.submissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  attempt smallint not null default 1,
  kind text not null check (kind in ('audio', 'image')),
  audio_version text check (audio_version in ('alpha', 'beta')),
  labels text[] not null default '{}',       -- audio alpha: chosen labels; beta: [primary]; image: [class]
  intensity smallint check (intensity between 0 and 100),
  shape jsonb,                               -- image: {"type":"rect","x","y","w","h"} or {"type":"polygon","points":[[x,y],...]}, 0..1
  not_present boolean not null default false,
  unsure boolean not null default false,
  tokens text[] not null default '{}',       -- what consensus is computed over (labels, or class:cell for images)
  listen_ms integer not null default 0,
  elapsed_ms integer,
  score real,                                -- agreement (audio) or IoU (image) with the item's consensus, once scored
  seq integer,
  created_at timestamptz not null default now(),
  unique (user_id, item_id, attempt)
);
create index submissions_item on public.submissions (item_id);
create index submissions_user on public.submissions (user_id, created_at);
alter table public.submissions enable row level security;
create policy "own submissions" on public.submissions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.submissions from anon, authenticated;
grant select (id, item_id, kind, labels, intensity, not_present, unsure, created_at) on public.submissions to authenticated;

create table public.item_consensus (
  item_id uuid primary key references public.items (id) on delete cascade,
  tokens text[] not null,
  labels text[] not null,                    -- consensus classes without mask cells
  agreement real,                            -- mean submission score (how much judges agreed)
  judges integer not null,
  scored_at timestamptz not null default now()
);
alter table public.item_consensus enable row level security;
revoke all on public.item_consensus from anon, authenticated;

-- waitlist: points, ranks and movement. Visible through RPCs only.
create table public.user_scores (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  submissions integer not null default 0,
  scored integer not null default 0,
  points real not null default 0,
  agreement real,
  iou real,
  rank integer,
  updated_at timestamptz not null default now()
);
alter table public.user_scores enable row level security;
revoke all on public.user_scores from anon, authenticated;

create table public.waitlist_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  old_rank integer,
  new_rank integer not null,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index waitlist_events_user on public.waitlist_events (user_id, created_at desc);
alter table public.waitlist_events enable row level security;
revoke all on public.waitlist_events from anon, authenticated;

create table private.rank_snapshots (
  week date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rank integer not null,
  points real not null,
  primary key (week, user_id)
);
alter table private.rank_snapshots enable row level security;

create table public.island_membership (
  week date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  primary key (week, user_id)
);
alter table public.island_membership enable row level security;
revoke all on public.island_membership from anon, authenticated;

create table public.bans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  evidence jsonb not null default '{}',
  banned_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  lifted_at timestamptz
);
alter table public.bans enable row level security;
revoke all on public.bans from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- storage: audio and images are private; a labeller can read exactly the item they hold an open assignment for.

insert into storage.buckets (id, name, public) values
  ('clips', 'clips', false),
  ('images', 'images', false),
  ('avatars', 'avatars', true)
on conflict (id) do nothing;

create function private.can_see(p_bucket text, p_name text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a join public.items i on i.id = a.item_id
    where a.user_id = auth.uid() and a.state = 'open' and a.expires_at > now()
      and i.media_path = p_name and i.kind = case p_bucket when 'clips' then 'audio' when 'images' then 'image' end);
$$;

grant execute on function private.can_see(text, text) to authenticated;

create policy "labellers see their assigned item" on storage.objects for select to authenticated
  using (bucket_id in ('clips', 'images') and private.can_see(bucket_id, name));
create policy "admins upload items" on storage.objects for insert to authenticated
  with check (bucket_id in ('clips', 'images') and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "remove own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "list own avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

revoke all on function public.start_guest() from public, anon;
grant execute on function public.start_guest() to authenticated;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
