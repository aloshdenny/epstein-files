import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/Layouts'
import { Button, Card, CardHeader, Field, Input, PageHeader, Stamp, cx } from '../components/ui'
import { useAuth } from '../lib/auth'
import { saveUserChallenge, type Challenge } from '../lib/challenges'

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'challenge'

const TEXTAREA =
  'w-full rounded-2xl border-2 border-hairline bg-surface-muted px-4 py-3 text-[15px] font-semibold text-ink ' +
  'placeholder:font-medium placeholder:text-ink-muted transition-colors focus:border-brand-border focus:bg-surface focus:outline-none'

/** Three steps: what it is, who can join, launch. */
const STEP_LABELS = ['The challenge', 'Who can join', 'Launch']

export default function Host() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [blurb, setBlurb] = useState('')
  const [kinds, setKinds] = useState<('audio' | 'image')[]>([])
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [ends, setEnds] = useState('')

  const stepOk = [name.trim().length >= 3 && blurb.trim().length >= 10 && kinds.length > 0, true, true][step]

  const launch = () => {
    const c: Challenge = {
      slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      blurb: blurb.trim(),
      kinds: [...kinds],
      visibility,
      status: 'open',
      host_username: profile?.username ?? 'you',
      host_email: session?.user?.email ?? '',
      labellers: 0, submissions: 0, items: 0, items_scored: 0, agreement: null,
      ends_at: ends || null,
    }
    saveUserChallenge(c)
    navigate('/dashboard')
  }

  return (
    <AppLayout>
      <PageHeader title="Host a challenge" description="Put up a labelling job, open it to the crowd or keep it private, and watch the genuinity panel fill in." />
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Steps">
        {STEP_LABELS.map((l, i) => (
          <li key={l} className={cx('flex items-center gap-2 rounded-full border-2 px-3 py-1.5 font-mono text-xs font-bold',
            i === step ? 'border-brand-border bg-brand-soft text-brand' : i < step ? 'border-hairline text-ink-secondary' : 'border-hairline text-ink-muted')}>
            <span>{i < step ? 'done' : `0${i + 1}`}</span> {l}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader title="What is it?" description="Labellers see this on the challenge directory." />
          <div className="mt-4 space-y-4">
            <Field label="Challenge name" hint="3 to 40 characters" htmlFor="hc-name">
              <Input id="hc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Birdsong of Kerala" />
            </Field>
            <Field label="One-line pitch" hint="What labellers do, in a sentence" htmlFor="hc-blurb">
              <textarea id="hc-blurb" className={TEXTAREA} rows={3} value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={220}
                placeholder="Hear a dawn-chorus clip, name every bird you can pick out." />
            </Field>
            <Field label="Media" hint="Audio clips, images, or both">
              <div className="flex gap-2">
                {(['audio', 'image'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))}
                    aria-pressed={kinds.includes(k)}
                    className={cx('h-11 rounded-2xl border-2 px-5 text-xs font-extrabold uppercase tracking-[0.06em]',
                      kinds.includes(k) ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-brand' : 'border-hairline bg-surface-muted text-ink-secondary hover:text-ink')}>
                    {k}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader title="Who can join?" description="You can change this later from the challenge card." />
          <div className="mt-4 space-y-3">
            {([['public', 'Public', 'Listed on the homepage. Anyone can join and label. The genuinity panel shows usernames only.'],
               ['private', 'Private', 'Not listed. Only people you invite see it. Your genuinity panel also shows real names, when given.']] as const).map(([v, title, text]) => (
              <button key={v} type="button" onClick={() => setVisibility(v)} aria-pressed={visibility === v}
                className={cx('w-full rounded-2xl border-2 p-4 text-left transition-colors',
                  visibility === v ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-hairline bg-surface-muted hover:border-hairline-strong')}>
                <span className="flex items-center gap-2">
                  <span className={cx('inline-block h-4 w-4 rounded-full border-2', visibility === v ? 'border-[var(--brand)] bg-[var(--brand)]' : 'border-hairline-strong')} aria-hidden />
                  <span className="text-sm font-extrabold text-ink">{title}</span>
                  <Stamp tone={v === 'public' ? 'ok' : 'danger'}>{v}</Stamp>
                </span>
                <span className="mt-1 block pl-6 text-sm text-ink-secondary">{text}</span>
              </button>
            ))}
            <Field label="Closes on" hint="Optional. Blank means it stays open." htmlFor="hc-ends" quiet>
              <Input id="hc-ends" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} className="sm:max-w-56" />
            </Field>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader title="Ready to launch?" description="Last look before it goes up." />
          <dl className="mt-4 space-y-2.5 text-sm">
            {([['Name', name], ['Pitch', blurb], ['Media', kinds.join(' + ')], ['Visibility', visibility], ['Closes', ends || 'no end date']] as const).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7rem_1fr] gap-2">
                <dt className="font-bold text-ink-muted">{k}</dt>
                <dd className="font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-secondary">Upload items from the admin panel once it's live. Labellers get ranked on your genuinity panel as their scored labels come in.</p>
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? navigate('/dashboard') : setStep(step - 1))}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < 2 ? (
          <Button variant="primary" disabled={!stepOk} onClick={() => setStep(step + 1)}>Continue</Button>
        ) : (
          <Button variant="primary" onClick={launch}>Launch challenge</Button>
        )}
      </div>
    </AppLayout>
  )
}
