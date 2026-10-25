import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Button, cx } from './ui'
import { inviteFor } from '../lib/challenges'

/** The host's ways to bring labellers into a challenge: a link, a code, a ready email, and a QR for the room. */
export default function InvitePanel({ slug, name }: { slug: string; name: string }) {
  const { code, link } = inviteFor(slug)
  const [copied, setCopied] = useState('')
  const [emails, setEmails] = useState('')
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#3b3a4aff', light: '#ffffffff' } }).then(setQr, () => setQr(null))
  }, [link])

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* clipboard blocked: the values are selectable text anyway */
    }
    setCopied(what)
    setTimeout(() => setCopied(''), 1600)
  }

  const body = `I'm hosting "${name}" on Epstein Files and want you labelling in it.\n\nOpen ${link} and enter the code ${code}.\n\nSee you on the waitlist.`
  const mailto = `mailto:?subject=${encodeURIComponent(`You're invited: ${name}`)}&body=${encodeURIComponent(body)}`
  const message = `You're invited: ${name}\n\n${body}`

  const row = 'flex flex-col gap-2 sm:flex-row sm:items-center'
  const emailInput =
    'h-11 w-full rounded-2xl border-2 border-hairline bg-surface px-4 text-[15px] font-semibold text-ink placeholder:font-medium placeholder:text-ink-muted focus:border-brand-border focus:outline-none'

  return (
    <div className="mt-4 space-y-4 rounded-2xl border-2 border-hairline bg-surface-muted p-4">
      <div className={row}>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">1 · Invite link</p>
          <p className="truncate font-mono text-[13px] font-semibold text-ink">{link}</p>
        </div>
        <Button size="sm" variant="primary" onClick={() => copy('link', link)} className="shrink-0">{copied === 'link' ? 'Copied' : 'Copy link'}</Button>
      </div>
      <div className={row}>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">2 · Invite code</p>
          <p className="font-mono text-lg font-bold tracking-[0.12em] text-ink">{code}</p>
        </div>
        <Button size="sm" variant="primary" onClick={() => copy('code', code)} className="shrink-0">{copied === 'code' ? 'Copied' : 'Copy code'}</Button>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">3 · Invite by email</p>
        <div className={row}>
          <input className={emailInput} value={emails} onChange={(e) => setEmails(e.target.value)}
            placeholder="their emails, comma separated" aria-label="Emails to invite" />
          <div className="flex shrink-0 gap-2">
            <a href={mailto} className="inline-flex h-9 items-center rounded-2xl bg-brand px-3.5 text-xs font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_3px_0_var(--brand-dark)]">Open email</a>
            <Button size="sm" onClick={() => copy('msg', message)}>{copied === 'msg' ? 'Copied' : 'Copy message'}</Button>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">Open email starts a ready message in your mail app; if nothing opens, copy the message and paste it anywhere.</p>
      </div>
      <div className={cx(row, 'items-start')}>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">4 · QR code</p>
          <p className="text-xs text-ink-secondary">Put it on a screen and people scan themselves in. Click it to save the image.</p>
          {qr && (
            <a href={qr} download={`invite-${slug}.png`} className="mt-2 inline-flex">
              <img src={qr} alt={`QR code for the ${name} invite link`} width={132} height={132}
                className="rounded-2xl border-2 border-hairline bg-white" />
            </a>
          )}
        </div>
      </div>
      <p className="text-xs text-ink-muted">Anyone with the link, code or QR can join this challenge. Rotate the code from the admin panel if it leaks.</p>
    </div>
  )
}
