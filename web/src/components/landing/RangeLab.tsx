import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import gsap from 'gsap'
import { money, pct } from '../../lib'
import type { Basis, Forecast, Horizon } from '../../types'
import { binStep, chanceAtLeast, forecastFor } from './data'
import { q } from './scroll'

/*
 * Range lab: the real simulated distribution for each horizon and basis. Pick one and the 40 bars re-grow into it;
 * drag the target (on the chart or the slider) and the bars past it turn plum while the chance re-counts.
 * The scroll only reveals the lab (wrappers); the inner bars belong to the interaction, so the two never fight.
 */

const W = 1000
const BASE = 236
const TOP = 26
const N = 40
const SLOT = (W - 40) / N
const bx = (i: number) => 20 + i * SLOT
const domain = (f: Forecast) => [f.histogram[0].bin - binStep(f) / 2, f.histogram[N - 1].bin + binStep(f) / 2] as const
const xOf = (f: Forecast, v: number) => {
  const [lo, hi] = domain(f)
  return 20 + ((v - lo) / (hi - lo)) * (W - 40)
}
const heights = (f: Forecast) => {
  const max = Math.max(...f.histogram.map((b) => b.count))
  return f.histogram.map((b) => (b.count / max) * (BASE - TOP))
}
const FIRST = forecastFor(30, 'bookings')
const H0 = heights(FIRST)
const P0 = chanceAtLeast(FIRST, FIRST.target)

export function buildLab(root: HTMLElement, motion: boolean) {
  if (!motion) return
  gsap
    .timeline({ scrollTrigger: { trigger: root.querySelector('.lab-chart'), start: 'top 88%', end: 'top 40%', scrub: 0.6 } })
    .fromTo(root.querySelector('.lab-bars'), { scaleY: 0, svgOrigin: `0 ${BASE}` }, { scaleY: 1, svgOrigin: `0 ${BASE}`, ease: 'power2.out' }, 0)
    .fromTo(root.querySelector('.lab-cap'), { scaleX: 0, svgOrigin: `${W / 2} 0` }, { scaleX: 1, svgOrigin: `${W / 2} 0`, ease: 'power2.out' }, 0.3)
    .fromTo(q(root, '.lab-stat'), { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.12 }, 0)
}

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const idx = options.findIndex(([v]) => v === value)
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-grid rounded-full border border-line bg-surface/70 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full bg-ink shadow-card transition-transform duration-300 ease-out"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onChange(v)}
          className={`relative z-10 min-h-10 rounded-full px-4 text-sm font-semibold transition-colors duration-300 ${v === value ? 'text-canvas' : 'text-muted hover:text-ink'}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export function RangeLab({ motion }: { motion: boolean }) {
  const [horizon, setHorizon] = useState<Horizon>(30)
  const [basis, setBasis] = useState<Basis>('bookings')
  const f = forecastFor(horizon, basis)
  const [target, setTarget] = useState(f.target)
  const svg = useRef<SVGSVGElement>(null)
  const probEl = useRef<HTMLSpanElement>(null)
  const prob = useRef({ v: P0 })
  const chance = chanceAtLeast(f, target)
  const [lo, hi] = domain(f)
  const dur = motion ? 1 : 0

  // a new forecast: the bars re-grow, the capsule slides, the target resets to that forecast's
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const h = heights(f)
    const bars = q<SVGRectElement>(el, '.lab-bar')
    gsap.killTweensOf(bars)
    gsap.to(bars, { attr: { y: (i: number) => BASE - h[i], height: (i: number) => h[i] }, duration: 0.7 * dur, ease: 'power3.inOut', stagger: { each: 0.008 * dur, from: 'center' } })
    gsap.to(el.querySelector('.lab-band'), { attr: { x: xOf(f, f.p10), width: xOf(f, f.p90) - xOf(f, f.p10) }, duration: 0.7 * dur, ease: 'power3.inOut', overwrite: true })
    q(el, '.lab-q').forEach((t) => gsap.to(t, { x: xOf(f, f[t.getAttribute('data-q') as 'p10' | 'p50' | 'p90']), duration: 0.7 * dur, ease: 'power3.inOut', overwrite: true }))
    setTarget(f.target)
  }, [f, dur])

  // the target line follows the pointer smoothly; the chance re-counts
  useEffect(() => {
    const el = svg.current?.querySelector('.lab-tgt')
    if (!el) return
    gsap.to(el, { x: xOf(f, target), duration: 0.35 * dur, ease: 'power3.out', overwrite: true })
    gsap.to(prob.current, { v: chance, duration: 0.5 * dur, ease: 'power2.out', overwrite: true, onUpdate: () => void (probEl.current && (probEl.current.textContent = pct(prob.current.v))) })
  }, [f, target, chance, dur])

  useEffect(() => {
    const p = prob.current
    return () => void gsap.killTweensOf(p)
  }, [])

  const fromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const share = (((e.clientX - box.left) / box.width) * W - 20) / (W - 40)
    setTarget(Math.round(Math.min(hi, Math.max(lo, lo + share * (hi - lo))) / 10000) * 10000)
  }

  const ticks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((t) => [20 + t * (W - 40), lo + t * (hi - lo)] as const), [lo, hi])

  return (
    <div className="lab mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Horizon" value={horizon} options={[[30, '30 days'], [60, '60 days'], [90, '90 days']]} onChange={setHorizon} />
        <Segmented label="Basis" value={basis} options={[['bookings', 'Bookings'], ['cash', 'Cash']]} onChange={setBasis} />
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-[auto_auto_1fr]">
        <div className="lab-stat">
          <dt className="text-sm text-muted">Chance of reaching {money(target)}</dt>
          <dd className="mt-1 font-head text-[clamp(3rem,8vw,6rem)] font-bold leading-none tracking-[-0.05em] text-target">
            <span ref={probEl}>{pct(P0)}</span>
          </dd>
        </div>
        <div className="lab-stat">
          <dt className="text-sm text-muted">Expected</dt>
          <dd className="mt-1 font-head text-[clamp(2rem,4.5vw,3.5rem)] font-bold leading-none tracking-[-0.04em]">{money(f.p50)}</dd>
        </div>
        <div className="lab-stat col-span-2 sm:col-span-1">
          <dt className="text-sm text-muted">Worst to best</dt>
          <dd className="mt-1 font-head text-[clamp(2rem,4.5vw,3.5rem)] font-bold leading-none tracking-[-0.04em] text-brand">
            {money(f.p10)} – {money(f.p90)}
          </dd>
        </div>
      </dl>

      <svg
        ref={svg}
        viewBox={`0 0 ${W} 320`}
        className="lab-chart mt-10 w-full cursor-ew-resize touch-pan-y select-none overflow-visible"
        role="img"
        aria-label={`Distribution of ${horizon}-day ${basis}; ${pct(chance)} of futures reach ${money(target)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          fromPointer(e)
        }}
        onPointerMove={(e) => e.buttons && fromPointer(e)}
      >
        <line className="stroke-line" x1={20} x2={W - 20} y1={BASE} y2={BASE} />
        <g className="lab-bars">
          {H0.map((h, i) => (
            <rect
              key={i}
              className={`lab-bar transition-[fill,fill-opacity] duration-300 ${f.histogram[i].bin >= target ? 'fill-target' : 'fill-brand'}`}
              fillOpacity={f.histogram[i].bin >= target ? 0.9 : 0.35}
              x={bx(i) + 2}
              y={BASE - h}
              width={SLOT - 4}
              height={h}
              rx={3}
            />
          ))}
        </g>
        <g className="lab-tgt" transform={`translate(${xOf(FIRST, FIRST.target)},0)`}>
          <line className="stroke-target" x1={0} x2={0} y1={TOP - 14} y2={BASE + 6} strokeWidth={2} />
          <circle className="fill-target" cx={0} cy={TOP - 14} r={7} />
          <text className="fill-target text-[13px] font-semibold max-sm:text-[34px]" x={12} y={TOP - 10}>
            Target {money(target)}
          </text>
        </g>
        <g className="lab-cap">
          <rect className="lab-band fill-brand" x={xOf(FIRST, FIRST.p10)} y={258} width={xOf(FIRST, FIRST.p90) - xOf(FIRST, FIRST.p10)} height={10} rx={5} />
          {(['p10', 'p50', 'p90'] as const).map((k) => (
            <g key={k} className="lab-q" data-q={k} transform={`translate(${xOf(FIRST, FIRST[k])},0)`}>
              <line className="stroke-ink" x1={0} x2={0} y1={254} y2={272} strokeWidth={k === 'p50' ? 3 : 1.5} />
              <text className="fill-ink text-[12px] font-semibold max-sm:hidden" x={0} y={292} textAnchor="middle">
                {k === 'p10' ? 'Worst' : k === 'p50' ? 'Expected' : 'Best'} {money(f[k])}
              </text>
            </g>
          ))}
        </g>
        {ticks.map(([x, v]) => (
          <text key={x} className="fill-faint text-[11px] max-sm:text-[30px]" x={x} y={314} textAnchor="middle">
            {money(v)}
          </text>
        ))}
      </svg>

      <label className="mt-4 flex items-center gap-4 text-sm text-muted">
        <span className="shrink-0">Target</span>
        <input
          type="range"
          min={Math.round(lo / 10000) * 10000}
          max={Math.round(hi / 10000) * 10000}
          step={10000}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-[rgb(var(--target))]"
          aria-valuetext={`${money(target)}, ${pct(chance)} chance`}
        />
        <span className="w-16 shrink-0 text-right font-mono text-ink">{money(target)}</span>
      </label>
    </div>
  )
}
