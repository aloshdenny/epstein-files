import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '../components/Layouts'
import { Alert, ButtonLink, Card, Loading, PageHeader, Stamp } from '../components/ui'
import { useAuth } from '../lib/auth'
import { forgetInvite, rememberInvite } from '../lib/challenges'
import { friendlyError, supabase } from '../lib/supabase'

type InviteInfo = {
  slug: string | null
  title: string | null
  kind: string | null
  blurb: string | null
  open: boolean | null
  valid: boolean
  reason: string | null
  inviter: string | null
}

export default function JoinChallenge() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { session, profile, loading } = useAuth()
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [error, setError] = useState('')
  const accepting = useRef(false)

  useEffect(() => {
    rememberInvite(token)
    setInvite(null)
    supabase.rpc('invite_info', { p_token: token }).then(({ data, error }) => {
      if (error) setError(friendlyError(error.message))
      else setInvite((data as InviteInfo[] | null)?.[0] ?? null)
    })
  }, [token, session?.user.id, session?.user.email])

  useEffect(() => {
    if (!session || !profile?.onboarded || !invite?.valid || !invite.slug || accepting.current) return
    accepting.current = true
    supabase.rpc('accept_invite', { p_token: token }).then(({ data, error }) => {
      if (error) {
        accepting.current = false
        setError(friendlyError(error.message))
        return
      }
      forgetInvite()
      navigate(`/label?c=${encodeURIComponent(data as string)}`, { replace: true })
    })
  }, [session, profile, invite, navigate, token])

  if (!loading && session && !profile?.onboarded) return <Navigate to="/welcome" replace />

  const unavailable = invite && !invite.valid
  return (
    <AppLayout width="narrow">
      <PageHeader title="Challenge invitation" description="A link with a finite useful life." />
      {!invite && !error ? <Loading /> : (
        <Card>
          {error ? <Alert>{error}</Alert> : invite?.title ? (
            <>
              <div className="flex flex-wrap items-center gap-2"><Stamp tone="brand">{invite.kind}</Stamp><h2 className="text-lg font-extrabold text-ink">{invite.title}</h2></div>
              {invite.blurb && <p className="mt-3 text-sm text-ink-secondary">{invite.blurb}</p>}
              {invite.inviter && <p className="mt-3 text-xs text-ink-muted">Invited by @{invite.inviter}.</p>}
              {unavailable && session && <Alert><span className="capitalize">{invite.reason ?? 'This invitation is unavailable.'}</span>. Check the account you used to sign in.</Alert>}
              {!session && (
                <div className="mt-5 space-y-3">
                  <p className="text-sm text-ink-secondary">Sign in or create an account to accept. This invitation will still be here.</p>
                  <ButtonLink to="/login" variant="primary" className="w-full">Log in to accept</ButtonLink>
                  <ButtonLink to="/signup" className="w-full">Create an account</ButtonLink>
                </div>
              )}
              {session && profile?.onboarded && invite.valid && <p className="mt-4 text-sm text-ink-muted">Joining…</p>}
            </>
          ) : !error ? <Alert>This invitation could not be found.</Alert> : null}
          {session && unavailable && <Link to="/settings" className="mt-4 inline-block text-sm font-bold text-brand hover:underline">Switch account</Link>}
        </Card>
      )}
    </AppLayout>
  )
}
