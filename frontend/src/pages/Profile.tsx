import { useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import { Activity, RankHistory, StatGrid } from '../components/FileStats'
import { AppLayout } from '../components/Layouts'
import { ButtonLink, EmptyState, Loading, Stamp } from '../components/ui'
import { useAuth } from '../lib/auth'
import { since, useUserStats } from '../lib/stats'

export default function Profile() {
  const { username } = useParams()
  const { profile } = useAuth()
  const { stats, counts, history } = useUserStats(username)
  if (stats === undefined) return <AppLayout><Loading /></AppLayout>
  if (stats === null) return <AppLayout><EmptyState title="No file under that name." action={<ButtonLink to="/leaderboard">See the public board</ButtonLink>} /></AppLayout>
  const mine = profile?.username === stats.username
  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Avatar name={stats.username} url={stats.avatar_url} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-extrabold tracking-tight text-ink">{stats.display_name ?? stats.username}</h1>
            {stats.rank != null && stats.rank <= 10 && <Stamp tone="ok">top ten</Stamp>}
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">@{stats.username} · joined {since(stats.joined)}{stats.island_weeks > 0 && ` · ${stats.island_weeks} week${stats.island_weeks === 1 ? '' : 's'} in the top ten`}</p>
        </div>
        {mine && <ButtonLink to="/settings" size="sm">Edit</ButtonLink>}
      </div>
      <div className="space-y-6">
        <StatGrid stats={stats} counts={counts} />
        <RankHistory history={history} />
        <Activity counts={counts} />
      </div>
    </AppLayout>
  )
}
