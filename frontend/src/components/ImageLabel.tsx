import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Button, Kbd, cx } from './ui'

export type Shape =
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'polygon'; points: [number, number][] }

export type ImageAnswer = { notPresent: true } | { notPresent: false; label: string; shape: Shape }

type Tool = 'lasso' | 'rect'

const clamp = (v: number) => Math.min(1, Math.max(0, v))
const round = (v: number) => Math.round(v * 10000) / 10000

/** Keep a lasso light: drop points closer than ~0.4% of the image to the previous one, cap at 400. */
function simplify(points: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004) out.push(p)
  }
  const step = Math.ceil(out.length / 400)
  return step > 1 ? out.filter((_, i) => i % step === 0) : out
}

function area(s: Shape): number {
  if (s.type === 'rect') return s.w * s.h
  let a = 0
  for (let i = 0, j = s.points.length - 1; i < s.points.length; j = i++) a += (s.points[j][0] + s.points[i][0]) * (s.points[j][1] - s.points[i][1])
  return Math.abs(a / 2)
}

/** Full-bleed image annotator: circle (lasso) or box the thing, pick its class, or say it isn't there.
 *  Shapes are stored normalised to the image (0..1), so the server can rasterise and compare them. Pointer only. */
export default function ImageLabel({
  src,
  options,
  busy,
  onSubmit,
  onSkip,
}: {
  src: string
  options: string[]
  busy: boolean
  onSubmit: (a: ImageAnswer) => void
  onSkip: () => void
}) {
  const [tool, setTool] = useState<Tool>('lasso')
  const [shape, setShape] = useState<Shape | null>(null)
  const [history, setHistory] = useState<(Shape | null)[]>([])
  const [drawing, setDrawing] = useState<[number, number][] | null>(null)
  const [start, setStart] = useState<[number, number] | null>(null)
  const [label, setLabel] = useState<string | null>(options.length === 1 ? options[0] : null)
  const [loaded, setLoaded] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const pos = (e: ReactPointerEvent): [number, number] => {
    const r = box.current!.getBoundingClientRect()
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)]
  }

  const down = (e: ReactPointerEvent) => {
    if (busy || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = pos(e)
    setStart(p)
    setDrawing([p])
  }
  const move = (e: ReactPointerEvent) => {
    if (!drawing) return
    const p = pos(e)
    setDrawing(tool === 'lasso' ? [...drawing, p] : [drawing[0], p])
  }
  const up = () => {
    if (!drawing || !start) return
    let next: Shape | null = null
    if (tool === 'rect') {
      const [a, b] = [start, drawing[drawing.length - 1]]
      next = { type: 'rect', x: round(Math.min(a[0], b[0])), y: round(Math.min(a[1], b[1])), w: round(Math.abs(a[0] - b[0])), h: round(Math.abs(a[1] - b[1])) }
    } else {
      const pts = simplify(drawing).map(([x, y]) => [round(x), round(y)] as [number, number])
      if (pts.length >= 3) next = { type: 'polygon', points: pts }
    }
    setDrawing(null)
    setStart(null)
    if (next && area(next) > 0.0015) {
      setHistory((h) => [...h, shape])
      setShape(next)
    }
  }
  const undo = () => {
    setShape(history[history.length - 1] ?? null)
    setHistory((h) => h.slice(0, -1))
  }

  const ready = !!shape && !!label && !busy
  const submit = () => ready && onSubmit({ notPresent: false, label: label!, shape: shape! })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'l') setTool('lasso')
      else if (k === 'b') setTool('rect')
      else if (k === 'z' || k === 'backspace') undo()
      else if (k === 'n' && !busy) onSubmit({ notPresent: true })
      else if (k === 'enter') submit()
      else if (/^[1-9]$/.test(k) && options[+k - 1]) setLabel(options[+k - 1])
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const live: Shape | null =
    drawing && start
      ? tool === 'rect'
        ? { type: 'rect', x: Math.min(start[0], drawing[drawing.length - 1][0]), y: Math.min(start[1], drawing[drawing.length - 1][1]), w: Math.abs(start[0] - drawing[drawing.length - 1][0]), h: Math.abs(start[1] - drawing[drawing.length - 1][1]) }
        : { type: 'polygon', points: drawing }
      : null

  const draw = (s: Shape, key: string, dashed = false) =>
    s.type === 'rect' ? (
      <rect key={key} x={s.x * 100} y={s.y * 100} width={s.w * 100} height={s.h * 100} className={cx('fill-[color-mix(in_srgb,var(--brand)_22%,transparent)] stroke-brand', dashed && '[stroke-dasharray:1.5_1]')} strokeWidth={0.6} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2.5 }} />
    ) : (
      <polygon key={key} points={s.points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} className={cx('fill-[color-mix(in_srgb,var(--brand)_22%,transparent)] stroke-brand', dashed && '[stroke-dasharray:4_3]')} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2.5 }} strokeLinejoin="round" />
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Drawing tool" className="inline-flex rounded-2xl border-2 border-hairline bg-surface-muted p-1">
          {(['lasso', 'rect'] as Tool[]).map((t) => (
            <button key={t} role="radio" aria-checked={tool === t} onClick={() => setTool(t)}
              className={cx('flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold uppercase tracking-[0.06em] transition-colors', tool === t ? 'bg-surface text-brand' : 'text-ink-muted hover:text-ink')}>
              {t === 'lasso' ? 'Circle' : 'Box'} <Kbd>{t === 'lasso' ? 'L' : 'B'}</Kbd>
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={undo} disabled={history.length === 0 || busy}>Undo <Kbd>Z</Kbd></Button>
        <span className="ml-auto text-xs font-semibold text-ink-muted">{shape ? 'Drawn. Pick what it is.' : 'Draw around the thing.'}</span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border-2 border-hairline bg-surface-muted">
        {!loaded && <div className="aspect-[4/3] w-full animate-pulse bg-surface-muted" />}
        <div ref={box} className={cx('relative touch-none select-none', !loaded && 'hidden', busy ? 'cursor-wait' : 'cursor-crosshair')}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <img src={src} alt="Item to label" draggable={false} onLoad={() => setLoaded(true)} className="block max-h-[62vh] w-full object-contain" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            {shape && draw(shape, 'shape')}
            {live && draw(live, 'live', true)}
          </svg>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => (
          <button key={o} onClick={() => setLabel(o)} aria-pressed={label === o}
            className={cx('press flex h-11 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-extrabold transition-colors',
              label === o ? 'pop border-brand-border bg-brand-soft text-brand [--edge:var(--brand-border)]' : 'border-hairline bg-surface text-ink [--edge:var(--border)] hover:bg-surface-hover')}>
            {i < 9 && <Kbd>{i + 1}</Kbd>}{o}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="lg" onClick={submit} disabled={!ready}>Submit <Kbd className="border-white/40 bg-transparent text-white">⏎</Kbd></Button>
        <Button size="lg" onClick={() => onSubmit({ notPresent: true })} disabled={busy}>Not present <Kbd>N</Kbd></Button>
        <Button size="lg" variant="ghost" onClick={onSkip} disabled={busy} className="ml-auto">Skip</Button>
      </div>
    </div>
  )
}
