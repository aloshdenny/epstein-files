// Local demo data: synthetic audio and images, an admin, and a handful of bot labellers whose answers give the
// waitlist, island and admin pages something to show. Local Supabase only:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-local.mjs
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) throw new Error('set SUPABASE_SERVICE_ROLE_KEY (supabase status -o env)')
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error('seed-local only runs against a local Supabase')
const admin = createClient(url, key, { auth: { persistSession: false } })

const SOUNDS = ['tone', 'noise', 'sweep', 'clicks']
const SHAPES = ['circle', 'square', 'triangle']
const PASSWORD = 'labeller-demo-1'

function wav(kind, seconds = 2.5, rate = 16000) {
  const n = Math.round(seconds * rate)
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  const f0 = 220 + Math.random() * 440
  for (let i = 0; i < n; i++) {
    const t = i / rate
    let v = 0
    if (kind === 'tone') v = Math.sin(2 * Math.PI * f0 * t)
    else if (kind === 'noise') v = Math.random() * 2 - 1
    else if (kind === 'sweep') v = Math.sin(2 * Math.PI * (200 * t + 600 * t * t))
    else v = i % Math.round(rate / 6) < 60 ? 1 : 0
    buf.writeInt16LE(Math.round(v * 0.3 * 32767), 44 + i * 2)
  }
  return buf
}

function svg(shape) {
  const W = 800, H = 600
  const s = 120 + Math.random() * 120
  const x = 40 + Math.random() * (W - s - 80), y = 40 + Math.random() * (H - s - 80)
  const hue = Math.floor(Math.random() * 360)
  const fill = `hsl(${hue} 70% 55%)`
  const body =
    shape === 'circle' ? `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2}" fill="${fill}"/>`
      : shape === 'square' ? `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${fill}"/>`
        : `<polygon points="${x + s / 2},${y} ${x + s},${y + s} ${x},${y + s}" fill="${fill}"/>`
  const clutter = Array.from({ length: 14 }, () => `<rect x="${Math.random() * W}" y="${Math.random() * H}" width="${8 + Math.random() * 20}" height="${4 + Math.random() * 10}" fill="hsl(${hue} 15% ${60 + Math.random() * 25}%)"/>`).join('')
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f4efe2"/>${clutter}${body}</svg>`
  return { doc, rect: { type: 'rect', x: x / W, y: y / H, w: s / W, h: s / H }, W, H }
}

async function user(email, username, isAdmin = false) {
  let { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error && !/already/i.test(error.message)) throw error
  if (!data?.user) {
    const list = await admin.auth.admin.listUsers({ perPage: 1000 })
    data = { user: list.data.users.find((u) => u.email === email) }
  }
  const id = data.user.id
  const { error: e2 } = await admin.from('profiles').upsert({ id, username, onboarded: true })
  if (e2) throw e2
  if (isAdmin) await admin.rpc('admin_set_admin', { p_username: username, p_admin: true })
  return id
}

const truth = new Map()
const items = []
for (let i = 0; i < 24; i++) {
  const label = SOUNDS[i % SOUNDS.length]
  const path = `${randomUUID()}.wav`
  const { error } = await admin.storage.from('clips').upload(path, wav(label), { contentType: 'audio/wav' })
  if (error) throw error
  truth.set(path, { label })
  items.push({ kind: 'audio', media_path: path, batch: 'demo-sounds', class_options: SOUNDS, duration_s: 2.5, target_votes: 6, source_uid: `demo:${path}` })
}
for (let i = 0; i < 24; i++) {
  const label = SHAPES[i % SHAPES.length]
  const { doc, rect, W, H } = svg(label)
  const path = `${randomUUID()}.svg`
  const { error } = await admin.storage.from('images').upload(path, Buffer.from(doc), { contentType: 'image/svg+xml' })
  if (error) throw error
  truth.set(path, { label, rect })
  items.push({ kind: 'image', media_path: path, batch: 'demo-shapes', class_options: SHAPES, width: W, height: H, target_votes: 6, source_uid: `demo:${path}` })
}
const { data: added, error: addErr } = await admin.rpc('admin_add_items', { p_items: items })
if (addErr) throw addErr
console.log(`items added: ${added}`)

await user('admin@example.com', 'admin', true)
const bots = ['bart', 'lisa', 'milhouse', 'nelson', 'ralph', 'martin', 'sherri', 'terri', 'otto', 'apu', 'moe', 'barney']
for (const [n, name] of bots.entries()) {
  await user(`${name}@example.com`, name)
  const c = createClient(url, process.env.SUPABASE_ANON_KEY ?? key, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: `${name}@example.com`, password: PASSWORD })
  if (error) throw error
  const care = name === 'ralph' ? 0.3 : 0.75 + (n % 4) * 0.06
  const count = 10 + ((n * 7) % 26)
  for (let k = 0; k < count; k++) {
    const { data, error: e1 } = await c.rpc('next_item')
    if (e1) throw e1
    const it = data?.[0]
    if (!it) break
    const t = truth.get(it.media_path)
    const right = Math.random() < care
    const pick = right ? t.label : it.class_options[Math.floor(Math.random() * it.class_options.length)]
    const j = () => (Math.random() - 0.5) * 0.04
    const args = it.kind === 'audio'
      ? { p_labels: [pick], p_listen_ms: 2500, p_intensity: it.audio_version === 'beta' ? 60 : null }
      : { p_labels: [pick], p_shape: right ? { ...t.rect, x: Math.max(0, t.rect.x + j()), y: Math.max(0, t.rect.y + j()) } : { type: 'rect', x: Math.random() * 0.5, y: Math.random() * 0.5, w: 0.25, h: 0.25 } }
    const { error: e2 } = await c.rpc('submit_item', { p_item: it.item_id, ...args })
    if (e2) console.warn(name, e2.message)
  }
  console.log(`${name}: labelled`)
}
const { error: refreshErr } = await admin.rpc('admin_refresh')
if (refreshErr) throw refreshErr
console.log('done. admin@example.com /', PASSWORD)
