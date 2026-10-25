import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppLayout } from '../components/Layouts'
import { Button, ButtonLink, Card, CardHeader, Field, Input, PageHeader, Stamp } from '../components/ui'
import { useAuth } from '../lib/auth'
import { challengeBySlug } from '../lib/challenges'

const INVITE_KEY = 'ef_invites'
const JOINED_KEY = 'ef_joined'

/** Where an invite link lands: confirm the code, then you're in. Signed-out visitors sign up first and come back. */
export default function Join() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase())
  const [error, setError] = useState('')
  const challenge = challengeBySlug(slug ?? null)

  const expected = (JSON.parse(localStorage.getItem(INVITE_KEY) ?? '{}') as Record<string, string>)[slug ?? ''] ?? null

  const join = () => {
    if (!slug) return
    if (expected && code.trim().toUpperCase() !== expected) return setError("That code is not this challenge's code.")
    const joined = JSON.parse(localStorage.getItem(JOINED_KEY) ?? '[]') as string[]
    localStorage.setItem(JOINED_KEY, JSON.stringify([...new Set([...joined, slug])]))
    navigate('/dashboard')
  }

  if (!challenge)
    return (
      <AppLayout>
        <Card><CardHeader title="No such challenge" description="The invite may have expired. Ask your host for a fresh link." /></Card>
      </AppLayout>
    )

  const signedIn = !!session && !!profile?.onboarded
  return (
    <AppLayout>
      <PageHeader title={`Join ${challenge.name}`} description="You were invited. Enter the code from your invite to get in." />
      <Card className="max-w-lg">
        <div className="flex items-center gap-2">
          <Stamp tone={challenge.visibility === 'private' ? 'danger' : 'ok'}>{challenge.visibility}</Stamp>
          <span className="text-sm text-ink-secondary">{challenge.blurb}</span>
        </div>
        <div className="mt-4">
          <Field label="Invite code" hint="Four letters or digits, a dash, four more" htmlFor="join-code">
            <Input id="join-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX"
              className="font-mono tracking-[0.12em]" maxLength={9} />
          </Field>
        </div>
        {error && <p className="mt-3 text-sm font-bold text-danger">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {signedIn ? (
            <Button variant="primary" onClick={join}>Join the challenge</Button>
          ) : (
            <>
              <ButtonLink to={`/signup?next=/join/${slug}`} variant="primary">Sign up to join</ButtonLink>
              <ButtonLink to={`/login?next=/join/${slug}`}>Log in</ButtonLink>
            </>
          )}
        </div>
      </Card>
    </AppLayout>
  )
}
