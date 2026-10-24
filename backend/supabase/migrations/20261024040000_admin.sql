-- admin: callable by the service role or a signed-in profile with is_admin (set by the service role only).
-- Banning is always an explicit admin action with a reason; the quality numbers are stored as evidence.

create function public.admin_set_config(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_key = 'audio_version' and p_value #>> '{}' not in ('alpha', 'beta') then
    raise exception 'audio_version is alpha or beta' using errcode = '22023';
  elsif p_key = 'image_share' and (jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 0 and 1) then
    raise exception 'image_share is a number from 0 to 1' using errcode = '22023';
  elsif p_key not in ('audio_version', 'image_share') then
    raise exception 'unknown config key' using errcode = '22023';
  end if;
  insert into public.app_config (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
end $$;

create function public.admin_set_setting(p_key text, p_value numeric)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from private.settings s where s.key = p_key) then
    raise exception 'unknown setting' using errcode = '22023';
  end if;
  update private.settings s set value = p_value, updated_at = now() where s.key = p_key;
end $$;

create function public.admin_settings()
returns table (key text, value numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select s.key, s.value from private.settings s order by s.key;
end $$;

-- [{kind, media_path, class_options, batch?, duration_s?, width?, height?, source_uid?, role?, truth?, target_votes?}]
create function public.admin_add_items(p_items jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer := 0;
  e jsonb;
  new_id uuid;
begin
  perform private.require_admin();
  for e in select * from jsonb_array_elements(p_items) loop
    insert into public.items (kind, media_path, batch, class_options, duration_s, width, height, target_votes)
    values (e ->> 'kind', e ->> 'media_path', coalesce(e ->> 'batch', 'default'),
            array(select jsonb_array_elements_text(e -> 'class_options')),
            (e ->> 'duration_s')::real, (e ->> 'width')::integer, (e ->> 'height')::integer,
            coalesce((e ->> 'target_votes')::smallint, private.setting('target_votes', 12)::smallint))
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

create function public.admin_set_active(p_batch text, p_active boolean)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  perform private.require_admin();
  update public.items i set active = p_active where i.batch = p_batch;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.admin_queue_stats()
returns table (kind text, batch text, items bigint, active bigint, scored bigint, submissions bigint, agreement real)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select i.kind, i.batch, count(*), count(*) filter (where i.active), count(*) filter (where i.scored_at is not null),
           coalesce(sum(i.votes), 0)::bigint, avg(c.agreement)::real
    from public.items i left join public.item_consensus c on c.item_id = i.id
    group by i.kind, i.batch order by i.kind, i.batch;
end $$;

-- scored items, least agreement first: the ones worth a human look
create function public.admin_consensus(p_limit integer default 50)
returns table (item_id uuid, kind text, batch text, media_path text, labels text[], agreement real, judges integer,
               votes integer, scored_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select i.id, i.kind, i.batch, i.media_path, c.labels, c.agreement, c.judges, i.votes, c.scored_at
    from public.item_consensus c join public.items i on i.id = c.item_id
    order by c.agreement nulls first, c.scored_at desc limit least(greatest(p_limit, 1), 500);
end $$;

-- signed read access for an admin looking at one item in review
create policy "admins see items" on storage.objects for select to authenticated
  using (bucket_id in ('clips', 'images') and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create function public.admin_labeller_quality()
returns table (user_id uuid, username text, track text, status text, flags text[], answers integer, refs integer,
               follow real, follow_se real, retests integer, retest_agreement real, controls integer, control_score real,
               median_answer_s real, median_listen_ms real, top_label text, top_label_share real, unsure_rate real,
               skip_rate real, points real, banned_at timestamptz, computed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select q.user_id, p.username, q.track, q.status, q.flags, q.answers, q.refs, q.follow, q.follow_se, q.retests,
           q.retest_agreement, q.controls, q.control_score, q.median_answer_s, q.median_listen_ms, q.top_label,
           q.top_label_share, q.unsure_rate, q.skip_rate, u.points, p.banned_at, q.computed_at
    from private.labeller_quality q join public.profiles p on p.id = q.user_id
    left join public.user_scores u on u.user_id = q.user_id
    order by (q.status = 'weak') desc, (q.status = 'watch') desc, q.follow nulls last;
end $$;

create function public.admin_ban(p_user uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then raise exception 'give a reason' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'no such labeller' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user and p.banned_at is not null) then return; end if;
  insert into public.bans (user_id, reason, evidence, banned_by)
  values (p_user, btrim(p_reason),
          jsonb_build_object(
            'quality', coalesce((select jsonb_agg(to_jsonb(q)) from private.labeller_quality q where q.user_id = p_user), '[]'),
            'scores', (select to_jsonb(u) from public.user_scores u where u.user_id = p_user)),
          auth.uid());
  update public.profiles p set banned_at = now() where p.id = p_user;
  update public.assignments a set state = 'expired' where a.user_id = p_user and a.state = 'open';
  perform private.refresh_ranks();
end $$;

create function public.admin_unban(p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.bans b set lifted_at = now() where b.user_id = p_user and b.lifted_at is null;
  update public.profiles p set banned_at = null where p.id = p_user;
  perform private.refresh_ranks();
end $$;

create function public.admin_bans()
returns table (id bigint, username text, reason text, banned_by text, created_at timestamptz, lifted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select b.id, p.username, b.reason, a.username, b.created_at, b.lifted_at
    from public.bans b join public.profiles p on p.id = b.user_id left join public.profiles a on a.id = b.banned_by
    order by b.created_at desc limit 200;
end $$;

-- recompute everything now instead of waiting for cron
create function public.admin_refresh()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  it uuid;
begin
  perform private.require_admin();
  perform private.refresh_quality();
  for it in select i.id from public.items i join private.item_sources s on s.item_id = i.id
            where s.role = 'task' and i.votes >= i.target_votes loop
    perform private.score_item(it);
  end loop;
  perform private.refresh_ranks();
end $$;

create function public.admin_snapshot_week()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  perform private.snapshot_week();
end $$;

-- service role only: who can open /admin
create function public.admin_set_admin(p_username text, p_admin boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service_role();
  update public.profiles p set is_admin = p_admin where p.username = lower(p_username);
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_set_config(text, jsonb)', 'admin_set_setting(text, numeric)', 'admin_settings()', 'admin_add_items(jsonb)',
    'admin_set_active(text, boolean)', 'admin_queue_stats()', 'admin_consensus(integer)', 'admin_labeller_quality()',
    'admin_ban(uuid, text)', 'admin_unban(uuid)', 'admin_bans()', 'admin_refresh()', 'admin_snapshot_week()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on function public.admin_set_admin(text, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_admin(text, boolean) to service_role;
