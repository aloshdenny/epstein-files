import { useEffect, useState } from 'react'
import { ChallengeCard } from '../components/ChallengeCard'
import { AppLayout } from '../components/Layouts'
import { ButtonLink, Folder, Stamp } from '../components/ui'
import { useAuth } from '../lib/auth'
import { hostedBy, publicChallenges } from '../lib/challenges'
import { supabase } from '../lib/supabase'

type Site = { submissions: number; labellers: number; items: number; items_scored: number }

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
  const [site, setSite] = useState<Site | null>(null)
  useEffect(() => {
    supabase.rpc('site_stats').then(({ data }) => setSite((data as Site[] | null)?.[0] ?? null))
  }, [])
  const signedIn = !!session && !!profile?.onboarded
  const hosting = new Set(hostedBy(session?.user?.email, profile?.username, profile?.is_admin).map((c) => c.slug))

  return (
    <AppLayout>
      <section className="grid items-center gap-8 md:grid-cols-[1.05fr_1fr]">
        <div>
          <Stamp>declassified</Stamp>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">Labelling. Made fun.<br />With Epstein.</h1>
          <p className="mt-4 max-w-md text-base text-ink-secondary">
            A labelling game for audio and images. The more useful your labels, the higher you climb. The top ten are on the island.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {signedIn ? (
              <>
                <ButtonLink to="/label" variant="primary" size="lg">Keep labelling</ButtonLink>
                <ButtonLink to="/leaderboard?week=latest" size="lg">This week's Epstein winners!</ButtonLink>
              </>
            ) : (
              <>
                <ButtonLink to="/signup" variant="primary" size="lg">Join the waitlist</ButtonLink>
                <ButtonLink to="/leaderboard?week=latest" size="lg">This week's Epstein winners!</ButtonLink>
                <ButtonLink to="/login" size="lg">Log in</ButtonLink>
              </>
            )}
          </div>
          {site && site.submissions > 0 && (
            <p className="mt-5 font-mono text-xs font-bold text-ink-muted">
              {site.submissions.toLocaleString()} labels · {site.labellers.toLocaleString()} labellers · {site.items_scored.toLocaleString()} files closed
            </p>
          )}
        </div>
        <Hero />
      </section>

      <section className="mt-14">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink">Challenges</h2>
          <span className="text-xs font-semibold text-ink-muted">Open to everyone</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {publicChallenges().map((c) => (
            <ChallengeCard key={c.slug} c={c} hosting={hosting.has(c.slug)} joined={signedIn} />
          ))}
        </div>
      </section>
    </AppLayout>
  )
}
