import { useId } from 'react'
import gsap from 'gsap'
import { money, pct } from '../../lib'
import { ACCURACY } from './data'
import { countTo, drive, q } from './scroll'

/*
 * Proof: a year of backtests drawn month by month. The P10 to P90 band unrolls, the predicted line follows, each
 * actual lands inside or outside, and the counter keeps score. Then the error bars race the stage formula.
 */

const H12 = ACCURACY.history
const H = 400
const V0 = 1_200_000
const V1 = 2_900_000
const inside = H12.map((m) => m.actual >= m.p10 && m.actual <= m.p90)
const ours = ACCURACY.mape['30'] ?? 0
const formula = ACCURACY.baseline_mape ?? 0
const SCALE = Math.max(ours, formula) * 1.15
const month = (s: string) => new Date(`${s}-01`).toLocaleDateString('en-GB', { month: 'short' })
const y = (v: number) => 360 - ((v - V0) / (V1 - V0)) * 320

/** Phones get a narrower frame, so the month and money labels stay readable at phone scale. */
function geometry(narrow: boolean) {
  const W = narrow ? 420 : 760
  const x0 = narrow ? 46 : 64
  const x = (i: number) => x0 + (i * (W - x0 - 20)) / (H12.length - 1)
  const band = `M${H12.map((m, i) => `${x(i)},${y(m.p90)}`).join('L')}L${[...H12].reverse().map((m, i) => `${x(H12.length - 1 - i)},${y(m.p10)}`).join('L')}Z`
  const line = `M${H12.map((m, i) => `${x(i)},${y(m.predicted)}`).join('L')}`
  return { W, x0, x, band, line }
}

export function buildProof(root: HTMLElement, narrow: boolean, motion: boolean) {
  const { W, x } = geometry(narrow)
  const svg = root.querySelector('svg')!
  const dots = q(svg, '.p-dot')
  const seenEl = root.querySelector('.p-seen')!
  const inEl = root.querySelector('.p-in')!
  const seen = { v: 0 }
  const write = () => {
    const n = Math.round(seen.v)
    seenEl.textContent = String(n)
    inEl.textContent = String(inside.slice(0, n).filter(Boolean).length)
  }
  write()
  const D = 2.2
  const tl = gsap.timeline({ defaults: { ease: 'none' } }).addLabel('draw', 0)
  tl.fromTo(svg.querySelector('.p-clip'), { attr: { width: 0 } }, { attr: { width: W }, duration: D }, 0)
    .fromTo(svg.querySelector('.p-line'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: D }, 0)
    .to(seen, { v: H12.length, duration: D, onUpdate: write }, 0)
  dots.forEach((d, i) =>
    tl.fromTo(d, { scale: 0, autoAlpha: 0, svgOrigin: `${x(i)} ${y(H12[i].actual)}` }, { scale: 1, autoAlpha: 1, svgOrigin: `${x(i)} ${y(H12[i].actual)}`, duration: 0.18, ease: 'back.out(2.5)' }, (i / (H12.length - 1)) * D),
  )

  tl.addLabel('race', D + 0.3)
  const bars = q<HTMLElement>(root, '.p-bar')
  const vals = q<HTMLElement>(root, '.p-val')
  ;[ours, formula].forEach((v, k) => {
    tl.fromTo(bars[k], { scaleX: 0 }, { scaleX: v / SCALE, duration: 0.9, ease: 'power2.out' }, D + 0.35 + k * 0.1)
    countTo(tl, vals[k], { v: 0 }, v, (n) => pct(n), D + 0.35 + k * 0.1, 0.9)
  })
  tl.fromTo(q(root, '.p-note'), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.3 }, D + 1.1).to({}, { duration: 0.5 })
  drive(tl, { trigger: root, start: 'top top', end: () => `+=${innerHeight * 2.6}`, pin: true, anticipatePin: 1, invalidateOnRefresh: true }, { motion })
}

export function Proof({ narrow }: { narrow: boolean }) {
  const { W, x0, x, band, line } = geometry(narrow)
  const t = narrow ? 'text-[13px]' : 'text-[11px]'
  const clip = `pc${useId().replace(/:/g, '')}`
  return (
    <section id="proof" className="relative h-[100svh] overflow-hidden" aria-label="Backtest results">
      <div className="mx-auto flex h-full max-w-[1240px] flex-col gap-4 px-4 pb-4 pt-[76px] lg:grid lg:grid-cols-[minmax(300px,0.7fr)_1.4fr] lg:items-center lg:gap-14 lg:px-8 lg:pt-20">
        <div data-rise>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Backtest</p>
          <h2 className="mt-2 text-[clamp(1.75rem,3.6vw,3rem)] font-bold leading-[1.04] tracking-[-0.04em] lg:mt-4">Checked against what actually closed.</h2>
          <p className="mt-3 font-head text-[clamp(1.25rem,2.2vw,1.75rem)] font-semibold leading-tight tracking-[-0.02em] lg:mt-8">
            <span className="p-in text-brand">{inside.filter(Boolean).length}</span> of <span className="p-seen">{H12.length}</span> months landed inside the range
          </p>
          <div className="mt-5 space-y-3 lg:mt-10">
            {(
              [
                ['Rangefinder, 30 days', ours, 'bg-brand'],
                ['Σ value × stage %', formula, 'bg-faint'],
              ] as const
            ).map(([label, v, color]) => (
              <div key={label}>
                <p className="flex items-baseline justify-between text-sm">
                  <span className="text-muted">{label}</span>
                  <span className="font-mono font-semibold">
                    <span className="p-val">{pct(v)}</span> error
                  </span>
                </p>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-line/70">
                  <div className={`p-bar h-full origin-left rounded-full ${color}`} style={{ transform: `scaleX(${v / SCALE})` }} />
                </div>
              </div>
            ))}
            <p className="p-note pt-1 text-sm text-muted">Mean absolute error over the last twelve monthly runs, against the stage formula on the same deals.</p>
          </div>
        </div>

        <svg data-rise viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet" className="min-h-0 w-full flex-1 overflow-visible lg:h-[min(540px,calc(100svh-140px))] lg:flex-none" role="img" aria-label="Twelve months of forecast ranges against actual results">
          <defs>
            <clipPath id={clip}>
              <rect className="p-clip" x={0} y={0} width={W} height={H} />
            </clipPath>
          </defs>
          {[1.5e6, 2e6, 2.5e6].map((v) => (
            <g key={v}>
              <line className="stroke-line" x1={x0 - 8} x2={W} y1={y(v)} y2={y(v)} strokeDasharray="2 5" />
              <text className={`fill-faint ${t}`} x={x0 - 14} y={y(v) + 4} textAnchor="end">{money(v)}</text>
            </g>
          ))}
          <g clipPath={`url(#${clip})`}>
            <path className="fill-brand" fillOpacity={0.14} d={band} />
          </g>
          <path className="p-line stroke-brand" d={line} fill="none" strokeWidth={2.5} strokeLinejoin="round" pathLength={1} strokeDasharray="1" />
          {H12.map((m, i) => (
            <g key={m.run_at} className="p-dot">
              <circle className={inside[i] ? 'fill-ink' : 'fill-canvas stroke-loss'} cx={x(i)} cy={y(m.actual)} r={6} strokeWidth={2.5} />
              {!inside[i] && (
                <text className={`fill-loss font-semibold ${t}`} x={x(i)} y={y(m.actual) + (m.actual > m.p90 ? -14 : 26)} textAnchor="middle">outside</text>
              )}
              <title>{`${month(m.run_at)}: predicted ${money(m.predicted)}, actual ${money(m.actual)}`}</title>
            </g>
          ))}
          {H12.map((m, i) => (
            <text key={m.run_at} className={`fill-faint ${t}`} x={x(i)} y={392} textAnchor="middle">{narrow && i % 2 ? '' : month(m.run_at)}</text>
          ))}
        </svg>
      </div>
    </section>
  )
}
