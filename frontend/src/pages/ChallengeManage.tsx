import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { Link, useParams } from 'react-router-dom'
import { AppLayout } from '../components/Layouts'
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, Loading, PageHeader, Stamp, cx } from '../components/ui'
import type { ChallengeInvite, ChallengeMember, Genuineness, ManagedChallenge } from '../lib/challenges'
import { friendlyError, supabase } from '../lib/supabase'

export default function ChallengeManage() {
  const { slug = '' } = useParams()
  const [challenge, setChallenge] = useState<ManagedChallenge | null>(null)
  const [invites, setInvites] = useState<ChallengeInvite[]>([])
  const [members, setMembers] = useState<ChallengeMember[]>([])
  const [genuineness, setGenuineness] = useState<Genuineness[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [emailResult, setEmailResult] = useState('')
  const [qr, setQr] = useState<{ title: string; url: string; svg: string } | null>(null)

  const load = useCallback(async () => {
    const [mine, inviteRows, memberRows, genuineRows] = await Promise.all([
      supabase.rpc('my_challenges'),
      supabase.rpc('challenge_invites', { p_slug: slug }),
      supabase.rpc('challenge_members_list', { p_slug: slug }),
      supabase.rpc('challenge_genuineness', { p_slug: slug }),
    ])
    const row = (mine.data as ManagedChallenge[] | null)?.find((c) => c.slug === slug) ?? null
    setChallenge(row)
    setInvites((inviteRows.data as ChallengeInvite[] | null) ?? [])
    setMembers((memberRows.data as ChallengeMember[] | null) ?? [])
    setGenuineness((genuineRows.data as Genuineness[] | null) ?? [])
    const firstError = mine.error ?? inviteRows.error ?? memberRows.error ?? genuineRows.error
    setError(firstError ? friendlyError(firstError.message) : '')
  }, [slug])
  useEffect(() => { load() }, [load])

  const stats = useMemo(() => challenge ? [
    ['Items', challenge.items], ['Scored', challenge.scored], ['Answers', challenge.answers],
    ['Labellers', challenge.labellers], ['Mean agreement', challenge.agreement == null ? '–' : `${Math.round(challenge.agreement * 100)}%`],
    ['Flagged labellers', challenge.flagged_labellers],
  ] as const : [], [challenge])

  const makeInvite = async (channel: 'link' | 'qr') => {
    setBusy(true)
    setEmailResult('')
    const { data, error } = await supabase.rpc('create_invite', { p_slug: slug, p_channel: channel })
    setBusy(false)
    if (error) return setError(friendlyError(error.message))
    const invite = (data as { token: string }[] | null)?.[0]
    if (!invite) return setError('No invitation was returned.')
    const url = new URL(`/join/${encodeURIComponent(invite.token)}`, window.location.origin).toString()
    await navigator.clipboard?.writeText(url).catch(() => {})
    if (channel === 'qr') {
      const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 240 })
      setQr({ title: challenge?.title ?? slug, url, svg })
    } else {
      setEmailResult(`Invitation link copied: ${url}`)
    }
    await load()
  }

  const sendEmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setEmailResult('')
    const { data: auth } = await supabase.auth.getSession()
    const response = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.session?.access_token ?? ''}` },
      body: JSON.stringify({ challenge: slug, email: email.trim() }),
    })
    const result = await response.json().catch(() => ({})) as { sent?: boolean; link?: string; error?: string }
    setBusy(false)
    if (!response.ok) return setError(result.error ?? `Invite could not be sent (HTTP ${response.status}).`)
    setEmailResult(`Invite sent to ${email.trim()}.`)
    setEmail('')
    await load()
  }

  const revoke = async (id: string) => {
    setBusy(true)
    const { error } = await supabase.rpc('revoke_invite', { p_id: id })
    setBusy(false)
    if (error) setError(friendlyError(error.message))
    else await load()
  }

  if (!challenge && !error) return <AppLayout><Loading /></AppLayout>
  if (!challenge) return <AppLayout><EmptyState title="Challenge unavailable." description={error || 'You may not be an admin for this challenge.'} action={<Link to="/challenges/mine" className="text-sm font-bold text-brand hover:underline">Back to my challenges</Link>} /></AppLayout>

  return (
    <AppLayout width="wide">
      <PageHeader
        title={challenge.title}
        description={<span className="flex items-center gap-2"><Stamp tone="brand">{challenge.kind}</Stamp><span>{challenge.open ? 'open to everyone' : 'invite-only'} · <code>/{challenge.slug}</code></span></span>}
        actions={<><Link to={`/label?c=${encodeURIComponent(challenge.slug)}`} className="rounded-xl px-3 py-2 text-sm font-bold text-brand hover:bg-surface-hover">Preview labelling</Link><Link to="/challenges/mine" className="rounded-xl px-3 py-2 text-sm font-bold text-ink-secondary hover:bg-surface-hover">My challenges</Link></>}
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <div className="mb-6 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl border-2 border-hairline bg-surface p-3"><p className="truncate font-mono text-[10px] font-bold uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-1 text-xl font-extrabold tabular-nums text-ink">{typeof value === 'number' ? value.toLocaleString() : value}</p></div>)}
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Invite labellers" description="Link, QR, or email. Invites expire after 14 days." />
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => makeInvite('link')}>Copy link</Button>
              <Button disabled={busy} onClick={() => makeInvite('qr')}>Show QR code</Button>
            </div>
            <form onSubmit={sendEmail} className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
              <div className="w-full min-w-0 sm:flex-1">
                <Field label="Invite by email" htmlFor="invite-email" quiet>
                  <Input id="invite-email" type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              </div>
              <Button type="submit" variant="primary" disabled={busy} className="w-full shrink-0 sm:w-auto">{busy ? 'Sending…' : 'Send invite'}</Button>
            </form>
            {emailResult && <p role="status" className="mt-3 break-all text-xs font-semibold text-ink-muted">{emailResult}</p>}
          </Card>
          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Invitations" description="Revoked and expired links stop working." /></div>
            {invites.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-muted">No invitations yet.</p> : (
              <div className="max-w-full min-w-0 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead><tr className="border-y-2 border-hairline text-left text-xs text-ink-muted"><th className="px-4 py-2">Type</th><th className="px-4 py-2">Recipient</th><th className="px-4 py-2">Expires</th><th className="px-4 py-2">Uses</th><th className="px-4 py-2" /></tr></thead>
                  <tbody className="divide-y-2 divide-hairline">
                    {invites.map((invite) => (
                      <tr key={invite.id} className={invite.revoked_at ? 'opacity-50' : undefined}>
                        <td className="px-4 py-2.5 capitalize text-ink-secondary">{invite.channel}</td>
                        <td className="max-w-40 truncate px-4 py-2.5 text-ink-secondary">{invite.email ?? (invite.token ? <a className="text-brand hover:underline" href={`/join/${encodeURIComponent(invite.token)}`}>Open link</a> : '–')}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-muted">{new Date(invite.expires_at).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5 tabular-nums text-ink-secondary">{invite.uses}{invite.max_uses ? ` / ${invite.max_uses}` : ''}</td>
                        <td className="px-4 py-2.5 text-right">{invite.revoked_at ? <span className="text-xs text-ink-muted">revoked</span> : <Button size="sm" variant="danger" disabled={busy} onClick={() => revoke(invite.id)}>Revoke</Button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <ChallengeUpload slug={challenge.slug} kind={challenge.kind} classOptions={challenge.class_options} onDone={load} onError={setError} />
        </div>

        <div className="min-w-0 space-y-6">
          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Genuineness" description="Per-challenge agreement and behaviour signals. Visible only to challenge admins." /></div>
            <GenuinenessChart rows={genuineness} />
          </Card>
          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Members" description={`${members.length.toLocaleString()} people in this challenge.`} /></div>
            {members.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-muted">No members yet.</p> : (
              <div className="max-w-full min-w-0 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead><tr className="border-y-2 border-hairline text-left text-xs text-ink-muted"><th className="px-4 py-2">Labeller</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Joined</th></tr></thead>
                  <tbody className="divide-y-2 divide-hairline">{members.map((member) => <tr key={member.user_id}><td className="px-4 py-2.5"><span className="inline-block max-w-32 truncate align-bottom font-extrabold text-ink">@{member.username}</span>{member.display_name && <span className="ml-2 inline-block max-w-32 truncate align-bottom text-xs text-ink-muted">{member.display_name}</span>}</td><td className="px-4 py-2.5 capitalize text-ink-secondary">{member.role}</td><td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-muted">{new Date(member.joined_at).toLocaleDateString()}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
      {qr && <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" role="presentation" onClick={() => setQr(null)}>
        <div role="dialog" aria-modal="true" aria-label="Challenge QR code" className="w-full max-w-[calc(100vw-2rem)] sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <Card className="min-w-0 text-center">
            <CardHeader title={<span className="break-words">{`Join ${qr.title}`}</span>} description="Scan to open the challenge invitation." action={<Button size="sm" variant="ghost" onClick={() => setQr(null)}>Close</Button>} />
            <div className="mx-auto w-fit max-w-full rounded-xl bg-white p-3 [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <p className="mt-3 break-all text-xs text-ink-muted">{qr.url}</p>
            <Button className="mt-3 w-full" onClick={() => navigator.clipboard?.writeText(qr.url)}>Copy invitation link</Button>
          </Card>
        </div>
      </div>}
    </AppLayout>
  )
}

function GenuinenessChart({ rows }: { rows: Genuineness[] }) {
  if (rows.length === 0) return <p className="px-5 pb-5 text-sm text-ink-muted">No answers yet. The chart declines to speculate.</p>
  return (
    <ol className="min-w-0 space-y-3 px-5 pb-5">
      {rows.map((row) => {
        const color = row.status === 'genuine' ? 'bg-ok' : row.status === 'watch' ? 'bg-brand' : 'bg-danger'
        return (
          <li key={row.user_id} className="grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3rem] items-center gap-2 sm:gap-3">
            <div className="min-w-0"><p className="truncate text-xs font-extrabold text-ink">@{row.username}</p><p className="truncate text-[10px] text-ink-muted">{row.eligible ? row.flags.join(', ') || row.status : `${row.answers} / 10 labels`}</p></div>
            <div className="h-3 overflow-hidden rounded-full bg-surface-muted" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={row.genuineness} aria-label={`${row.username} genuineness`}>
              <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.max(0, Math.min(1, row.genuineness)) * 100}%` }} />
            </div>
            <span className="text-right font-mono text-xs font-bold tabular-nums text-ink-secondary">{Math.round(row.genuineness * 100)}%</span>
            {row.display_name && <p className="col-span-3 -mt-2 truncate text-[10px] text-ink-muted">{row.display_name}</p>}
          </li>
        )
      })}
    </ol>
  )
}

function ChallengeUpload({ slug, kind, classOptions, onDone, onError }: {
  slug: string; kind: 'audio' | 'image'; classOptions: string[]; onDone: () => void; onError: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  const measure = (file: File): Promise<Record<string, number>> => new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    if (kind === 'image') {
      const image = new Image()
      image.onload = () => { resolve({ width: image.naturalWidth, height: image.naturalHeight }); URL.revokeObjectURL(url) }
      image.onerror = () => { resolve({}); URL.revokeObjectURL(url) }
      image.src = url
    } else {
      const audio = new Audio()
      audio.onloadedmetadata = () => { resolve({ duration_s: audio.duration }); URL.revokeObjectURL(url) }
      audio.onerror = () => { resolve({}); URL.revokeObjectURL(url) }
      audio.src = url
    }
  })

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) return onError('Sign in before uploading challenge items.')
    setBusy(true)
    const items: Record<string, unknown>[] = []
    for (const [index, file] of files.entries()) {
      setProgress(`${index + 1} / ${files.length}`)
      const ext = file.name.split('.').pop()?.toLowerCase() || (kind === 'image' ? 'jpg' : 'mp3')
      const path = `hosted/${auth.user.id}/${crypto.randomUUID()}.${ext}`
      const bucket = kind === 'image' ? 'images' : 'clips'
      const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type })
      if (error) {
        setBusy(false)
        setProgress('')
        return onError(`${file.name}: ${error.message}`)
      }
      items.push({ kind, media_path: path, batch: `challenge:${slug}`, class_options: classOptions, source_uid: `challenge:${slug}:${crypto.randomUUID()}`, ...(await measure(file)) })
    }
    const { data, error } = await supabase.rpc('challenge_add_items', { p_slug: slug, p_items: items })
    setBusy(false)
    setProgress('')
    if (error) return onError(friendlyError(error.message))
    if (!data) return onError('No files were added.')
    onDone()
  }

  return (
    <Card>
      <CardHeader title="Add items" description={`Upload ${kind} for this challenge. Class options are fixed to the challenge labels.`} />
      <div className="mb-3 flex flex-wrap gap-2">{classOptions.map((option) => <span key={option} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-bold text-ink-secondary">{option}</span>)}</div>
      <label className={cx('press flex h-11 cursor-pointer items-center justify-center rounded-2xl bg-brand px-5 text-[13px] font-extrabold uppercase tracking-[0.06em] text-white [--edge:var(--brand-dark)]', busy && 'pointer-events-none opacity-50')}>
        {busy ? `Uploading ${progress}` : 'Choose files'}
        <input type="file" multiple accept={kind === 'image' ? 'image/*' : 'audio/*'} onChange={upload} hidden disabled={busy} />
      </label>
    </Card>
  )
}
