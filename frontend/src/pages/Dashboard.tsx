import { Activity, RankHistory, StatGrid } from '../components/FileStats'
import { AppLayout } from '../components/Layouts'
import { ButtonLink, Card, Loading, PageHeader, Stamp } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useProgress } from '../lib/progress'
import { useUserStats } from '../lib/stats'

export default function Dashboard() {
  const { profile } = useAuth()
  const { progress } = useProgress()
  const { stats, counts, history } = useUserStats(profile?.username)
  const goal = progress?.daily_goal ?? 20
  const today = progress?.today ?? 0
  return (
    <AppLayout>
      <PageHeader
        title={`Hi, ${profile?.display_name ?? profile?.username}`}
        description={today >= goal ? `Daily goal done: ${today} labels today. Extra still counts.` : `${today} of ${goal} labels today.`}
        actions={<ButtonLink to="/label" variant="primary" size="lg">{today > 0 ? 'Keep labelling' : 'Start labelling'}</ButtonLink>}
      />
      {stats === undefined ? <Loading /> : stats === null ? null : (
        <div className="space-y-6">
          {stats.rank != null && stats.rank <= 10 && (
            <Card className="flex items-center gap-3"><Stamp tone="ok">on the island</Stamp><span className="text-sm font-bold text-ink">You're in the top ten. Try to stay there.</span></Card>
          )}
          <StatGrid stats={stats} counts={counts} />
          <RankHistory history={history} />
          <Activity counts={counts} />
        </div>
      )}
    </AppLayout>
  )
}
