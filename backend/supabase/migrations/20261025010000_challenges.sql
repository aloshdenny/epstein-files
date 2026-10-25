create table public.challenges (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  kind text not null check (kind in ('audio', 'image')),
  blurb text not null default '',
  class_options text[] not null check (cardinality(class_options) between 1 and 48),
  open boolean not null default true,
  active boolean not null default true,
  owner_id uuid references public.profiles (id) on delete set null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.challenges enable row level security;
revoke all on public.challenges from anon, authenticated;

alter table public.items drop constraint items_class_options_check;
alter table public.items add constraint items_class_options_check check (cardinality(class_options) between 1 and 48);
alter table public.items add column challenge text references public.challenges (slug) on update cascade on delete set null;
create index items_challenge_serving on public.items (challenge, active, votes);

create table public.challenge_members (
  challenge text not null references public.challenges (slug) on update cascade on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'labeller')),
  via text not null check (via in ('owner', 'open', 'link', 'email', 'qr')),
  joined_at timestamptz not null default now(),
  primary key (challenge, user_id)
);
alter table public.challenge_members enable row level security;
revoke all on public.challenge_members from anon, authenticated;

create schema if not exists private;
create table private.invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  challenge text not null references public.challenges (slug) on update cascade on delete cascade,
  channel text not null check (channel in ('link', 'email', 'qr')),
  email text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  check ((channel = 'email' and email is not null) or (channel <> 'email' and email is null))
);
alter table private.invites enable row level security;
revoke all on private.invites from public, anon, authenticated;
grant usage on schema private to authenticated;
insert into private.settings (key, value) values ('genuine_min_labels', 10)
on conflict (key) do nothing;

create table private.pending_owners (
  email text not null,
  slug text primary key references public.challenges (slug) on update cascade on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.pending_owners enable row level security;

create function private.challenge_admin(p_uid uuid, p_slug text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.challenge_members m
    where m.challenge = p_slug and m.user_id = p_uid and m.role = 'admin'
  ) or exists (
    select 1 from public.profiles p where p.id = p_uid and p.is_admin
  );
$$;

create function private.can_label(p_uid uuid, p_slug text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.challenges c
    where c.slug = p_slug and c.active and (
      c.open or private.challenge_admin(p_uid, p_slug)
      or exists (select 1 from public.challenge_members m where m.challenge = p_slug and m.user_id = p_uid)
    )
  );
$$;

create function private.can_upload_challenges()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.challenge_members m where m.user_id = auth.uid() and m.role = 'admin')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin);
$$;

grant execute on function private.can_upload_challenges() to authenticated;

create policy "challenge admins upload items" on storage.objects for insert to authenticated
  with check (bucket_id in ('clips', 'images') and private.can_upload_challenges());

create function private.claim_pending_challenges()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  addr text;
  pending record;
begin
  select lower(u.email) into addr from auth.users u where u.id = new.id;
  if addr is null then return new; end if;
  for pending in select p.slug from private.pending_owners p where lower(p.email) = addr loop
    update public.challenges c set owner_id = new.id where c.slug = pending.slug and c.owner_id is null;
    insert into public.challenge_members (challenge, user_id, role, via)
    select pending.slug, new.id, 'admin', 'owner'
    where exists (select 1 from public.challenges c where c.slug = pending.slug and c.owner_id = new.id)
    on conflict (challenge, user_id) do update set role = 'admin', via = 'owner';
    delete from private.pending_owners p where p.slug = pending.slug;
  end loop;
  return new;
end $$;

create trigger claim_pending_challenges
after insert on public.profiles
for each row execute function private.claim_pending_challenges();

insert into public.challenges (slug, title, kind, blurb, class_options, open, sort)
values
  ('asmrboard', 'ASMRboard', 'audio',
   'Short ASMR clips. Tag every sound you hear. 18+: some clips have intimate sounds.',
   array['breathing', 'kissing', 'oral sounds', 'moaning', 'whispering', 'normal speech', 'laughing', 'gasping',
         'singing', 'tapping', 'scratching', 'crinkling', 'brushing', 'liquid', 'spraying', 'microphone touching',
         'sticky', 'fabric rustling', 'paper rustling', 'cutting', 'clapping', 'background music', 'silence / room tone',
         'sex slapping', 'wet sounds', 'squirting', 'spanking', 'vibrator', 'gagging', 'whimpering', 'growling',
         'grunting', 'bed creaking'], true, 10),
  ('epstein-labelling', 'Epstein labelling', 'image',
   'Draw a box around Jeffrey Epstein. If he isn’t in the photo, say so.',
   array['jeffrey epstein', 'ghislaine maxwell', 'other person', 'document', 'none of these'], false, 20),
  ('bird-calls', 'Bird calls', 'audio', 'Identify the bird, or say there are no birds.',
   array['bird song', 'crow', 'pigeon', 'gull', 'owl', 'no birds'], true, 30),
  ('street-signs', 'Street signs', 'image', 'Find the street sign, or say the photo has none.',
   array['stop sign', 'speed limit', 'crosswalk'], true, 40)
on conflict (slug) do update set
  title = excluded.title, kind = excluded.kind, blurb = excluded.blurb,
  class_options = excluded.class_options, open = excluded.open, sort = excluded.sort;

update public.items
set challenge = 'epstein-labelling'
where batch = 'epstein' and challenge is null;

insert into private.pending_owners (email, slug)
values ('aloshdenny@gmail.com', 'asmrboard'), ('aloshdenny@gmail.com', 'epstein-labelling')
on conflict (slug) do update set email = excluded.email;

update public.challenges c
set owner_id = p.id
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = 'aloshdenny@gmail.com'
  and c.slug in ('asmrboard', 'epstein-labelling');

insert into public.challenge_members (challenge, user_id, role, via)
select c.slug, c.owner_id, 'admin', 'owner'
from public.challenges c where c.owner_id is not null
on conflict (challenge, user_id) do update set role = 'admin', via = 'owner';

delete from private.pending_owners p
where exists (
  select 1 from public.challenges c join auth.users u on u.id = c.owner_id
  where c.slug = p.slug and lower(u.email) = lower(p.email)
);

create function public.challenges()
returns table (
  slug text, title text, kind text, blurb text, class_options text[], open boolean, active boolean,
  items bigint, scored bigint, labellers bigint, joined boolean, my_role text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  return query
    select c.slug, c.title, c.kind, c.blurb, c.class_options, c.open, c.active,
           count(distinct i.id)::bigint, count(distinct i.id) filter (where i.scored_at is not null)::bigint,
           count(distinct s.user_id)::bigint,
           coalesce(bool_or(m.user_id = uid), false),
           max(m.role) filter (where m.user_id = uid)
    from public.challenges c
    left join public.items i on i.challenge = c.slug
    left join public.submissions s on s.item_id = i.id and s.attempt = 1
    left join public.challenge_members m on m.challenge = c.slug
    where c.active and (c.open or exists (
      select 1 from public.challenge_members mine where mine.challenge = c.slug and mine.user_id = uid
    ) or private.challenge_admin(uid, c.slug))
    group by c.slug
    order by c.sort, c.created_at desc;
end $$;

create function public.my_challenges()
returns table (
  slug text, title text, kind text, blurb text, class_options text[], open boolean, active boolean,
  items bigint, scored bigint, answers bigint, labellers bigint, agreement real, flagged_labellers bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  return query
    select c.slug, c.title, c.kind, c.blurb, c.class_options, c.open, c.active,
           coalesce(stats.items, 0), coalesce(stats.scored, 0), coalesce(stats.answers, 0),
           coalesce(stats.labellers, 0), stats.agreement, coalesce(flags.count, 0)
    from public.challenges c
    left join lateral (
      select count(distinct i.id)::bigint as items,
             count(distinct i.id) filter (where i.scored_at is not null)::bigint as scored,
             count(s.id)::bigint as answers,
             count(distinct s.user_id)::bigint as labellers,
             avg(s.score)::real as agreement
      from public.items i left join public.submissions s on s.item_id = i.id and s.attempt = 1
      where i.challenge = c.slug
    ) stats on true
    left join lateral (
      select count(*) filter (where g.eligible and g.status <> 'genuine')::bigint as count
      from public.challenge_genuineness(c.slug) g
    ) flags on true
    where private.challenge_admin(uid, c.slug)
    order by c.sort, c.created_at desc;
end $$;

create function public.create_challenge(
  p_slug text, p_title text, p_kind text, p_blurb text, p_class_options text[], p_open boolean
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_labeller();
begin
  if p_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'slug must use lowercase letters, digits and hyphens' using errcode = '22023'; end if;
  if p_kind not in ('audio', 'image') then raise exception 'kind must be audio or image' using errcode = '22023'; end if;
  if cardinality(p_class_options) not between 1 and 48
     or exists (select 1 from unnest(p_class_options) x where btrim(x) = '') then
    raise exception 'provide 1 to 48 class options' using errcode = '22023';
  end if;
  insert into public.challenges (slug, title, kind, blurb, class_options, open, owner_id)
  values (p_slug, btrim(p_title), p_kind, coalesce(btrim(p_blurb), ''), p_class_options, p_open, uid);
  insert into public.challenge_members (challenge, user_id, role, via) values (p_slug, uid, 'admin', 'owner');
  return p_slug;
end $$;

create function public.update_challenge(
  p_slug text, p_title text, p_kind text, p_blurb text, p_class_options text[], p_open boolean, p_active boolean default true
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.challenge_admin(auth.uid(), p_slug) then raise exception 'challenge admins only' using errcode = '42501'; end if;
  if p_kind not in ('audio', 'image') or cardinality(p_class_options) not between 1 and 48 then
    raise exception 'invalid challenge options' using errcode = '22023';
  end if;
  update public.challenges c
  set title = btrim(p_title), kind = p_kind, blurb = coalesce(btrim(p_blurb), ''),
      class_options = p_class_options, open = p_open, active = p_active
  where c.slug = p_slug;
  if not found then raise exception 'challenge not found' using errcode = 'P0002'; end if;
end $$;

create function public.join_challenge(p_slug text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_labeller();
begin
  if not exists (select 1 from public.challenges c where c.slug = p_slug and c.active and c.open) then
    raise exception 'this challenge is not open to join' using errcode = '42501';
  end if;
  insert into public.challenge_members (challenge, user_id, role, via) values (p_slug, uid, 'labeller', 'open')
  on conflict (challenge, user_id) do nothing;
  return p_slug;
end $$;

create function public.invite_info(p_token text)
returns table (slug text, title text, kind text, blurb text, open boolean, valid boolean, reason text, inviter text)
language plpgsql stable security definer set search_path = '' as $$
declare
  inv private.invites;
begin
  select * into inv from private.invites i where i.token = p_token;
  if not found then return query select null::text, null::text, null::text, null::text, null::boolean, false, 'not found'::text, null::text; return; end if;
  return query
    select c.slug, c.title, c.kind, c.blurb, c.open,
           (i.revoked_at is null and i.expires_at > now() and (i.max_uses is null or i.uses < i.max_uses)
             and c.active and (i.email is null or lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', '')))),
           case when i.revoked_at is not null then 'revoked'
                when i.expires_at <= now() then 'expired'
                when i.max_uses is not null and i.uses >= i.max_uses then 'used'
                when not c.active then 'inactive'
                when i.email is not null and lower(i.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then 'email mismatch'
                else null end,
           p.username
    from private.invites i join public.challenges c on c.slug = i.challenge
    left join public.profiles p on p.id = i.created_by
    where i.id = inv.id;
end $$;

create function public.accept_invite(p_token text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_labeller();
  inv private.invites;
  addr text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  select * into inv from private.invites i where i.token = p_token for update;
  if not found then raise exception 'invite not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.challenge_members m where m.challenge = inv.challenge and m.user_id = uid) then return inv.challenge; end if;
  if inv.revoked_at is not null then raise exception 'invite revoked' using errcode = '42501'; end if;
  if inv.expires_at <= now() then raise exception 'invite expired' using errcode = '42501'; end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then raise exception 'invite already used' using errcode = '42501'; end if;
  if inv.email is not null and (addr = '' or addr <> lower(inv.email)) then raise exception 'invite email mismatch' using errcode = '42501'; end if;
  if not exists (select 1 from public.challenges c where c.slug = inv.challenge and c.active) then raise exception 'challenge inactive' using errcode = '42501'; end if;
  insert into public.challenge_members (challenge, user_id, role, via) values (inv.challenge, uid, 'labeller', inv.channel);
  update private.invites i set uses = i.uses + 1 where i.id = inv.id;
  return inv.challenge;
end $$;

create function public.create_invite(
  p_slug text, p_channel text, p_email text default null, p_max_uses integer default null, p_days integer default 14
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_labeller();
begin
  if not private.challenge_admin(uid, p_slug) then raise exception 'challenge admins only' using errcode = '42501'; end if;
  if p_channel not in ('link', 'email', 'qr') then raise exception 'invalid invite channel' using errcode = '22023'; end if;
  if p_channel = 'email' and coalesce(btrim(p_email), '') = '' then raise exception 'email is required' using errcode = '22023'; end if;
  if p_channel <> 'email' then p_email := null; end if;
  if p_max_uses is not null and p_max_uses < 1 then raise exception 'max uses must be positive' using errcode = '22023'; end if;
  if p_days not between 1 and 90 then raise exception 'invite days must be from 1 to 90' using errcode = '22023'; end if;
  return query
    insert into private.invites (challenge, channel, email, created_by, expires_at, max_uses)
    values (p_slug, p_channel, lower(btrim(p_email)), uid, now() + make_interval(days => p_days), p_max_uses)
    returning private.invites.id, private.invites.token, private.invites.expires_at;
end $$;

create function public.challenge_invites(p_slug text)
returns table (id uuid, channel text, email text, token text, created_at timestamptz, expires_at timestamptz, max_uses integer, uses integer, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.challenge_admin(auth.uid(), p_slug) then raise exception 'challenge admins only' using errcode = '42501'; end if;
  return query select i.id, i.channel, i.email, i.token, i.created_at, i.expires_at, i.max_uses, i.uses, i.revoked_at
    from private.invites i where i.challenge = p_slug order by i.created_at desc;
end $$;

create function public.revoke_invite(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.invites i set revoked_at = now()
  where i.id = p_id and private.challenge_admin(auth.uid(), i.challenge) and i.revoked_at is null;
end $$;

create function public.challenge_members_list(p_slug text)
returns table (user_id uuid, username text, display_name text, role text, via text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.challenge_admin(auth.uid(), p_slug) then raise exception 'challenge admins only' using errcode = '42501'; end if;
  return query
    select m.user_id, p.username, case when c.open then null::text else p.display_name end, m.role, m.via, m.joined_at
    from public.challenge_members m join public.profiles p on p.id = m.user_id
    join public.challenges c on c.slug = m.challenge
    where m.challenge = p_slug order by (m.role = 'admin') desc, m.joined_at;
end $$;

create function public.challenge_add_items(p_slug text, p_items jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer := 0;
  e jsonb;
  new_id uuid;
  c public.challenges;
  upload_folder text;
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role'
     and not private.challenge_admin(auth.uid(), p_slug) then
    raise exception 'challenge admins only' using errcode = '42501';
  end if;
  if coalesce(auth.role(), 'service_role') <> 'service_role'
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    upload_folder := 'hosted/' || auth.uid() || '/';
  end if;
  select * into c from public.challenges x where x.slug = p_slug and x.active;
  if not found then raise exception 'challenge inactive' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array' using errcode = '22023'; end if;
  for e in select * from jsonb_array_elements(p_items) loop
    if coalesce(e ->> 'kind', c.kind) <> c.kind then raise exception 'item kind does not match challenge' using errcode = '22023'; end if;
    if upload_folder is not null and coalesce(e ->> 'media_path', '') not like upload_folder || '%' then
      raise exception 'challenge admins may only add items under their own hosted folder' using errcode = '42501';
    end if;
    insert into public.items (kind, media_path, batch, class_options, duration_s, width, height, target_votes, challenge)
    values (c.kind, e ->> 'media_path', coalesce(e ->> 'batch', 'challenge:' || p_slug),
            case when e ? 'class_options' then array(select jsonb_array_elements_text(e -> 'class_options')) else c.class_options end,
            (e ->> 'duration_s')::real, (e ->> 'width')::integer, (e ->> 'height')::integer,
            coalesce((e ->> 'target_votes')::smallint, private.setting('target_votes', 12)::smallint), p_slug)
    on conflict (media_path) do nothing
    returning id into new_id;
    if new_id is not null then
      insert into private.item_sources (item_id, source_uid, role, truth)
      values (new_id, coalesce(e ->> 'source_uid', e ->> 'media_path'), coalesce(e ->> 'role', 'task'),
              case when e ? 'truth' then array(select jsonb_array_elements_text(e -> 'truth')) end);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create function public.challenge_genuineness(p_slug text)
returns table (
  user_id uuid, username text, display_name text, answers integer, agreement real, genuineness real,
  flags text[], status text, eligible boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  min_labels integer := private.setting('genuine_min_labels', 10)::integer;
  ch public.challenges;
begin
  if not private.challenge_admin(auth.uid(), p_slug) then raise exception 'challenge admins only' using errcode = '42501'; end if;
  select * into ch from public.challenges c where c.slug = p_slug;
  if not found then raise exception 'challenge not found' using errcode = 'P0002'; end if;
  return query
    with ans as (
      select s.user_id, s.item_id, s.tokens, s.labels, s.elapsed_ms, s.unsure, s.attempt
      from public.submissions s join public.items i on i.id = s.item_id
      where i.challenge = p_slug
    ), firsts as (
      select a.* from ans a where a.attempt = 1
    ), refs as (
      select f.user_id, f.item_id, f.tokens,
        coalesce(array(
          select x from firsts o, unnest(o.tokens) x
          where o.item_id = f.item_id and o.user_id <> f.user_id and not o.unsure
          group by x
          having 2 * count(*) >= (select count(*) from firsts o2 where o2.item_id = f.item_id and o2.user_id <> f.user_id and not o2.unsure)
        ), '{}') as reference
      from firsts f where not f.unsure
    ), agreement as (
      select r.user_id, avg(private.jaccard(r.tokens, r.reference))::real as agreement
      from refs r group by r.user_id
    ), top_labels as (
      select distinct on (f.user_id) f.user_id, f.label, f.count::real / nullif(f.total, 0) as top_share
      from (
        select a.user_id, coalesce(a.labels[1], case when 'none' = any(a.tokens) then 'not present' end) as label,
          count(*) over (partition by a.user_id, coalesce(a.labels[1], case when 'none' = any(a.tokens) then 'not present' end)) as count,
          count(*) over (partition by a.user_id) as total
        from firsts a where not a.unsure
      ) f
      order by f.user_id, f.count desc, f.label
    ), timing as (
      select f.user_id, count(*) filter (where not f.unsure)::integer as answers,
        percentile_cont(0.5) within group (order by f.elapsed_ms / 1000.0) as median_seconds,
        max(t.top_share)::real as top_share
      from firsts f left join top_labels t on t.user_id = f.user_id group by f.user_id
    ), repeats as (
      select a.user_id, count(*)::integer as n, avg(private.jaccard(a.tokens, b.tokens))::real as retest_agreement
      from ans a join ans b on b.user_id = a.user_id and b.item_id = a.item_id and b.attempt = 2
      where a.attempt = 1 and not a.unsure and not b.unsure group by a.user_id
    ), scored as (
      select t.user_id, t.answers, coalesce(a.agreement, 0)::real as agreement, t.median_seconds, t.top_share,
        coalesce(r.n, 0) as retests, r.retest_agreement,
        array_remove(array[
          case when t.median_seconds < 2 then 'rushing' end,
          case when t.answers >= min_labels and t.top_share > 0.8 then 'single-label spam' end,
          case when r.n >= 3 and r.retest_agreement < 0.3 then 'retest disagreement' end
        ], null) as flags
      from timing t left join agreement a on a.user_id = t.user_id left join repeats r on r.user_id = t.user_id
    ), final as (
      select x.*,
        greatest(0, least(1, x.agreement
          - case when 'rushing' = any(x.flags) then 0.2 else 0 end
          - case when 'single-label spam' = any(x.flags) then 0.2 else 0 end
          - case when 'retest disagreement' = any(x.flags) then 0.2 else 0 end))::real as genuineness
      from scored x
    )
    select f.user_id, p.username, case when ch.open then null else p.display_name end,
      f.answers, f.agreement, f.genuineness, f.flags,
      case when f.genuineness >= 0.6 then 'genuine'
           when f.genuineness >= 0.35 then 'watch' else 'fake' end,
      f.answers >= min_labels
    from final f join public.profiles p on p.id = f.user_id
    order by (f.answers >= min_labels) desc, f.genuineness desc, p.username;
end $$;

drop function public.next_item();
create function public.next_item(p_challenge text default null)
returns table (item_id uuid, kind text, media_path text, class_options text[], duration_s real, width integer,
               height integer, audio_version text, expires_at timestamptz, challenge text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := private.require_labeller();
  audited boolean := private.is_audited(uid);
  me private.people;
  want text;
  picked uuid;
  att smallint := 1;
  ver text := coalesce((select c.value #>> '{}' from public.app_config c where c.key = 'audio_version'), 'alpha');
  share numeric := coalesce((select (c.value #>> '{}')::numeric from public.app_config c where c.key = 'image_share'), 0.5);
  mins numeric := private.setting('assignment_minutes', 20);
  maxv numeric := private.setting('max_votes', 20);
begin
  if p_challenge is not null and not private.can_label(uid, p_challenge) then
    raise exception 'join this challenge first' using errcode = '42501';
  end if;
  update public.assignments a set state = 'expired' where a.user_id = uid and a.state = 'open' and a.expires_at <= now();

  return query
    select i.id, i.kind, i.media_path, i.class_options, i.duration_s, i.width, i.height, a.audio_version, a.expires_at, i.challenge
    from public.assignments a join public.items i on i.id = a.item_id
    where a.user_id = uid and a.state = 'open'
      and (p_challenge is null or i.challenge = p_challenge)
      and (p_challenge is not null or i.challenge is null or private.can_label(uid, i.challenge))
    order by a.assigned_at limit 1;
  if found then return; end if;

  select * into me from private.people p where p.user_id = uid;
  if p_challenge is not null then
    select c.kind into want from public.challenges c where c.slug = p_challenge;
  else
    want := case when random() < share then 'image' else 'audio' end;
  end if;

  if random() < private.setting(case when audited then 'audited_repeat_rate' else 'repeat_rate' end, 0.03) then
    select s.item_id into picked
    from public.submissions s join public.items i on i.id = s.item_id
    where s.user_id = uid and s.attempt = 1 and i.active and not s.unsure
      and i.challenge is not distinct from p_challenge
      and s.seq <= coalesce(me.seq, 0) - private.setting('repeat_gap', 25)
      and not exists (select 1 from public.assignments a2 where a2.user_id = uid and a2.item_id = s.item_id and a2.attempt = 2)
    order by random() limit 1;
    if picked is not null then att := 2; end if;
  end if;

  if picked is null and random() < private.setting(case when audited then 'audited_control_rate' else 'control_rate' end, 0.04) then
    select i.id into picked
    from public.items i join private.item_sources src on src.item_id = i.id
    where src.role = 'control' and i.active and i.challenge is not distinct from p_challenge
      and (p_challenge is not null or i.challenge is null or private.can_label(uid, i.challenge))
      and not exists (select 1 from public.assignments a2 where a2.user_id = uid and a2.item_id = i.id)
    order by (i.kind = want) desc, random() limit 1;
  end if;

  if picked is null then
    select i.id into picked
    from public.items i join private.item_sources src on src.item_id = i.id
    where src.role = 'task' and i.active and i.votes < maxv
      and i.challenge is not distinct from p_challenge
      and (p_challenge is not null or i.challenge is null or private.can_label(uid, i.challenge))
      and not exists (select 1 from public.assignments a2 where a2.user_id = uid and a2.item_id = i.id)
    order by (i.kind = want) desc, (i.votes >= i.target_votes), i.votes desc, i.priority desc, random()
    limit 1;
  end if;
  if picked is null then return; end if;

  insert into public.assignments (user_id, item_id, attempt, audio_version, expires_at)
  select uid, i.id, att, case when i.kind = 'audio' then ver end, now() + make_interval(mins => mins::integer)
  from public.items i where i.id = picked;

  return query
    select i.id, i.kind, i.media_path, i.class_options, i.duration_s, i.width, i.height, a.audio_version, a.expires_at, i.challenge
    from public.assignments a join public.items i on i.id = a.item_id
    where a.user_id = uid and a.item_id = picked and a.attempt = att;
end $$;

drop function public.admin_queue_stats();
create function public.admin_queue_stats()
returns table (kind text, batch text, challenge text, items bigint, active bigint, scored bigint, submissions bigint, agreement real)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select i.kind, i.batch, i.challenge, count(*), count(*) filter (where i.active), count(*) filter (where i.scored_at is not null),
           coalesce(sum(i.votes), 0)::bigint, avg(c.agreement)::real
    from public.items i left join public.item_consensus c on c.item_id = i.id
    group by i.kind, i.batch, i.challenge order by i.kind, i.batch, i.challenge;
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'challenges()', 'my_challenges()', 'create_challenge(text, text, text, text, text[], boolean)',
    'update_challenge(text, text, text, text, text[], boolean, boolean)', 'join_challenge(text)',
    'invite_info(text)', 'accept_invite(text)', 'create_invite(text, text, text, integer, integer)',
    'challenge_invites(text)', 'revoke_invite(uuid)', 'challenge_members_list(text)',
    'challenge_add_items(text, jsonb)', 'challenge_genuineness(text)', 'next_item(text)', 'admin_queue_stats()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
grant execute on function public.challenges() to anon;
grant execute on function public.invite_info(text) to anon;
