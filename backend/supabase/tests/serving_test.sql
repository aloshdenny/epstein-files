-- supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'sv1@example.test'), ('00000000-0000-0000-0000-0000000000b2', 'sv2@example.test');
insert into public.profiles (id, username, onboarded) values
  ('00000000-0000-0000-0000-0000000000b1', 'sv_one', true), ('00000000-0000-0000-0000-0000000000b2', 'sv_two', true);
update public.app_config set value = '0' where key = 'image_share';   -- audio first
update private.settings set value = 0 where key in ('repeat_rate', 'control_rate', 'audited_repeat_rate', 'audited_control_rate');

select is(public.admin_add_items(jsonb_build_array(
  jsonb_build_object('kind', 'audio', 'media_path', 'a1.mp3', 'class_options', jsonb_build_array('speech', 'music', 'noise'), 'duration_s', 6),
  jsonb_build_object('kind', 'image', 'media_path', 'i1.jpg', 'class_options', jsonb_build_array('cat', 'dog'), 'width', 640, 'height', 480))),
  2, 'items are added');

create function pg_temp.act(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- signed out
set local role anon;
select throws_ok('select * from public.next_item()', '42501', null, 'anon cannot be served');
select throws_ok('select * from public.items', '42501', null, 'anon cannot list items');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok('select * from private.item_sources', '42501', null, 'item sources are private');
select throws_ok('select * from public.items', '42501', null, 'items are not listable');
create temp table got as select * from public.next_item();
select is((select kind from got), 'audio', 'an audio item is served first when the mix says audio');
select is((select audio_version from got), 'alpha', '... in the current audio version');
select is((select item_id from public.next_item()), (select item_id from got), 'the open item is served again until answered');
select ok(private.can_see('clips', 'a1.mp3'), 'the assigned clip is readable');
select ok(not private.can_see('images', 'i1.jpg'), 'an unassigned image is not');
select throws_ok(format('select * from public.submit_item(%L, array[''speech''], p_listen_ms => 200)', (select item_id from got)),
                 '22023', 'listen to the clip first', 'answering needs real playback');
select throws_ok(format('select * from public.submit_item(%L, array[''laser''], p_listen_ms => 3000)', (select item_id from got)),
                 '22023', 'unknown label', 'labels must come from the options');
select throws_ok(format('select * from public.submit_item(%L, array[]::text[], p_listen_ms => 3000)', (select item_id from got)),
                 '22023', 'pick at least one label', 'alpha needs a label');
create temp table res as select * from public.submit_item((select item_id from got), array['speech', 'noise'], p_listen_ms => 3000);
select is((select today from res), 1, 'today counts the answer');
select is((select combo from res), 1, 'combo starts');
select is((select daily_goal from res), 20, 'the daily goal is 20');
select is((select streak from res), 1, 'day 1 of the streak');
select throws_ok(format('select * from public.submit_item(%L, array[''speech''], p_listen_ms => 3000)', (select item_id from got)),
                 'P0002', null, 'the same item cannot be answered twice');

-- the image comes next (no audio left)
create temp table img as select * from public.next_item();
select is((select kind from img), 'image', 'then the image');
select throws_ok(format('select * from public.submit_item(%L, array[''cat''], p_shape => %L)', (select item_id from img),
                        '{"type":"rect","x":0.8,"y":0.1,"w":0.5,"h":0.2}'),
                 '22023', 'that shape does not fit the image', 'shapes must stay inside the image');
select is((select combo from public.submit_item((select item_id from img), array['cat'],
          p_shape => '{"type":"polygon","points":[[0.1,0.1],[0.5,0.1],[0.5,0.5],[0.1,0.5]]}')), 2, 'a lasso answer keeps the combo going');
select throws_ok('select tokens from public.submissions', '42501', null, 'own submissions do not expose tokens');
reset role;
select is((select cardinality(tokens) from public.submissions where item_id = (select item_id from img)), 169,
          'the lasso is rasterised to grid cells');

select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select is((select combo from public.labelling_state()), 2, 'labelling state reports the combo');
reset role;
select * from finish();
rollback;
