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
  hero: { w: 'w-full', h: 'h-24', track: 10, dot: 20, tick: 34 },
  row: { w: 'w-[60px]', h: 'h-4', track: 6, dot: 8, tick: 14 },
  nav: { w: 'w-14', h: 'h-3', track: 4, dot: 7, tick: 12 },
  card: { w: 'w-full', h: 'h-4', track: 6, dot: 10, tick: 14 },
}

/**
 * The signature visual: worst..best track, solid dot at expected, dashed ochre target.
 * Target above best case turns the band rust and draws the shortfall; below worst turns it green.
 */
export function RangeBand({ low, mid, high, target, size = 'hero', domain, format = 'money', label }: Props) {
  const d = DIMS[size]
  const fmt = format === 'pct' ? (n: number) => pct(n) : (n: number) => money(n)
  const lo = Math.min(low, target ?? low)
  const hi = Math.max(high, target ?? high)
  const pad = (hi - lo) * (size === 'hero' ? 0.14 : 0.08) || 1
  const [d0, d1] = domain ?? [lo - pad, hi + pad]
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - d0) / (d1 - d0)) * 100))}%`

  const miss = target != null && target > high
  const beat = target != null && target < low
  const tone = miss ? 'bg-loss' : beat ? 'bg-gain' : 'bg-forest'

  const aria =
    label ??
    `Worst ${fmt(low)}, median ${fmt(mid)}, best ${fmt(high)}` +
      (target != null
        ? `, target ${fmt(target)}${miss ? ', above the best case' : beat ? ', below the worst case' : ', inside the range'}`
        : '')

  const trackTop = size === 'hero' ? 'top-9' : 'top-1/2'

  return (
    <div role="img" aria-label={aria} className={`relative shrink-0 ${d.w} ${d.h}`}>
      {/* rail */}
      <div className={`absolute inset-x-0 ${trackTop} h-px -translate-y-1/2 bg-hair`} />
      {/* shortfall: best case to target */}
      {miss && (
        <div
          className={`band-move absolute ${trackTop} -translate-y-1/2 border-t-2 border-dotted border-loss`}
          style={{ left: x(high), width: `calc(${x(target!)} - ${x(high)})` }}
        />
      )}
      {/* band */}
      <div
        className={`band-move absolute ${trackTop} -translate-y-1/2 rounded-full ${tone}`}
        style={{ left: x(low), width: `calc(${x(high)} - ${x(low)})`, height: d.track }}
      />
      {/* expected */}
      <div
        className={`band-move absolute ${trackTop} -translate-x-1/2 -translate-y-1/2 rounded-full ${size === 'hero' ? 'border-2' : 'border'} border-white ${tone}`}
        style={{ left: x(mid), width: d.dot, height: d.dot }}
      />
      {/* target: the only ochre on the screen */}
      {target != null && (
        <div
          className={`band-move absolute ${trackTop} -translate-y-1/2 border-l-2 border-dashed border-target`}
          style={{ left: x(target), height: d.tick }}
        />
      )}

      {size === 'hero' && (
        <>
          {target != null && (
            <span
              className="band-move absolute top-0 -translate-x-1/2 -translate-y-3 whitespace-nowrap text-xs text-ink"
              style={{ left: x(target) }}
            >
              Target {fmt(target)}
            </span>
          )}
          {[
            ['Worst', low],
            ['Median', mid],
            ['Best', high],
          ].map(([name, v]) => (
            <span
              key={name}
              className="band-move absolute top-14 -translate-x-1/2 whitespace-nowrap text-center"
              style={{ left: x(v as number) }}
            >
              <span className="block text-xs text-ink/70">{name}</span>
              <span className={`block font-head font-bold ${name === 'Median' ? 'text-lg' : 'text-base'}`}>
                {fmt(v as number)}
              </span>
            </span>
          ))}
        </>
      )}
    </div>
  )
}
