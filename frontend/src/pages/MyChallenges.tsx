import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '../components/Layouts'
import { Alert, ButtonLink, Card, CardHeader, EmptyState, Loading, PageHeader, Stamp } from '../components/ui'
import type { ManagedChallenge } from '../lib/challenges'
import { friendlyError, supabase } from '../lib/supabase'

export default function MyChallenges() {
  const [rows, setRows] = useState<ManagedChallenge[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_challenges')
    if (error) setError(friendlyError(error.message))
    else setRows((data as ManagedChallenge[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <AppLayout>
      <PageHeader title="My challenges" description="Queues you host. The numbers are for management, not a personality test." actions={<ButtonLink to="/challenges/new" variant="primary">Host a challenge</ButtonLink>} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {rows === null ? <Loading /> : rows.length === 0 ? (
        <EmptyState title="No hosted challenges yet." description="The first queue is mostly a title and a promise." action={<ButtonLink to="/challenges/new" variant="primary">Create a challenge</ButtonLink>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.slug}>
              <CardHeader title={row.title} description={<span className="flex items-center gap-2"><Stamp tone="brand">{row.kind}</Stamp>{row.open ? 'open' : 'private'}</span>} action={<Link to={`/c/${row.slug}/manage`} className="text-xs font-extrabold text-brand hover:underline">Manage</Link>} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MiniStat label="Items" value={row.items} />
                <MiniStat label="Scored" value={row.scored} />
                <MiniStat label="Answers" value={row.answers} />
                <MiniStat label="Labellers" value={row.labellers} />
                <MiniStat label="Mean agreement" value={row.agreement == null ? '–' : `${Math.round(row.agreement * 100)}%`} />
                <MiniStat label="Flagged" value={row.flagged_labellers} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-surface-muted px-3 py-2"><p className="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-0.5 text-lg font-extrabold tabular-nums text-ink">{typeof value === 'number' ? value.toLocaleString() : value}</p></div>
}
