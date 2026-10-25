/** Mock hosted challenges. A challenge is a labelling job a host puts up (audio, images or both); labellers join,
 *  and once each labeller has enough scored answers the genuinity panel ranks them. Replace with a challenges table
 *  + RPCs when live; shapes are kept close to what those queries return. */

export type Visibility = 'public' | 'private'
export type ChallengeStatus = 'open' | 'soon' | 'finished'

export type Challenge = {
  slug: string
  name: string
  blurb: string
  kinds: ('audio' | 'image')[]
  visibility: Visibility
  status: ChallengeStatus
  host_username: string
  host_email: string
  labellers: number
  submissions: number
  items: number
  items_scored: number
  agreement: number | null
  ends_at: string | null
}

/** The owner of this deployment. Hosts are matched by email first, then username, then the admin flag. */
export const OWNER_EMAIL = 'aloshdenny@gmail.com'
export const CHALLENGES: Challenge[] = [
  {
    slug: 'epstein-files', name: 'The Epstein Files',
    blurb: 'Sort the released files. Tag what you hear, circle what you see, climb the waitlist. Top ten make the island.',
    kinds: ['audio', 'image'], visibility: 'public', status: 'open',
    host_username: 'alosh', host_email: OWNER_EMAIL,
    labellers: 17, submissions: 3269, items: 554, items_scored: 380, agreement: 0.71,
    ends_at: '2026-11-15',
  },
  {
    slug: 'noisy-kitchens', name: 'Noisy Kitchens',
    blurb: 'Six-second clips from busy restaurant kitchens. Name every sound: pans, ticket printers, the pass, the dish pit.',
    kinds: ['audio'], visibility: 'public', status: 'open',
    host_username: 'adi_dev', host_email: 'adithya@linehear.dev',
    labellers: 11, submissions: 842, items: 210, items_scored: 96, agreement: 0.64,
    ends_at: '2026-11-30',
  },
  {
    slug: 'street-signs-kl', name: 'Street Signs: Kochi',
    blurb: 'Circle every street name on photos from Fort Kochi to Edappally. Boxes or freehand, the crowd checks you.',
    kinds: ['image'], visibility: 'public', status: 'open',
    host_username: 'sreeja_v', host_email: 'sreeja@mapworks.in',
    labellers: 9, submissions: 1287, items: 340, items_scored: 151, agreement: 0.77,
    ends_at: '2026-12-05',
  },
  {
    slug: 'cat-or-loaf', name: 'Cat or Loaf',
    blurb: 'The classic. Circle the cat, or the loaf, or the cat that is a loaf. Finished with 4,002 labels.',
    kinds: ['image'], visibility: 'public', status: 'finished',
    host_username: 'alliewoof', host_email: 'alesia@woof.studio',
    labellers: 23, submissions: 4002, items: 500, items_scored: 500, agreement: 0.93,
    ends_at: null,
  },
  {
    slug: 'fossasia-votes', name: 'FOSSASIA Talk Votes',
    blurb: 'Private: the review panel scores proposal clips ahead of the summit. Only the host and panel can see names.',
    kinds: ['audio'], visibility: 'private', status: 'open',
    host_username: 'alosh', host_email: OWNER_EMAIL,
    labellers: 6, submissions: 214, items: 60, items_scored: 41, agreement: 0.69,
    ends_at: '2026-11-08',
  },
]

export const challengeBySlug = (slug: string | null) => allChallenges().find((c) => c.slug === slug)

/** Does this signed-in account host this challenge? Email match, username match, or the admin flag. */
export function isHost(c: Challenge, email: string | null | undefined, username: string | undefined, isAdmin = false) {
  return isAdmin || (email != null && email.toLowerCase() === c.host_email.toLowerCase()) || username === c.host_username
}

export const hostedBy = (email: string | null | undefined, username: string | undefined, isAdmin = false) =>
  allChallenges().filter((c) => isHost(c, email, username, isAdmin))

export const publicChallenges = () => allChallenges().filter((c) => c.visibility === 'public')

// ---- user-hosted challenges (localStorage until the challenges table lands) ----

const LS_KEY = 'ef_hosted_challenges'

export function loadUserChallenges(): Challenge[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
    return Array.isArray(raw) ? (raw as Challenge[]) : []
  } catch {
    return []
  }
}

export function saveUserChallenge(c: Challenge) {
  localStorage.setItem(LS_KEY, JSON.stringify([...loadUserChallenges(), c]))
}

export const allChallenges = () => [...CHALLENGES, ...loadUserChallenges()]
