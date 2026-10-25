import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import { AppLayout } from '../components/Layouts'
import { ButtonLink, Card, CardHeader, Folder, Stamp, cx } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useProgress } from '../lib/progress'
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

type Challenge = {
  tag: string
  title: string
  text: string
  goal: number
  progress: number | null // null while signed out: the challenge shows, the progress waits
  render: (n: number, goal: number) => ReactNode
}

function ComboDots({ n, goal }: { n: number; goal: number }) {
  return (
    <div className="mt-4 flex gap-1.5" aria-label={`${n} of ${goal} in a row`}>
      {Array.from({ length: goal }, (_, i) => (
        <span key={i} className={cx('h-3.5 w-3.5 rounded-full border-2', i < n ? 'border-[var(--brand)] bg-[var(--brand)]' : 'border-hairline-strong bg-transparent')} />
      ))}
    </div>
  )
}

function ProgressBar({ n, goal }: { n: number; goal: number }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex justify-between font-mono text-xs font-bold text-ink-muted tabular-nums">
        <span>{n} / {goal}</span>
        <span>{n >= goal ? 'done' : `${Math.max(0, goal - n)} to go`}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-[var(--ok)] transition-[width] duration-500" style={{ width: `${Math.min(100, Math.round((n / goal) * 100))}%` }} />
      </div>
    </div>
  )
}

export default function Home() {
  const { session, profile } = useAuth()
  const { progress } = useProgress()
  const rows = useLeaderboard(null, 10)
  const [site, setSite] = useState<Site | null>(null)
  useEffect(() => {
    supabase.rpc('site_stats').then(({ data }) => setSite((data as Site[] | null)?.[0] ?? null))
  }, [])
  const signedIn = !!session && !!profile?.onboarded

  const challenges: Challenge[] = [
    {
      tag: 'daily', title: 'Five in a row',
      text: 'Land five labels in a row without a skip. The combo resets when you step away too long.',
      goal: 5, progress: signedIn ? (progress?.combo ?? 0) : null,
      render: (n, goal) => <ComboDots n={n} goal={goal} />,
    },
    {
      tag: 'daily', title: 'The daily twenty',
      text: 'Twenty labels closes the file for the day. Anything after still counts toward the waitlist.',
      goal: progress?.daily_goal ?? 20, progress: signedIn ? (progress?.today ?? 0) : null,
      render: (n, goal) => <ProgressBar n={n} goal={goal} />,
    },
    {
      tag: 'weekly', title: 'Sharp ears',
      text: 'Agree with the crowd on eight of your next ten scored items and you are on the accurate list this week.',
      goal: 8, progress: signedIn ? 0 : null,
      render: (n, goal) => <ProgressBar n={n} goal={goal} />,
    },
  ]

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
          {signedIn ? (
            <Link to="/label" className="text-sm font-extrabold text-brand hover:underline">Go</Link>
          ) : (
            <span className="text-xs font-semibold text-ink-muted">Join the waitlist to play</span>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {challenges.map((c) => (
            <Card key={c.title}>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">{c.tag}</span>
              <h3 className="mt-1 text-lg font-extrabold text-ink">{c.title}</h3>
              <p className="mt-1.5 text-sm text-ink-secondary">{c.text}</p>
              {c.progress == null ? (
                <p className="mt-4 font-mono text-xs font-bold text-ink-muted">progress starts when you do</p>
              ) : (
                c.render(c.progress, c.goal)
              )}
            </Card>
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
