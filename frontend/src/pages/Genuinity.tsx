import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import { AppLayout } from '../components/Layouts'
import { Card, CardHeader, PageHeader, Stamp, cx } from '../components/ui'
import { GENUINITY, MIN_SCORED, type GenuineRow } from '../lib/genuinity'

const pct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)}%`)

/** Where a labeller sits between "answers track their items" and "answers would fit any item". */
function tone(follow: number | null) {
  if (follow == null) return 'var(--ink-muted)'
  if (follow >= 0.35) return 'var(--ok)'
  if (follow >= 0.15) return 'var(--brand)'
  return 'var(--danger)'
}

function Bar({ row }: { row: GenuineRow }) {
  const w = row.follow == null ? 0 : Math.max(2, Math.round(row.follow * 100))
  return (
    <div className="h-3.5 w-full overflow-hidden rounded-full bg-surface-muted" role="img"
      aria-label={`${row.username}: genuinity ${pct(row.follow)}`}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${w}%`, background: tone(row.follow) }} />
    </div>
  )
}

function StatusChip({ row }: { row: GenuineRow }) {
  const map = { ok: ['genuine', 'ok'], watch: ['watch', 'brand'], weak: ['fake pattern', 'danger'], 'too early': ['too early', 'brand'] } as const
  const [label, t] = map[row.status]
  return <Stamp tone={t as 'ok' | 'brand' | 'danger'}>{label}</Stamp>
}

/** The project owner's genuinity report: every labeller ranked most genuine to most fake, once they have
 *  MIN_SCORED scored labels. Public projects show usernames only; private projects may also show real names. */
export default function Genuinity() {
  const [priv, setPriv] = useState(false)
  const ranked = GENUINITY.filter((r) => r.scored >= MIN_SCORED).sort((a, b) => (b.follow ?? 0) - (a.follow ?? 0))
  const pending = GENUINITY.filter((r) => r.scored < MIN_SCORED).sort((a, b) => b.scored - a.scored)

  return (
    <AppLayout width="wide">
      <PageHeader
        title="Genuinity"
        description={`How honestly each labeller's answers track their own items. Ranking starts once a labeller has ${MIN_SCORED} scored labels.`}
        actions={
          <div className="inline-flex rounded-2xl border-2 border-hairline bg-surface-muted p-1" role="group" aria-label="Project visibility">
            {([['public', 'Public view'], ['private', 'Private view']] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => setPriv(mode === 'private')}
                aria-pressed={priv === (mode === 'private')}
                className={cx('h-9 rounded-xl px-4 text-xs font-extrabold uppercase tracking-[0.06em]', priv === (mode === 'private') ? 'bg-surface text-brand' : 'text-ink-muted hover:text-ink')}>
                {label}
              </button>
            ))}
          </div>
        }
      />

      <p className="mb-6 max-w-2xl text-sm text-ink-secondary">
        {priv
          ? 'Private project: usernames and real names (when the labeller gave one). Only you and your admins see this view.'
          : 'Public project: usernames only. Real names stay hidden even from other labellers.'}
      </p>

      <Card padded={false}>
        <div className="px-5 pt-5"><CardHeader title="Most genuine to most fake" description="The follow score: 100% means answers depend on what is in the item, 0% means they would fit any item." /></div>
        <ol className="mt-2 divide-y-2 divide-[var(--hairline)]">
          {ranked.map((row, i) => (
            <li key={row.username} className="grid items-center gap-3 px-5 py-3.5 sm:grid-cols-[2rem_1fr_7rem_5.5rem]">
              <span className="font-mono text-xs font-bold text-ink-muted tabular-nums">{i + 1}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Avatar name={row.username} size={22} />
                  <Link to={`/u/${row.username}`} className="truncate text-sm font-extrabold text-ink hover:text-brand">@{row.username}</Link>
                  {priv && row.real_name && <span className="truncate text-xs text-ink-muted">{row.real_name}</span>}
                  <StatusChip row={row} />
                </div>
                <div className="mt-2"><Bar row={row} /></div>
                {row.flags.length > 0 && <p className="mt-1.5 text-xs text-ink-muted">{row.flags.join(' · ')}</p>}
              </div>
              <span className="font-mono text-sm font-bold text-ink tabular-nums" style={{ color: tone(row.follow) }}>{pct(row.follow)}</span>
              <span className="text-right font-mono text-xs text-ink-muted tabular-nums">{row.scored} scored</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-6">
        <Card>
          <CardHeader title="Collecting evidence" description={`Fewer than ${MIN_SCORED} scored labels. They are ranked once the algorithm has enough to judge.`} />
          <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-secondary">
            {pending.map((row) => (
              <li key={row.username} className="flex items-center gap-2">
                <Avatar name={row.username} size={20} />
                <span className="font-bold">@{row.username}</span>
                {priv && row.real_name && <span className="text-xs text-ink-muted">{row.real_name}</span>}
                <span className="font-mono text-xs text-ink-muted tabular-nums">{row.scored}/{MIN_SCORED}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppLayout>
  )
}
