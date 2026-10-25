export type Challenge = {
  slug: string
  title: string
  kind: 'audio' | 'image'
  blurb: string
  class_options: string[]
  open: boolean
  active: boolean
  items: number
  scored: number
  labellers: number
  joined: boolean
  my_role: string | null
}

export type ManagedChallenge = Challenge & {
  answers: number
  agreement: number | null
  flagged_labellers: number
}

export type ChallengeInvite = {
  id: string
  channel: string
  email: string | null
  token: string
  created_at: string
  expires_at: string
  max_uses: number | null
  uses: number
  revoked_at: string | null
}

export type ChallengeMember = {
  user_id: string
  username: string
  display_name: string | null
  role: string
  via: string
  joined_at: string
}

export type Genuineness = {
  user_id: string
  username: string
  display_name: string | null
  answers: number
  agreement: number
  genuineness: number
  flags: string[]
  status: 'genuine' | 'watch' | 'fake'
  eligible: boolean
}

export const PENDING_INVITE_KEY = 'epstein-files-invite'

export function pendingInvitePath(): string | null {
  try {
    const token = localStorage.getItem(PENDING_INVITE_KEY)
    return token ? `/join/${encodeURIComponent(token)}` : null
  } catch {
    return null
  }
}

export function rememberInvite(token: string) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token)
  } catch {
    /* invite remains available in the URL */
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    /* private mode */
  }
}
