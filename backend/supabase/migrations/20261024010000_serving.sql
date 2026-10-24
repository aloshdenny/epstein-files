-- serving and submitting: one item at a time, blind. The app gets an opaque id, a media path it can read only while
-- the assignment is open, and the options. Hidden retests and control items look exactly like any other item.

-- quality verdicts per labeller and track (audio-alpha, audio-beta, image); filled by private.refresh_quality()
create table private.labeller_quality (
  user_id uuid not null references public.profiles (id) on delete cascade,
  track text not null,
  answers integer not null default 0,
  refs integer not null default 0,
  matched real, unmatched real, ref_similarity real,
  follow real, follow_se real,
  retests integer not null default 0, retest_agreement real,
  controls integer not null default 0, control_score real,
  median_answer_s real, rush_rate real, timing_cv real, median_listen_ms real,
  top_label text, top_label_share real,
  unsure_rate real, skip_rate real,
  flags text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'ok', 'watch', 'weak')),
  computed_at timestamptz not null default now(),
  primary key (user_id, track)
);
alter table private.labeller_quality enable row level security;

create function private.is_weak(p_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.labeller_quality q where q.user_id = p_user and q.status = 'weak');
$$;

create function private.is_audited(p_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.labeller_quality q where q.user_id = p_user and q.status in ('watch', 'weak'));
$$;

-- cells (row * grid + col) of a grid x grid mask whose centres fall inside a normalised rect or polygon
create function private.shape_cells(p_shape jsonb, p_grid integer)
returns integer[]
language plpgsql immutable as $$
declare
  cells integer[] := '{}';
  xs float8[];
  ys float8[];
  n integer;
  cx float8; cy float8;
  inside boolean;
  r integer; c integer; i integer; j integer;
  x0 float8; y0 float8; x1 float8; y1 float8;
begin
  if p_shape is null then return cells; end if;
  if p_shape ->> 'type' = 'rect' then
    x0 := (p_shape ->> 'x')::float8; y0 := (p_shape ->> 'y')::float8;
    x1 := x0 + (p_shape ->> 'w')::float8; y1 := y0 + (p_shape ->> 'h')::float8;
    for r in 0 .. p_grid - 1 loop
      cy := (r + 0.5) / p_grid;
      continue when cy < y0 or cy > y1;
      for c in 0 .. p_grid - 1 loop
        cx := (c + 0.5) / p_grid;
        if cx >= x0 and cx <= x1 then cells := cells || (r * p_grid + c); end if;
      end loop;
    end loop;
    return cells;
  elsif p_shape ->> 'type' = 'polygon' then
    select array_agg((p ->> 0)::float8 order by o), array_agg((p ->> 1)::float8 order by o)
      into xs, ys from jsonb_array_elements(p_shape -> 'points') with ordinality e(p, o);
    n := coalesce(cardinality(xs), 0);
    if n < 3 then return cells; end if;
    for r in 0 .. p_grid - 1 loop
      cy := (r + 0.5) / p_grid;
      for c in 0 .. p_grid - 1 loop
        cx := (c + 0.5) / p_grid;
        inside := false;
        j := n;
        for i in 1 .. n loop
          if ((ys[i] > cy) <> (ys[j] > cy))
             and (cx < (xs[j] - xs[i]) * (cy - ys[i]) / nullif(ys[j] - ys[i], 0) + xs[i]) then
            inside := not inside;
          end if;
          j := i;
        end loop;
        if inside then cells := cells || (r * p_grid + c); end if;
      end loop;
    end loop;
    return cells;
  end if;
  return cells;
end $$;

-- a valid normalised shape: rect inside 0..1 with some area, or a polygon of 3..400 points inside 0..1
create function private.valid_shape(p_shape jsonb)
returns boolean
language sql immutable as $$
  select case p_shape ->> 'type'
    when 'rect' then jsonb_typeof(p_shape -> 'x') = 'number' and jsonb_typeof(p_shape -> 'y') = 'number'
                 and jsonb_typeof(p_shape -> 'w') = 'number' and jsonb_typeof(p_shape -> 'h') = 'number'
                 and (p_shape ->> 'x')::float8 >= 0 and (p_shape ->> 'y')::float8 >= 0
                 and (p_shape ->> 'w')::float8 > 0 and (p_shape ->> 'h')::float8 > 0
                 and (p_shape ->> 'x')::float8 + (p_shape ->> 'w')::float8 <= 1.0001
                 and (p_shape ->> 'y')::float8 + (p_shape ->> 'h')::float8 <= 1.0001
    when 'polygon' then jsonb_typeof(p_shape -> 'points') = 'array'
                 and jsonb_array_length(p_shape -> 'points') between 3 and 400
                 and not exists (select 1 from jsonb_array_elements(p_shape -> 'points') p
                                 where jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2
                                    or jsonb_typeof(p -> 0) <> 'number' or jsonb_typeof(p -> 1) <> 'number'
                                    or (p ->> 0)::float8 not between 0 and 1 or (p ->> 1)::float8 not between 0 and 1)
    else false end;
$$;

create function private.day_count(p_user uuid, p_tz text)
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.submissions s
  where s.user_id = p_user and (s.created_at at time zone p_tz)::date = (now() at time zone p_tz)::date;
$$;

-- consecutive days with at least one submission, ending today (or yesterday while today is still empty)
create function private.streak(p_user uuid, p_tz text)
returns integer
language sql stable security definer set search_path = '' as $$
  with days as (
    select distinct (s.created_at at time zone p_tz)::date as d from public.submissions s where s.user_id = p_user
  ), anchor as (
    select case when exists (select 1 from days where d = (now() at time zone p_tz)::date)
                then (now() at time zone p_tz)::date else (now() at time zone p_tz)::date - 1 end as a
  ), run as (
    select d, (select a from anchor) - d as back, row_number() over (order by d desc) - 1 as rn
    from days where d <= (select a from anchor)
  )
  select count(*)::integer from run where back = rn;
$$;

create function private.safe_tz(p_tz text)
returns text
language sql stable as $$
  select coalesce((select name from pg_catalog.pg_timezone_names where name = p_tz), 'UTC');
$$;

-- ---------------------------------------------------------------------------------------------------------------

create function public.next_item()
returns table (item_id uuid, kind text, media_path text, class_options text[], duration_s real, width integer,
               height integer, audio_version text, expires_at timestamptz)
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
  update public.assignments a set state = 'expired' where a.user_id = uid and a.state = 'open' and a.expires_at <= now();

  return query
    select i.id, i.kind, i.media_path, i.class_options, i.duration_s, i.width, i.height, a.audio_version, a.expires_at
    from public.assignments a join public.items i on i.id = a.item_id
    where a.user_id = uid and a.state = 'open'
    order by a.assigned_at limit 1;
  if found then return; end if;

  select * into me from private.people p where p.user_id = uid;
  want := case when random() < share then 'image' else 'audio' end;

  -- hidden retest: an item answered long enough ago, served again as if new
  if random() < private.setting(case when audited then 'audited_repeat_rate' else 'repeat_rate' end, 0.03) then
    select s.item_id into picked
    from public.submissions s join public.items i on i.id = s.item_id
    where s.user_id = uid and s.attempt = 1 and i.active and not s.unsure
      and s.seq <= coalesce(me.seq, 0) - private.setting('repeat_gap', 25)
      and not exists (select 1 from public.assignments a2 where a2.user_id = uid and a2.item_id = s.item_id and a2.attempt = 2)
    order by random() limit 1;
    if picked is not null then att := 2; end if;
  end if;

  -- control: an item with a known answer
  if picked is null and random() < private.setting(case when audited then 'audited_control_rate' else 'control_rate' end, 0.04) then
    select i.id into picked
    from public.items i join private.item_sources src on src.item_id = i.id
    where src.role = 'control' and i.active
      and not exists (select 1 from public.assignments a2 where a2.user_id = uid and a2.item_id = i.id)
    order by (i.kind = want) desc, random() limit 1;
  end if;

  -- regular items: finish items that are closest to being scored, so the waitlist moves
  if picked is null then
    select i.id into picked
    from public.items i join private.item_sources src on src.item_id = i.id
    where src.role = 'task' and i.active and i.votes < maxv
      and not exists (select 1 from public.assignments a2 where a2.user_id = uid and a2.item_id = i.id)
    order by (i.kind = want) desc, (i.votes >= i.target_votes), i.votes desc, i.priority desc, random()
    limit 1;
  end if;

  if picked is null then return; end if;

  insert into public.assignments (user_id, item_id, attempt, audio_version, expires_at)
  select uid, i.id, att, case when i.kind = 'audio' then ver end, now() + make_interval(mins => mins::integer)
  from public.items i where i.id = picked;

  return query
    select i.id, i.kind, i.media_path, i.class_options, i.duration_s, i.width, i.height, a.audio_version, a.expires_at
    from public.assignments a join public.items i on i.id = a.item_id
    where a.user_id = uid and a.item_id = picked and a.attempt = att;
end $$;

create function public.submit_item(
  p_item uuid,
  p_labels text[] default '{}',
  p_intensity integer default null,
  p_shape jsonb default null,
  p_not_present boolean default false,
  p_unsure boolean default false,
  p_listen_ms integer default 0,
  p_tz text default 'UTC'
)
returns table (today integer, total integer, combo integer, streak integer, daily_goal integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := private.require_labeller();
  tz text := private.safe_tz(p_tz);
  a public.assignments;
  it public.items;
  src private.item_sources;
  labs text[] := coalesce(p_labels, '{}');
  toks text[] := '{}';
  cells integer[];
  g integer := private.setting('grid', 32)::integer;
  idle numeric := private.setting('combo_idle_s', 300);
  me private.people;
  new_combo integer;
begin
  select * into a from public.assignments x
  where x.user_id = uid and x.item_id = p_item and x.state = 'open' and x.expires_at > now()
  order by x.attempt desc limit 1;
  if not found then raise exception 'that item is no longer yours, grab the next one' using errcode = 'P0002'; end if;
  select * into it from public.items i where i.id = p_item;
  select * into src from private.item_sources s where s.item_id = p_item;

  if exists (select 1 from unnest(labs) x where not (x = any (it.class_options))) then
    raise exception 'unknown label' using errcode = '22023';
  end if;
  labs := array(select distinct x from unnest(labs) x order by x);

  if it.kind = 'audio' then
    if coalesce(p_listen_ms, 0) < private.setting('min_listen_ms', 1500) then
      raise exception 'listen to the clip first' using errcode = '22023';
    end if;
    if p_unsure then
      labs := '{}';
    elsif a.audio_version = 'beta' then
      if cardinality(labs) <> 1 then raise exception 'pick one main label' using errcode = '22023'; end if;
      if p_intensity is not null and p_intensity not between 0 and 100 then
        raise exception 'intensity is 0 to 100' using errcode = '22023';
      end if;
      toks := labs;
    else
      if cardinality(labs) = 0 then raise exception 'pick at least one label' using errcode = '22023'; end if;
      toks := labs;
    end if;
  else
    if p_unsure then
      labs := '{}';
    elsif p_not_present then
      labs := '{}';
      toks := array['none'];
    else
      if cardinality(labs) <> 1 then raise exception 'pick one class for the shape' using errcode = '22023'; end if;
      if not private.valid_shape(p_shape) then raise exception 'that shape does not fit the image' using errcode = '22023'; end if;
      cells := private.shape_cells(p_shape, g);
      if cardinality(cells) = 0 then raise exception 'draw a bigger shape' using errcode = '22023'; end if;
      toks := array(select labs[1] || ':' || c from unnest(cells) c);
    end if;
  end if;

  update private.people p set seq = p.seq + 1,
         combo = case when p.combo_at is null or now() - p.combo_at > make_interval(secs => idle) then 1 else p.combo + 1 end,
         combo_at = now()
  where p.user_id = uid returning * into me;
  new_combo := me.combo;

  insert into public.submissions (user_id, item_id, attempt, kind, audio_version, labels, intensity, shape, not_present,
                                  unsure, tokens, listen_ms, elapsed_ms, seq, score)
  values (uid, p_item, a.attempt, it.kind, a.audio_version, labs,
          case when it.kind = 'audio' and a.audio_version = 'beta' and not p_unsure then p_intensity end,
          case when it.kind = 'image' and not p_not_present and not p_unsure then p_shape end,
          it.kind = 'image' and p_not_present and not p_unsure, p_unsure, toks,
          greatest(coalesce(p_listen_ms, 0), 0), (extract(epoch from now() - a.assigned_at) * 1000)::integer, me.seq,
          case when src.role = 'control' and not p_unsure and src.truth is not null then private.jaccard(toks, src.truth) end);

  update public.assignments x set state = 'done'
  where x.user_id = uid and x.item_id = p_item and x.attempt = a.attempt;

  if a.attempt = 1 then
    update public.items i set votes = i.votes + 1 where i.id = p_item returning * into it;
    if src.role = 'task' and it.votes >= it.target_votes then
      perform private.score_item(p_item);
      perform private.refresh_ranks();
    end if;
  end if;

  return query select private.day_count(uid, tz), (select count(*)::integer from public.submissions s where s.user_id = uid),
                      new_combo, private.streak(uid, tz), private.setting('daily_goal', 20)::integer;
end $$;

create function public.skip_item(p_item uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_labeller();
begin
  update public.assignments a set state = 'skipped' where a.user_id = uid and a.item_id = p_item and a.state = 'open';
  update private.people p set combo = 0, combo_at = null where p.user_id = uid;
end $$;

-- where the labeller stands right now: the top bar and the label page read this
create function public.labelling_state(p_tz text default 'UTC')
returns table (today integer, total integer, combo integer, streak integer, daily_goal integer, rank integer,
               ranked integer, points real, audio_version text)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tz text := private.safe_tz(p_tz);
begin
  if uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  return query
    select private.day_count(uid, tz),
           (select count(*)::integer from public.submissions s where s.user_id = uid),
           coalesce((select case when p.combo_at > now() - make_interval(secs => private.setting('combo_idle_s', 300))
                                 then p.combo else 0 end from private.people p where p.user_id = uid), 0),
           private.streak(uid, tz),
           private.setting('daily_goal', 20)::integer,
           (select u.rank from public.user_scores u where u.user_id = uid),
           (select count(*)::integer from public.user_scores u where u.rank is not null),
           coalesce((select u.points from public.user_scores u where u.user_id = uid), 0),
           coalesce((select c.value #>> '{}' from public.app_config c where c.key = 'audio_version'), 'alpha');
end $$;

revoke all on function public.next_item() from public, anon;
revoke all on function public.submit_item(uuid, text[], integer, jsonb, boolean, boolean, integer, text) from public, anon;
revoke all on function public.skip_item(uuid) from public, anon;
revoke all on function public.labelling_state(text) from public, anon;
grant execute on function public.next_item() to authenticated;
grant execute on function public.submit_item(uuid, text[], integer, jsonb, boolean, boolean, integer, text) to authenticated;
grant execute on function public.skip_item(uuid) to authenticated;
grant execute on function public.labelling_state(text) to authenticated;
