# Epstein Files — Build Spec

Gamified data-labelling platform. A fork of **ASMRboard** (`text2asmr/frontend`), re-themed from ASMR audio labelling into a general **audio + image** labelling game with Duolingo-inspired (light-touch) gamification and Roboflow-inspired image annotation.

- Repo: `https://github.com/aloshdenny/epstein-files` (lives at `~/vscode/epstein-files`, adjacent to `~/vscode/text2asmr`)
- Homepage hero: `frontend/public/epstein-simpsons.jpeg`
- Theme voice: the "Epstein files" release — waitlist, island, dossiers. Ironic, deadpan, never graphic.

---

## 1. What it is

Users label audio clips and images. Labels are scored against a consensus pool of 12–20 other labellers. Good labelling moves you up **the Epstein waitlist** (a Kaggle-style evolving leaderboard); the top 10 make it to **the island**. Daily goal of 20 labels with a 5-in-a-row combo meter for pace. Junk labellers get caught by consensus agreement (audio) and IoU overlap (images) and are banned.

## 2. Fork strategy (from ASMRboard)

Copy the whole `text2asmr/frontend` app as the starting point, then:

**Keep as-is**
- Stack: React 19 + TypeScript + Vite 8 + react-router-dom 7 + Tailwind v4 + supabase-js 2
- House style: Geist / Geist Mono, neutral tokens, hairline borders, one accent color, light default + dark toggle
- Auth flow (Login / Signup / Password), Profile, Settings, TopBar, Layouts, `ui.tsx` primitives
- Leaderboard page skeleton, Dashboard shell, blind-labelling discipline (opaque item IDs, no neighbor context, min-listen enforcement on audio)
- Supabase backend pattern: SQL migrations, RLS on every table, access via RPC functions (no direct table grants to anon)

**Strip / rename**
- All ASMR-specific label taxonomy and TimelineLabeler multi-label UI moves to the **audio-alpha** flow only (v1 mechanics)
- ASMR branding, PixelCritter mascot → swap for the dossier/waitlist visual language
- Nunito rounded font (too Duolingo-ish); keep Geist only

**Add new**
- `ImageLabel.tsx` page with a canvas circle/box annotator (Roboflow-style)
- Gamification engine (combo, daily goal, waitlist rank, island, weekly accuracy popup)
- Admin console (version switch alpha/beta, item upload, ban review)
- Consensus + IoU scoring workers (SQL functions)

## 3. Gamification — exactly what we discussed, no more

Take from Duolingo only: the daily-goal bar, the streak/combo feel, and celebratory micro-moments. Do NOT take: leagues, gems/hearts, mascot nagging, push notifications.

### 3.1 Five in a row
- Counter 0→5, resets on skip or an idle timeout (5 min).
- At 5: full-width interlude **"5 in a row!!"** (reuses ASMRboard `Interlude.tsx`), confetti-lite (CSS only), then continue. Combo persists across audio/image tasks.

### 3.2 Daily goal — 20 labels
- Progress bar in TopBar: `n / 20`.
- At 20: interlude **"Labelling complete!"** — day done; further labels still count for leaderboard but the bar reads "complete" (like Duolingo's daily goal, not a hard cap).
- Streak = consecutive days hitting 20. Displayed as a small flame-less counter (`Day 3`) — deliberately restrained.

### 3.3 The waitlist (leaderboard)
- Rank message after each scored batch: **"You moved up the Epstein waitlist — #412 → #398."** (Down-moves get a muted variant, no guilt-trip copy.)
- **Evolving leaderboard, Kaggle-style**: ranks recalculate as consensus scores land; the board is one continuous season with weekly snapshots.
- **Top 10 = the island.** A fixed panel on the leaderboard page: "Currently on the island" with the 10 names. Island membership is live — you can be knocked off.

### 3.4 Accuracy recognition
- When your recent labels agree with the consensus of the other 12–20 labellers at a top-tier rate: popup **"You're one of the top accurate labellers this week!"**
- Trigger: rolling 7-day window, ≥30 scored submissions, agreement ≥90th percentile of active labellers. Shown max once per week.

## 4. Labelling flows

### 4.1 Audio (two versions, admin-controlled)
- **Alpha (v1)** — inherited from ASMRboard: 6-second blind clips, multi-label tags, keyboard shortcuts, minimum-listen enforcement before submit unlocks.
- **Beta (v2)** — same clip delivery, but single primary label + optional intensity slider, and the tag set is curated per-batch (fewer, harder distractors).
- The **admin picks which version is live** (`app_config.audio_version = 'alpha' | 'beta'`). Users just get "Label audio"; the version is A/B metadata on every submission for later comparison.

### 4.2 Images (Roboflow-inspired)
- Image shown full-bleed; user **circles (or boxes) the region** they believe the label refers to, then picks/confirm the class tag.
- Freehand circle lasso + rectangle tool, undo, and "label not present" escape hatch.
- Submissions store the shape (polygon points or rect) normalized to image dimensions.

### 4.3 Consensus & quality engine
- Each item collects **12–20 independent submissions** before scoring (per-label-class quorum; abstains don't count).
- **Audio**: your label scores against the majority distribution. Agreement score = share of your scored submissions matching consensus.
- **Images**: consensus mask = union of shapes carrying the majority class; your score = **mean IoU** of your shape vs the consensus mask. Genuine labellers cluster around high IoU; random circlers don't.
- **Ban logic**: labellers whose rolling agreement/IoU falls below a statistical floor (e.g. below what random guessing would achieve, p<0.01 over ≥40 scored items) are flagged → admin review queue → ban. Bans are deliberate, never automatic-silent; admin confirms.
- Scoring runs as SQL functions invoked when an item's quorum fills; rank updates fan out from the same transaction.

## 5. Data model (Supabase)

```
users              (from ASMRboard auth, + waitlist_rank cache, streak, banned_at)
items              (id, kind:'audio'|'image', media_path, batch_id, class_options, audio_version nullable, status)
submissions        (id, user_id, item_id, kind, labels jsonb, shape jsonb, duration_ms, audio_version, submitted_at)
item_consensus     (item_id, consensus jsonb, mean_iou, scored_at, submission_count)
user_scores        (user_id, window:'weekly'|'alltime', labels_count, agreement, mean_iou, percentile)
waitlist_events    (user_id, old_rank, new_rank, reason, created_at)   -- feeds "you moved up" toasts
island_membership  (season_week, user_id, position)                    -- top-10 snapshots
app_config         (key, value)  -- 'audio_version' etc.
bans               (user_id, evidence jsonb, reviewed_by, reason, created_at)
```

RLS: users read own rows; submissions insert-only by owner; consensus/scores read-only to all; writes to consensus/bans/ranks only via service-role RPC.

## 6. Pages

| Route | Purpose |
|---|---|
| `/` | Homepage — hero `epstein-simpsons.jpeg`, tagline, "Join the waitlist" CTA |
| `/label` | Labelling session — interleaves audio + image tasks (ratio configurable), combo + daily bar |
| `/leaderboard` | Evolving waitlist, weekly snapshot tabs, island top-10 panel |
| `/profile` | Your stats: rank history, agreement %, IoU, streak, submissions |
| `/admin` | (role-gated) audio version switch, item/batch upload, consensus & ban review queue |

## 7. Build order

1. **Fork scaffold** — copy text2asmr/frontend, rebrand, strip ASMR taxonomy, new Supabase project + migrations skeleton.
2. **Core loop** — items + submissions + `/label` with both task kinds, daily bar, 5-in-a-row.
3. **Scoring** — consensus quorum, audio agreement, image IoU, waitlist events, leaderboard + island.
4. **Admin + bans** — version switch, upload, review queue, ban flow.
5. **Polish** — accuracy popup, weekly snapshots, empty/loading states, dark mode pass.

## 8. Guardrails

- Duolingo inspiration stays at: daily goal bar, combo, celebratory interludes. Nothing else imported.
- Waitlist/island copy stays playful-deadpan; no real-person imagery beyond the Simpsons hero already chosen.
- Image annotator is pointer-only MVP; touch polish comes later.
