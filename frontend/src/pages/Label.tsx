import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Celebration, { type Milestone } from '../components/Celebration'
import HeadphonesPrompt, { headphonesSeen } from '../components/HeadphonesPrompt'
import ImageLabel, { type ImageAnswer } from '../components/ImageLabel'
import { AppLayout } from '../components/Layouts'
import { Button, Card, EmptyState, Kbd, Loading, Stamp, cx } from '../components/ui'
import type { Challenge } from '../lib/challenges'
import { useProgress } from '../lib/progress'
import { KEYS, friendlyError, supabase, timeZone } from '../lib/supabase'

type Item = {
  item_id: string; kind: 'audio' | 'image'; media_path: string; class_options: string[]
  duration_s: number | null; width: number | null; height: number | null; audio_version: 'alpha' | 'beta' | null; expires_at: string
}
type Submitted = { today: number; total: number; combo: number; streak: number; daily_goal: number }
type Phase = 'loading' | 'ready' | 'empty' | 'error' | 'milestone'

const MIN_LISTEN_MS = 1500

/** One session, audio and images interleaved by the server. Blind: no counts, no other answers, no sources. */
export default function Label() {
  const [params] = useSearchParams()
  const challengeSlug = params.get('c')
  const { progress, set, refresh } = useProgress()
  const [item, setItem] = useState<Item | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [rankNote, setRankNote] = useState<{ from: number | null; to: number } | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [challengeTitle, setChallengeTitle] = useState('')

  const flash = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((t) => (t === m ? '' : t)), 2800)
  }, [])

  const next = useCallback(async () => {
    setPhase('loading')
    setSrc(null)
    const { data, error } = await supabase.rpc('next_item', challengeSlug ? { p_challenge: challengeSlug } : {})
    if (error) {
      setError(friendlyError(error.message))
      return setPhase('error')
    }
    const it = (data as Item[] | null)?.[0]
    if (!it) {
      setItem(null)
      return setPhase('empty')
    }
    const { data: signed, error: e2 } = await supabase.storage.from(it.kind === 'audio' ? 'clips' : 'images').createSignedUrl(it.media_path, 900)
    if (e2 || !signed) {
      setError(e2?.message ?? 'Could not load that item')
      return setPhase('error')
    }
    setItem(it)
    setSrc(signed.signedUrl)
    setPhase('ready')
  }, [challengeSlug])

  useEffect(() => {
    next()
  }, [next])

  useEffect(() => {
    if (!challengeSlug) {
      setChallengeTitle('')
      return
    }
    supabase.rpc('challenges').then(({ data }) => {
      const challenge = (data as Challenge[] | null)?.find((row) => row.slug === challengeSlug)
      setChallengeTitle(challenge?.title ?? challengeSlug)
    })
  }, [challengeSlug])

  const afterSubmit = useCallback(async (r: Submitted) => {
    const before = progress?.today ?? r.today - 1
    set({ today: r.today, total: r.total, combo: r.combo, streak: r.streak, daily_goal: r.daily_goal })
    const due: Milestone[] = []
    if (r.combo > 0 && r.combo % 5 === 0) due.push({ kind: 'combo', combo: r.combo })
    if (before < r.daily_goal && r.today >= r.daily_goal) due.push({ kind: 'goal', today: r.today })
    // rank changes land when an item reaches its quorum, so check after each answer
    const [ev, acc] = await Promise.all([supabase.rpc('pop_waitlist_event'), r.total % 10 === 0 ? supabase.rpc('accuracy_check') : null])
    const e = (ev.data as { old_rank: number | null; new_rank: number }[] | null)?.[0]
    if (e && (e.old_rank == null || e.new_rank < e.old_rank)) {
      setRankNote({ from: e.old_rank, to: e.new_rank })
      window.setTimeout(() => setRankNote(null), 5000)
      refresh()
    }
    const a = (acc?.data as { eligible: boolean; agreement: number }[] | null)?.[0]
    if (a?.eligible) setAccuracy(a.agreement)
    if (due.length) {
      setMilestones(due)
      setPhase('milestone')
    } else next()
  }, [progress?.today, set, refresh, next])

  const submit = useCallback(async (args: Record<string, unknown>) => {
    if (!item || busy) return
    setBusy(true)
    const { data, error } = await supabase.rpc('submit_item', { p_item: item.item_id, p_tz: timeZone, ...args })
    setBusy(false)
    if (error) {
      if (error.code === 'P0002') return next()
      return flash(friendlyError(error.message))
    }
    afterSubmit((data as Submitted[])[0])
  }, [item, busy, next, flash, afterSubmit])

  const skip = useCallback(async () => {
    if (!item || busy) return
    setBusy(true)
    await supabase.rpc('skip_item', { p_item: item.item_id })
    setBusy(false)
    set({ combo: 0 })
    next()
  }, [item, busy, next, set])

  const continueOn = useCallback(() => {
    setMilestones((m) => {
      const rest = m.slice(1)
      if (rest.length === 0) next()
      return rest
    })
  }, [next])

  return (
    <AppLayout width="narrow">
      {challengeSlug && <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold text-ink-muted"><span>Challenge · {challengeTitle || challengeSlug}</span><Link to="/challenges" className="text-brand hover:underline">All challenges</Link></div>}
      <ComboMeter combo={progress?.combo ?? 0} />
      {phase === 'loading' && <Loading />}
      {phase === 'error' && <EmptyState title="Something went wrong" description={error} action={<Button onClick={next}>Try again</Button>} />}
      {phase === 'empty' && (
        <EmptyState
          title={challengeSlug ? 'Nothing left in this challenge right now.' : 'Nothing left to label right now.'}
          description={challengeSlug ? 'Every item has enough eyes on it. The host may add more files later.' : 'Every file in the queue has enough eyes on it. New batches land regularly. Check back later.'}
          action={challengeSlug ? <Link to="/challenges" className="rounded-xl bg-brand px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white">Browse challenges</Link> : undefined}
        />
      )}
      {phase === 'milestone' && milestones[0] && <Celebration key={JSON.stringify(milestones[0])} milestone={milestones[0]} onContinue={continueOn} />}
      {phase === 'ready' && item && src && (
        <Card key={item.item_id + item.expires_at} className="cheer-in">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Stamp tone="brand">{item.kind === 'audio' ? 'audio exhibit' : 'photo exhibit'}</Stamp>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">file {item.item_id.slice(0, 8)}</span>
          </div>
          {item.kind === 'image' ? (
            <ImageLabel
              src={src}
              options={item.class_options}
              busy={busy}
              onSkip={skip}
              onSubmit={(a: ImageAnswer) => submit(a.notPresent ? { p_not_present: true } : { p_labels: [a.label], p_shape: a.shape })}
            />
          ) : (
            <AudioLabel item={item} src={src} busy={busy} onSkip={skip} flash={flash}
              onSubmit={(labels, listen, intensity, unsure) => submit({ p_labels: labels, p_listen_ms: listen, p_intensity: intensity, p_unsure: unsure })} />
          )}
        </Card>
      )}
      {rankNote && (
        <div role="status" className="cheer-in fixed bottom-6 left-1/2 z-30 w-[min(92vw,30rem)] -translate-x-1/2 rounded-2xl border-2 border-brand-border bg-brand-soft px-4 py-3 text-sm font-bold text-ink">
          {rankNote.from == null
            ? <>You're on the public board: #{rankNote.to.toLocaleString()}.</>
            : <>You moved up the public board. #{rankNote.from.toLocaleString()} → #{rankNote.to.toLocaleString()}.</>}
          {rankNote.to <= 10 && <span className="ml-1 text-brand">Front row. No catering.</span>}
        </div>
      )}
      {toast && <div role="status" className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-2xl bg-ink px-4 py-2.5 text-sm font-bold text-ink-inverse">{toast}</div>}
      {accuracy != null && <AccuracyNote agreement={accuracy} onClose={() => setAccuracy(null)} />}
    </AppLayout>
  )
}

/** Five pips. They fill with each answer in a row and reset on a skip or five idle minutes. */
function ComboMeter({ combo }: { combo: number }) {
  const lit = combo === 0 ? 0 : ((combo - 1) % 5) + 1
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-1.5" aria-label={`${combo} in a row`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cx('h-3 w-7 rounded-full border-2', i <= lit ? 'pip-on border-brand-dark bg-brand' : 'border-hairline bg-surface-muted')} />
        ))}
        <span className="ml-2 text-xs font-bold text-ink-muted tabular-nums">{combo > 0 ? `${combo} in a row` : 'combo'}</span>
      </div>
      <span className="text-xs font-semibold text-ink-muted">Skipping resets it.</span>
    </div>
  )
}

function AccuracyNote({ agreement, onClose }: { agreement: number; onClose: () => void }) {
  return (
    <div className="hp-backdrop fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <Card className="hp-panel max-w-sm text-center">
        <Stamp tone="ok">noted for the record</Stamp>
        <h2 className="mt-4 text-xl font-extrabold text-ink">You're unusually accurate this week.</h2>
        <p className="mt-2 text-sm text-ink-muted">{Math.round(agreement * 100)}% agreement, top 10% of labellers. Someone else may be checking the numbers.</p>
        <Button variant="primary" className="mt-5" onClick={onClose} autoFocus>Carry on</Button>
      </Card>
    </div>
  )
}

/** Audio: blind playback with minimum listen. Alpha picks any number of labels; beta picks one main label and an
 *  optional intensity. The version comes from the assignment, so a mid-session switch never mixes experiments. */
function AudioLabel({ item, src, busy, onSubmit, onSkip, flash }: {
  item: Item; src: string; busy: boolean
  onSubmit: (labels: string[], listenMs: number, intensity: number | null, unsure: boolean) => void
  onSkip: () => void; flash: (m: string) => void
}) {
  const beta = item.audio_version === 'beta'
  const audio = useRef<HTMLAudioElement>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [intensity, setIntensity] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState({ at: 0, dur: item.duration_s ?? 0 })
  const [started, setStarted] = useState(headphonesSeen)
  const [intro, setIntro] = useState(() => !headphonesSeen())

  useEffect(() => {
    if (started) audio.current?.play().catch(() => setPlaying(false))
  }, [src, started])

  const listened = () => {
    const a = audio.current
    if (!a) return 0
    let t = 0
    for (let i = 0; i < a.played.length; i++) t += a.played.end(i) - a.played.start(i)
    return Math.round(t * 1000)
  }
  const play = () => {
    const a = audio.current
    if (!a) return
    setStarted(true)
    if (a.paused) a.play().catch(() => {})
    else a.pause()
  }
  const replay = () => {
    const a = audio.current
    if (!a) return
    a.currentTime = 0
    a.play().catch(() => {})
  }
  const toggle = (o: string) => setPicked((p) => (beta ? [o] : p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))
  const send = (unsure = false) => {
    if (busy) return
    if (listened() < MIN_LISTEN_MS) return flash('Listen to the clip first.')
    if (!unsure && picked.length === 0) return flash(beta ? 'Pick the main sound.' : 'Pick at least one label.')
    onSubmit(unsure ? [] : picked, listened(), beta && !unsure ? intensity : null, unsure)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === ' ') play()
      else if (k === 'r') replay()
      else if (k === 'u') send(true)
      else if (k === 'enter') send()
      else if (KEYS.includes(k) && item.class_options[KEYS.indexOf(k)]) toggle(item.class_options[KEYS.indexOf(k)])
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pct = time.dur > 0 ? Math.min(100, (time.at / time.dur) * 100) : 0
  return (
    <div className="flex flex-col gap-5">
      <audio ref={audio} src={src} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime({ at: e.currentTarget.currentTime, dur: e.currentTarget.duration || time.dur })} />
      <div className="flex items-center gap-4">
        <button onClick={play} aria-label={playing ? 'Pause' : 'Play'}
          className={cx('press flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand text-white [--edge:var(--brand-dark)]', playing && 'play-ring')}>
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>{playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}</svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="h-3 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-brand transition-[width] duration-150" style={{ width: `${pct}%` }} /></div>
          <div className="mt-1.5 flex justify-between text-xs font-semibold text-ink-muted tabular-nums">
            <span>{time.at.toFixed(1)}s</span>
            <button onClick={replay} className="font-bold hover:text-ink">Replay <Kbd>R</Kbd></button>
          </div>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-bold text-ink-secondary">{beta ? 'What is the main sound?' : 'What do you hear? Pick all that apply.'}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {item.class_options.map((o, i) => {
            const on = picked.includes(o)
            return (
              <button key={o} onClick={() => toggle(o)} aria-pressed={on}
                className={cx('press flex h-12 items-center gap-2 rounded-2xl border-2 px-3 text-left text-sm font-extrabold transition-colors',
                  on ? 'pop border-brand-border bg-brand-soft text-brand [--edge:var(--brand-border)]' : 'border-hairline bg-surface text-ink [--edge:var(--border)] hover:bg-surface-hover')}>
                {KEYS[i] && <Kbd>{KEYS[i].toUpperCase()}</Kbd>}<span className="truncate">{o}</span>
              </button>
            )
          })}
        </div>
      </div>
      {beta && (
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm font-bold text-ink-secondary">
            <span>How strong is it? <span className="font-medium text-ink-muted">(optional)</span></span>
            <span className="tabular-nums text-ink-muted">{intensity ?? '–'}</span>
          </span>
          <input type="range" min={0} max={100} value={intensity ?? 50} onChange={(e) => setIntensity(+e.target.value)} className="w-full accent-[var(--brand)]" aria-label="Intensity" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="lg" onClick={() => send()} disabled={busy}>Submit <Kbd className="border-white/40 bg-transparent text-white">⏎</Kbd></Button>
        <Button size="lg" onClick={() => send(true)} disabled={busy}>Can't tell <Kbd>U</Kbd></Button>
        <Button size="lg" variant="ghost" onClick={onSkip} disabled={busy} className="ml-auto">Skip</Button>
      </div>
      {intro && <HeadphonesPrompt onReady={() => { setStarted(true); audio.current?.play().catch(() => {}) }} onClosed={() => setIntro(false)} />}
    </div>
  )
}
