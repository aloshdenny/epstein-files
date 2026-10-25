/** Mock genuinity data, shaped exactly like what private.labeller_quality will return once every labeller passes
 *  MIN_SCORED. Real names exist only for the private view; public projects must never see them. Folks are copied
 *  over from ASMRboard. Swap this module for `supabase.rpc('admin_labeller_quality')` when the project is live. */

export const MIN_SCORED = 15

export type GenuineRow = {
  username: string
  real_name: string | null
  scored: number
  follow: number | null // 0..1: do the answers depend on the item, or would they fit any item
  agreement: number | null
  status: 'ok' | 'watch' | 'weak' | 'too early'
  flags: string[]
}

export const GENUINITY: GenuineRow[] = [  { username: 'adi_dev', real_name: 'Adithya Menon', scored: 412, follow: 0.61, agreement: 0.88, status: 'ok', flags: [] },
  { username: 'sreeja_v', real_name: 'Sreeja Varier', scored: 388, follow: 0.57, agreement: 0.85, status: 'ok', flags: [] },
  { username: 'rohithvp', real_name: 'Rohith Vijay Prakash', scored: 341, follow: 0.52, agreement: 0.81, status: 'ok', flags: [] },
  { username: 'alliewoof', real_name: 'Alesia Fernandes', scored: 297, follow: 0.49, agreement: 0.78, status: 'ok', flags: [] },
  { username: 'ear_of_the_dog', real_name: null, scored: 263, follow: 0.44, agreement: 0.74, status: 'ok', flags: [] },
  { username: 'km_rajeev', real_name: 'Rajeev Krishnamoorthy', scored: 231, follow: 0.38, agreement: 0.69, status: 'ok', flags: [] },
  { username: 'quietfox', real_name: null, scored: 204, follow: 0.31, agreement: 0.61, status: 'ok', flags: [] },
  { username: 'arhan', real_name: 'Arhan Qureshi', scored: 187, follow: 0.24, agreement: 0.55, status: 'watch', flags: ['answers barely follow the audio'] },
  { username: 'nightowl_7', real_name: 'Sneha Thomas', scored: 156, follow: 0.19, agreement: 0.47, status: 'watch', flags: ['rushing', 'answers barely follow the audio'] },
  { username: 'alosh', real_name: 'Alosh Denny', scored: 149, follow: 0.34, agreement: 0.66, status: 'ok', flags: [] },
  { username: 'vak_learns', real_name: null, scored: 121, follow: 0.14, agreement: 0.38, status: 'watch', flags: ['same label every time'] },
  { username: 'pencilcase', real_name: 'Ibrahim Kareem', scored: 98, follow: 0.11, agreement: 0.33, status: 'watch', flags: ['not listening'] },
  { username: 'bassdrop', real_name: null, scored: 76, follow: 0.07, agreement: 0.27, status: 'weak', flags: ['answers do not follow the audio', 'inconsistent on repeats'] },
  { username: 'guest_kid', real_name: null, scored: 51, follow: 0.04, agreement: 0.19, status: 'weak', flags: ['robotic timing', 'answers do not follow the audio'] },
  { username: 'dr_sonar', real_name: null, scored: 44, follow: 0.02, agreement: 0.14, status: 'weak', flags: ['rushing', 'not listening', 'answers do not follow the audio'] },
  { username: 'mythili', real_name: 'Mythili Nair', scored: 11, follow: null, agreement: null, status: 'too early', flags: [] },
  { username: 'swara', real_name: null, scored: 6, follow: null, agreement: null, status: 'too early', flags: [] },
]

/** Per-challenge rows: the same cohort with different coverage and outcomes per challenge (deterministic, so the
 *  chart is stable between loads). The Epstein Files uses the hand-written table above. */
const hash = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

export function genuinityFor(slug: string): GenuineRow[] {
  if (slug === 'epstein-files') return GENUINITY
  const h = hash(slug)
  return GENUINITY.filter((_, i) => ((h >> (i % 16)) & 3) !== 0).map((r, i) => {
    if (r.scored < MIN_SCORED) return r
    const jitter = 0.7 + ((h >> (i % 12)) & 7) / 20 // 0.7 .. 1.05
    const follow = r.follow == null ? null : Math.min(0.95, Math.max(0.02, r.follow * jitter))
    const scored = Math.max(MIN_SCORED, Math.round(r.scored * (0.35 + ((h >> (i % 10)) & 7) / 12)))
    const status: GenuineRow['status'] = follow == null ? 'too early' : follow >= 0.15 ? (r.status === 'weak' ? 'watch' : 'ok') : follow >= 0.07 ? 'watch' : 'weak'
    return { ...r, follow, scored, status, agreement: r.agreement == null ? null : Math.min(0.97, r.agreement * jitter) }
  })
}
