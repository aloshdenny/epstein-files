import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '../components/Layouts'
import { ButtonLink, Card, CardHeader, Folder, Stamp } from '../components/ui'
import { useAuth } from '../lib/auth'
import type { Challenge } from '../lib/challenges'
import { supabase } from '../lib/supabase'

function Hero() {
  const [broken, setBroken] = useState(false)
  if (broken)
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-3xl border-2 border-hairline bg-[var(--paper)]">
        <Folder size={120} stamped />
      </div>
    )
  return (
    <img src="/epstein-simpsons.jpeg" alt="A cartoon crowd waiting their turn" onError={() => setBroken(true)}
      className="aspect-[4/3] w-full rounded-3xl border-2 border-hairline object-cover" />
  )
}

export default function Home() {
  const { session, profile } = useAuth()
  const hostPath = session ? profile?.onboarded ? '/challenges/new' : '/welcome' : '/signup'
  const [challenges, setChallenges] = useState<Challenge[] | null>(null)
  useEffect(() => {
    supabase.rpc('challenges').then(({ data }) => setChallenges((data as Challenge[] | null) ?? []))
  }, [])

  return (
    <AppLayout>
      <section className="grid items-center gap-8 md:grid-cols-[1.05fr_1fr]">
        <div>
          <Stamp tone="brand">all-in-one labelling</Stamp>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">Challenges for<br />things worth labelling.</h1>
          <p className="mt-4 max-w-md text-base text-ink-secondary">
            Audio and images, one queue at a time. Host a challenge, invite a few people, and let consensus become somebody's problem.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink to="/challenges" variant="primary" size="lg">Browse challenges</ButtonLink>
            <ButtonLink to="/leaderboard?week=latest" size="lg">This week's winners</ButtonLink>
            <ButtonLink to={hostPath} state={hostPath === '/welcome' ? { from: { pathname: '/challenges/new' } } : undefined} size="lg">Host a challenge</ButtonLink>
          </div>
        </div>
        <Hero />
      </section>

      <section className="mt-14">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div><p className="font-mono text-xs font-bold uppercase tracking-widest text-ink-muted">Community queues</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">Challenges</h2></div>
          <Link to="/challenges" className="text-sm font-extrabold text-brand hover:underline">See all</Link>
        </div>
        {challenges === null ? (
          <p className="rounded-2xl border-2 border-dashed border-hairline-strong px-5 py-8 text-center text-sm text-ink-muted">Checking the queues. No forms to fill out.</p>
        ) : challenges.filter((c) => c.open).length === 0 ? (
          <Card><CardHeader title="No public challenges yet." /><p className="text-sm text-ink-muted">The first one can be yours.</p><ButtonLink to={hostPath} state={hostPath === '/welcome' ? { from: { pathname: '/challenges/new' } } : undefined} className="mt-4">Host a challenge</ButtonLink></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {challenges.filter((c) => c.open).slice(0, 6).map((challenge) => {
              const progress = challenge.items ? Math.round(challenge.scored * 100 / challenge.items) : 0
              return (
                <Card key={challenge.slug}>
                  <CardHeader title={challenge.title} description={<Stamp tone="brand">{challenge.kind}</Stamp>} />
                  {challenge.blurb && <p className="mb-4 text-sm text-ink-secondary">{challenge.blurb}</p>}
                  <div className="mb-3 flex items-center justify-between gap-2 text-xs font-bold text-ink-muted"><span>{challenge.scored.toLocaleString()} / {challenge.items.toLocaleString()} scored</span><span>{challenge.labellers.toLocaleString()} labellers</span></div>
                  <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} /></div>
                  <Link to={`/label?c=${encodeURIComponent(challenge.slug)}`} className="inline-flex rounded-xl px-2 py-1 text-sm font-extrabold text-brand hover:bg-surface-hover">
                    Start labelling <span aria-hidden="true">→</span>
                  </Link>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </AppLayout>
  )
}
