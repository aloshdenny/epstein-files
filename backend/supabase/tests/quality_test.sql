-- supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- six people answer the same 20 clips; each clip holds one of five sound sets. Three listen carefully, one answers
-- with another clip's labels (realistic-looking random clicking), one picks speech every time, one answers carefully
-- but within 1.5 s of being served.
insert into auth.users (id, email)
  select ('00000000-0000-0000-0000-0000000000a' || i)::uuid, 'qa' || i || '@example.test' from generate_series(1, 6) i;
insert into public.profiles (id, username, onboarded) values
  ('00000000-0000-0000-0000-0000000000a1', 'qa_careful1', true), ('00000000-0000-0000-0000-0000000000a2', 'qa_careful2', true),
  ('00000000-0000-0000-0000-0000000000a3', 'qa_careful3', true), ('00000000-0000-0000-0000-0000000000a4', 'qa_random', true),
  ('00000000-0000-0000-0000-0000000000a5', 'qa_speech', true), ('00000000-0000-0000-0000-0000000000a6', 'qa_rusher', true);

select public.admin_add_items((select jsonb_agg(jsonb_build_object('kind', 'audio', 'media_path', 'q' || i || '.mp3',
  'class_options', jsonb_build_array('speech', 'music', 'noise', 'birds', 'rain'))) from generate_series(1, 20) i));

create temp table truth (i int primary key, item uuid, labels text[]);
insert into truth
  select i, (select id from public.items where media_path = 'q' || i || '.mp3'),
         (array[array['speech', 'speech'], array['music', 'music'], array['noise', 'music'],
                array['birds', 'speech'], array['rain', 'rain']])[1 + i % 5 : 1 + i % 5][1:2]
  from generate_series(1, 20) i;
update truth set labels = array(select distinct x from unnest(labels) x order by x);

create temp table answers (who uuid, i int, labels text[], answer_ms int);
insert into answers
  select u.id, t.i, t.labels, 9000 + 700 * (t.i % 7) from truth t,
         (values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000a2'),
                 ('00000000-0000-0000-0000-0000000000a3')) u(id)
  union all select '00000000-0000-0000-0000-0000000000a4', t.i, (select labels from truth o where o.i = 1 + (t.i + 6) % 20), 9000 + 500 * (t.i % 5) from truth t
  union all select '00000000-0000-0000-0000-0000000000a5', t.i, array['speech'], 9000 + 600 * (t.i % 4) from truth t
  union all select '00000000-0000-0000-0000-0000000000a6', t.i, t.labels, 1500 + 100 * (t.i % 3) from truth t;

insert into public.submissions (user_id, item_id, attempt, kind, audio_version, labels, tokens, listen_ms, elapsed_ms, seq, created_at)
  select a.who, t.item, 1, 'audio', 'alpha', a.labels, a.labels, 6000, a.answer_ms, a.i, now() - interval '1 hour' + a.i * interval '1 minute'
  from answers a join truth t on t.i = a.i;

select lives_ok('select private.refresh_quality()', 'quality refreshes');
select lives_ok('select private.refresh_quality()', 'and refreshes again');
select is((select status from private.labeller_quality where user_id = '00000000-0000-0000-0000-0000000000a1'), 'ok', 'a careful listener is ok');
select ok((select follow from private.labeller_quality where user_id = '00000000-0000-0000-0000-0000000000a1') > 0.8, '... and follows the audio');
select is((select status from private.labeller_quality where user_id = '00000000-0000-0000-0000-0000000000a4'), 'weak', 'answers from other clips are weak');
select ok((select follow from private.labeller_quality where user_id = '00000000-0000-0000-0000-0000000000a4') < 0.1, '... because they do not follow the audio');
select ok((select status from private.labeller_quality where user_id = '00000000-0000-0000-0000-0000000000a5') in ('watch', 'weak'), 'the same label every time goes to review');
select ok((select 'same label every time' = any (flags) from private.labeller_quality where user_id = '00000000-0000-0000-0000-0000000000a5'), '... and flagged as such');
select is((select status from private.labeller_quality where user_id = '00000000-0000-0000-0000-0000000000a6'), 'watch', 'a rusher is watched, not weak');
select is((select track from private.labeller_quality where user_id = '00000000-0000-0000-0000-0000000000a1'), 'audio-alpha', 'quality is kept per audio version');

-- weak labellers do not shape consensus and leave the public waitlist while reviewed
select private.score_item((select item from truth where i = 1));
select is((select judges from public.item_consensus where item_id = (select item from truth where i = 1)),
          6 - (select count(*)::int from private.labeller_quality where status = 'weak'), 'weak judges are left out of consensus');
select private.refresh_ranks();
select is((select count(*)::int from public.leaderboard() where username = 'qa_random'), 0, 'weak labellers are off the waitlist');
select is((select count(*)::int from public.user_scores where user_id = '00000000-0000-0000-0000-0000000000a4' and rank is null), 1,
          'their scores are kept for review, unranked');
select * from finish();
rollback;
