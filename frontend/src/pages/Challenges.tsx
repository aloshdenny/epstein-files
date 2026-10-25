import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/Layouts'
import { Alert, Button, ButtonLink, Card, CardHeader, EmptyState, Loading, PageHeader, Stamp } from '../components/ui'
import { useAuth } from '../lib/auth'
import type { Challenge } from '../lib/challenges'
import { friendlyError, supabase } from '../lib/supabase'

export default function Challenges() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [challenges, setChallenges] = useState<Challenge[] | null>(null)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('challenges')
    if (error) setError(friendlyError(error.message))
    else setChallenges((data as Challenge[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const start = async (challenge: Challenge) => {
    if (!session) return navigate('/login', { state: { from: { pathname: `/label?c=${encodeURIComponent(challenge.slug)}` } } })
    if (!profile?.onboarded) return navigate('/welcome', { state: { from: { pathname: '/label', search: `?c=${encodeURIComponent(challenge.slug)}` } } })
    setJoining(challenge.slug)
    const { error } = challenge.joined
      ? { error: null }
      : await supabase.rpc('join_challenge', { p_slug: challenge.slug })
    setJoining('')
    if (error) return setError(friendlyError(error.message))
    navigate(`/label?c=${encodeURIComponent(challenge.slug)}`)
  }

  return (
    <AppLayout>
      <PageHeader
        title="Challenges"
        description="Pick a queue, label a few things, and let consensus do its slow work."
        actions={<ButtonLink to="/challenges/new" variant="primary">Host a challenge</ButtonLink>}
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {challenges === null ? <Loading /> : challenges.filter((c) => c.open || c.joined).length === 0 ? (
        <EmptyState title="No open challenges yet." description="An empty queue is still a queue, in a technical sense." action={<ButtonLink to="/challenges/new">Host one</ButtonLink>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {challenges.filter((c) => c.open || c.joined).map((challenge) => {
            const percent = challenge.items ? Math.round(challenge.scored * 100 / challenge.items) : 0
            return (
              <Card key={challenge.slug}>
                <CardHeader
                  title={challenge.title}
                  description={<span className="flex flex-wrap items-center gap-2"><Stamp tone="brand">{challenge.kind}</Stamp><span>{challenge.open ? 'open challenge' : 'invited labellers'}</span></span>}
                  action={challenge.my_role === 'admin' && <Link to={`/c/${challenge.slug}/manage`} className="text-xs font-extrabold text-brand hover:underline">Manage</Link>}
                />
                {challenge.blurb && <p className="mb-4 text-sm text-ink-secondary">{challenge.blurb}</p>}
                <div className="mb-4 flex flex-wrap gap-2">
                  {challenge.class_options.slice(0, 7).map((option) => <span key={option} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-bold text-ink-secondary">{option}</span>)}
                  {challenge.class_options.length > 7 && <span className="px-1 py-1 text-xs text-ink-muted">+{challenge.class_options.length - 7}</span>}
                </div>
                <div className="flex items-center justify-between gap-3 text-xs font-bold text-ink-muted">
                  <span>{challenge.scored.toLocaleString()} / {challenge.items.toLocaleString()} scored</span>
                  <span>{challenge.labellers.toLocaleString()} labellers</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Scored items">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                </div>
                <Button className="mt-4 w-full" variant="primary" disabled={joining === challenge.slug} onClick={() => start(challenge)}>
                  {joining === challenge.slug ? 'Joining…' : challenge.joined ? 'Start labelling' : 'Join and start labelling'}
                </Button>
              </Card>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}
