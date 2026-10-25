import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { AppLayout } from '../components/Layouts'
import { Alert, Button, Card, CardHeader, Input, PageHeader, Stamp, cx } from '../components/ui'
import { pct } from '../lib/stats'
import { friendlyError, supabase } from '../lib/supabase'

type Queue = { kind: string; batch: string; items: number; active: number; scored: number; submissions: number; agreement: number | null }
type Consensus = { item_id: string; kind: string; batch: string; media_path: string; labels: string[]; agreement: number | null; judges: number; votes: number }
type Quality = {
  user_id: string; username: string; track: string; status: string; flags: string[]; answers: number; refs: number
  follow: number | null; follow_se: number | null; retests: number; retest_agreement: number | null; controls: number
  control_score: number | null; median_answer_s: number | null; top_label: string | null; top_label_share: number | null
  points: number | null; banned_at: string | null
}
type Ban = { id: number; username: string; reason: string; banned_by: string | null; created_at: string; lifted_at: string | null }

const num = (v: number | null | undefined, d = 2) => (v == null ? '–' : v.toFixed(d))

/** Admins only (the route and every RPC check is_admin). Switch audio versions, upload batches, review consensus and
 *  the ban queue. Nobody is banned automatically: weak labellers wait here for a human. */
export default function Admin() {
  const [version, setVersion] = useState<'alpha' | 'beta'>('alpha')
  const [share, setShare] = useState(0.5)
  const [queue, setQueue] = useState<Queue[]>([])
  const [consensus, setConsensus] = useState<Consensus[]>([])
  const [quality, setQuality] = useState<Quality[]>([])
  const [bans, setBans] = useState<Ban[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [cfg, q, c, ql, b] = await Promise.all([
      supabase.from('app_config').select('key, value'),
      supabase.rpc('admin_queue_stats'),
      supabase.rpc('admin_consensus', { p_limit: 30 }),
      supabase.rpc('admin_labeller_quality'),
      supabase.rpc('admin_bans'),
    ])
    for (const r of (cfg.data as { key: string; value: unknown }[] | null) ?? []) {
      if (r.key === 'audio_version') setVersion(r.value as 'alpha' | 'beta')
      if (r.key === 'image_share') setShare(Number(r.value))
    }
    setQueue((q.data as Queue[]) ?? [])
    setConsensus((c.data as Consensus[]) ?? [])
    setQuality((ql.data as Quality[]) ?? [])
    setBans((b.data as Ban[]) ?? [])
    const err = q.error ?? c.error ?? ql.error ?? b.error
    if (err) setMsg({ ok: false, text: friendlyError(err.message) })
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    setMsg(error ? { ok: false, text: friendlyError(error.message) } : { ok: true, text: ok })
    if (!error) load()
  }

  const setConfig = (key: string, value: unknown, ok: string) => run(() => supabase.rpc('admin_set_config', { p_key: key, p_value: value }), ok)

  const ban = (q: Quality) => {
    const reason = window.prompt(`Ban @${q.username}? Their labels stop counting and they can no longer label. Give a reason:`, q.flags.join(', '))
    if (reason?.trim()) run(() => supabase.rpc('admin_ban', { p_user: q.user_id, p_reason: reason.trim() }), `@${q.username} banned.`)
  }

  const review = quality.filter((q) => q.status === 'weak' || q.status === 'watch' || q.banned_at)

  return (
    <AppLayout width="wide">
      <PageHeader title="Admin" description="Evidence first, bans second." actions={<Button size="sm" disabled={busy} onClick={() => run(() => supabase.rpc('admin_refresh'), 'Scores, quality and ranks refreshed.')}>Refresh now</Button>} />
      {msg && <div className="mb-4"><Alert tone={msg.ok ? 'brand' : 'danger'}>{msg.text}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Audio version" description="New assignments use this. Each version is scored separately." />
          <div className="inline-flex rounded-2xl border-2 border-hairline bg-surface-muted p-1">
            {(['alpha', 'beta'] as const).map((v) => (
              <button key={v} disabled={busy} onClick={() => setConfig('audio_version', v, `Audio switched to ${v}.`)}
                className={cx('h-9 rounded-xl px-4 text-xs font-extrabold uppercase tracking-[0.06em]', version === v ? 'bg-surface text-brand' : 'text-ink-muted hover:text-ink')}>
                {v === 'alpha' ? 'Alpha: multi-label' : 'Beta: one label + intensity'}
              </button>
            ))}
          </div>
          <div className="mt-5">
            <label className="mb-1.5 flex justify-between text-sm font-bold text-ink-secondary"><span>Image share of the mix</span><span className="tabular-nums">{Math.round(share * 100)}%</span></label>
            <input type="range" min={0} max={100} value={Math.round(share * 100)} onChange={(e) => setShare(+e.target.value / 100)}
              onPointerUp={() => setConfig('image_share', share, 'Mix saved.')} onKeyUp={() => setConfig('image_share', share, 'Mix saved.')} className="w-full accent-[var(--brand)]" aria-label="Image share" />
          </div>
        </Card>
        <Upload onDone={(n) => { setMsg({ ok: true, text: `${n} items added.` }); load() }} onError={(t) => setMsg({ ok: false, text: t })} />
      </div>

      <Card className="mt-6" padded={false}>
        <div className="p-5 pb-0"><CardHeader title="Queue" description="Per batch. Items are scored once they reach their quorum." /></div>
        <Table head={['Kind', 'Batch', 'Items', 'Active', 'Scored', 'Answers', 'Agreement']}
          rows={queue.map((q) => [q.kind, q.batch, q.items, q.active, q.scored, q.submissions, pct(q.agreement)])} />
      </Card>

      <Card className="mt-6" padded={false}>
        <div className="p-5 pb-0"><CardHeader title="Review queue" description="Weak means follow is confidently below the threshold. Watch means a behaviour flag. Ban only after reading the numbers." /></div>
        {review.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-muted">Nobody needs a look right now.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-y-2 border-hairline text-left text-xs text-ink-muted">
                {['Labeller', 'Track', 'Status', 'Flags', 'Answers', 'Follow ± se', 'Retests', 'Checks', 'Top label', ''].map((h) => <th key={h} className="whitespace-nowrap px-4 py-2 font-bold">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y-2 divide-hairline">
                {review.map((q) => (
                  <tr key={q.user_id + q.track}>
                    <td className="px-4 py-2.5 font-extrabold text-ink">@{q.username}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{q.track}</td>
                    <td className="px-4 py-2.5"><Stamp tone={q.status === 'weak' ? 'danger' : 'brand'}>{q.banned_at ? 'banned' : q.status}</Stamp></td>
                    <td className="px-4 py-2.5 text-xs text-ink-secondary">{q.flags.join(', ') || '–'}</td>
                    <td className="px-4 py-2.5 tabular-nums">{q.answers}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{num(q.follow)} ± {num(q.follow_se)} <span className="text-ink-muted">({q.refs})</span></td>
                    <td className="px-4 py-2.5 tabular-nums">{q.retests ? `${pct(q.retest_agreement)} of ${q.retests}` : '–'}</td>
                    <td className="px-4 py-2.5 tabular-nums">{q.controls ? `${pct(q.control_score)} of ${q.controls}` : '–'}</td>
                    <td className="px-4 py-2.5 text-xs">{q.top_label ? `${q.top_label} (${pct(q.top_label_share)})` : '–'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {q.banned_at
                        ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => supabase.rpc('admin_unban', { p_user: q.user_id }), `@${q.username} unbanned.`)}>Lift</Button>
                        : <Button size="sm" variant="danger" disabled={busy} onClick={() => ban(q)}>Ban</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-5 pb-0"><CardHeader title="Consensus" description="Scored items, least agreement first." /></div>
          <Table head={['Kind', 'Batch', 'Consensus', 'Judges', 'Agreement']}
            rows={consensus.map((c) => [c.kind, c.batch, c.labels.join(', ') || 'nothing', c.judges, pct(c.agreement)])} />
        </Card>
        <Card padded={false}>
          <div className="p-5 pb-0"><CardHeader title="Ban log" description="Every ban keeps its evidence." /></div>
          <Table head={['Labeller', 'Reason', 'By', 'When', 'Lifted']}
            rows={bans.map((b) => ['@' + b.username, b.reason, b.banned_by ? '@' + b.banned_by : 'service', new Date(b.created_at).toLocaleDateString(), b.lifted_at ? new Date(b.lifted_at).toLocaleDateString() : '–'])} />
        </Card>
      </div>
    </AppLayout>
  )
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p className="px-5 pb-5 text-sm text-ink-muted">Nothing yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-y-2 border-hairline text-left text-xs text-ink-muted">{head.map((h) => <th key={h} className="whitespace-nowrap px-4 py-2 font-bold">{h}</th>)}</tr></thead>
        <tbody className="divide-y-2 divide-hairline">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-4 py-2.5 tabular-nums text-ink-secondary">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

/** Upload a batch: files go to the private bucket under random names (so paths say nothing), then become items. */
function Upload({ onDone, onError }: { onDone: (n: number) => void; onError: (t: string) => void }) {
  const [batch, setBatch] = useState('')
  const [classes, setClasses] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  const measure = (file: File): Promise<Record<string, number>> =>
    new Promise((ok) => {
      const url = URL.createObjectURL(file)
      if (file.type.startsWith('image/')) {
        const img = new Image()
        img.onload = () => { ok({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url) }
        img.onerror = () => ok({})
        img.src = url
      } else {
        const a = new Audio()
        a.onloadedmetadata = () => { ok({ duration_s: a.duration }); URL.revokeObjectURL(url) }
        a.onerror = () => ok({})
        a.src = url
      }
    })

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    const options = classes.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
    if (!files.length) return
    if (!batch.trim() || options.length === 0) return onError('Name the batch and list its classes first.')
    setBusy(true)
    const items: Record<string, unknown>[] = []
    for (const [i, f] of files.entries()) {
      setProgress(`${i + 1} / ${files.length}`)
      const image = f.type.startsWith('image/')
      const ext = f.name.split('.').pop()?.toLowerCase() ?? (image ? 'jpg' : 'mp3')
      const path = `${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from(image ? 'images' : 'clips').upload(path, f, { contentType: f.type })
      if (error) { setBusy(false); setProgress(''); return onError(`${f.name}: ${error.message}`) }
      items.push({ kind: image ? 'image' : 'audio', media_path: path, batch: batch.trim(), class_options: options, source_uid: `${batch.trim()}:${f.name}`, ...(await measure(f)) })
    }
    const { data, error } = await supabase.rpc('admin_add_items', { p_items: items })
    setBusy(false)
    setProgress('')
    if (error) return onError(friendlyError(error.message))
    onDone(data as number)
  }

  return (
    <Card>
      <CardHeader title="Upload a batch" description="Audio clips or images. Every file in a batch shares its class list." />
      <div className="space-y-3">
        <Input placeholder="Batch name, e.g. birds-oct" value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Batch name" />
        <Input placeholder="Classes, comma separated: speech, music, birds" value={classes} onChange={(e) => setClasses(e.target.value)} aria-label="Classes" />
        <label className={cx('press flex h-11 cursor-pointer items-center justify-center rounded-2xl bg-brand px-5 text-[13px] font-extrabold uppercase tracking-[0.06em] text-white [--edge:var(--brand-dark)]', busy && 'pointer-events-none opacity-50')}>
          {busy ? `Uploading ${progress}` : 'Choose files'}
          <input type="file" multiple accept="audio/*,image/*" onChange={upload} hidden disabled={busy} />
        </label>
      </div>
    </Card>
  )
}
