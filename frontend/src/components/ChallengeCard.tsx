import { ButtonLink, Card, Stamp, cx } from './ui'
import { isHost, type Challenge } from '../lib/challenges'

const STATUS: Record<Challenge['status'], [string, 'ok' | 'brand' | 'danger']> = {
  open: ['open', 'ok'], soon: ['opens soon', 'brand'], finished: ['finished', 'danger'],
}

/** One hosted challenge as it appears in the public directory. */
export function ChallengeCard({ c, hosting, joined }: { c: Challenge; hosting: boolean; joined: boolean }) {
  const [label, tone] = STATUS[c.status]
  const joinable = c.status === 'open' && c.items > 0
  const fresh = c.status === 'open' && c.items === 0 && hosting
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-extrabold leading-tight text-ink">{c.name}</h3>
        <Stamp tone={tone}>{label}</Stamp>
      </div>
      <p className="mt-1.5 text-sm text-ink-secondary">{c.blurb}</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs font-bold text-ink-muted">
        <span>@{c.host_username}</span>
        <span aria-hidden>·</span>
        {c.kinds.map((k) => <span key={k} className={cx('rounded-full border-2 border-hairline px-2 py-0.5 uppercase tracking-[0.06em]', k === 'audio' ? 'text-ink-secondary' : 'text-brand')}>{k}</span>)}
      </p>
      <p className="mt-3 font-mono text-xs text-ink-muted tabular-nums">
        {c.labellers} labellers · {c.submissions.toLocaleString()} labels · {c.items_scored}/{c.items} files closed
        {c.agreement != null && <> · {Math.round(c.agreement * 100)}% agreement</>}
      </p>
      <div className="mt-4 flex items-center gap-2 pt-1">
        {joinable ? (
          joined ? <ButtonLink to="/label" size="sm" variant="primary">Label now</ButtonLink>
                 : <ButtonLink to="/signup" size="sm" variant="primary">Join</ButtonLink>
        ) : fresh ? (
          <span className="text-xs font-extrabold text-brand">you host this · add items to open it to labellers</span>
        ) : (
          <span className="text-xs font-bold text-ink-muted">{c.status === 'finished' ? 'Closed to new labellers' : 'Not taking labellers yet'}</span>
        )}
        {!fresh && hosting && <span className="text-xs font-extrabold text-brand">you host this</span>}
      </div>
    </Card>
  )
}

/** The stats strip on the host's own challenge card. */
export function HostStats({ c }: { c: Challenge }) {
  const cells: [string, string][] = [
    [c.labellers.toString(), 'labellers'],
    [c.submissions.toLocaleString(), 'labels'],
    [`${c.items_scored}/${c.items}`, 'files closed'],
    [c.agreement == null ? '–' : `${Math.round(c.agreement * 100)}%`, 'agreement'],
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map(([v, l]) => (
        <div key={l} className="rounded-2xl border-2 border-hairline bg-surface-muted px-3 py-2">
          <div className="text-lg font-extrabold text-ink tabular-nums">{v}</div>
          <div className="text-[11px] font-semibold text-ink-muted">{l}</div>
        </div>
      ))}
    </div>
  )
}

export function hostedFlag(c: Challenge, email: string | null | undefined, username: string | undefined, isAdmin = false) {
  return isHost(c, email, username, isAdmin)
}
