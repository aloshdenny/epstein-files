import { useEffect, useMemo } from 'react'
import { Button, Card, Kbd, Stamp } from './ui'

const COLORS = ['var(--brand)', 'var(--ok)', 'var(--danger)', 'var(--folder-edge)']

/** Confetti-lite: a few squares fall once. CSS only; hidden under reduced motion. */
function Confetti() {
  const bits = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      delay: `${(i % 7) * 0.06}s`,
      fall: `${260 + ((i * 53) % 140)}px`,
      spin: `${((i * 97) % 540) - 270}deg`,
      color: COLORS[i % COLORS.length],
    })),
    [],
  )
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <i key={i} style={{ left: b.left, animationDelay: b.delay, background: b.color, ['--fall' as string]: b.fall, ['--spin' as string]: b.spin }} />
      ))}
    </div>
  )
}

export type Milestone = { kind: 'combo'; combo: number } | { kind: 'goal'; today: number }

/** The interlude between items: "5 in a row!!" or "Labelling complete!". Enter or the button continues. */
export default function Celebration({ milestone, onContinue }: { milestone: Milestone; onContinue: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onContinue()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onContinue])
  const combo = milestone.kind === 'combo'
  return (
    <Card className="cheer-in relative overflow-hidden py-12 text-center">
      {combo && <Confetti />}
      <div className="relative">
        <Stamp tone={combo ? 'brand' : 'ok'}>{combo ? 'streak noted' : 'file closed'}</Stamp>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">{combo ? `${milestone.combo === 5 ? '5' : milestone.combo} in a row!!` : 'Labelling complete!'}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          {combo
            ? 'No skips, no wandering off. The public board notices this sort of thing.'
            : `That's ${milestone.today} today. You can stop here, or keep going. Everything still counts.`}
        </p>
        <Button variant="primary" size="lg" className="mt-6" onClick={onContinue} autoFocus>
          {combo ? 'Keep going' : 'Keep labelling'} <Kbd className="border-white/40 bg-transparent text-white">⏎</Kbd>
        </Button>
      </div>
    </Card>
  )
}
