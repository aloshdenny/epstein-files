-- supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- twelve judges label one clip and one image.
-- clip: 1..9 hear speech, 10..12 hear music. image: 1..6 box the cat tightly, 7..10 box it loosely, 11..12 say not present.
insert into auth.users (id, email)
  select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'sc' || i || '@example.test' from generate_series(1, 12) i;
insert into public.profiles (id, username, onboarded)
  select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'sc_u' || lpad(i::text, 2, '0'), true from generate_series(1, 12) i;
update private.settings set value = 0 where key in ('repeat_rate', 'control_rate', 'audited_repeat_rate', 'audited_control_rate');
create function pg_temp.uid(i int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid $$;
create function pg_temp.act(i int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(i), 'role', 'authenticated')::text, true);
$$;

select public.admin_add_items('[{"kind":"audio","media_path":"sc.mp3","class_options":["speech","music","noise"],"duration_s":6}]');
do $$
declare
  it uuid;
begin
  for i in 1 .. 12 loop
    perform pg_temp.act(i);
    select item_id into it from public.next_item();
    perform public.submit_item(it, case when i <= 9 then array['speech'] else array['music'] end, p_listen_ms => 4000);
  end loop;
end $$;

select pg_temp.act(7);
select results_eq('select old_rank, new_rank from public.pop_waitlist_event()', $$values (null::int, 1)$$, 'first place is reported');
create temp table aud as select id from public.items where media_path = 'sc.mp3';
select is((select labels from public.item_consensus where item_id = (select id from aud)), array['speech'], 'the clip consensus is the majority label');
select is((select judges from public.item_consensus where item_id = (select id from aud)), 12, '... from twelve judges');
select ok(abs((select agreement from public.item_consensus where item_id = (select id from aud)) - 0.75) < 0.001, '... who agreed 75%');
select is((select score from public.submissions where user_id = pg_temp.uid(1)), 1::real, 'a majority answer scores 1');
select is((select score from public.submissions where user_id = pg_temp.uid(12)), 0::real, 'a minority answer scores 0');
select is((select rank from public.user_scores where user_id = pg_temp.uid(7)), 1, 'majority judges share first place');
select is((select rank from public.user_scores where user_id = pg_temp.uid(12)), 10, 'minority judges come after');

select set_config('request.jwt.claims', '', true);
select public.admin_add_items('[{"kind":"image","media_path":"sc.jpg","class_options":["cat","dog"],"width":800,"height":600}]');
do $$
declare
  it uuid;
begin
  for i in 1 .. 12 loop
    perform pg_temp.act(i);
    select item_id into it from public.next_item();
    if i <= 6 then
      perform public.submit_item(it, array['cat'], p_shape => '{"type":"rect","x":0.25,"y":0.25,"w":0.5,"h":0.5}');
    elsif i <= 10 then
      perform public.submit_item(it, array['cat'], p_shape => '{"type":"rect","x":0.25,"y":0.25,"w":0.6,"h":0.6}');
    else
      perform public.submit_item(it, p_not_present => true);
    end if;
  end loop;
end $$;

create temp table img as select id from public.items where media_path = 'sc.jpg';
select is((select labels from public.item_consensus where item_id = (select id from img)), array['cat'], 'the image consensus class is cat');
select is((select cardinality(tokens) from public.item_consensus where item_id = (select id from img)), 256,
          'the consensus mask is the cells most judges covered');
select is((select score from public.submissions where user_id = pg_temp.uid(1) and item_id = (select id from img)), 1::real,
          'a tight box has IoU 1 with the majority mask');
select ok(abs((select score from public.submissions where user_id = pg_temp.uid(8) and item_id = (select id from img)) - 256.0 / 361) < 0.001,
          'a loose box scores its IoU');
select is((select score from public.submissions where user_id = pg_temp.uid(11) and item_id = (select id from img)), 0::real,
          'not present scores 0 when the cat is there');
select is((select rank from public.user_scores where user_id = pg_temp.uid(7)), 7, 'loose boxes drop to seventh');
select ok(abs((select iou from public.user_scores where user_id = pg_temp.uid(8)) - 256.0 / 361) < 0.001, 'mean IoU is kept per labeller');

select pg_temp.act(7);
set local role authenticated;
select results_eq('select old_rank, new_rank from public.pop_waitlist_event()', $$values (1, 7)$$, 'the rank change is reported once');
select is_empty('select * from public.pop_waitlist_event()', '... and then marked seen');
select is((select count(*)::int from public.leaderboard()), 12, 'everyone scored is on the waitlist');
select is((select count(*)::int from public.leaderboard() where on_island), 10, 'the top ten are on the island');
select is((select points from public.profile_stats('sc_u01')), 2::real, 'profile stats show points');
reset role;

select lives_ok('select private.snapshot_week()', 'the weekly snapshot runs');
select is((select count(*)::int from public.island_membership), 10, 'ten people were on the island this week');
set local role anon;
select is((select count(*)::int from public.leaderboard((select week from public.leaderboard_weeks() limit 1))), 12,
          'past weeks are readable by anyone');
reset role;
select * from finish();
rollback;
