-- scoring: once an item has its quorum of independent judges, its consensus is every token (an audio label, or an
-- image class:cell) that at least half the trusted judges chose, weighted by trust. Each submission then scores the
-- Jaccard overlap with that consensus: label agreement for audio, IoU against the majority mask for images.
-- Banned and weak labellers never shape the consensus, but they are still scored against it.

create function private.score_item(p_item uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  cons text[];
  n integer;
  tw real;
begin
  with judges as (
    select s.tokens, coalesce(pp.trust, 1) as w
    from public.submissions s
    join public.profiles p on p.id = s.user_id
    left join private.people pp on pp.user_id = s.user_id
    where s.item_id = p_item and s.attempt = 1 and not s.unsure and p.banned_at is null and not private.is_weak(s.user_id)
  )
  select count(*), sum(w) into n, tw from judges;
  if coalesce(n, 0) = 0 then return; end if;

  with judges as (
    select s.tokens, coalesce(pp.trust, 1) as w
    from public.submissions s
    join public.profiles p on p.id = s.user_id
    left join private.people pp on pp.user_id = s.user_id
    where s.item_id = p_item and s.attempt = 1 and not s.unsure and p.banned_at is null and not private.is_weak(s.user_id)
  )
  select coalesce(array_agg(x order by x), '{}') into cons
  from (select x from judges, unnest(tokens) x group by x having 2 * sum(w) >= tw) t;

  update public.submissions s set score = private.jaccard(s.tokens, cons)
  where s.item_id = p_item and not s.unsure;

  insert into public.item_consensus (item_id, tokens, labels, agreement, judges, scored_at)
  values (p_item, cons,
          coalesce(array(select distinct split_part(x, ':', 1) from unnest(cons) x order by 1), '{}'),
          (select avg(s.score) from public.submissions s join public.profiles p on p.id = s.user_id
           where s.item_id = p_item and s.attempt = 1 and not s.unsure and p.banned_at is null and not private.is_weak(s.user_id)),
          n, now())
  on conflict (item_id) do update
    set tokens = excluded.tokens, labels = excluded.labels, agreement = excluded.agreement,
        judges = excluded.judges, scored_at = excluded.scored_at;

  update public.items i set scored_at = now() where i.id = p_item;
end $$;

-- waitlist: points are the sum of submission scores (volume times quality). Rank changes are logged so the app can
-- say "you moved up the Epstein waitlist". Guests, banned and (while reviewed) weak labellers are not ranked.
create function private.refresh_ranks()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  hide boolean := private.setting('hide_weak', 1) > 0;
begin
  drop table if exists _ranks;
  create temporary table _ranks (user_id uuid primary key, submissions integer, scored integer, points real,
                                 agreement real, iou real, rank integer) on commit drop;
  insert into _ranks
  with agg as (
    select s.user_id, count(*)::integer as submissions, count(s.score)::integer as scored,
           coalesce(sum(s.score), 0)::real as points,
           avg(s.score) filter (where s.kind = 'audio')::real as agreement,
           avg(s.score) filter (where s.kind = 'image')::real as iou
    from public.submissions s group by s.user_id
  )
  select a.user_id, a.submissions, a.scored, a.points, a.agreement, a.iou,
         case when p.deleted_at is null and not p.guest and p.banned_at is null and a.scored > 0
                   and not (hide and private.is_weak(a.user_id))
              then rank() over (partition by (p.deleted_at is null and not p.guest and p.banned_at is null and a.scored > 0
                                              and not (hide and private.is_weak(a.user_id)))
                                order by a.points desc, a.scored desc, p.created_at) end
  from agg a join public.profiles p on p.id = a.user_id;

  insert into public.waitlist_events (user_id, old_rank, new_rank)
  select r.user_id, u.rank, r.rank
  from _ranks r left join public.user_scores u on u.user_id = r.user_id
  where r.rank is not null and r.rank is distinct from u.rank;

  insert into public.user_scores (user_id, submissions, scored, points, agreement, iou, rank, updated_at)
  select user_id, submissions, scored, points, agreement, iou, rank, now() from _ranks
  on conflict (user_id) do update
    set submissions = excluded.submissions, scored = excluded.scored, points = excluded.points,
        agreement = excluded.agreement, iou = excluded.iou, rank = excluded.rank, updated_at = excluded.updated_at;
  update public.user_scores u set rank = null where not exists (select 1 from _ranks r where r.user_id = u.user_id);
end $$;

-- the weekly snapshot: full ranking for the leaderboard's past weeks, and who was on the island
create function private.snapshot_week(p_week date default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  wk date := coalesce(p_week, date_trunc('week', now())::date);
begin
  perform private.refresh_ranks();
  delete from private.rank_snapshots s where s.week = wk;
  delete from public.island_membership m where m.week = wk;
  insert into private.rank_snapshots (week, user_id, rank, points)
  select wk, u.user_id, u.rank, u.points from public.user_scores u where u.rank is not null;
  insert into public.island_membership (week, user_id, position)
  select wk, u.user_id, row_number() over (order by u.rank, u.points desc) from public.user_scores u
  where u.rank is not null order by u.rank limit 10;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- public reads

create function public.leaderboard(p_week date default null, p_limit integer default 50)
returns table (rank integer, username text, display_name text, avatar_url text, points real, scored integer,
               agreement real, iou real, on_island boolean)
language sql stable security definer set search_path = '' as $$
  select u.rank, p.username, p.display_name, p.avatar_url, u.points, u.scored, u.agreement, u.iou, u.rank <= 10
  from public.user_scores u join public.profiles p on p.id = u.user_id
  where p_week is null and u.rank is not null and p.deleted_at is null
  union all
  select s.rank, p.username, p.display_name, p.avatar_url, s.points, null, null, null,
         exists (select 1 from public.island_membership m where m.week = s.week and m.user_id = s.user_id)
  from private.rank_snapshots s join public.profiles p on p.id = s.user_id
  where p_week is not null and s.week = p_week and p.deleted_at is null
  order by 1, 5 desc
  limit least(greatest(p_limit, 1), 200);
$$;

create function public.leaderboard_weeks()
returns table (week date)
language sql stable security definer set search_path = '' as $$
  select distinct s.week from private.rank_snapshots s order by 1 desc limit 26;
$$;

-- the newest unseen rank change (then all are marked seen): "you moved up the Epstein waitlist, #412 → #398"
create function public.pop_waitlist_event()
returns table (old_rank integer, new_rank integer, ranked integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  first_old integer;
  last_new integer;
begin
  if uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select e.old_rank into first_old from public.waitlist_events e where e.user_id = uid and not e.seen order by e.id limit 1;
  select e.new_rank into last_new from public.waitlist_events e where e.user_id = uid and not e.seen order by e.id desc limit 1;
  if last_new is null then return; end if;
  update public.waitlist_events e set seen = true where e.user_id = uid and not e.seen;
  return query select first_old, last_new, (select count(*)::integer from public.user_scores u where u.rank is not null);
end $$;

create function public.profile_stats(p_username text)
returns table (username text, display_name text, avatar_url text, joined timestamptz, submissions integer,
               scored integer, points real, agreement real, iou real, rank integer, ranked integer, island_weeks integer)
language sql stable security definer set search_path = '' as $$
  select p.username, p.display_name, p.avatar_url, p.created_at,
         coalesce(u.submissions, 0), coalesce(u.scored, 0), coalesce(u.points, 0), u.agreement, u.iou, u.rank,
         (select count(*)::integer from public.user_scores x where x.rank is not null),
         (select count(*)::integer from public.island_membership m where m.user_id = p.id)
  from public.profiles p left join public.user_scores u on u.user_id = p.id
  where p.username = lower(p_username) and p.deleted_at is null and (not p.guest or p.id = auth.uid());
$$;

create function public.rank_history(p_username text)
returns table (week date, rank integer, points real)
language sql stable security definer set search_path = '' as $$
  select s.week, s.rank, s.points
  from private.rank_snapshots s join public.profiles p on p.id = s.user_id
  where p.username = lower(p_username) and p.deleted_at is null
  order by s.week desc limit 26;
$$;

create function public.contributions(p_username text, p_tz text default 'UTC')
returns table (day date, n integer)
language sql stable security definer set search_path = '' as $$
  select (s.created_at at time zone private.safe_tz(p_tz))::date, count(*)::integer
  from public.submissions s join public.profiles p on p.id = s.user_id
  where p.username = lower(p_username) and p.deleted_at is null and (not p.guest or p.id = auth.uid())
    and s.created_at > now() - interval '371 days'
  group by 1 order by 1;
$$;

create function public.site_stats()
returns table (submissions bigint, labellers bigint, items bigint, items_scored bigint)
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.submissions),
         (select count(distinct s.user_id) from public.submissions s),
         (select count(*) from public.items i where i.active),
         (select count(*) from public.items i where i.active and i.scored_at is not null);
$$;

-- the weekly accuracy note: at least accuracy_min_scored scored answers this week and an average score at or above
-- the accuracy_percentile of everyone else who qualifies. Shown at most once a week (calling it marks it shown).
create function public.accuracy_check()
returns table (eligible boolean, agreement real, percentile real)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  wk date := date_trunc('week', now())::date;
  minn numeric := private.setting('accuracy_min_scored', 30);
  mine real;
  pct real;
begin
  if uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if exists (select 1 from private.people p where p.user_id = uid and p.accuracy_shown_week = wk) then
    return query select false, null::real, null::real; return;
  end if;
  with w as (
    select s.user_id, avg(s.score)::real as a from public.submissions s
    where s.created_at >= wk and s.score is not null group by s.user_id having count(*) >= minn
  )
  select (select a from w where user_id = uid),
         (select (count(*) filter (where a <= (select a from w where user_id = uid)))::real / nullif(count(*), 0) from w)
  into mine, pct;
  if mine is null or pct < private.setting('accuracy_percentile', 0.9) then
    return query select false, mine, pct; return;
  end if;
  update private.people p set accuracy_shown_week = wk where p.user_id = uid;
  return query select true, mine, pct;
end $$;

revoke all on function public.pop_waitlist_event() from public, anon;
revoke all on function public.accuracy_check() from public, anon;
grant execute on function public.pop_waitlist_event() to authenticated;
grant execute on function public.accuracy_check() to authenticated;
grant execute on function public.leaderboard(date, integer), public.leaderboard_weeks(), public.profile_stats(text),
  public.rank_history(text), public.contributions(text, text), public.site_stats() to anon, authenticated;

select cron.schedule('refresh-ranks', '*/5 * * * *', 'select private.refresh_ranks()');
select cron.schedule('snapshot-week', '55 23 * * 0', 'select private.snapshot_week()');
