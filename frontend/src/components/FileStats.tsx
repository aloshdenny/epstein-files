import Heatmap, { streaks } from './Heatmap'
import { Card, CardHeader, Stat } from './ui'
import { pct, type RankPoint, type UserStats } from '../lib/stats'

/** The numbers on a labeller's file: shared by the dashboard and public profiles. */
export function StatGrid({ stats, counts }: { stats: UserStats; counts: Map<string, number> }) {
  const s = streaks(counts)
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat value={stats.rank ? `#${stats.rank.toLocaleString()}` : '–'} label={stats.rank ? `of ${stats.ranked.toLocaleString()} on the public board` : 'not ranked yet'} />
      <Stat value={stats.submissions.toLocaleString()} label="labels" />
      <Stat value={stats.scored.toLocaleString()} label="scored" />
      <Stat value={pct(stats.agreement)} label="audio agreement" />
      <Stat value={pct(stats.iou)} label="image IoU" />
      <Stat value={s.current} label={`day streak (best ${s.longest})`} />
    </div>
  )
}

/** Weekly rank as a small step chart. Up is better, so the axis is flipped. No library. */
export function RankHistory({ history }: { history: RankPoint[] }) {
  return (
    <Card>
      <CardHeader title="Rank history" description="Where you stood at the end of each week." />
      {history.length < 2 ? (
        <p className="text-sm text-ink-muted">{history.length === 1 ? `One week on record: #${history[0].rank}.` : 'Nothing on record yet. Weeks close on Sunday night.'}</p>
      ) : (
        <RankChart history={history} />
      )}
    </Card>
  )
}

function RankChart({ history }: { history: RankPoint[] }) {
  const w = 600, h = 140, pad = 16
  const worst = Math.max(...history.map((p) => p.rank)), best = Math.min(...history.map((p) => p.rank))
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (history.length - 1)
  const y = (r: number) => (worst === best ? h / 2 : pad + ((r - best) * (h - 2 * pad)) / (worst - best))
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" role="img" aria-label={`Rank from #${history[0].rank} to #${history[history.length - 1].rank}`}>
      <polyline points={history.map((p, i) => `${x(i)},${y(p.rank)}`).join(' ')} fill="none" stroke="var(--brand)" strokeWidth={3} strokeLinejoin="round" />
      {history.map((p, i) => (
        <g key={p.week}>
          <circle cx={x(i)} cy={y(p.rank)} r={5} fill="var(--surface)" stroke="var(--brand)" strokeWidth={2.5} />
          <text x={x(i)} y={y(p.rank) - 10} textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[11px] font-bold">#{p.rank}</text>
        </g>
      ))}
    </svg>
  )
}

export function Activity({ counts }: { counts: Map<string, number> }) {
  return (
    <Card>
      <CardHeader title="Activity" description="Labels per day." />
      <Heatmap counts={counts} />
    </Card>
  )
}
