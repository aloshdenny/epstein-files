-- supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'ad1@example.test'), ('00000000-0000-0000-0000-0000000000c2', 'ad2@example.test');
insert into public.profiles (id, username, onboarded) values
  ('00000000-0000-0000-0000-0000000000c1', 'ad_boss', true), ('00000000-0000-0000-0000-0000000000c2', 'ad_labeller', true);
update private.settings set value = 0 where key in ('repeat_rate', 'control_rate', 'audited_repeat_rate', 'audited_control_rate');
select public.admin_add_items('[{"kind":"audio","media_path":"ad1.mp3","class_options":["speech","music"]},
                                {"kind":"audio","media_path":"ad2.mp3","class_options":["speech","music"]}]');
create function pg_temp.act(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- nobody makes themselves an admin
select pg_temp.act('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select throws_ok($$select public.admin_set_config('audio_version', '"beta"')$$, '42501', 'admins only', 'labellers cannot switch the audio version');
select throws_ok('select * from public.admin_labeller_quality()', '42501', 'admins only', 'or read quality');
select throws_ok($$select public.admin_set_admin('ad_labeller', true)$$, '42501', null, 'or promote themselves');
select throws_ok($$update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000c2'$$, '42501', null,
                 'or flip the admin flag directly');
select throws_ok($$insert into public.app_config (key, value) values ('audio_version', '"beta"')$$, '42501', null, 'config is read only');
reset role;

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
select lives_ok($$select public.admin_set_admin('ad_boss', true)$$, 'the service role makes an admin');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select lives_ok($$select public.admin_set_config('audio_version', '"beta"')$$, 'an admin switches audio to beta');
select throws_ok($$select public.admin_set_config('audio_version', '"gamma"')$$, '22023', null, 'only alpha or beta');
select throws_ok($$select public.admin_set_config('image_share', '2')$$, '22023', null, 'the mix is a share');
select is((select count(*)::int from public.admin_queue_stats()), 1, 'queue stats list batches');
reset role;

-- beta: one main label plus an intensity, recorded with the version
select pg_temp.act('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
create temp table got as select * from public.next_item();
select is((select audio_version from got), 'beta', 'new assignments use beta');
select throws_ok(format('select * from public.submit_item(%L, array[''speech'', ''music''], p_listen_ms => 3000)', (select item_id from got)),
                 '22023', 'pick one main label', 'beta takes one main label');
select lives_ok(format('select * from public.submit_item(%L, array[''music''], p_intensity => 70, p_listen_ms => 3000)', (select item_id from got)),
                'a beta answer is accepted');
reset role;
select results_eq('select audio_version, intensity::int from public.submissions', $$values ('beta'::text, 70)$$, 'version and intensity are stored');

-- banning: explicit, with a reason, evidence kept
select pg_temp.act('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select throws_ok($$select public.admin_ban('00000000-0000-0000-0000-0000000000c2', ' ')$$, '22023', 'give a reason', 'a ban needs a reason');
select lives_ok($$select public.admin_ban('00000000-0000-0000-0000-0000000000c2', 'random answers')$$, 'an admin bans after review');
reset role;
select ok((select evidence ? 'quality' from public.bans), 'the ban keeps evidence');
select pg_temp.act('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select throws_ok('select * from public.next_item()', '42501', 'this account can no longer label', 'banned labellers are not served');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select lives_ok($$select public.admin_unban('00000000-0000-0000-0000-0000000000c2')$$, 'bans can be lifted');
reset role;
select ok((select lifted_at is not null from public.bans), '... and the record stays');
select * from finish();
rollback;
