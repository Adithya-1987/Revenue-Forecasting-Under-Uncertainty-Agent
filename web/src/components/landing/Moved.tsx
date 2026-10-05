import gsap from 'gsap'
import { money, signedMoney } from '../../lib'
import { CAUSE_LABEL, groupCauses } from '../Ledger'
import { CHANGES } from './data'
import { countTo, drive, q } from './scroll'

/*
 * Why it moved: last week's number stands up, each cause drops or adds in turn, and this week's lands. The total
 * on the left counts with every step and the ledger names the deals behind the step on screen.
 */

interface Step {
  key: string
  short: string
  long: string
  amount: number
  /** running total before and after this step */
  from: number
  to: number
  kind: 'total' | 'gain' | 'loss'
  lines: { name: string; text: string; amount: number }[]
}

const STEPS: Step[] = (() => {
  const out: Step[] = [
    { key: 'prev', short: 'Last week', long: 'Last week’s expected 30 days', amount: CHANGES.prev_total, from: 0, to: CHANGES.prev_total, kind: 'total', lines: [] },
  ]
  let run = CHANGES.prev_total
  for (const g of groupCauses(CHANGES)) {
    out.push({
      key: g.type,
      short: CAUSE_LABEL[g.type][1],
      long: CAUSE_LABEL[g.type][0],
      amount: g.amount,
      from: run,
      to: run + g.amount,
      kind: g.amount >= 0 ? 'gain' : 'loss',
      lines: g.items.map((c) => ({ name: c.deal_name ?? c.deal_id ?? '', text: c.description, amount: c.amount })),
    })
    run += g.amount
  }
  if (CHANGES.residual) {
    out.push({ key: 'other', short: 'Other', long: 'Rounding and small moves', amount: CHANGES.residual, from: run, to: run + CHANGES.residual, kind: CHANGES.residual >= 0 ? 'gain' : 'loss', lines: [] })
  }
  out.push({ key: 'curr', short: 'This week', long: 'This week’s expected 30 days', amount: CHANGES.curr_total, from: 0, to: CHANGES.curr_total, kind: 'total', lines: [] })
  return out
})()

const W = 760
const H = 440
const Y0 = 1_500_000
const Y1 = 2_500_000
const TOP = 36
const BASE = H - 52
const y = (v: number) => BASE - ((Math.max(Y0, v) - Y0) / (Y1 - Y0)) * (BASE - TOP)
const SLOT = (W - 70) / STEPS.length
const bw = SLOT * 0.62
const x = (i: number) => 60 + i * SLOT + (SLOT - bw) / 2
const tone = { total: 'fill-ink', gain: 'fill-gain', loss: 'fill-loss' } as const
const moved = CHANGES.curr_total - CHANGES.prev_total
const fmt = (s: Step) => (s.kind === 'total' ? money(s.amount) : signedMoney(s.amount))

export function buildMoved(root: HTMLElement, motion: boolean) {
  const svg = root.querySelector('svg')!
  const bars = q<SVGRectElement>(svg, '.m-bar')
  const amts = q(svg, '.m-amt')
  const links = q(svg, '.m-link')
  const totalEl = root.querySelector('.m-total')!
  const total = { v: 0 }
  totalEl.textContent = money(0)
  const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.6 } })
  STEPS.forEach((s, i) => {
    tl.addLabel(`s${i}`, i)
    const origin = s.kind === 'total' ? BASE : y(s.from)
    tl.fromTo(bars[i], { scaleY: 0, svgOrigin: `${x(i)} ${origin}` }, { scaleY: 1, svgOrigin: `${x(i)} ${origin}` }, i + 0.05)
      .fromTo(amts[i], { autoAlpha: 0, y: s.kind === 'loss' ? -8 : 8 }, { autoAlpha: 1, y: 0, duration: 0.3 }, i + 0.4)
    if (i > 0) tl.fromTo(links[i - 1], { scaleX: 0, svgOrigin: `${x(i - 1) + bw} 0` }, { scaleX: 1, svgOrigin: `${x(i - 1) + bw} 0`, duration: 0.3 }, i)
    countTo(tl, totalEl, total, s.to, money, i + 0.05, 0.6)
  })
  tl.fromTo(root.querySelector('.m-delta'), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, STEPS.length - 0.5).to({}, { duration: 0.5 })

  // the ledger shows the step on screen; earlier causes step back so the current one reads
  const notes = q<HTMLElement>(root, '.m-note')
  const last = STEPS.length - 1
  let prev = -1
  const show = (i: number) => {
    notes.forEach((n, k) => k !== i && k !== prev && gsap.set(n, { autoAlpha: 0 }))
    if (prev >= 0 && prev !== i) gsap.to(notes[prev], { autoAlpha: 0, y: -12, duration: motion ? 0.2 : 0, overwrite: true })
    gsap.fromTo(notes[i], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: motion ? 0.4 : 0, ease: 'power3.out', overwrite: true })
    if (motion && STEPS[i].lines.length) gsap.fromTo(notes[i].querySelectorAll('li'), { autoAlpha: 0, x: -14 }, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.06, delay: 0.1, overwrite: true })
    bars.forEach((b, k) => b.classList.toggle('m-dim', i < last && k > 0 && k < i))
    prev = i
  }
  drive(tl, { trigger: root, start: 'top top', end: () => `+=${innerHeight * 4}`, pin: true, anticipatePin: 1, invalidateOnRefresh: true }, { motion, onChapter: show })
}

export function Moved() {
  return (
    <section id="moved" className="relative h-[100svh] overflow-hidden" aria-label="Why the forecast moved">
      <div className="mx-auto flex h-full max-w-[1240px] flex-col gap-4 px-4 pb-4 pt-[76px] lg:grid lg:grid-cols-[minmax(300px,0.7fr)_1.4fr] lg:items-center lg:gap-14 lg:px-8 lg:pt-20">
        <div data-rise>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Forecast change explanation</p>
          <h2 className="mt-2 text-[clamp(1.75rem,3.6vw,3rem)] font-bold leading-[1.04] tracking-[-0.04em] lg:mt-4">Every move, explained to the rupee.</h2>
          <div className="mt-4 flex items-baseline gap-3 lg:mt-8">
            <span className="m-total font-head text-[clamp(2.5rem,5vw,4rem)] font-bold leading-none tracking-[-0.045em]">{money(CHANGES.curr_total)}</span>
            <span className="m-delta rounded-full bg-loss/10 px-2.5 py-1 font-mono text-sm font-semibold text-loss">{signedMoney(moved)}</span>
          </div>
          <div className="mt-4 grid lg:mt-8">
            {STEPS.map((s, i) => (
              <div key={s.key} className="m-note [grid-area:1/1]" style={i ? { visibility: 'hidden' } : undefined}>
                <p className="flex items-baseline justify-between gap-4 border-b border-line pb-2 text-sm font-semibold">
                  <span>{s.long}</span>
                  <span className={`font-mono ${s.kind === 'loss' ? 'text-loss' : s.kind === 'gain' ? 'text-gain' : 'text-ink'}`}>{fmt(s)}</span>
                </p>
                {s.lines.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {s.lines.slice(0, 4).map((l) => (
                      <li key={l.name + l.text} className="grid grid-cols-[1fr_auto] gap-x-4">
                        <span className="truncate">
                          <span className="font-medium text-ink">{l.name}</span> <span className="text-muted">{l.text}</span>
                        </span>
                        <span className={`font-mono ${l.amount < 0 ? 'text-loss' : 'text-gain'}`}>{signedMoney(l.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    {s.key === 'curr'
                      ? `${signedMoney(moved)} since last week, and the steps add up to it exactly.`
                      : s.key === 'prev'
                        ? 'Expected bookings for the next 30 days, as of last week’s run.'
                        : 'Small moves below the reporting threshold, kept so the ledger balances.'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <svg data-rise viewBox={`0 0 ${W} ${H}`} className="min-h-0 w-full flex-1 overflow-visible lg:h-[min(560px,calc(100svh-140px))] lg:flex-none" role="img" aria-label={`Waterfall from ${money(CHANGES.prev_total)} to ${money(CHANGES.curr_total)}`}>
          {[1.5e6, 1.75e6, 2e6, 2.25e6, 2.5e6].map((v) => (
            <g key={v}>
              <line className="stroke-line" x1={52} x2={W} y1={y(v)} y2={y(v)} strokeDasharray={v === Y0 ? undefined : '2 5'} />
              <text className="fill-faint text-[11px] max-sm:text-[17px]" x={46} y={y(v) + 4} textAnchor="end">{money(v)}</text>
            </g>
          ))}
          {STEPS.map((s, i) => {
            const top = s.kind === 'total' ? y(s.to) : y(Math.max(s.from, s.to))
            const h = s.kind === 'total' ? BASE - y(s.to) : Math.max(2, Math.abs(y(s.from) - y(s.to)))
            return (
              <g key={s.key}>
                {i < STEPS.length - 1 && <line className="m-link stroke-faint" x1={x(i) + bw} x2={x(i + 1)} y1={y(s.to)} y2={y(s.to)} strokeDasharray="3 3" />}
                <rect className={`m-bar ${tone[s.kind]} transition-opacity duration-300 [&.m-dim]:opacity-30`} x={x(i)} y={top} width={bw} height={h} rx={5}>
                  <title>{`${s.long}: ${fmt(s)}`}</title>
                </rect>
                <text
                  className={`m-amt text-[12px] font-semibold max-sm:text-[17px] ${s.kind === 'total' ? 'fill-ink' : s.kind === 'gain' ? 'fill-gain' : 'fill-loss'}`}
                  x={x(i) + bw / 2}
                  y={s.kind === 'loss' ? top + h + 16 : top - 8}
                  textAnchor="middle"
                >
                  {fmt(s)}
                </text>
                <text className="fill-muted text-[11px] max-sm:text-[16px]" x={x(i) + bw / 2} y={BASE + 22} textAnchor="middle">{s.short}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}
