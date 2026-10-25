-- Hosts upload their own challenge items from the wizard: no admin needed. Files land under hosted/<uid>/ in the
-- private buckets (policy allows exactly that folder), and host_add_items turns them into items under the host's own
-- batch prefix u_<uid8>_ so a host can only ever grow their own batch.

create policy "hosts upload own media"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('images', 'clips')
  and (storage.foldername(name))[1] = 'hosted'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.onboarded)
);

create function public.host_add_items(p_batch text, p_items jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  folder text;
  prefix text;
  n integer := 0;
  e jsonb;
  new_id uuid;
begin
  if uid is null or not exists (select 1 from public.profiles p where p.id = uid and p.onboarded) then
    raise exception 'finish your profile first' using errcode = 'P0001';
  end if;
  if p_batch is null or not (lower(p_batch) ~ '^[a-z0-9][a-z0-9_-]{0,39}$') then
    raise exception 'batch name: 1 to 40 chars, lowercase letters, digits, dash' using errcode = 'P0001';
  end if;
  folder := 'hosted/' || uid || '/';
  prefix := 'u_' || left(uid::text, 8) || '_';
  for e in select * from jsonb_array_elements(p_items) loop
    if coalesce(e ->> 'kind', '') not in ('audio', 'image') or not (e ->> 'media_path') like folder || '%' then
      raise exception 'each item needs a kind and a media_path under your own folder' using errcode = 'P0001';
    end if;
    if jsonb_array_length(coalesce(e -> 'class_options', '[]'::jsonb)) = 0 then
      raise exception 'each item needs at least one class' using errcode = 'P0001';
    end if;
    insert into public.items (kind, media_path, batch, class_options, duration_s, width, height, target_votes)
    values (e ->> 'kind', e ->> 'media_path', prefix || lower(p_batch),
            array(select jsonb_array_elements_text(e -> 'class_options')),
            (e ->> 'duration_s')::real, (e ->> 'width')::integer, (e ->> 'height')::integer,
            coalesce((e ->> 'target_votes')::smallint, private.setting('target_votes', 12)::smallint))
    on conflict (media_path) do nothing
    returning id into new_id;
    if new_id is not null then
      insert into private.item_sources (item_id, source_uid, role)
      values (new_id, coalesce(e ->> 'source_uid', e ->> 'media_path'), 'task');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke all on function public.host_add_items(text, jsonb) from public, anon;
grant execute on function public.host_add_items(text, jsonb) to authenticated;
