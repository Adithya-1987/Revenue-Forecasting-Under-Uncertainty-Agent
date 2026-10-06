import { useMemo, useRef, useState, type PointerEvent } from 'react'
import gsap from 'gsap'
import { money, pct } from '../../lib'
import { AXIS_DAYS, DEALS, RANGE, REP_GROUPS, TOTALS, WINDOW_DAYS, binStep, chanceAtLeast, dayLabel, futurePaths } from './data'
import { countTo, drive, q } from './scroll'

/*
 * The engine: one pinned stage where the same twelve deals carry the whole method. They pop out of the CRM's single
 * number as bubbles, become bars that re-score, decay and calibrate, shrink to dots that run out to their payment
 * dates, then fly into the simulation whose 10,000 futures close into a range.
 */

const PROB = chanceAtLeast(RANGE, RANGE.target)
const SAME = '12 largest open deals'

const CHAPTERS = [
  { kicker: 'What the CRM does', title: 'One number, from a formula.', label: 'CRM forecast · Σ value × stage %', sub: SAME,
    body: `Every open deal is multiplied by a fixed stage percentage and added up. A ${money(500000)} proposal and a ${money(75000)} proposal both count at 60%.` },
  { kicker: 'Deal probability model', title: 'Every deal, re-scored.', label: 'Σ value × learned win chance', sub: SAME,
    body: 'Win chance is learned from your own won and lost deals: size, segment, age and time in stage. The stage percentage is only where it starts.' },
  { kicker: 'Inactivity decay', title: 'Silence is a signal.', label: 'After inactivity decay', sub: SAME,
    body: 'A deal nobody has touched for six weeks is not still a 60% deal. Win chance decays with every quiet day.' },
  { kicker: 'Salesperson calibration', title: 'Every rep, calibrated.', label: 'After rep calibration', sub: SAME,
    body: 'Each salesperson’s past calls are scored against what actually closed. Optimists are discounted and sandbaggers are trusted more.' },
  { kicker: 'Cash realization', title: 'Signed is not paid.', label: `Expected cash inside ${WINDOW_DAYS} days`, sub: SAME,
    body: 'Payment terms and each customer’s real payment delay move the cash to its true date. The two biggest deals sign this quarter and pay in the next.' },
  { kicker: 'Monte Carlo simulation', title: '10,000 futures, not one.', label: 'Futures simulated', sub: 'Whole pipeline · next 30 days',
    body: 'Every run plays the period out ten thousand times: which deals close, which slip, and when the cash lands.' },
  { kicker: 'Scenario output', title: 'A range you can plan on.', label: '30-day bookings · worst to best', sub: `${pct(PROB)} chance of ${money(RANGE.target)}`,
    body: `Worst, expected and best case, and the honest chance of reaching target: ${pct(PROB)} for ${money(RANGE.target)}.` },
]

/* ------------------------------------------------------------------ geometry */

function pack(W: number, B0: number, B1: number, R: number) {
  const cx = W / 2
  const cy = (B0 + B1) / 2
  const k = Math.min(1.9, Math.max(1, W / (B1 - B0)))
  const out: { x: number; y: number; r: number }[] = []
  for (const d of DEALS) {
    const r = Math.sqrt(d.value / DEALS[0].value) * R
    let spot = { x: cx, y: cy, r }
    for (let t = 0; t < 8000; t++) {
      const a = t * 0.31
      const s = t * 0.42
      const c = { x: cx + Math.cos(a) * s * k, y: cy + Math.sin(a) * s, r }
      if (c.x - r < 2 || c.x + r > W - 2 || c.y - r < B0 || c.y + r > B1) continue
      if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= o.r + r + 7)) {
        spot = c
        break
      }
    }
    out.push(spot)
  }
  return out
}

function geometry(narrow: boolean) {
  const W = narrow ? 400 : 760
  const H = narrow ? 520 : 540
  const B0 = 108
  const B1 = H - 6
  const x0 = narrow ? 104 : 148
  const TW = W - x0 - (narrow ? 50 : 64)
  const n = DEALS.length
  const rowH = (B1 - B0) / n
  const bh = narrow ? 13 : 16
  const rows = DEALS.map((_, i) => B0 + i * rowH + rowH / 2)
  // grouped by salesperson, a header line above each group
  const gh = 18
  const rowG = (B1 - B0 - REP_GROUPS.length * gh) / n
  const grouped: number[] = []
  const heads: number[] = []
  let y = B0
  for (const g of REP_GROUPS) {
    heads.push(y + 12)
    y += gh
    for (const i of g.deals) {
      grouped[i] = y + rowG / 2
      y += rowG
    }
  }
  const px0 = narrow ? 38 : 54
  const px1 = W - (narrow ? 118 : 190)
  const VMAX = 3_000_000
  return {
    W, H, B0, B1, x0, TW, bh, rows, grouped, heads, px0, px1, VMAX,
    bubbles: pack(W, B0, B1, narrow ? 50 : 80),
    xd: (day: number) => x0 + (day / AXIS_DAYS) * TW,
    yv: (v: number) => B1 - 26 - (v / VMAX) * (B1 - 26 - (B0 + 6)),
  }
}
type Geo = ReturnType<typeof geometry>

const bar = (G: Geo, p: number, cy: number) => ({ x: G.x0, y: cy - G.bh / 2, width: Math.max(G.bh, G.TW * p), height: G.bh, rx: G.bh / 2 })
const dot = (cx: number, cy: number, r = 6) => ({ x: cx - r, y: cy - r, width: r * 2, height: r * 2, rx: r })

/* ------------------------------------------------------------------ timeline */

export function buildEngine(root: HTMLElement, narrow: boolean, motion: boolean) {
  const G = geometry(narrow)
  const svg = root.querySelector('svg')!
  const deals = q<SVGGElement>(svg, '.e-deal')
  const part = (sel: string) => deals.map((g) => g.querySelector<SVGGraphicsElement>(sel))
  const shapes = part('.d-shape') as SVGRectElement[]
  const tracks = part('.d-track')
  const names = part('.d-name') as SVGTextElement[]
  const pcts = part('.d-pct') as SVGTextElement[]
  const dates = part('.d-date')
  const tails = part('.d-tail')
  const cash = part('.d-cash')
  const tags = deals.map((g) => g.querySelector('.d-tag')).filter(Boolean) as SVGTextElement[]
  const tagged = DEALS.flatMap((d, i) => (d.silent > 0 ? [i] : []))
  const quiet = DEALS.flatMap((d, i) => (d.silent > 0 ? [] : [i]))
  const outside = DEALS.flatMap((d, i) => (d.cashInside ? [] : [i]))
  const one = <T extends Element>(sel: string) => svg.querySelector<T>(sel)!
  const num = one<SVGTextElement>('.e-num')
  const fut = one<SVGTextElement>('.e-fut')
  const rng = one<SVGTextElement>('.e-rng')

  // bubble labels: centred by measured width; names that do not fit their bubble wait for the bars
  const B = G.bubbles
  const len = (t: SVGTextElement, fallback: number) => t.getComputedTextLength() || fallback
  const fits = names.map((t, i) => len(t, DEALS[i].name.length * 6.6) <= 2 * B[i].r - 14)
  names.forEach((t, i) => gsap.set(t, { attr: { x: B[i].x - len(t, DEALS[i].name.length * 6.6) / 2, y: fits[i] ? B[i].y - 1 : B[i].y }, opacity: fits[i] ? 1 : 0 }))
  pcts.forEach((t, i) => gsap.set(t, { attr: { x: B[i].x - len(t, 24) / 2, y: fits[i] ? B[i].y + 15 : B[i].y + 4 } }))

  const total = { v: 0 }
  const futures = { v: 0 }
  const pv = DEALS.map((d) => ({ v: d.stagePct }))
  num.textContent = money(0)
  const tl = gsap.timeline({ defaults: { ease: 'power2.inOut', duration: 0.6 } })
  const score = (i: number, p: number, at: number, d = 0.5) =>
    tl
      .to(shapes[i], { attr: { width: Math.max(G.bh, G.TW * p) }, duration: d }, at)
      .to(pv[i], { v: p, duration: d, onUpdate: () => void (pcts[i].textContent = pct(pv[i].v)) }, at)
  // rows glide to a new slot; while they cross, their labels dim so the passing rows never read as a pile-up
  const moveRow = (i: number, cy: number, at: number, withShape = true) => {
    const labels = [names[i], pcts[i], deals[i].querySelector('.d-tag')].filter(Boolean) as SVGTextElement[]
    tl.to(withShape ? [shapes[i], tracks[i]] : [tracks[i]], { attr: { y: cy - G.bh / 2 }, duration: 0.7, ease: 'power3.inOut' }, at)
      .to(labels, { attr: { y: cy + 4 }, duration: 0.7, ease: 'power3.inOut' }, at)
    if (withShape) tl.to(labels, { opacity: 0.15, duration: 0.22, ease: 'power1.in' }, at + 0.05).to(labels, { opacity: 1, duration: 0.3, ease: 'power1.out' }, at + 0.45)
  }

  // 1. the deals pop out of the CRM's number
  tl.addLabel('c0', 0)
  deals.forEach((g, i) =>
    tl.fromTo(g, { scale: 0, autoAlpha: 0, svgOrigin: `${B[i].x} ${B[i].y}` }, { scale: 1, autoAlpha: 1, svgOrigin: `${B[i].x} ${B[i].y}`, duration: 0.45, ease: 'back.out(1.5)' }, 0.05 + i * 0.045),
  )
  countTo(tl, num, total, TOTALS.crm, money, 0.05, 0.75)

  // 2. bubbles become bars at their stage %, then slide to the learned chance
  tl.addLabel('c1', 1.15)
  DEALS.forEach((_, i) => {
    const at = 1.2 + i * 0.025
    const cy = G.rows[i]
    tl.to(shapes[i], { attr: { ...bar(G, DEALS[i].stagePct, cy), 'fill-opacity': 0.88, 'stroke-opacity': 0 } }, at)
      .to(names[i], { attr: { x: 0, y: cy + 4 }, opacity: 1 }, at)
      .to(pcts[i], { attr: { x: G.x0 + G.TW + 10, y: cy + 4 } }, at)
      .fromTo(tracks[i], { opacity: 0 }, { opacity: 1, duration: 0.3 }, at + 0.35)
    score(i, DEALS[i].pLearned, 2 + i * 0.03)
  })
  countTo(tl, num, total, TOTALS.learned, money, 2, 0.7)

  // 3. quiet deals are tagged and lose chance; the rest step back
  tl.addLabel('c2', 2.95)
  tl.to(quiet.map((i) => deals[i]), { opacity: 0.3, duration: 0.35 }, 3)
    .fromTo(tags, { opacity: 0, x: 8 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.05 }, 3.05)
  tagged.forEach((i, k) => score(i, DEALS[i].pDecayed, 3.35 + k * 0.05))
  countTo(tl, num, total, TOTALS.decayed, money, 3.35, 0.6)

  // 4. rows regroup under their salesperson and take the rep's correction
  tl.addLabel('c3', 4.25)
  tl.to(quiet.map((i) => deals[i]), { opacity: 1, duration: 0.3 }, 4.25)
  DEALS.forEach((_, i) => moveRow(i, G.grouped[i], 4.3 + i * 0.015))
  tl.fromTo(q(svg, '.e-head'), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.06 }, 4.6)
  DEALS.forEach((d, i) => score(i, d.pWin, 5.05 + i * 0.02))
  countTo(tl, num, total, TOTALS.calibrated, money, 5.05, 0.6)

  // 5. bars shrink to dots on the calendar, then run out to the day the cash lands
  tl.addLabel('c4', 5.95)
  tl.to(q(svg, '.e-head'), { opacity: 0, duration: 0.25 }, 5.95).to([...tracks, ...pcts, ...tags], { opacity: 0, duration: 0.3 }, 6)
  DEALS.forEach((d, i) => {
    // the bar shrinks straight into its dot (the dot carries the new row), so no two tweens fight over y
    moveRow(i, G.rows[i], 6.05, false)
    tl.to(shapes[i], { attr: { ...dot(G.xd(d.closeDay), G.rows[i]), 'fill-opacity': 1 }, duration: 0.7, ease: 'power3.inOut' }, 6.1 + i * 0.02)
  })
  tl.fromTo(one('.e-cashax'), { opacity: 0 }, { opacity: 1, duration: 0.4 }, 6.25)
  DEALS.forEach((d, i) =>
    tl
      .to(tails[i], { attr: { width: G.xd(d.cashDay) - G.xd(d.closeDay) }, opacity: 1, duration: 0.6, ease: 'none' }, 6.95 + i * 0.02)
      .fromTo(cash[i], { opacity: 0 }, { attr: { cx: G.xd(d.cashDay) }, opacity: 1, duration: 0.6, ease: 'none' }, 6.95 + i * 0.02),
  )
  tl.fromTo(dates, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.02 }, 7.5).to(outside.map((i) => deals[i]), { opacity: 0.45, duration: 0.3 }, 7.65)
  countTo(tl, num, total, TOTALS.cash, money, 6.95, 0.7)

  // 6. every deal flies into the simulation; 10,000 futures fan out and pile up as a histogram
  tl.addLabel('c5', 8.25)
  const ox = G.px0
  const oy = G.yv(0)
  tl.to([...names, ...dates, ...tails, one('.e-cashax')], { opacity: 0, duration: 0.3 }, 8.3)
  DEALS.forEach((_, i) => {
    tl.to(shapes[i], { attr: dot(ox, oy, 3), duration: 0.6, ease: 'power2.inOut' }, 8.3 + i * 0.03).to(cash[i], { attr: { cx: ox, cy: oy }, opacity: 0, duration: 0.6, ease: 'power2.inOut' }, 8.3 + i * 0.03)
  })
  tl.to(deals, { autoAlpha: 0, duration: 0.15 }, 8.95)
    .to(num, { opacity: 0, y: -10, duration: 0.3 }, 8.4)
    .fromTo(fut, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3 }, 8.55)
    .fromTo(one('.e-fut-g'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 }, 8.6)
    .fromTo(q(svg, '.f-path'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7, stagger: 0.012, ease: 'power1.out' }, 8.9)
    .fromTo(q(svg, '.f-bin'), { attr: { width: 0 } }, { attr: { width: (_: number, el: Element) => Number(el.getAttribute('data-w')) }, duration: 0.5, stagger: 0.008, ease: 'power2.out' }, 9.4)
  countTo(tl, fut, futures, 10000, (v) => Math.round(v).toLocaleString('en-US'), 8.9, 1.2)

  // 7. the futures dim and the range closes over them, with the target and its chance
  tl.addLabel('c6', 10.25)
  const p50 = G.yv(RANGE.p50)
  tl.to(q(svg, '.f-path'), { opacity: 0.14, duration: 0.4 }, 10.3)
    .to(fut, { opacity: 0, y: -10, duration: 0.3 }, 10.3)
    .fromTo(rng, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35 }, 10.45)
    .fromTo(one('.f-band'), { scaleY: 0, svgOrigin: `${G.px1} ${p50}` }, { scaleY: 1, svgOrigin: `${G.px1} ${p50}`, duration: 0.6, ease: 'power3.out' }, 10.4)
    .fromTo(one('.f-mid'), { opacity: 0 }, { opacity: 1, duration: 0.25 }, 10.6)
    .fromTo(q(svg, '.f-lbl'), { opacity: 0, x: 8 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.07 }, 10.7)
    .fromTo(one('.f-tgt'), { scaleX: 0, svgOrigin: `${G.px0} 0` }, { scaleX: 1, svgOrigin: `${G.px0} 0`, duration: 0.5, ease: 'power2.out' }, 11)
    .fromTo(q(svg, '.f-hi'), { opacity: 0 }, { opacity: 1, duration: 0.35, stagger: 0.015 }, 11.2)
    .to({}, { duration: 0.6 }, 11.6)

  // story progress: one segment per chapter, filled by the scroll
  const starts = Object.values(tl.labels).sort((a, b) => a - b)
  q<HTMLElement>(root, '.e-tick > i').forEach((fill, k) => {
    const end = starts[k + 1] ?? tl.duration()
    tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: end - starts[k] }, starts[k])
  })

  // captions and header labels follow the chapter
  const caps = q<HTMLElement>(root, '.e-cap')
  const label = one('.e-label')
  const sub = one('.e-sub')
  let prev = -1
  const show = (i: number) => {
    const dir = i >= prev ? 1 : -1
    caps.forEach((c, k) => k !== i && k !== prev && gsap.set(c, { autoAlpha: 0 }))
    if (prev >= 0 && prev !== i) gsap.to(caps[prev], { autoAlpha: 0, y: -16 * dir, duration: motion ? 0.25 : 0, overwrite: true })
    gsap.fromTo(caps[i], { autoAlpha: 0, y: 16 * dir }, { autoAlpha: 1, y: 0, duration: motion ? 0.5 : 0, ease: 'power3.out', overwrite: true })
    if (motion) gsap.fromTo(caps[i].querySelectorAll('.cw'), { yPercent: 110 }, { yPercent: 0, duration: 0.55, stagger: 0.04, ease: 'power3.out', overwrite: true })
    label.textContent = CHAPTERS[i].label
    sub.textContent = CHAPTERS[i].sub
    if (motion) gsap.fromTo([label, sub], { opacity: 0.15 }, { opacity: 1, duration: 0.45, overwrite: true })
    prev = i
  }

  drive(tl, { trigger: root, start: 'top top', end: () => `+=${innerHeight * 7.5}`, pin: true, anticipatePin: 1, invalidateOnRefresh: true }, { motion, onChapter: show, scrub: 1 })
  return tl
}

/* ------------------------------------------------------------------ view */

function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <span key={i} className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
          <span className="cw inline-block">{w}&nbsp;</span>
        </span>
      ))}
    </>
  )
}

export function Engine({ narrow }: { narrow: boolean }) {
  const G = useMemo(() => geometry(narrow), [narrow])
  const paths = useMemo(() => futurePaths(narrow ? 26 : 40), [narrow])
  const tipEl = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<number | null>(null)

  const step = binStep(RANGE)
  const maxCount = Math.max(...RANGE.histogram.map((b) => b.count))
  const binH = G.yv(0) - G.yv(step)
  const histW = G.W - G.px1 - 22
  const tone = (k: number, n: number) => (k < n * 0.2 ? 'stroke-lavender' : k >= n * 0.8 ? 'stroke-mint' : 'stroke-sky')
  const d = tip === null ? null : DEALS[tip]

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = (e.target as Element).closest('[data-deal]')
    if (!g) return setTip(null)
    setTip(Number(g.getAttribute('data-deal')))
    const box = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    if (tipEl.current) tipEl.current.style.transform = `translate(${x > box.width - 250 ? x - 244 : x + 16}px, ${Math.min(y + 16, box.height - 150)}px)`
  }

  return (
    <section id="engine" className="engine relative h-[100svh] overflow-hidden" aria-label="How the forecast is built">
      <div className="mx-auto flex h-full max-w-[1240px] flex-col gap-3 px-4 pb-3 pt-[76px] lg:grid lg:grid-cols-[minmax(300px,0.72fr)_1.4fr] lg:items-center lg:gap-14 lg:px-8 lg:pb-6 lg:pt-20">
        <div data-rise>
          <div className="mb-4 flex gap-1.5 lg:mb-8" aria-hidden>
            {CHAPTERS.map((c) => (
              <span key={c.title} className="e-tick relative h-[3px] flex-1 overflow-hidden rounded-full bg-line">
                <i className="absolute inset-0 origin-left scale-x-0 rounded-full bg-brand" />
              </span>
            ))}
          </div>
          <div className="grid">
            {CHAPTERS.map((c, i) => (
              <div key={c.title} className="e-cap [grid-area:1/1]" style={i ? { visibility: 'hidden' } : undefined}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">{c.kicker}</p>
                <h3 className="mt-2 text-[clamp(1.6rem,3.2vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.035em] lg:mt-4">
                  <Words text={c.title} />
                </h3>
                <p className="mt-2 max-w-[44ch] text-sm text-muted sm:text-base lg:mt-5 lg:text-lg lg:leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div data-rise className="relative min-h-0 flex-1 lg:h-[min(620px,calc(100svh-130px))] lg:flex-none" onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
          <svg viewBox={`0 0 ${G.W} ${G.H}`} className="h-full w-full overflow-visible" preserveAspectRatio={narrow ? 'xMidYMin meet' : 'xMidYMid meet'} role="img" aria-label="Twelve deals turning into a forecast range">
            {/* header */}
            <text className="e-label fill-faint text-[11px] font-semibold uppercase tracking-[0.14em]" x={0} y={18}>{CHAPTERS[0].label}</text>
            <text className="e-sub fill-muted text-[12px]" x={G.W} y={18} textAnchor="end">{CHAPTERS[0].sub}</text>
            <g className="font-head font-bold" style={{ fontSize: narrow ? 38 : 48, letterSpacing: '-0.035em' }}>
              <text className="e-num fill-ink" x={0} y={70}>{money(TOTALS.crm)}</text>
              <text className="e-fut fill-ink" x={0} y={70} opacity={0}>10,000</text>
              <text className="e-rng fill-ink" x={0} y={70} opacity={0}>{money(RANGE.p10)} – {money(RANGE.p90)}</text>
            </g>
            <line x1={0} x2={G.W} y1={88} y2={88} className="stroke-line" />

            {/* cash calendar */}
            <g className="e-cashax" opacity={0}>
              <rect className="fill-brand" fillOpacity={0.07} x={G.xd(0)} y={G.B0 - 2} width={G.xd(WINDOW_DAYS) - G.xd(0)} height={G.B1 - G.B0 + 2} rx={8} />
              <line className="stroke-brand" x1={G.xd(WINDOW_DAYS)} x2={G.xd(WINDOW_DAYS)} y1={G.B0 - 2} y2={G.B1} strokeDasharray="3 4" />
              <text className="fill-brand text-[10px] font-semibold uppercase tracking-[0.12em]" x={G.xd(WINDOW_DAYS) - 6} y={G.B1 - 6} textAnchor="end">{WINDOW_DAYS}-day window</text>
              {[0, 34, 64, 95, 126].map((day) => (
                <text key={day} className="fill-faint text-[10px]" x={G.xd(day)} y={G.B0 - 6} textAnchor="middle">{dayLabel(day)}</text>
              ))}
            </g>

            {/* salesperson groups */}
            {REP_GROUPS.map((g, k) => (
              <text key={g.name} className="e-head fill-muted text-[11px]" x={G.x0} y={G.heads[k]} opacity={0}>
                {g.name} · {g.rep?.label} <tspan className="fill-brand font-semibold">×{g.rep?.score.toFixed(2)}</tspan>
              </text>
            ))}

            {/* the twelve deals */}
            {DEALS.map((d, i) => {
              const b = G.bubbles[i]
              const cy = G.rows[i]
              return (
                <g key={d.name} className="e-deal cursor-pointer" data-deal={i}>
                  <rect className="d-track fill-line" x={G.x0} y={cy - G.bh / 2} width={G.TW} height={G.bh} rx={G.bh / 2} opacity={0} />
                  <rect className="d-tail fill-faint" x={G.xd(d.closeDay)} y={cy - 1} width={0} height={2} opacity={0} />
                  <rect className="d-shape fill-brand stroke-brand" x={b.x - b.r} y={b.y - b.r} width={b.r * 2} height={b.r * 2} rx={b.r} fillOpacity={0.14} strokeOpacity={0.6} strokeWidth={1.25} />
                  <circle className={`d-cash ${d.cashInside ? 'fill-gain' : 'fill-loss'}`} cx={G.xd(d.closeDay)} cy={cy} r={5} opacity={0} />
                  <text className="d-name fill-ink text-[12px] font-medium" x={b.x} y={b.y}>{d.name}</text>
                  <text className="d-pct fill-brand text-[12px] font-semibold" x={b.x} y={b.y + 15}>{pct(d.stagePct)}</text>
                  <text className="d-date fill-muted text-[11px]" x={G.x0 + G.TW + 10} y={cy + 4} opacity={0}>{dayLabel(d.cashDay)}</text>
                  {d.silent > 0 && (
                    <text className="d-tag fill-loss text-[10px] font-semibold" x={G.x0 + G.TW - 8} y={cy + 4} textAnchor="end" opacity={0}>silent {d.silent}d</text>
                  )}
                </g>
              )
            })}

            {/* the simulation */}
            <g className="e-fut-g" opacity={0}>
              {[0, 1e6, 2e6, 3e6].map((v) => (
                <g key={v}>
                  <line className="stroke-line" x1={G.px0} x2={G.W} y1={G.yv(v)} y2={G.yv(v)} />
                  <text className="fill-faint text-[10px]" x={G.px0 - 6} y={G.yv(v) + 3} textAnchor="end">{money(v)}</text>
                </g>
              ))}
              <text className="fill-faint text-[10px]" x={G.px0} y={G.B1 - 6}>Today</text>
              <text className="fill-faint text-[10px]" x={G.px1} y={G.B1 - 6} textAnchor="end">+30 days</text>
              {paths.map((pts, k) => (
                <path
                  key={k}
                  className={`f-path ${k === paths.length >> 1 ? 'stroke-brand' : tone(k, paths.length)}`}
                  d={pts.map(([t, v], j) => `${j ? 'L' : 'M'}${(G.px0 + t * (G.px1 - G.px0)).toFixed(1)},${G.yv(v).toFixed(1)}`).join('')}
                  fill="none"
                  strokeWidth={k === paths.length >> 1 ? 2 : 1.2}
                  strokeOpacity={0.6}
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray="1"
                />
              ))}
              {RANGE.histogram.map((b) => {
                const w = (b.count / maxCount) * histW
                const y = G.yv(b.bin + step / 2)
                return (
                  <g key={b.bin}>
                    <rect className="f-bin fill-brand" fillOpacity={0.5} x={G.px1 + 18} y={y} width={w} height={Math.max(1, binH - 1)} data-w={w} />
                    {b.bin >= RANGE.target && <rect className="f-hi fill-target" opacity={0} x={G.px1 + 18} y={y} width={w} height={Math.max(1, binH - 1)} />}
                  </g>
                )
              })}
              <rect className="f-band fill-brand" x={G.px1 + 3} y={G.yv(RANGE.p90)} width={8} height={G.yv(RANGE.p10) - G.yv(RANGE.p90)} rx={4} />
              <line className="f-mid stroke-ink" x1={G.px1 - 2} x2={G.px1 + 16} y1={G.yv(RANGE.p50)} y2={G.yv(RANGE.p50)} strokeWidth={2.5} strokeLinecap="round" />
              <g className="text-[11px] font-semibold" style={{ paintOrder: 'stroke' }}>
                {([['Best', RANGE.p90], ['Expected', RANGE.p50], ['Worst', RANGE.p10]] as const).map(([k, v]) => (
                  <text key={k} className="f-lbl fill-ink stroke-canvas" strokeWidth={4} x={G.px1 - 8} y={G.yv(v) + 4} textAnchor="end">
                    {k} {money(v)}
                  </text>
                ))}
              </g>
              <g className="f-tgt">
                <line className="stroke-target" x1={G.px0} x2={G.W} y1={G.yv(RANGE.target)} y2={G.yv(RANGE.target)} strokeWidth={1.5} strokeDasharray="5 4" />
                <text className="fill-target text-[11px] font-semibold" x={G.px0 + 6} y={G.yv(RANGE.target) - 7}>Target {money(RANGE.target)}</text>
              </g>
            </g>
          </svg>

          <div
            ref={tipEl}
            aria-hidden
            className={`pointer-events-none absolute left-0 top-0 z-10 w-[228px] rounded-xl border border-line bg-surface p-3 text-xs shadow-pop transition-opacity duration-150 ${d ? 'opacity-100' : 'opacity-0'}`}
          >
            {d && (
              <>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{d.name}</span>
                  <span className="font-mono text-muted">{money(d.value)}</span>
                </p>
                <p className="mt-0.5 text-faint">{d.stage} · {d.rep}</p>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-muted">
                  <dt>Stage %</dt><dd className="text-right font-mono">{pct(d.stagePct)}</dd>
                  <dt>Learned</dt><dd className="text-right font-mono">{pct(d.pLearned)}</dd>
                  <dt>After silence</dt><dd className="text-right font-mono">{pct(d.pDecayed)}</dd>
                  <dt>Calibrated</dt><dd className="text-right font-mono font-semibold text-brand">{pct(d.pWin)}</dd>
                  <dt>Cash lands</dt><dd className={`text-right font-mono ${d.cashInside ? '' : 'text-loss'}`}>{dayLabel(d.cashDay)}</dd>
                </dl>
                <p className="mt-2 border-t border-line pt-2 text-faint">{d.reason}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
