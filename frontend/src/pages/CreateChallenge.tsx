import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/Layouts'
import { Alert, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { friendlyError, supabase } from '../lib/supabase'

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

export default function CreateChallenge() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [customSlug, setCustomSlug] = useState(false)
  const [kind, setKind] = useState<'audio' | 'image'>('audio')
  const [blurb, setBlurb] = useState('')
  const [classes, setClasses] = useState('')
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const options = classes.split(',').map((value) => value.trim()).filter(Boolean)
    if (!slug) return setError('Add a short URL slug.')
    if (!title.trim()) return setError('Give the challenge a title.')
    if (options.length < 1 || options.length > 48) return setError('List between 1 and 48 class options.')
    setBusy(true)
    const { data, error } = await supabase.rpc('create_challenge', {
      p_slug: slugify(slug), p_title: title.trim(), p_kind: kind, p_blurb: blurb.trim(), p_class_options: options, p_open: open,
    })
    setBusy(false)
    if (error) return setError(friendlyError(error.message))
    navigate(`/c/${data}/manage`, { replace: true })
  }

  return (
    <AppLayout width="narrow">
      <PageHeader title="Host a challenge" description="A title, a queue, and a decision about who gets in." />
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title" htmlFor="challenge-title"><Input id="challenge-title" required maxLength={100} value={title} onChange={(e) => { setTitle(e.target.value); if (!customSlug) setSlug(slugify(e.target.value)) }} /></Field>
          <Field label="URL slug" htmlFor="challenge-slug" hint="Lowercase letters, numbers and hyphens; 3–40 characters.">
            <Input id="challenge-slug" required maxLength={40} pattern="[a-z0-9][a-z0-9-]{2,39}" value={slug} onChange={(e) => { setCustomSlug(true); setSlug(slugify(e.target.value)) }} />
          </Field>
          <Field label="Media type" htmlFor="challenge-kind">
            <select id="challenge-kind" value={kind} onChange={(e) => setKind(e.target.value as 'audio' | 'image')} className="h-12 w-full rounded-2xl border-2 border-hairline bg-surface-muted px-4 text-sm font-semibold text-ink">
              <option value="audio">Audio</option><option value="image">Image</option>
            </select>
          </Field>
          <Field label="Description" htmlFor="challenge-blurb" hint="Optional, up to 500 characters.">
            <textarea id="challenge-blurb" maxLength={500} rows={3} value={blurb} onChange={(e) => setBlurb(e.target.value)} className="w-full rounded-2xl border-2 border-hairline bg-surface-muted px-4 py-3 text-sm font-semibold text-ink focus:border-brand-border focus:bg-surface focus:outline-none" />
          </Field>
          <Field label="Class options" htmlFor="challenge-classes" hint="Comma-separated. Use the exact labels you want people to choose.">
            <Input id="challenge-classes" required placeholder="speech, music, silence" value={classes} onChange={(e) => setClasses(e.target.value)} />
          </Field>
          <label className="flex items-start gap-3 rounded-2xl border-2 border-hairline p-3 text-sm">
            <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="mt-1 accent-[var(--brand)]" />
            <span><span className="font-extrabold text-ink">Open challenge</span><span className="mt-0.5 block text-ink-muted">Anyone can join. Turn this off for invite-only labelling.</span></span>
          </label>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Create challenge'}</Button>
        </form>
      </Card>
    </AppLayout>
  )
}
