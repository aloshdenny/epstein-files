import { Activity, RankHistory, StatGrid } from '../components/FileStats'
import { HostStats } from '../components/ChallengeCard'
import { AppLayout } from '../components/Layouts'
import { ButtonLink, Card, Loading, PageHeader, Stamp } from '../components/ui'
import { useAuth } from '../lib/auth'
import { hostedBy } from '../lib/challenges'
import { useProgress } from '../lib/progress'
import { useUserStats } from '../lib/stats'

/** The host's own corner: every challenge this account hosts, with its stats. Comes first on the dashboard. */
function HostedChallenges() {
  const { session, profile } = useAuth()
  const mine = hostedBy(session?.user?.email, profile?.username, profile?.is_admin)
  if (mine.length === 0) return null
  return (
    <section aria-label="Challenges you host">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-extrabold tracking-tight text-ink">You're hosting</h2>
        <span className="text-xs font-semibold text-ink-muted">{mine.length} {mine.length === 1 ? 'challenge' : 'challenges'}</span>
      </div>
      <div className="space-y-4">
        {mine.map((c) => (
          <Card key={c.slug}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-extrabold text-ink">{c.name}</h3>
                  <Stamp tone={c.visibility === 'private' ? 'danger' : 'ok'}>{c.visibility}</Stamp>
                  <Stamp tone={c.status === 'open' ? 'ok' : 'brand'}>{c.status === 'open' ? 'open' : c.status}</Stamp>
                </div>
                <p className="mt-1 text-sm text-ink-secondary">{c.blurb}</p>
              </div>
              <div className="flex gap-2">
                <ButtonLink to={`/genuinity?c=${c.slug}`} size="sm" variant="primary">Genuinity report</ButtonLink>
                {profile?.is_admin && c.slug === 'epstein-files' && <ButtonLink to="/admin" size="sm">Admin</ButtonLink>}
              </div>
            </div>
            <div className="mt-4"><HostStats c={c} /></div>
            {c.ends_at && <p className="mt-3 font-mono text-xs text-ink-muted">closes {new Date(c.ends_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</p>}
          </Card>
        ))}
      </div>
    </section>
  )
}

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
          <HostedChallenges />
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
