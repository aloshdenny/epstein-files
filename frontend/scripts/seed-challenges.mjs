import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const authKey = process.env.SUPABASE_ANON_KEY ?? serviceKey
// Mock labellers copied over from ASMRboard (username, real name when given).
const folks = [['adi_dev', 'Adithya Menon'], ['sreeja_v', 'Sreeja Varier'], ['rohithvp', 'Rohith Vijay Prakash'],
  ['alliewoof', 'Alesia Fernandes'], ['ear_of_the_dog', null], ['km_rajeev', 'Rajeev Krishnamoorthy'], ['quietfox', null],
  ['arhan', 'Arhan Qureshi'], ['nightowl_7', 'Sneha Thomas'], ['vak_learns', null], ['pencilcase', 'Ibrahim Kareem'],
  ['bassdrop', null], ['guest_kid', null], ['dr_sonar', null], ['mythili', 'Mythili Nair'], ['swara', null]]
const names = folks.map(([username]) => username)
const realNames = new Map(folks)
const challengeArg = process.argv.indexOf('--challenge')
const requestedChallenge = challengeArg >= 0 ? process.argv[challengeArg + 1] : undefined
const thinkMs = Math.max(0, Number(process.env.SEED_CHALLENGE_THINK_MS ?? 2050))
const allUsers = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users
const users = []

for (const [index, username] of names.entries()) {
  const email = `seed+${username}@example.invalid`
  let user = allUsers.find((u) => u.email === email)
  const password = randomBytes(24).toString('base64url')
  if (!user) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    user = created.data.user
    allUsers.push(user)
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true })
    if (updated.error) throw updated.error
  }
  const profile = await admin.from('profiles').upsert({ id: user.id, username, display_name: realNames.get(username), onboarded: true })
  if (profile.error) throw profile.error
  users.push({ id: user.id, email, password, index })
}

const { data: challenges, error: challengesError } = await admin.from('challenges').select('slug,kind,class_options,open,active')
if (challengesError) throw challengesError
if (requestedChallenge && !challenges.some((challenge) => challenge.slug === requestedChallenge))
  throw new Error(`unknown challenge: ${requestedChallenge}`)
for (const user of users) {
  const client = createClient(url, authKey, { auth: { persistSession: false } })
  const login = await client.auth.signInWithPassword({ email: user.email, password: user.password })
  if (login.error) throw login.error
  for (const challenge of challenges.filter((c) => c.active)) {
    const member = await admin.from('challenge_members').upsert({ challenge: challenge.slug, user_id: user.id, role: 'labeller', via: challenge.open ? 'open' : 'link' }, { onConflict: 'challenge,user_id', ignoreDuplicates: true })
    if (member.error) throw member.error
    if (requestedChallenge && challenge.slug !== requestedChallenge) continue
    for (let label = 0; label < 24; label++) {
      const next = await client.rpc('next_item', { p_challenge: challenge.slug })
      if (next.error) throw next.error
      const item = next.data?.[0]
      if (!item) break
      const options = item.class_options
      const hash = createHash('sha256').update(item.media_path).digest().readUInt32BE(0)
      const truth = hash % options.length
      const behaviour = user.index < 9 ? 'genuine' : user.index < 11 ? 'sloppy' : 'fake'
      if (behaviour !== 'fake' && thinkMs > 0) await new Promise((resolve) => setTimeout(resolve, thinkMs))
      const pick = behaviour === 'genuine'
        ? (label % 10 === 9 ? (truth + 1) % options.length : truth)
        : behaviour === 'sloppy'
          ? (label % 2 ? truth : (truth + 1) % options.length)
          : 0
      const args = item.kind === 'audio'
        ? { p_labels: [options[pick]], p_listen_ms: behaviour === 'fake' ? 1500 : behaviour === 'sloppy' ? 2200 : 4000, p_intensity: item.audio_version === 'beta' ? 50 : null }
        : { p_labels: [options[pick]], p_shape: { type: 'rect', x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }
      const submitted = await client.rpc('submit_item', { p_item: item.item_id, ...args })
      if (submitted.error) console.warn(`${user.email}/${challenge.slug}: ${submitted.error.message}`)
    }
  }
  console.log(`${user.email}: seeded`)
}
console.log(`Seeded ${users.length} labellers across ${challenges.length} challenges; no media uploaded.`)
