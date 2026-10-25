import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const arg = (key) => args[args.indexOf(key) + 1]
const slug = arg('--challenge')
const dir = arg('--dir')
if (!slug || !dir) throw new Error('usage: node scripts/upload-challenge-media.mjs --challenge slug --dir path')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(url, key, { auth: { persistSession: false } })
const { data: challenge, error: challengeError } = await admin.from('challenges').select('slug,kind,class_options').eq('slug', slug).single()
if (challengeError) throw challengeError
const directory = resolve(dir)
await mkdir(directory, { recursive: true })
let files = await readdir(directory)
if (!files.some((name) => !name.startsWith('.'))) {
  if (challenge.kind === 'audio') {
    for (let i = 0; i < 12; i++) {
      const rate = 16000, seconds = 3, count = rate * seconds, data = Buffer.alloc(44 + count * 2)
      data.write('RIFF', 0); data.writeUInt32LE(36 + count * 2, 4); data.write('WAVEfmt ', 8)
      data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24)
      data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(count * 2, 40)
      const frequency = 300 + i * 83
      for (let n = 0; n < count; n++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * n / rate) * 7000), 44 + n * 2)
      await writeFile(join(directory, `synthetic-${i}.wav`), data)
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const x = 80 + i * 37, y = 90 + i * 29
      await writeFile(join(directory, `synthetic-${i}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#eee"/><rect x="${x}" y="${y}" width="210" height="130" rx="14" fill="#d22"/><text x="${x + 36}" y="${y + 80}" fill="white" font-size="52">SIGN ${i + 1}</text></svg>`)
    }
  }
  files = await readdir(directory)
}

const mime = (extension) => ({ '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' })[extension] ?? 'application/octet-stream'
const jpegSize = (buffer) => {
  let offset = 2
  while (offset < buffer.length - 9) {
    if (buffer[offset++] !== 0xff) continue
    const marker = buffer[offset++], length = buffer.readUInt16BE(offset)
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) }
    offset += length
  }
  return {}
}
const bucket = challenge.kind === 'audio' ? 'clips' : 'images'
const items = []
for (const name of files.filter((f) => !f.startsWith('.'))) {
  const localPath = join(directory, name), buffer = await readFile(localPath)
  const extension = extname(name).toLowerCase(), path = `${randomUUID()}${extension}`
  const uploaded = await admin.storage.from(bucket).upload(path, buffer, { contentType: mime(extension), upsert: false })
  if (uploaded.error) throw uploaded.error
  const meta = challenge.kind === 'image'
    ? extension === '.jpeg' || extension === '.jpg' ? jpegSize(buffer) : (() => {
      const source = buffer.toString('utf8')
      return { width: Number(source.match(/width="(\d+)/)?.[1]) || undefined, height: Number(source.match(/height="(\d+)/)?.[1]) || undefined }
    })()
    : extension === '.wav' ? { duration_s: buffer.readUInt32LE(40) / buffer.readUInt32LE(28) } : {}
  items.push({ kind: challenge.kind, media_path: path, batch: `challenge:${slug}`, class_options: challenge.class_options, source_uid: `challenge:${slug}:${randomUUID()}`, ...meta })
}
if (!items.length) throw new Error('no media files found')
const added = await admin.rpc('challenge_add_items', { p_slug: slug, p_items: items })
if (added.error) throw added.error
console.log(`${basename(directory)}: uploaded ${items.length} items to ${bucket} for ${slug}`)
