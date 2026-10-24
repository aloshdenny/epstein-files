# Supabase Backend — reference from ASMRboard, for epstein-files

Source: `~/vscode/text2asmr/backend/supabase/` (28 migrations, pgTAP-style SQL tests in `tests/`, auth email templates in `templates/`, `config.toml` for local CLI). **Alosh will set up the new Supabase project on request and share the keys — ask him for: project ref + URL, publishable (anon) key, service-role key, then he'll flip off "Confirm email" (Authentication → Providers → Email) like last time.**

## Architecture principles (keep all of these)

1. **Two schemas.** `public` for what labellers touch; `private` for everything else (sources, quality tables, settings, snapshots). `revoke all on schema private from public, anon, authenticated;`
2. **Labellers write only through RPCs.** All writes go through `security definer` functions (`public.submit_label`, `public.skip_clip`, …) with `set search_path = ''`. Base tables get `revoke all` from anon/authenticated, then narrow column grants + RLS policies for reads ("own assignments", "own labels", "menu is public").
3. **Admin RPCs** start with `perform private.require_service_role();` and are granted only to `service_role`. Never expose them to the client app; run them from scripts with the service key.
4. **Everything tunable lives in `private.settings`** (`private.setting(key, default)` helper): vote targets, repeat rates, quality thresholds. Thresholds get recalibrated on real data (see INTEGRITY doc) — never hardcode them.
5. **pg_cron** for periodic recompute: ASMRboard runs `select private.refresh_quality()` at minutes 7/22/37/52 of every hour. epstein-files should schedule the same for its consensus + quality refresh.
6. **Migrations are plain SQL files**, timestamp-prefixed (`20261018020000_labeller_quality.sql`), each with a header comment explaining intent, and paired SQL tests (`tests/quality_test.sql`, …) runnable locally with the Supabase CLI.

## Core schema (ASMRboard shapes to port)

```
public.profiles        id (no FK to auth.users on purpose: deleting an account keeps its labels in the dataset),
                       username ^[a-z0-9_]{3,20}$, display_name, avatar_url (https:// or avatars/ bucket),
                       fusion_name (legacy-imported labellers), imported, adult_confirmed_at, created_at, deleted_at,
                       plus: trust real, trust_evidence int, label_seq int, guest boolean
public.clips           id, audio_path (opaque object name in private 'clips' bucket), duration_s (default 6, <=30),
                       target_votes smallint (default 3), max_votes, votes, priority, uncertainty, boost,
                       batch, active, core, need
private.clip_sources   clip_id, source_uid, kind ('unsure'|'unlabelled'|'control'), info jsonb   -- never visible to labellers
public.assignments     user_id, clip_id, attempt (1 = first time, 2 = hidden retest), state ('open'|'done'|'skipped'),
                       assigned_at, expires_at
public.labels          user_id, clip_id, attempt, labels text[] (from label_options), other_text, unsure boolean,
                       listen_ms int, created_at, seq
public.label_options   key, grp, hint, sort          -- the label menu with plain-language hints
public.imported_labels historical/seed labels (used for synthetic seed profiles)
private.settings       key/value jsonb + setting() helper
private.labeller_quality  see INTEGRITY doc
private.progress_snapshot one-row site progress (recomputed by refresh_progress())
```

## Serving model (`public.next_clip()`)

This function is the heart of the queue; port the shape:

1. Return any still-open unexpired assignment first (assignments expire after **20 minutes**).
2. With probability `repeat_rate` (0.04; **0.12 if the labeller is on watch/weak**), serve a **hidden retest**: a clip they answered at least `repeat_gap` labels ago (gap shrinks to 15 under audit), as attempt 2, unlabelled-looking.
3. Else with probability `control_rate` (slides 0.25 → 0.05 as their control-clip count grows; floor 0.30 under audit) serve a **control clip** (gold set with known truth), ordered by `need`.
4. Else fill started clips to breadth (`breadth_votes` = 3) fullest-first, then the neediest never-assigned clip (`need + boost` desc, penalised by open assignments, +5% jitter). Thin-class boost lets rare classes jump the queue.
5. Insert the assignment row and return `clip_id, audio_path, duration_s, expires_at` — the audio itself streams via a **signed storage URL** (15 min in practice), policy "labellers hear their assigned clip" only.

Clips enter through `public.admin_add_clips(jsonb)` (service-role): upserts by `source_uid`, sets `target_votes` (default `min_votes`=12) and `max_votes` (default 20) — this is the **12–20 judges per item** rule — plus uncertainty/priority/core flags. Non-core clips (verification pools) count toward consensus but not the "labelled by people" progress milestone.

## Storage

- `clips` bucket: **private**; select policy only for assigned clips via signed URLs. Paths are opaque.
- `avatars` bucket: users upload/replace/delete only their own object (`avatars/<uid>/…`), avatar_url validated `^(https://|avatars/)`.
- epstein-files adds an `images` bucket with the same treatment as `clips`.

## Auth specifics that mattered

- Email+password with **email confirmation turned off** (Supabase autoconfirm) so sign-up works immediately; magic-link was the original flow.
- Username chosen at signup, unique, editable later; optional avatar; 18+ confirm gate (epstein-files likely doesn't need the 18+ gate).
- Profile claims legacy labellers by email (`account_status(email)` tells the browser "waiting to be claimed").
- Auth emails (confirm/recovery) use custom templates in `templates/` pointing at the site, not the Supabase domain.
- The SPA never holds the service key: Vercel server-side env or local `.env.local` only; a Vercel edge `/sb` proxy hides the Supabase project URL from the bundle (the missing publishable key in Vercel env was the historic 503 bug — don't repeat it).

## RPCs the frontend calls

`next_clip()`, `submit_label(clip, labels[], other, unsure, listen_ms)`, `skip_clip(clip)`, `leaderboard(days, limit)`, `contributions(username, tz)`, `profile_stats(username)`, `site_stats()`, `account_status(email)`, `delete_account()`. Admin (service-role): `admin_add_clips`, `admin_set_active`, `admin_export_labels(since)` (carries each labeller's quality status), `admin_labeller_quality()` (review list, weakest first), `admin_known_sources`.

## Tests worth copying

`tests/` covers: serving order + expiry, quality statuses and flags, guest labelling, device marks, interludes, working set, voice mix, referrals, timeline labels. They run against local Supabase (`supabase db test`); 46 tests green was the release bar. Set the same bar for epstein-files.
