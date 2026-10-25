begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'challenge-admin@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'challenge-labeller@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'genuine-one@example.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'genuine-two@example.test'),
  ('00000000-0000-0000-0000-0000000000d5', 'genuine-three@example.test'),
  ('00000000-0000-0000-0000-0000000000d6', 'genuine-fake@example.test');
insert into public.profiles (id, username, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000000d1', 'ch_admin', 'Challenge Admin', true),
  ('00000000-0000-0000-0000-0000000000d2', 'ch_labeller', 'Challenge Labeller', true),
  ('00000000-0000-0000-0000-0000000000d3', 'genuine_one', 'Genuine One', true),
  ('00000000-0000-0000-0000-0000000000d4', 'genuine_two', 'Genuine Two', true),
  ('00000000-0000-0000-0000-0000000000d5', 'genuine_three', 'Genuine Three', true),
  ('00000000-0000-0000-0000-0000000000d6', 'genuine_fake', 'Genuine Fake', true);

create function pg_temp.act(p uuid) returns void language sql security definer set search_path = '' as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated',
    'email', (select u.email from auth.users u where u.id = p))::text, true);
$$;

select is((select count(*)::int from public.challenges), 4, 'the four challenge configurations are seeded');
select is((select cardinality(class_options)::int from public.challenges where slug = 'asmrboard'), 33, 'ASMRboard has its complete label set');

select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select is(public.create_challenge('invite-test', 'Invite test', 'audio', 'A private test.',
  array['cat', 'dog'], false), 'invite-test', 'a labeller can create and own a challenge');
select is(public.challenge_add_items('invite-test',
  '[{"kind":"audio","media_path":"hosted/00000000-0000-0000-0000-0000000000d1/challenge-upload.wav","class_options":["cat","dog"]}]'::jsonb),
  1, 'challenge admins can register uploads from their own hosted folder');
select throws_ok($$select public.challenge_add_items('invite-test',
  '[{"kind":"audio","media_path":"challenge-upload.wav","class_options":["cat","dog"]}]'::jsonb)$$,
  '42501', 'challenge admins may only add items under their own hosted folder',
  'ordinary challenge admins cannot register uploads outside their hosted folder');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select throws_ok($$select public.create_invite('invite-test', 'link')$$, '42501', 'challenge admins only',
  'only challenge admins can create invites');
select throws_ok($$select * from public.next_item('invite-test')$$, '42501', 'join this challenge first',
  'private challenge items are blocked before acceptance');
select ok(not exists (select 1 from public.challenges() where slug = 'invite-test'),
  'private challenge is hidden from non-members');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
create temp table link_invite as select * from public.create_invite('invite-test', 'link');
select ok((select token <> '' from link_invite), 'admins can create a shareable invite');
reset role;
insert into public.items (kind, media_path, class_options, challenge)
values ('audio', 'invite-test.wav', array['cat', 'dog'], 'invite-test');
insert into private.item_sources (item_id, source_uid)
select id, 'invite-test.wav' from public.items where media_path = 'invite-test.wav';

insert into public.challenges (slug, title, kind, blurb, class_options, open, owner_id)
values ('gen-test', 'Genuineness test', 'audio', '', array['cat', 'dog', 'bird', 'noise'], true,
        '00000000-0000-0000-0000-0000000000d1');
insert into public.challenge_members (challenge, user_id, role, via)
values ('gen-test', '00000000-0000-0000-0000-0000000000d1', 'admin', 'owner');
insert into public.challenge_members (challenge, user_id, role, via)
values ('gen-test', '00000000-0000-0000-0000-0000000000d3', 'labeller', 'open');
insert into public.items (kind, media_path, class_options, challenge, target_votes)
select 'audio', 'genuine-test-' || n || '.wav', array['cat', 'dog', 'bird', 'noise'], 'gen-test', 4
from generate_series(1, 10) n;
insert into public.submissions (user_id, item_id, kind, audio_version, labels, tokens, listen_ms, elapsed_ms)
select people.uid, i.id, 'audio', 'alpha', array[truth.label], array[truth.label], 3000, 5000
from public.items i
cross join (values
  ('00000000-0000-0000-0000-0000000000d3'::uuid),
  ('00000000-0000-0000-0000-0000000000d4'::uuid),
  ('00000000-0000-0000-0000-0000000000d5'::uuid)
) people(uid)
cross join lateral (
  select (array['cat', 'dog', 'bird'])[(split_part(split_part(i.media_path, '-', 3), '.', 1)::integer - 1) % 3 + 1] as label
) truth
where i.challenge = 'gen-test';
insert into public.submissions (user_id, item_id, kind, audio_version, labels, tokens, listen_ms, elapsed_ms)
select '00000000-0000-0000-0000-0000000000d6', i.id, 'audio', 'alpha', array['noise'], array['noise'], 0, 500
from public.items i where i.challenge = 'gen-test';

select pg_temp.act('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select ok((select valid from public.invite_info((select token from link_invite))),
  'shareable invitation information is available');
select ok(not exists (select 1 from public.challenges() where slug = 'invite-test'),
  'private challenge remains hidden until accepted');
select is(public.accept_invite((select token from link_invite)), 'invite-test', 'a valid invite can be accepted');
select ok(exists (select 1 from public.challenges() where slug = 'invite-test' and my_role = 'labeller'),
  'accepting creates a member');
select ok(exists (select 1 from public.challenges() where slug = 'invite-test'),
  'private challenge appears after acceptance');
select ok((select challenge = 'invite-test' from public.next_item('invite-test')),
  'accepted member is served an item from that challenge');
select is(public.join_challenge('bird-calls'), 'bird-calls', 'any signed-in labeller can join an open challenge');

select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
create temp table email_invite as
  select * from public.create_invite('invite-test', 'email', 'someone-else@example.test');
reset role;
insert into private.invites (challenge, channel, created_by, expires_at, token)
values ('invite-test', 'link', '00000000-0000-0000-0000-0000000000d1', now() - interval '1 minute', 'expired-test'),
       ('invite-test', 'link', '00000000-0000-0000-0000-0000000000d1', now() + interval '1 day', 'revoked-test'),
       ('invite-test', 'link', '00000000-0000-0000-0000-0000000000d1', now() + interval '1 day', 'used-test');
update private.invites set revoked_at = now() where token = 'revoked-test';
update private.invites set max_uses = 1, uses = 1 where token = 'used-test';

select pg_temp.act('00000000-0000-0000-0000-0000000000d3');
set local role authenticated;
select throws_ok(format('select public.accept_invite(%L)', (select token from email_invite)),
  '42501', 'invite email mismatch', 'email invitations require a matching account');
select throws_ok($$select public.accept_invite('expired-test')$$, '42501', 'invite expired', 'expired invites are rejected');
select throws_ok($$select public.accept_invite('revoked-test')$$, '42501', 'invite revoked', 'revoked invites are rejected');
select throws_ok($$select public.accept_invite('used-test')$$, '42501', 'invite already used', 'max-use invites cannot be reused');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select ok((select genuineness from public.challenge_genuineness('gen-test') where username = 'genuine_fake')
  < (select genuineness from public.challenge_genuineness('gen-test') where username = 'genuine_one'),
  'the fake labeller ranks below a genuine labeller');
select is((select display_name from public.challenge_genuineness('gen-test') where username = 'genuine_one'),
  null::text, 'public challenge analytics hide display names');
select is((select display_name from public.challenge_members_list('gen-test') where username = 'genuine_one'),
  null::text, 'public challenge member lists hide display names');
reset role;

select * from finish();
rollback;
