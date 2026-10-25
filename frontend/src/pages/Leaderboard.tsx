import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import { AppLayout } from '../components/Layouts'
import { Card, CardHeader, EmptyState, Loading, PageHeader, Stamp, cx } from '../components/ui'
import { useAuth } from '../lib/auth'
import { pct, useLeaderboard, type BoardRow } from '../lib/stats'
import { supabase } from '../lib/supabase'

const weekLabel = (w: string) => `Week of ${new Date(w + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

/** The current top ten. */
export function TopTenPanel({ rows }: { rows: BoardRow[] }) {
  const top = rows.filter((r) => r.on_island).slice(0, 10)
  return (
    <Card>
      <CardHeader title="The top ten" description="Ranks update every five minutes." action={<Stamp tone="ok">live</Stamp>} />
      {top.length === 0 ? (
        <p className="text-sm text-ink-muted">Nobody is there yet. Suspiciously quiet.</p>
      ) : (
        <ol className="grid gap-2 sm:grid-cols-2">
          {top.map((r) => (
            <li key={r.username}>
              <Link to={`/u/${r.username}`} className="flex items-center gap-2.5 rounded-2xl border-2 border-hairline px-3 py-2 transition-colors hover:bg-surface-hover">
                <span className="w-6 font-mono text-xs font-bold text-ink-muted">#{r.rank}</span>
                <Avatar name={r.username} url={r.avatar_url} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-ink">{r.display_name ?? r.username}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

export default function Leaderboard() {
  const { profile } = useAuth()
  const [week, setWeek] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<string[]>([])
  const rows = useLeaderboard(week, 200)
  useEffect(() => {
    supabase.rpc('leaderboard_weeks').then(({ data }) => setWeeks(((data as { week: string }[] | null) ?? []).map((r) => r.week)))
  }, [])

  return (
    <AppLayout>
      <PageHeader
        title="Public leaderboard"
        description="Ranked by useful labels: every answer scores how well it matches what everyone else saw."
        actions={
          <select value={week ?? ''} onChange={(e) => setWeek(e.target.value || null)} aria-label="Which week"
            className="h-10 rounded-2xl border-2 border-hairline bg-surface px-3 text-sm font-bold text-ink">
            <option value="">Live</option>
            {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
          </select>
        }
      />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody has a rank yet." description="Items get scored once enough people label them. Be early." />
      ) : (
        <div className="space-y-6">
          {week === null && <TopTenPanel rows={rows} />}
          <Card padded={false} className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-hairline text-left text-xs text-ink-muted">
                  <th className="w-16 px-5 py-2.5 font-bold">#</th>
                  <th className="w-full py-2.5 font-bold">Labeller</th>
                  {week === null && <th className="hidden whitespace-nowrap px-3 py-2.5 text-right font-bold sm:table-cell">Agreement</th>}
                  {week === null && <th className="hidden whitespace-nowrap px-3 py-2.5 text-right font-bold sm:table-cell">IoU</th>}
                  <th className="whitespace-nowrap px-5 py-2.5 text-right font-bold">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-hairline">
                {rows.map((r) => {
                  const me = profile?.username === r.username
                  return (
                    <tr key={r.username} className={cx(me && 'bg-brand-soft')}>
                      <td className="px-5 py-3 font-mono text-xs font-bold text-ink-secondary">{r.rank}</td>
                      <td className="py-3">
                        <Link to={`/u/${r.username}`} className="flex items-center gap-2.5 hover:underline">
                          <Avatar name={r.username} url={r.avatar_url} size={28} />
                          <span className="truncate font-extrabold text-ink">{r.display_name ?? r.username}</span>
                          {r.on_island && <Stamp tone="ok" className="max-sm:hidden">top ten</Stamp>}
                          {me && <span className="text-xs font-bold text-brand">you</span>}
                        </Link>
                      </td>
                      {week === null && <td className="hidden px-3 py-3 text-right tabular-nums text-ink-secondary sm:table-cell">{pct(r.agreement)}</td>}
                      {week === null && <td className="hidden px-3 py-3 text-right tabular-nums text-ink-secondary sm:table-cell">{pct(r.iou)}</td>}
                      <td className="px-5 py-3 text-right font-extrabold tabular-nums text-ink">{Math.round(r.points).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </AppLayout>
  )
}
