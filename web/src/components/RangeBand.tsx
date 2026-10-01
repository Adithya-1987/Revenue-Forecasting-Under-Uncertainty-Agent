import { useEffect, useState } from 'react'
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

/**
 * The signature visual: worst..best track, solid dot at the median, dashed amber target.
 * Target above best case turns the band coral and draws the shortfall; below worst turns it green.
 * On first paint the band grows out of its median, then glides whenever a new run moves it.
 */
export function RangeBand({ low, mid, high, target, size = 'hero', domain, format = 'money', label }: Props) {
  const d = DIMS[size]
  const [ready, setReady] = useState(size !== 'hero')
  useEffect(() => {
    if (ready) return
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [ready])

  const fmt = format === 'pct' ? (n: number) => pct(n) : (n: number) => money(n)
  const lo = Math.min(low, target ?? low)
  const hi = Math.max(high, target ?? high)
  const pad = (hi - lo) * (size === 'hero' ? 0.14 : 0.08) || 1
  const [d0, d1] = domain ?? [lo - pad, hi + pad]
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - d0) / (d1 - d0)) * 100))}%`

  const miss = target != null && target > high
  const beat = target != null && target < low
  const tone = miss ? 'bg-loss' : beat ? 'bg-gain' : 'bg-brand'

  const aria =
    label ??
    `Worst ${fmt(low)}, median ${fmt(mid)}, best ${fmt(high)}` +
      (target != null ? `, target ${fmt(target)}${miss ? ', above the best case' : beat ? ', below the worst case' : ', inside the range'}` : '')

  const trackTop = size === 'hero' ? 'top-10' : 'top-1/2'
  const bandLeft = ready ? x(low) : x(mid)
  const bandWidth = ready ? `calc(${x(high)} - ${x(low)})` : '0%'

  return (
    <div role="img" aria-label={aria} className={`relative shrink-0 ${d.w} ${d.h}`}>
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
        className={`band-move absolute ${trackTop} -translate-x-1/2 -translate-y-1/2 rounded-full ${size === 'hero' ? 'border-[3px]' : 'border'} border-surface ${tone} ${size === 'hero' ? 'shadow-card' : ''}`}
        style={{ left: x(mid), width: d.dot, height: d.dot }}
      />
      {/* target: the only amber on the screen */}
      {target != null && (
        <div className={`band-move absolute ${trackTop} -translate-y-1/2 border-l-2 border-dashed border-target`} style={{ left: x(target), height: d.tick }} />
      )}

      {size === 'hero' && (
        <>
          {target != null && (
            <span className="band-move absolute top-0 -translate-x-1/2 -translate-y-2 whitespace-nowrap text-xs font-medium text-target" style={{ left: x(target) }}>
              Target {fmt(target)}
            </span>
          )}
          {[
            ['Worst · P10', low],
            ['Expected', mid],
            ['Best · P90', high],
          ].map(([name, v]) => (
            <span key={name} className="band-move absolute top-[60px] -translate-x-1/2 whitespace-nowrap text-center" style={{ left: x(v as number) }}>
              <span className="block text-xs text-faint">{name}</span>
              <span className={`block font-semibold ${name === 'Expected' ? 'text-xl text-ink' : 'text-md text-muted'}`}>{fmt(v as number)}</span>
            </span>
          ))}
        </>
      )}
    </div>
  )
}
