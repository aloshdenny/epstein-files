import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import AvatarPicker from '../components/AvatarPicker'
import { AuthLayout } from '../components/Layouts'
import { Alert, Button, Field, Input, Loading, PasswordInput } from '../components/ui'
import { useAuth, type Profile } from '../lib/auth'
import { pendingInvitePath } from '../lib/challenges'
import { friendlyError, supabase } from '../lib/supabase'

const USERNAME = /^[a-z0-9_]{3,20}$/

/** Onboarding, once per account: a public username and an optional picture. */
export default function Welcome() {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <AuthLayout><Loading /></AuthLayout>
  if (!session) return <Navigate to="/signup" replace />
  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from
  const destination = pendingInvitePath() ?? `${from?.pathname ?? '/label'}${from?.search ?? ''}`
  if (profile?.onboarded) return <Navigate to={pendingInvitePath() ?? '/dashboard'} replace />
  return <WelcomeForm key={profile?.id ?? 'new'} uid={session.user.id} profile={profile} invited={!!session.user.invited_at} destination={destination} />
}

function WelcomeForm({ uid, profile, invited, destination }: { uid: string; profile: Profile | null; invited: boolean; destination: string }) {
  const { refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar_url ?? null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const u = username.trim().toLowerCase()
    if (!USERNAME.test(u)) return setError('Usernames are 3 to 20 characters: lowercase letters, digits and _.')
    setBusy(true)
    if (invited && password.trim()) {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setBusy(false)
        return setError(friendlyError(error.message))
      }
    }
    const fields = { username: u, display_name: displayName.trim() || null, avatar_url: avatar, onboarded: true }
    const { error } = profile
      ? await supabase.from('profiles').update(fields).eq('id', uid)
      : await supabase.from('profiles').insert({ id: uid, ...fields })
    setBusy(false)
    if (error) return setError(error.code === '23505' ? 'That username is taken. Try another.' : friendlyError(error.message))
    await refreshProfile()
    navigate(destination, { replace: true })
  }

  return (
    <AuthLayout>
      <h1 className="text-center text-2xl font-extrabold tracking-tight text-ink">Open your file</h1>
      <p className="mt-1.5 text-center text-sm text-ink-muted">Pick the name people will see on the public board.</p>
      <form onSubmit={save} className="mt-6 space-y-4">
        <Field label="Username" htmlFor="username" hint="3 to 20 characters: lowercase letters, digits and _.">
          <Input id="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Display name (optional)" htmlFor="display">
          <Input id="display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
        </Field>
        {invited && <Field label="Password (optional)" htmlFor="password" hint="You can set one now or use email links to sign in."><PasswordInput id="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
        <Field label="Picture (optional)">
          <AvatarPicker uid={uid} name={username || '?'} value={avatar} onChange={setAvatar} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </AuthLayout>
  )
}
