import { createClient } from '@supabase/supabase-js'

/** Supabase is reached only through this site's /sb proxy (vite.config.ts in dev, api/sb.ts on Vercel), which adds
 *  the API key server-side: no project URL or key ships in the bundle. "public" is a placeholder the proxy replaces. */
export const API = `${window.location.origin}/sb`

/** A random id for this browser, not tied to the person. It lets the site tell several accounts made on one device
 *  apart from several people; the /sb proxy scrambles it (with the network) before anything is stored. */
function deviceId(): string | null {
  try {
    let id = localStorage.getItem('epstein-files-device')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('epstein-files-device', id)
    }
    return id
  } catch {
    return null // storage blocked: no device mark, everything else works
  }
}

const device = deviceId()
export const supabase = createClient(API, 'public', device ? { global: { headers: { 'x-ab-device-id': device } } } : undefined)

/** An avatar is an https URL or an object in the public "avatars" bucket. */
export const avatarSrc = (url?: string | null) =>
  !url ? null : url.startsWith('avatars/') ? `${API}/storage/v1/object/public/${url}` : url

/** Keyboard shortcuts for label options, in order. R is replay, U is can't tell, N is not present. */
export const KEYS = '1234567890abcdefghijklmopqstvwxyz'

/** Local calendar day as YYYY-MM-DD (matches contributions() days in the viewer's time zone). */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** Errors people can act on: a server or network failure reads as one, not as "HTTP 503" or "Failed to fetch". */
export function friendlyError(message: string): string {
  if (/^HTTP 5\d\d$|failed to fetch|networkerror|load failed|not configured/i.test(message))
    return "Can't reach the files right now. Try again in a moment."
  return message
}
