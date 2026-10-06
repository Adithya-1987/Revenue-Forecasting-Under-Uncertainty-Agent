import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { money, pct } from '../lib'

interface Props {
  low: number
  mid: number
  high: number
  target?: number
  size?: 'hero' | 'row' | 'nav' | 'card'
  /** Fixed scale; defaults to the band plus target with padding. */
  domain?: [number, number]
  /** How to print values. Probabilities use pct. */
  format?: 'money' | 'pct'
  label?: string
}

const DIMS = {
  hero: { w: 'w-full', h: 'h-28', track: 12, dot: 22, tick: 38 },
  row: { w: 'w-[64px]', h: 'h-4', track: 6, dot: 9, tick: 14 },
  nav: { w: 'w-14', h: 'h-3', track: 5, dot: 8, tick: 12 },
  card: { w: 'w-full', h: 'h-4', track: 6, dot: 10, tick: 14 },
}

// half-widths (px) of the worst / expected / best labels, and the air kept between them
const HALF = [38, 46, 38]
const GAP = 10

/**
 * The signature visual: worst..best track, solid dot at the median, dashed amber target.
 * Target above best case turns the band coral and draws the shortfall; below worst turns it green.
 * On first paint the band grows out of its median, then glides whenever a new run moves it.
 */
export function RangeBand({ low, mid, high, target, size = 'hero', domain, format = 'money', label }: Props) {
  const d = DIMS[size]
  const hero = size === 'hero'
  const [ready, setReady] = useState(!hero)
  useEffect(() => {
    if (ready) return
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [ready])

  // hero labels are laid out in pixels, so measure the scale
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  useLayoutEffect(() => {
    if (!hero || !box.current) return
    const el = box.current
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [hero])

  const fmt = format === 'pct' ? (n: number) => pct(n) : (n: number) => money(n)
  const lo = Math.min(low, target ?? low)
  const hi = Math.max(high, target ?? high)
  const pad = (hi - lo) * (hero ? 0.14 : 0.08) || 1
  const [d0, d1] = domain ?? [lo - pad, hi + pad]
  const f = (v: number) => Math.max(0, Math.min(1, (v - d0) / (d1 - d0)))
  const x = (v: number) => `${f(v) * 100}%`
  // the target label is centred on its value; keep it inside the box at the edges
  const xl = (v: number) => `clamp(2.5rem, ${x(v)}, calc(100% - 2.5rem))`

  // worst / expected / best labels: on the scale where they fit, nudged apart where they would collide
  const spots = (() => {
    if (!W) return [low, mid, high].map(xl)
    const p = [low, mid, high].map((v) => f(v) * W)
    const s01 = HALF[0] + HALF[1] + GAP
    const s12 = HALF[1] + HALF[2] + GAP
    p[1] = Math.max(HALF[0] + s01, Math.min(W - HALF[2] - s12, p[1]))
    p[0] = Math.max(HALF[0], Math.min(p[0], p[1] - s01))
    p[2] = Math.min(W - HALF[2], Math.max(p[2], p[1] + s12))
    return p.map((n) => `${n}px`)
  })()

  const miss = target != null && target > high
  const beat = target != null && target < low
  const tone = miss ? 'bg-loss' : beat ? 'bg-gain' : 'bg-brand'

  const aria =
    label ??
    `Worst ${fmt(low)}, median ${fmt(mid)}, best ${fmt(high)}` +
      (target != null ? `, target ${fmt(target)}${miss ? ', above the best case' : beat ? ', below the worst case' : ', inside the range'}` : '')

  const trackTop = hero ? 'top-10' : 'top-1/2'
  const bandLeft = ready ? x(low) : x(mid)
  const bandWidth = ready ? `calc(${x(high)} - ${x(low)})` : '0%'

  const points: [string, number][] = [
    ['Worst · P10', low],
    ['Expected', mid],
    ['Best · P90', high],
  ]

  return (
    <div role="img" aria-label={aria} className={`shrink-0 ${d.w}`}>
    {/* phones: the hero is shorter and its values sit in a row underneath instead of on the scale */}
    <div ref={box} className={`relative ${hero ? 'h-16 sm:h-28' : d.h}`}>
      {/* rail */}
      <div className={`absolute inset-x-0 ${trackTop} h-px -translate-y-1/2 bg-line`} />
      {/* shortfall: best case to target */}
      {miss && (
        <div className={`band-move absolute ${trackTop} -translate-y-1/2 border-t-2 border-dotted border-loss`} style={{ left: x(high), width: `calc(${x(target!)} - ${x(high)})` }} />
      )}
      {/* band */}
      <div
        className={`band-move absolute ${trackTop} -translate-y-1/2 rounded-full ${tone}`}
        style={{ left: bandLeft, width: bandWidth, height: d.track }}
      />
      {/* median */}
      <div
        className={`band-move absolute ${trackTop} -translate-x-1/2 -translate-y-1/2 rounded-full ${hero ? 'border-[3px]' : 'border'} border-surface ${tone} ${hero ? 'shadow-card' : ''}`}
        style={{ left: x(mid), width: d.dot, height: d.dot }}
      />
      {/* target: the only amber on the screen */}
      {target != null && (
        <div className={`band-move absolute ${trackTop} -translate-y-1/2 border-l-2 border-dashed border-target`} style={{ left: x(target), height: d.tick }} />
      )}

      {hero && (
        <>
          {target != null && (
            <span className={`band-move absolute top-0 -translate-x-1/2 -translate-y-2 whitespace-nowrap text-xs font-medium tabular-nums text-target`} style={{ left: xl(target) }}>
              Target {fmt(target)}
            </span>
          )}
          {points.map(([name, v], i) => (
            <span key={name} className="band-move absolute top-[60px] hidden -translate-x-1/2 whitespace-nowrap text-center sm:block" style={{ left: spots[i] }}>
              <span className="block text-xs text-faint">{name}</span>
              <span className={`block font-semibold ${i === 1 ? 'text-xl text-ink' : 'text-md text-muted'}`}>{fmt(v)}</span>
            </span>
          ))}
        </>
      )}
    </div>
    {hero && (
      <div className="grid grid-cols-3 gap-2 pb-2 sm:hidden">
        {points.map(([name, v], i) => (
          <span key={name} className={i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'}>
            <span className="block text-2xs text-faint">{name}</span>
            <span className={`block font-semibold ${i === 1 ? 'text-lg text-ink' : 'text-sm text-muted'}`}>{fmt(v)}</span>
          </span>
        ))}
      </div>
    )}
    </div>
  )
}
