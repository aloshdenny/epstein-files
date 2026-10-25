import { useState } from 'react'
import { Button, cx } from './ui'
import { inviteFor } from '../lib/challenges'

/** The host's three ways to bring labellers into a challenge: a link, a code, or a ready email. */
export default function InvitePanel({ slug, name }: { slug: string; name: string }) {
  const { code, link } = inviteFor(slug)
  const [copied, setCopied] = useState('')
  const [emails, setEmails] = useState('')

  const copy = async (what: 'link' | 'code', value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* clipboard blocked: the fields are selectable anyway */
    }
    setCopied(what)
    setTimeout(() => setCopied(''), 1600)
  }

  const subject = `You're invited: ${name}`
  const body = `I'm hosting "${name}" on Epstein Files and want you labelling in it.\n\nOpen ${link} and enter the code ${code}.\n\nSee you on the waitlist.`
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  const row = 'flex flex-col gap-2 sm:flex-row sm:items-center'
  const readonly = 'h-11 w-full rounded-2xl border-2 border-hairline bg-surface-muted px-4 font-mono text-[13px] font-semibold text-ink'

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
      <div className={row}>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">3 · Invite by email</p>
          <input className={cx(readonly, 'placeholder:font-medium placeholder:text-ink-muted')} value={emails}
            onChange={(e) => setEmails(e.target.value)} placeholder="their emails, comma separated" aria-label="Emails to invite" />
        </div>
        <Button size="sm" variant="primary" className="shrink-0" onClick={() => { window.location.href = mailto }}>Send email</Button>
      </div>
      <p className="text-xs text-ink-muted">Anyone with the link or code can join this challenge. Rotate the code from the admin panel if it leaks.</p>
    </div>
  )
}
