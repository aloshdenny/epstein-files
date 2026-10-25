-- labeller quality, ported from ASMRboard and generalised to tokens so one engine covers audio alpha, audio beta and
-- images (each its own track: a version switch must not mix experiments).
--
-- follow score: how much better your answer matches the reference of the item you were served (others' majority)
-- than the references of other items you answered (cyclic shifts), normalised by how alike references are anyway.
-- Careful labellers sit well above 0; random or fixed answers sit near 0. 'weak' needs statistical confidence that
-- follow is under quality_weak_follow (one-sided 95%); everything weak goes to admin review, nobody is auto-banned.

create function private.refresh_quality()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  min_refs numeric := private.setting('quality_min_refs', 15);
  watch_follow numeric := private.setting('quality_watch_follow', 0.1);
  weak_follow numeric := private.setting('quality_weak_follow', 0.1);
  rush_s numeric := private.setting('rush_s', 2.0);
begin
  drop table if exists _first;
  create temporary table _first on commit drop as
    select s.user_id, s.item_id, s.kind, s.labels, s.tokens, s.listen_ms, s.elapsed_ms, s.unsure,
           case when s.kind = 'image' then 'image' else 'audio-' || coalesce(s.audio_version, 'alpha') end as track,
           coalesce(src.role, 'task') as role, s.score
    from public.submissions s left join private.item_sources src on src.item_id = s.item_id
    where s.attempt = 1;
  create index on _first (item_id);

  delete from private.labeller_quality where true;
  insert into private.labeller_quality (user_id, track, answers, refs, matched, unmatched, ref_similarity, follow,
    follow_se, retests, retest_agreement, controls, control_score, median_answer_s, rush_rate, timing_cv,
    median_listen_ms, top_label, top_label_share, unsure_rate, skip_rate, flags, status, computed_at)
  with ans as (
    select * from _first where not unsure and role = 'task'
  ), refd as (
    select f.user_id, f.track, f.item_id, f.tokens,
           coalesce(array(
             select x from ans o, unnest(o.tokens) x where o.item_id = f.item_id and o.user_id <> f.user_id
             group by x having 2 * count(*) >= (select count(*) from ans o2 where o2.item_id = f.item_id and o2.user_id <> f.user_id)
           ), '{}') as ref
    from ans f
    where (select count(*) from ans o2 where o2.item_id = f.item_id and o2.user_id <> f.user_id) >= 4
  ), usable as (
    select r.*, (row_number() over (partition by r.user_id, r.track order by r.item_id) - 1)::integer as i,
           (count(*) over (partition by r.user_id, r.track))::integer as n
    from refd r
  ), per as (
    select u.user_id, u.track, u.i,
           private.jaccard(u.tokens, u.ref) as jm,
           avg(private.jaccard(u.tokens, v.ref)) as ju,
           avg(private.jaccard(u.ref, v.ref)) as jr
    from usable u
    cross join lateral generate_series(1, least(5, u.n - 1)) k
    join usable v on v.user_id = u.user_id and v.track = u.track and v.i = (u.i + k) % u.n
    group by u.user_id, u.track, u.i, u.tokens, u.ref
  ), fol as (
    select user_id, track, count(*)::integer as refs, avg(jm) as matched, avg(ju) as unmatched, avg(jr) as ref_sim,
           avg(jm - ju) / greatest(0.1, 1 - avg(jr)) as follow,
           coalesce(stddev_samp(jm - ju), 0) / sqrt(count(*)) / greatest(0.1, 1 - avg(jr)) as follow_se
    from per group by user_id, track
  ), timing as (
    select f.user_id, f.track,
           count(*) filter (where not f.unsure)::integer as answers,
           avg(f.unsure::int) as unsure_rate,
           percentile_cont(0.5) within group (order by f.listen_ms) filter (where f.kind = 'audio') as med_listen,
           percentile_cont(0.5) within group (order by f.elapsed_ms / 1000.0) as med_answer_s,
           avg((f.elapsed_ms / 1000.0 < rush_s)::int) as rush_rate,
           stddev_samp(f.elapsed_ms::float8) / nullif(avg(f.elapsed_ms::float8), 0) as timing_cv
    from _first f group by f.user_id, f.track
  ), tops as (
    select distinct on (t.user_id, t.track) t.user_id, t.track, t.x as top_label, t.c::numeric / t.n as top_share
    from (select f.user_id, f.track, coalesce(f.labels[1], case when 'none' = any (f.tokens) then 'not present' end) as x,
                 count(*) over (partition by f.user_id, f.track, coalesce(f.labels[1], case when 'none' = any (f.tokens) then 'not present' end)) as c,
                 count(*) over (partition by f.user_id, f.track) as n
          from ans f) t
    where t.x is not null
    order by t.user_id, t.track, t.c desc, t.x
  ), ret as (
    select a.user_id, case when a.kind = 'image' then 'image' else 'audio-' || coalesce(a.audio_version, 'alpha') end as track,
           count(*)::integer as retests, avg(private.jaccard(a.tokens, b.tokens)) as retest_j
    from public.submissions a join public.submissions b on b.user_id = a.user_id and b.item_id = a.item_id and b.attempt = 2
    where a.attempt = 1 and not a.unsure and not b.unsure
    group by 1, 2
  ), ctrl as (
    select f.user_id, f.track, count(*)::integer as controls, avg(f.score) as control_score
    from _first f where f.role = 'control' and not f.unsure and f.score is not null group by 1, 2
  ), skips as (
    select user_id, avg((state = 'skipped')::int) as skip_rate
    from public.assignments where state in ('done', 'skipped') group by user_id
  ), joined as (
    select t.user_id, t.track, coalesce(t.answers, 0) as answers, coalesce(f.refs, 0) as refs,
           f.matched, f.unmatched, f.ref_sim, f.follow, f.follow_se,
           coalesce(r.retests, 0) as retests, r.retest_j, coalesce(c.controls, 0) as controls, c.control_score,
           t.med_answer_s, t.rush_rate, t.timing_cv, t.med_listen, tp.top_label, tp.top_share, t.unsure_rate, sk.skip_rate,
           array_remove(array[
             case when coalesce(f.refs, 0) >= min_refs and f.follow + 1.645 * f.follow_se < weak_follow
                  then 'answers do not follow the item' end,
             case when coalesce(f.refs, 0) >= min_refs and f.follow < watch_follow
                       and not (f.follow + 1.645 * f.follow_se < weak_follow)
                  then 'answers barely follow the item' end,
             case when t.answers >= 20 and t.rush_rate > 0.3 then 'rushing' end,
             case when t.answers >= 20 and t.track like 'audio%' and t.med_listen < 3000 then 'not listening' end,
             case when t.answers >= 30 and t.timing_cv < 0.15 then 'robotic timing' end,
             case when t.answers >= 20 and tp.top_share > 0.8 then 'same label every time' end,
             case when coalesce(r.retests, 0) >= 5 and r.retest_j < 0.3 then 'inconsistent on repeats' end,
             case when coalesce(c.controls, 0) >= 5 and c.control_score < 0.3 then 'misses check items' end,
             case when t.answers + coalesce(t.unsure_rate, 0) >= 20 and t.unsure_rate > 0.5 then 'mostly can''t tell' end
           ], null) as flags
    from timing t
    left join fol f on f.user_id = t.user_id and f.track = t.track
    left join ret r on r.user_id = t.user_id and r.track = t.track
    left join ctrl c on c.user_id = t.user_id and c.track = t.track
    left join tops tp on tp.user_id = t.user_id and tp.track = t.track
    left join skips sk on sk.user_id = t.user_id
  )
  select user_id, track, answers, refs, matched, unmatched, ref_sim, follow, follow_se, retests, retest_j, controls,
         control_score, med_answer_s, rush_rate, timing_cv, med_listen, top_label, top_share, unsure_rate, skip_rate, flags,
         case when 'answers do not follow the item' = any (flags) then 'weak'
              when cardinality(flags) > 0 then 'watch'
              when refs >= min_refs then 'ok'
              else 'new' end,
         now()
  from joined;

  -- trust: careful labellers count fully in consensus, watched ones half
  update private.people p set trust = case when exists (select 1 from private.labeller_quality q where q.user_id = p.user_id and q.status = 'watch') then 0.5 else 1 end where true;
end $$;

select cron.schedule('refresh-quality', '7,22,37,52 * * * *', 'select private.refresh_quality()');
