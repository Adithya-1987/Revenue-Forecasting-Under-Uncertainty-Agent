import type { Forecast } from '../types'
import { money, shortDate } from '../lib'

/**
 * The range building up over the horizon as capsule bars: the grey track reaches the best case (P90) on
 * that date, the ember fill the expected case (P50). The dashed line is the target.
 */
export function CapsuleRange({ series, target, height = 'h-56' }: { series: Forecast['series']; target?: number; height?: string }) {
  const points = series.filter((s) => s.p90 > 0)
  const top = Math.max(...points.map((s) => s.p90), target ?? 0, 1) * 1.08
  const ticks = [1, 0.75, 0.5, 0.25, 0]
  const y = (v: number) => `${(v / top) * 100}%`

  return (
    <figure className="flex gap-3" aria-label="Expected and best case, building over the next 30 days">
      <div className={`relative w-12 shrink-0 ${height}`} aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2 text-2xs text-faint" style={{ top: `${(1 - t) * 100}%` }}>
            {t ? money(top * t) : '₹0'}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`relative ${height}`}>
          {ticks.map((t) => (
            <span key={t} aria-hidden className="absolute inset-x-0 border-t border-dashed border-ink/10" style={{ top: `${(1 - t) * 100}%` }} />
          ))}
          {target != null && target < top && (
            <span aria-hidden className="absolute inset-x-0 z-10 border-t-2 border-dashed border-target/70" style={{ bottom: y(target) }}>
              <span className="absolute -top-5 right-0 rounded-full bg-target/10 px-2 text-2xs font-semibold text-target">Target {money(target)}</span>
            </span>
          )}
          <ol className="absolute inset-0 flex items-end justify-around gap-2">
            {points.map((s, i) => (
              <li
                key={s.date}
                className="group relative flex h-full w-full max-w-[44px] items-end justify-center"
                title={`${shortDate(s.date)}: worst ${money(s.p10)}, expected ${money(s.p50)}, best ${money(s.p90)}`}
              >
                <span className="absolute bottom-0 w-full rounded-full bg-ink/[0.07] transition-colors group-hover:bg-ink/[0.11] dark:bg-white/[0.07]" style={{ height: y(s.p90) }} />
                <span
                  className="ember-fill relative w-full origin-bottom animate-[capsule_900ms_cubic-bezier(0.22,1,0.36,1)_both] rounded-full shadow-[0_8px_16px_-10px_rgb(var(--sky))]"
                  style={{ height: y(s.p50), animationDelay: `${120 + i * 70}ms` }}
                />
                <span className="sr-only">{`${shortDate(s.date)}: expected ${money(s.p50)}, best ${money(s.p90)}`}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-2 flex justify-around gap-2 text-2xs text-faint" aria-hidden>
          {points.map((s) => (
            <span key={s.date} className="w-full max-w-[44px] text-center">{shortDate(s.date)}</span>
          ))}
        </div>
      </div>
    </figure>
  )
}
