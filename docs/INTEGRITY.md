# Labelling Integrity — telling genuine labellers from fakes

Everything below is the proven system from ASMRboard (`migrations/20261018020000_labeller_quality.sql` + `20261004020000_verification_pools.sql` + the live calibration in `20261018030000_quality_calibration.sql`). The chats show it was built, run on real labellers, and recalibrated once. Port the *mechanisms*; for epstein-files, images add an IoU channel on top.

## Layer 0 — the design makes faking pointless

- **Blind serving.** Opaque clip ids, 20-minute assignments, signed URLs for exactly one item. Nobody sees vote counts, other answers, model guesses, or sources.
- **Every item gets 12–20 independent judges** (`min_votes` 12, `max_votes` 20; `target_votes` per item). Humans genuinely disagree — inter-labeller agreement on hard sounds measured only ~0.36 F1 — so single answers mean nothing and consensus is the unit of truth.
- **"Can't tell", "Skip", "Something else"** are always available; their overuse is itself a signal (see flags).
- A labeller's answer only counts toward consensus once their quality status is known-not-weak, weighted by learned `trust`.

## Layer 1 — the follow score (do answers depend on the audio?)

The core measure. For every first answer on an item with a **reference** (a control clip's known truth, or the labels ≥half of ≥2 other labellers chose):

```
follow = (matched − unmatched) / (1 − how alike the references are to each other)
```

- `matched` = Jaccard(your labels, your item's reference). `unmatched` = same Jaccard against the references of *other* items you answered (cyclic shifts, up to 20 shifts, last 400 answers).
- **1** = answers track what's actually in each item. **0** = answers would fit any item equally well — a random clicker and a "whispers on everything" spammer both land at 0 no matter how skewed the queue is. Plain agreement can't tell these apart; follow can.
- Statuses: `too early` (< 15 referenced answers), `ok`, `watch`, `weak`.
- **Calibration lesson (important):** the first live run showed real, careful labellers only reach follow 0.12–0.34 on noisy references. The original 0.25 watch line flagged the four *most active genuine* labellers. Watch was recalibrated to follow < 0.1, weak requires statistical confidence (follow + 1.645·SE < 0.1). **Expect to recalibrate thresholds on your first real cohort; keep them in `private.settings`.**

## Layer 2 — behavioural flags (exact thresholds from live code)

| Flag | Condition (after N answers) |
|---|---|
| rushing | ≥20 answers and >30% answered under `quality_rush_s` (4s) after assignment |
| not listening | ≥20 answers and median playback < 3000 ms |
| robotic timing | ≥30 answers and stddev/mean of answer times < 0.15 |
| same label every time | ≥20 answers and top label share > 0.85 |
| inconsistent on repeats | ≥5 hidden retests with mean self-Jaccard < 0.3 |
| mostly can't tell | ≥20 first answers and >50% unsure |
| answers do not follow the audio | ≥15 refs and follow + 1.645·SE < weak threshold (0.1) |

Status = `weak` if the follow flag fires **or ≥2 flags**; `watch` if exactly 1 flag; recompute every 15 min via pg_cron.

## Layer 3 — evidence gathering: controls and hidden retests

- **Control (gold) clips** — items with known truth, mixed in *indistinguishably*. Base rate slides from 25% down to 5% as the labeller accumulates control answers.
- **Hidden retests** — the same item served again as attempt 2 after a gap (default ≥300 labels apart, but from the 30th answer the gap narrows to `label_seq/2` so evidence arrives early). A genuine labeller agrees with their past self; a fraud doesn't.
- **Audit mode** — anyone on `watch`/`weak` silently gets repeat rate 12% (vs 4%), repeat gap 15, and control rate floor 30% until the question settles. The UI never reveals any of this.

## Consequences of `weak` (all silent)

1. Answers stop counting toward clip consensus (and consensus is trust-weighted; brand-new labellers under 20 answers are exempt from the trust floor).
2. Excluded from the milestone progress counts.
3. Hidden from the leaderboard when `hide_weak_from_board` = 1.
4. Exports carry the quality status; the pull script drops weak labellers unless `--keep-weak`.

ASMRboard never auto-banned. For **epstein-files**: keep that posture — `weak` + admin review queue (`admin_labeller_quality()` shows everyone weakest-first with every metric) → admin-confirmed ban, exactly as the spec says.

## What epstein-files adds

- **Images:** the reference becomes the consensus mask (union of majority-class shapes); your score = **mean IoU** of your shape vs it. IoU slots into the same follow framework (a random circler's IoU doesn't track its own item's reference; a genuine one's does). Compute IoU in the submission RPC for polygons/bboxes normalized to image dims.
- **Audio alpha/beta:** submissions record `audio_version`; run quality per version while both are live so a version that's easier to game doesn't contaminate the other's scores.
- The **"top accurate labellers this week"** popup keys off the same agreement metrics the integrity engine already computes — one query, no new machinery.

## Known result worth remembering (from the chats)

LLM judges were tested as labellers: best (Gemini 3.1 Pro) hit 0.41 F1 overall vs humans' 0.36 against each other — human-level on common voice sounds, near-zero (0.13) on physical triggers. Auto-label fakes are cheap to catch; the hard case is a lazy human, which is exactly what follow + timing flags catch.
