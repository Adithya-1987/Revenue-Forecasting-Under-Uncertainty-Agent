import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { money } from '../lib'

export type Horizon = 30 | 60 | 90
export const HORIZONS: Horizon[] = [30, 60, 90]

/** An illustrative pipeline per horizon (P10 / P50 / P90 of simulated bookings). Longer horizons are less certain, so wider. */
const SAMPLE: Record<Horizon, { p10: number; p50: number; p90: number }> = {
  30: { p10: 1_520_000, p50: 1_920_000, p90: 2_380_000 },
  60: { p10: 2_780_000, p50: 3_720_000, p90: 4_890_000 },
  90: { p10: 3_820_000, p50: 5_440_000, p90: 7_510_000 },
}

/** What a blank field becomes: 10% above the expected outcome. */
export const suggestedTarget = (h: Horizon) => Math.round((SAMPLE[h].p50 * 1.1) / 10_000) * 10_000

const BARS = 36
// the scale runs from LO to HI times the median: wide enough for the 90-day spread
const LO = 0.42
const HI = 1.9
const VW = 360
const GAP = 2.2

// marker, chance and scale chase their values on one spring; retargeting mid-flight keeps velocity
const SPRING = { type: 'spring', duration: 0.5, bounce: 0.15 } as const
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)' // the codebase's ease-out
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'
const RISE_MS = 620
const STAGGER_MS = 14

const sdOf = (h: Horizon) => (Math.log(SAMPLE[h].p90) - Math.log(SAMPLE[h].p10)) / (2 * 1.2816)

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, error under 1.5e-7). */
function cdf(z: number) {
  const x = Math.abs(z) / Math.SQRT2
  const k = 1 / (1 + 0.3275911 * x)
  const e = 1 - ((((1.061405429 * k - 1.453152027) * k + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-x * x)
  return z >= 0 ? (1 + e) / 2 : (1 - e) / 2
}

/** Share of simulated futures at or above `t`. */
const chanceOf = (t: number, median: number, sd: number) => (t <= 0 ? 1 : 1 - cdf(Math.log(t / median) / sd))

/** Bar heights (0..1): the lognormal density over the fixed relative scale. */
function shape(h: Horizon) {
  const sd = sdOf(h)
  const d = Array.from({ length: BARS }, (_, i) => {
    const r = LO + ((i + 0.5) / BARS) * (HI - LO)
    return Math.exp(-(Math.log(r) ** 2) / (2 * sd * sd)) / r
  })
  const max = Math.max(...d)
  return d.map((v) => v / max)
}

/** A number that springs to `to`, re-rendering on every frame it moves. */
function useSpringTo(to: number, reduce: boolean) {
  const mv = useMotionValue(to)
  const [v, setV] = useState(to)
  useMotionValueEvent(mv, 'change', setV)
  useEffect(() => {
    if (reduce) {
      mv.jump(to)
      setV(to)
      return
    }
    const run = animate(mv, to, SPRING)
    return () => run.stop()
  }, [to, reduce, mv])
  return v
}

function verdict(c: number) {
  if (c >= 0.9) return { text: 'Below almost every future. Safe, maybe too safe.', tone: 'text-gain' }
  if (c >= 0.5) return { text: 'More likely than not. A healthy target.', tone: 'text-gain' }
  if (c >= 0.1) return { text: 'Inside the range, but a stretch.', tone: 'text-target' }
  return { text: 'Above nearly every future. Needs new deals.', tone: 'text-loss' }
}

interface Props {
  horizon: Horizon
  /** The typed target; 0 while the field is blank. */
  typed: number
  onHorizon: (h: Horizon) => void
  /** Shorter chart, for the preview that sits inside the form on smaller screens. */
  compact?: boolean
}

/**
 * Live preview of a target against ten thousand simulated futures. Every keystroke springs the marker
 * across the histogram; the bars it passes light up (futures that reach the target) or dim, and the
 * chance counts along with it. Switching horizon reshapes the histogram and rescales the axis.
 */
export function TargetPreview({ horizon, typed, onHorizon, compact = false }: Props) {
  const reduce = !!useReducedMotion()
  const uid = useId()
  const target = typed > 0 ? typed : suggestedTarget(horizon)
  const sd = sdOf(horizon)

  const t = useSpringTo(target, reduce)
  const median = useSpringTo(SAMPLE[horizon].p50, reduce)
  const lo = median * LO
  const hi = median * HI
  const chance = chanceOf(t, median, sd)
  const settled = verdict(chanceOf(target, SAMPLE[horizon].p50, sd))

  // bars rise from the baseline once, staggered; after that their heights morph between horizons
  const heights = shape(horizon)
  const [phase, setPhase] = useState<'down' | 'rising' | 'live'>(reduce ? 'live' : 'down')
  useEffect(() => {
    if (phase === 'down') {
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('rising')))
      return () => cancelAnimationFrame(raf)
    }
    if (phase === 'rising') {
      const timer = setTimeout(() => setPhase('live'), RISE_MS + BARS * STAGGER_MS)
      return () => clearTimeout(timer)
    }
  }, [phase])

  // marker position, clamped to the scale; off-scale targets pin to an edge with an arrow
  const off = t < lo ? 'left' : t > hi ? 'right' : null
  const f = Math.max(0, Math.min(1, (t - lo) / (hi - lo)))

  // the tag is centred on the marker but never leaves the box
  const box = useRef<HTMLDivElement>(null)
  const tag = useRef<HTMLSpanElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const tagW = tag.current?.offsetWidth ?? 0
  const tagX = Math.max(0, Math.min(w - tagW, f * w - tagW / 2))

  const s = SAMPLE[horizon]

  return (
    <div>
      {/* horizon: mirrors the field being edited, and can pick it */}
      <div role="tablist" aria-label="Preview horizon" className="relative inline-flex rounded-full bg-surface-2 p-1">
        {HORIZONS.map((h) => (
          <button
            key={h}
            type="button"
            role="tab"
            aria-selected={h === horizon}
            onClick={() => onHorizon(h)}
            className={`relative h-8 rounded-full px-3.5 text-xs font-semibold transition-colors duration-200 ${h === horizon ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {h === horizon && (
              <motion.span
                layoutId={`${uid}-pill`}
                transition={reduce ? { duration: 0 } : { type: 'spring', duration: 0.4, bounce: 0.15 }}
                className="absolute inset-0 rounded-full bg-surface shadow-card"
              />
            )}
            <span className="relative">{h} days</span>
          </button>
        ))}
      </div>

      {/* the chance, counting with the marker */}
      <div className="mt-5 flex items-end gap-3">
        <p className={`font-head text-4xl font-bold leading-none tabular-nums transition-colors duration-200 ${settled.tone}`}>{Math.round(chance * 100)}%</p>
        <p className="pb-0.5 text-xs leading-snug text-muted">
          of futures reach
          <br />
          {typed > 0 ? 'your target' : 'the suggested target'}
        </p>
      </div>
      <div className="relative mt-2 h-5 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={settled.text}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(6px)' }}
            animate={{ opacity: 1, transform: 'translateY(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-6px)' }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="truncate text-sm text-ink"
          >
            {settled.text}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* histogram + marker */}
      <div ref={box} className="relative mt-4 pt-9">
        <span
          ref={tag}
          className={`absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums transition-[background-color,color] duration-200 ${
            typed > 0 ? 'bg-target text-white' : 'bg-target/15 text-target'
          }`}
          style={{ transform: `translateX(${tagX}px)` }}
        >
          {off === 'left' && <ChevronLeft size={13} aria-hidden className="-ml-1" />}
          {typed > 0 ? 'Target ' : 'Suggested '}
          {money(t)}
          {off === 'right' && <ChevronRight size={13} aria-hidden className="-mr-1" />}
        </span>

        <svg viewBox={`0 0 ${VW} 100`} preserveAspectRatio="none" className={`block w-full overflow-visible ${compact ? 'h-24' : 'h-32'}`} aria-hidden>
          {heights.map((hgt, i) => {
            const centre = lo + ((i + 0.5) / BARS) * (hi - lo)
            const transition =
              phase === 'down'
                ? 'none'
                : phase === 'rising'
                  ? `transform ${RISE_MS}ms ${EASE_OUT} ${i * STAGGER_MS}ms, fill 160ms ease`
                  : `transform 520ms ${EASE_IN_OUT}, fill 160ms ease`
            return (
              <rect
                key={i}
                x={i * (VW / BARS) + GAP / 2}
                y={0}
                width={VW / BARS - GAP}
                height={100}
                rx={1.5}
                className={centre >= t ? 'fill-brand' : 'fill-ink/[0.09]'}
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'bottom',
                  transform: `scaleY(${phase === 'down' ? 0.035 : Math.max(hgt, 0.035)})`,
                  transition,
                }}
              />
            )
          })}
          {/* marker: solid while on the scale, faint when pinned to an edge */}
          <line
            x1={f * VW}
            x2={f * VW}
            y1={-8}
            y2={100}
            vectorEffect="non-scaling-stroke"
            strokeWidth={2}
            strokeDasharray="4 3"
            className="stroke-target transition-opacity duration-150"
            style={{ opacity: off ? 0.35 : 1 }}
          />
        </svg>

        {/* axis */}
        <div className="mt-2 flex justify-between text-2xs tabular-nums text-faint">
          <span>{money(lo)}</span>
          <span>{money((lo + hi) / 2)}</span>
          <span>{money(hi)}</span>
        </div>
      </div>

      {/* the forecast itself, fixed per horizon */}
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
        {(
          [
            ['Worst · P10', s.p10],
            ['Expected', s.p50],
            ['Best · P90', s.p90],
          ] as const
        ).map(([name, v], i) => (
          <div key={name} className={i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'}>
            <dt className="text-2xs text-faint">{name}</dt>
            <dd className={`text-sm font-semibold tabular-nums ${i === 1 ? 'text-ink' : 'text-muted'}`}>{money(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
