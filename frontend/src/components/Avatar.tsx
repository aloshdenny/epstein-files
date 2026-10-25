import { avatarSrc } from '../lib/supabase'
import { cx } from './ui'

const TINTS = ['#7c5cff', '#2fa84f', '#ea8a2f', '#2f8fea', '#d94a9a', '#6f6d82']

/** A picture if there is one, else initials on a tint picked from the username (the same every time). */
export default function Avatar({ name, url, size = 28, className }: { name: string; url?: string | null; size?: number; className?: string }) {
  const src = avatarSrc(url)
  const base = cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', className)
  if (src) return <img className={cx(base, 'object-cover')} src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
  let h = 0
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const initials = name.replace(/^guest_/, '?').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?'
  return (
    <span aria-hidden className={cx(base, 'font-mono font-bold text-white')} style={{ width: size, height: size, background: TINTS[h % TINTS.length], fontSize: Math.max(10, size * 0.38) }}>
      {initials}
    </span>
  )
}
