import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { hostedBy } from '../lib/challenges'
import { useProgress } from '../lib/progress'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'
import { ButtonLink, Folder, Icon, ThemeToggle, cx } from './ui'

/** Always the landing page; on the landing page itself a click does nothing. */
export function Brand({ className, large = false }: { className?: string; large?: boolean }) {
  const { pathname } = useLocation()
  return (
    <Link
      to="/"
      onClick={(e) => pathname === '/' && e.preventDefault()}
      aria-label="epstein files"
      className={cx('inline-flex items-center gap-2 font-mono font-bold tracking-tight text-ink', large ? 'text-2xl' : 'text-lg', className)}
    >
      <Folder size={large ? 40 : 28} stamped />
      <span className={cx(large ? '' : 'max-sm:hidden')}>epstein files</span>
    </Link>
  )
}

/** Today's progress toward the daily goal, the streak and the waitlist position. Quiet: no flames, no nagging. */
export function DailyBar({ className }: { className?: string }) {
  const { progress } = useProgress()
  if (!progress) return null
  const goal = progress.daily_goal || 20
  const done = Math.min(progress.today, goal)
  return (
    <Link to="/dashboard" className={cx('flex min-w-0 items-center gap-3 rounded-2xl px-2 py-1 transition-colors hover:bg-surface-hover', className)} title="Today's labels">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-ink-muted">
          <span className="tabular-nums"><span className="text-ink">{progress.today}</span>/{goal} today</span>
          {progress.streak > 0 && <span className="tabular-nums">Day {progress.streak}</span>}
        </div>
        <div className="h-2.5 w-28 overflow-hidden rounded-full bg-surface-muted sm:w-36" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={done} aria-label="Daily goal">
          <div className={cx('h-full rounded-full transition-[width] duration-300', progress.today >= goal ? 'bg-ok' : 'bg-brand')} style={{ width: `${(done / goal) * 100}%` }} />
        </div>
      </div>
      {progress.rank != null && <span className="hidden font-mono text-xs font-bold text-ink-secondary sm:inline">#{progress.rank.toLocaleString()}</span>}
    </Link>
  )
}

function AccountMenu() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])
  if (!profile) return null
  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-bold text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink'
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2 rounded-2xl py-1 pl-1 pr-2 transition-colors hover:bg-surface-hover">
        <Avatar name={profile.username} url={profile.avatar_url} size={34} />
        <span className="hidden text-sm font-extrabold text-ink md:inline">{profile.username}</span>
        <Icon className="h-3.5 w-3.5 text-ink-muted"><path d="m6 9 6 6 6-6" /></Icon>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border-2 border-hairline bg-surface-raised p-1.5">
          <div className="px-3 pb-1.5 pt-1 text-xs font-semibold text-ink-muted">Signed in as <span className="font-medium text-ink">@{profile.username}</span></div>
          <Link role="menuitem" to="/dashboard" className={item}><Icon><path d="M3 13h4v7H3zM10 8h4v12h-4zM17 4h4v16h-4z" /></Icon>Dashboard</Link>
          <Link role="menuitem" to="/label" className={item}><Icon><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>Label</Link>
          <Link role="menuitem" to="/host" className={item}><Icon><path d="M12 5v14M5 12h14" /></Icon>Host a challenge</Link>
          <Link role="menuitem" to={`/u/${profile.username}`} className={item}><Icon><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>Your file</Link>
          <Link role="menuitem" to="/settings" className={item}><Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Icon>Settings</Link>
          {profile.is_admin && <Link role="menuitem" to="/admin" className={item}><Icon><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></Icon>Admin</Link>}
          {hostedBy(session?.user?.email, profile.username, profile.is_admin).length > 0 && <Link role="menuitem" to="/genuinity" className={item}><Icon><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></Icon>Genuinity</Link>}
          <div className="my-1 h-0.5 bg-hairline" />
          <button role="menuitem" className={item} onClick={async () => { navigate('/'); await supabase.auth.signOut() }}>
            <Icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></Icon>Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function TopBar() {
  const { session, profile, loading } = useAuth()
  return (
    <header className="sticky top-0 z-10 border-b-2 border-hairline bg-surface">
      <div className="mx-auto flex h-[var(--topbar-height)] max-w-5xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Brand />
        <Link to="/leaderboard" className="ml-1 rounded-xl px-2.5 py-1.5 text-sm font-bold text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink">Waitlist</Link>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {profile?.onboarded && <DailyBar />}
          <ThemeToggle />
          {loading ? null : session && profile ? (
            <AccountMenu />
          ) : session ? (
            <ButtonLink to="/welcome" size="sm" variant="primary">Finish signing up</ButtonLink>
          ) : (
            <>
              <ButtonLink to="/login" size="sm" variant="ghost">Log in</ButtonLink>
              <ButtonLink to="/signup" size="sm" variant="primary">Sign up</ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
