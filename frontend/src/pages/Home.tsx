import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import { ChallengeCard } from '../components/ChallengeCard'
import { AppLayout } from '../components/Layouts'
import { ButtonLink, Card, CardHeader, Folder, Stamp } from '../components/ui'
import { useAuth } from '../lib/auth'
import { hostedBy, publicChallenges } from '../lib/challenges'
import { useLeaderboard } from '../lib/stats'
import { supabase } from '../lib/supabase'
import { IslandPanel } from './Leaderboard'

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
  const rows = useLeaderboard(null, 10)
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
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">Help sort the files.<br />Get on the waitlist.</h1>
          <p className="mt-4 max-w-md text-base text-ink-secondary">
            A labelling game for audio and images. The more useful your labels, the higher you climb. The top ten are on the island.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {signedIn ? (
              <ButtonLink to="/label" variant="primary" size="lg">Keep labelling</ButtonLink>
            ) : (
              <>
                <ButtonLink to="/signup" variant="primary" size="lg">Join the waitlist</ButtonLink>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {publicChallenges.map((c) => (
            <ChallengeCard key={c.slug} c={c} hosting={hosting.has(c.slug)} joined={signedIn} />
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        {rows && rows.length > 0 ? <IslandPanel rows={rows} /> : (
          <Card><CardHeader title="Currently on the island" /><p className="text-sm text-ink-muted">Nobody yet. Plenty of room.</p></Card>
        )}
        <Card>
          <CardHeader title="The rules, briefly" />
          <ul className="space-y-2 text-sm text-ink-secondary">
            <li>Answer honestly. Random answers get noticed and stop counting.</li>
            <li>Skipping is fine. It just resets your combo.</li>
            <li>Not sure? Say so. "Can't tell" and "not present" are real answers.</li>
            <li>Rank is about useful labels, not volume.</li>
          </ul>
          <Link to="/leaderboard" className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-brand hover:underline">
            See the whole waitlist
          </Link>
          {rows?.[0] && (
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted"><Avatar name={rows[0].username} url={rows[0].avatar_url} size={20} /> @{rows[0].username} is first in line.</p>
          )}
        </Card>
      </section>
    </AppLayout>
  )
}
