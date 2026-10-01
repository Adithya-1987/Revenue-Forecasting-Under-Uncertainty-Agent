import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Check,
  Database,
  GitCompareArrows,
  Layers,
  Percent,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../auth'
import { figure, money, pct } from '../lib'
import changesMock from '../mocks/changes.json'
import forecast from '../mocks/forecast.json'
import type { CauseType, Changes, Forecast } from '../types'
import { ThemeToggle } from '../components/AppShell'
import { Waterfall } from '../components/charts'
import { CAUSE_LABEL, CAUSE_ORDER, groupCauses } from '../components/Ledger'
import { Logo } from '../components/Logo'
import { RangeBand } from '../components/RangeBand'
import { Button } from '../components/ui'

// Illustrative numbers from the bundled sample company, drawn with the product's own components.
const preview = (forecast as Record<string, Forecast>)['30-bookings']
const changes = changesMock as Changes
const moved = changes.curr_total - changes.prev_total

/** Adds .is-in to every .reveal child once it scrolls into view. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const els = ref.current?.querySelectorAll('.reveal') ?? []
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('is-in'), io.unobserve(e.target))),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return ref
}

/* ------------------------------------------------------------------ content */

interface Module {
  n: number
  icon: LucideIcon
  title: string
  stage: 'Data' | 'Models' | 'Output' | 'Explanation'
  points: string[]
  seen: string
}

const MODULES: Module[] = [
  {
    n: 1,
    icon: Database,
    title: 'Pipeline & history data layer',
    stage: 'Data',
    points: ['Imports open opportunities and historical won/lost deals', 'Tracks every stage change and close-date change', 'Links deals to customers, segments and salespeople'],
    seen: 'Data & targets',
  },
  {
    n: 2,
    icon: Percent,
    title: 'Deal probability model',
    stage: 'Models',
    points: ['Estimates win probability from deal attributes and history, not only stage', 'Adjusts for deal age, inactivity and time in stage', 'Learns the patterns that precede lost deals'],
    seen: 'Deal risk',
  },
  {
    n: 3,
    icon: CalendarClock,
    title: 'Timing & slippage model',
    stage: 'Models',
    points: ['Models sales-cycle length by segment and deal size', 'Estimates the chance a deal slips into a later period', 'Applies seasonality to expected close dates'],
    seen: 'Forecast range',
  },
  {
    n: 4,
    icon: UserCheck,
    title: 'Salesperson calibration',
    stage: 'Models',
    points: ["Compares each salesperson's past forecasts with actual outcomes", 'Corrects for optimism or sandbagging', 'Shows calibration scores per salesperson and team'],
    seen: 'Accuracy',
  },
  {
    n: 5,
    icon: Banknote,
    title: 'Cash-realization adjustment',
    stage: 'Models',
    points: ['Accounts for payment terms and historical payment delays', 'Separates booked revenue from collected revenue', 'Highlights revenue at risk of late collection'],
    seen: 'Forecast range · Cash',
  },
  {
    n: 6,
    icon: Layers,
    title: 'Scenario & range output',
    stage: 'Output',
    points: ['Best, expected and worst case for 30, 60 and 90 days', 'Measures pipeline concentration risk', 'Shows confidence ranges from 10,000 simulated futures'],
    seen: 'Dashboard',
  },
  {
    n: 7,
    icon: GitCompareArrows,
    title: 'Forecast change explanation',
    stage: 'Explanation',
    points: ['Compares the current forecast with the previous one', 'Attributes changes to specific deals, stage moves and model factors', 'Tracks forecast accuracy against actuals over time'],
    seen: 'What changed',
  },
]

const PROBLEMS: { problem: string; detail: string; fix: string; modules: number[] }[] = [
  { problem: 'Stage percentages are invented', detail: '“Proposal = 60%” for a tiny deal and a huge one, a strong rep and a weak one.', fix: 'Win probability is learned from your own won and lost history, deal by deal.', modules: [1, 2] },
  { problem: 'Dead deals still count', detail: 'A deal silent for six weeks still carries its stage percentage.', fix: 'Probability decays with inactivity and time stuck in stage, and slippage is modelled.', modules: [2, 3] },
  { problem: 'Every rep is trusted equally', detail: 'Optimists over-promise and sandbaggers under-promise; the formula ignores both.', fix: 'Each salesperson is scored against what they actually closed, and corrected.', modules: [4] },
  { problem: 'Signed is not paid', detail: 'A deal booked today on 60-day terms is not cash in 30 days.', fix: 'Payment terms and each customer’s real payment delay move cash to its true date.', modules: [5] },
  { problem: 'One number hides the risk', detail: 'A single total says nothing about how likely it is, or what it depends on.', fix: 'A best / expected / worst range, the chance of hitting target, and concentration risk.', modules: [6] },
  { problem: 'Nobody can say why it moved', detail: 'Last week ₹2.4M, this week ₹1.92M, and no explanation.', fix: 'Every change is attributed to named deals and causes, and the lines add up exactly.', modules: [7] },
]

const STAGES: { name: Module['stage']; note: string }[] = [
  { name: 'Data', note: 'Deals plus their full event history' },
  { name: 'Models', note: 'Will it close, when, and when is it paid' },
  { name: 'Output', note: '10,000 simulated futures become a range' },
  { name: 'Explanation', note: 'Each run is compared with the last' },
]

/* ------------------------------------------------------------------ pieces */

const Section = ({ id, eyebrow, title, sub, children, tone = 'surface' }: { id?: string; eyebrow: string; title: string; sub?: ReactNode; children: ReactNode; tone?: 'surface' | 'canvas' }) => (
  <section id={id} className={`scroll-mt-16 border-t border-line px-5 py-20 sm:py-24 ${tone === 'canvas' ? 'bg-rail' : 'bg-canvas'}`}>
    <div className="mx-auto max-w-[1160px]">
      <div className="reveal max-w-[720px]">
        <p className="text-sm font-semibold text-brand">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-semibold">{title}</h2>
        {sub && <p className="mt-4 text-pretty text-lg text-muted">{sub}</p>}
      </div>
      <div className="mt-12">{children}</div>
    </div>
  </section>
)

const ModuleTag = ({ n }: { n: number }) => (
  <a href={`#module-${n}`} className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand hover:underline">
    Module {n}
  </a>
)

/** Hero product preview: the range, three headline figures, and the first lines of "why it moved". */
function HeroPreview() {
  const lines = groupCauses(changes).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 4)
  return (
    <div className="card overflow-hidden shadow-pop">
      <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="size-2 rounded-full bg-gain" /> 30-day bookings forecast
        </span>
        <span className="text-xs text-faint">Sample company</span>
      </div>
      <div className="px-6 pb-2 pt-6">
        <RangeBand low={preview.p10} mid={preview.p50} high={preview.p90} target={preview.target} />
      </div>
      <div className="grid grid-cols-3 divide-x divide-line border-y border-line text-center">
        {[
          ['Chance of target', pct(preview.prob_hit_target), ''],
          ['Top 3 deals carry', pct(preview.top3_share), ''],
          ['Moved since last run', money(moved), 'text-loss'],
        ].map(([k, v, tone]) => (
          <div key={k} className="px-3 py-3">
            <p className="text-xs text-faint">{k}</p>
            <p className={`mt-0.5 font-semibold ${tone}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="px-5 py-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Why it moved</p>
        <ul className="divide-y divide-line text-sm">
          {lines.map((g) => (
            <li key={g.type} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0 truncate">
                <span className="font-medium">{CAUSE_LABEL[g.type][0]}</span>
                <span className="ml-2 text-xs text-muted">{g.items.length === 1 ? g.items[0].deal_name : `${g.items.length} deals`}</span>
              </span>
              <span className={`shrink-0 font-mono text-sm ${g.amount < 0 ? 'text-loss' : 'text-gain'}`}>{figure(g.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function LandingPage() {
  const { session } = useAuth()
  const root = useReveal()
  const [open, setOpen] = useState<CauseType | null>(null)
  useEffect(() => void (document.title = 'Rangefinder · Revenue forecasting under uncertainty'), [])
  const primary = session ? { to: '/app', label: 'Open dashboard' } : { to: '/login?mode=signup', label: 'Get started' }
  const ledger = groupCauses(changes).filter((g) => !open || g.type === open)

  return (
    <div ref={root} className="bg-canvas">
      {/* ---------------------------------------------------------------- header */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1160px] items-center justify-between gap-4 px-5">
          <Link to="/" aria-label="Rangefinder home" className="rounded-md">
            <Logo size={30} wordClass="text-[18px]" />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 text-sm text-muted lg:flex">
            <a href="#problem" className="hover:text-ink">The problem</a>
            <a href="#modules" className="hover:text-ink">How it works</a>
            <a href="#explain" className="hover:text-ink">Why it changed</a>
            <a href="#accuracy" className="hover:text-ink">Accuracy</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {!session && <Button to="/login" variant="ghost" className="hidden sm:inline-flex">Sign in</Button>}
            <Button to={primary.to}>{primary.label}</Button>
          </div>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------------------- hero */}
        <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:pt-20">
          <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,#000,transparent_85%)]" />
          <div className="relative mx-auto grid max-w-[1160px] items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div className="page-enter">
              <p className="inline-flex items-center rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted">
                Revenue forecasting under uncertainty
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-[-0.03em] lg:text-[44px] xl:text-[50px]">
                Forecast revenue as a range.
                <br />
                <span className="text-brand">Explain every change.</span>
              </h1>
              <p className="mt-5 max-w-[56ch] text-pretty text-lg text-muted">
                Rangefinder replaces the stage-percentage forecast. It models every deal — will it close, when, and when the cash arrives —
                and simulates your pipeline 10,000 times. Every run is saved, so when the number moves you see exactly which deals moved it.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button to={primary.to} size="lg" arrow>{primary.label}</Button>
                <a href="#modules" className="btn btn-secondary btn-lg">See how it works</a>
              </div>
              <ul className="mt-8 grid max-w-[520px] grid-cols-1 gap-2 text-sm text-muted sm:grid-cols-2">
                {['30 / 60 / 90-day horizons', 'Bookings and collected cash', 'Every change attributed', 'Backtested against actuals'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check size={16} aria-hidden className="text-brand" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="page-enter [animation-delay:120ms]">
              <HeroPreview />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- problem → fix */}
        <Section
          id="problem"
          tone="canvas"
          eyebrow="The problem"
          title="Why the standard CRM forecast is wrong"
          sub={<>Most teams forecast with <span className="font-mono text-base text-ink">Σ deal value × stage %</span>. One number comes out, and it is almost always wrong. Here is each failure, and the module that fixes it.</>}
        >
          <div className="reveal card overflow-hidden">
            <div className="hidden grid-cols-[1fr_1.2fr_7rem] gap-6 border-b border-line bg-surface-2/70 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-faint md:grid">
              <span>What goes wrong</span>
              <span>How Rangefinder solves it</span>
              <span className="text-right">Solved by</span>
            </div>
            <ul className="divide-y divide-line">
              {PROBLEMS.map((p) => (
                <li key={p.problem} className="grid gap-3 px-6 py-5 md:grid-cols-[1fr_1.2fr_7rem] md:gap-6">
                  <div>
                    <p className="font-semibold">{p.problem}</p>
                    <p className="mt-1 text-sm text-muted">{p.detail}</p>
                  </div>
                  <p className="flex gap-2 text-sm md:pt-0.5">
                    <ArrowRight size={16} aria-hidden className="mt-0.5 hidden shrink-0 text-brand md:block" />
                    {p.fix}
                  </p>
                  <div className="flex flex-wrap content-start gap-1.5 md:justify-end">
                    {p.modules.map((n) => <ModuleTag key={n} n={n} />)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- modules */}
        <Section
          id="modules"
          eyebrow="How it works"
          title="Seven modules, one direction of flow"
          sub="Raw pipeline history becomes honest per-deal numbers, those become a simulated range, and every run is kept so the next one can be explained."
        >
          <ol className="reveal grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STAGES.map((s, i) => {
              const mods = MODULES.filter((m) => m.stage === s.name)
              return (
                <li key={s.name} className="relative rounded-card border border-line bg-surface p-4 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-wide text-faint">Step {i + 1}</p>
                  <p className="mt-1 font-semibold">{s.name}</p>
                  <p className="text-sm text-muted">{s.note}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {mods.map((m) => <ModuleTag key={m.n} n={m.n} />)}
                  </div>
                  {i < STAGES.length - 1 && (
                    <span aria-hidden className="absolute -right-[15px] top-1/2 z-10 hidden size-6 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-faint lg:grid">
                      <ArrowRight size={13} />
                    </span>
                  )}
                </li>
              )
            })}
          </ol>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m, i) => (
              <article
                key={m.n}
                id={`module-${m.n}`}
                className={`reveal card card-pad scroll-mt-24 ${m.n === 7 ? 'border-brand/50' : ''}`}
                style={{ '--d': `${(i % 3) * 70}ms` } as React.CSSProperties}
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg border border-line bg-surface-2 text-brand">
                    <m.icon size={18} aria-hidden />
                  </span>
                  <span className="text-xs font-semibold tracking-wide text-faint">
                    MODULE {m.n} · {m.stage.toUpperCase()}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{m.title}</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  {m.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-brand" />
                      {p}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-line pt-3 text-xs text-faint">
                  In the app: <span className="font-medium text-ink">{m.seen}</span>
                </p>
              </article>
            ))}
            <div className="reveal flex flex-col justify-center rounded-card border border-dashed border-line p-6 text-sm text-muted">
              <p className="font-semibold text-ink">The hard part</p>
              <p className="mt-1">The system must explain why the forecast changed. Module 7 is where that happens.</p>
              <a href="#explain" className="link mt-3 inline-flex w-fit items-center gap-1">
                See how <ArrowRight size={14} aria-hidden />
              </a>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- the hard part */}
        <Section
          id="explain"
          tone="canvas"
          eyebrow="The hard part"
          title="The system must explain why the forecast changed"
          sub="Every run freezes a snapshot of every deal. To compare two runs we start from last week's state, apply one kind of change at a time in a fixed order, and re-forecast after each step. What each step moves is attributed to the deals that caused it."
        >
          <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
            <div className="reveal space-y-6">
              <div className="card card-pad">
                <p className="text-sm font-semibold">The fixed attribution order</p>
                <ol className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {CAUSE_ORDER.map((c, i) => (
                    <li key={c} className="flex items-center gap-2.5">
                      <span className="grid size-5 shrink-0 place-items-center rounded bg-surface-2 text-2xs font-semibold text-muted ring-1 ring-inset ring-line">{i + 1}</span>
                      {CAUSE_LABEL[c][0]}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                  Interaction effects fall into later steps. Whatever the order cannot assign is reported as an interaction residual — shown, never hidden.
                </p>
              </div>
              <ul className="space-y-3 text-sm">
                {[
                  ['Adds up exactly', 'The causes plus the residual always equal the total change.'],
                  ['Residual under 5%', 'Kept small and displayed openly as a credibility check.'],
                  ['Names the right deal', 'Push one deal’s close date and re-run: that deal, and only that deal, is named.'],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-gain/10 text-gain">
                      <Check size={13} strokeWidth={3} aria-hidden />
                    </span>
                    <span>
                      <span className="font-semibold">{t}.</span> <span className="text-muted">{d}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="reveal card card-pad" style={{ '--d': '100ms' } as React.CSSProperties}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">30-day forecast, last run → this run</p>
                <p className="font-mono text-sm">
                  {money(changes.prev_total)} → {money(changes.curr_total)} <span className="text-loss">({money(moved)})</span>
                </p>
              </div>
              <p className="mt-1 text-xs text-muted">Select a bar to see the deals behind it.</p>
              <div className="mt-4">
                <Waterfall changes={changes} selected={open} onSelect={(t) => setOpen((o) => (o === t ? null : t))} />
              </div>
              <div className="mt-2 border-t border-line pt-2">
                {ledger.map((g) =>
                  g.items.map((x) => (
                    <p key={x.deal_id ?? x.description} className="write-in flex items-baseline justify-between gap-4 py-1.5 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{x.deal_name ?? 'All deals'}</span>
                        <span className="text-muted"> · {x.description}</span>
                      </span>
                      <span className={`shrink-0 font-mono ${x.amount < 0 ? 'text-loss' : 'text-gain'}`}>{figure(x.amount)}</span>
                    </p>
                  )),
                )}
                {!open && (
                  <p className="flex items-baseline justify-between gap-4 border-t border-line pt-2 text-sm text-muted">
                    <span>Interaction residual</span>
                    <span className="font-mono">{figure(changes.residual)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- accuracy */}
        <Section
          id="accuracy"
          eyebrow="Proof"
          title="Backtested, so you know how far to trust it"
          sub="Past forecasts are replayed using only the data known at the time, then compared with what actually closed."
        >
          <dl className="reveal grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
            {[
              ['2.8×', 'lower error than the stage-% method'],
              ['83%', 'of actuals landed inside the forecast range (goal 80%)'],
              ['11%', 'mean absolute error at 30 days'],
              ['−3%', 'bias: forecasts run very slightly low'],
            ].map(([v, l]) => (
              <div key={l} className="bg-surface p-6">
                <dt className="sr-only">{l}</dt>
                <dd className="text-3xl font-semibold tracking-tight">{v}</dd>
                <dd className="mt-1 text-sm text-muted">{l}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-faint">Figures from the bundled sample company’s backtest.</p>
        </Section>

        {/* ---------------------------------------------------------------- CTA */}
        <section className="border-t border-line bg-rail px-5 py-20">
          <div className="reveal mx-auto flex max-w-[1160px] flex-col items-start justify-between gap-6 rounded-card border border-line bg-surface p-8 shadow-card sm:p-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold">See it on a sample company in under a minute</h2>
              <p className="mt-2 max-w-[56ch] text-muted">Two years of history, 150 open deals and a week of changes. No CRM connection needed — upload a CSV when you are ready.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button to={session ? '/app/data' : '/login?mode=signup'} size="lg" arrow>
                {session ? 'Go to data' : 'Create your workspace'}
              </Button>
              {!session && <Button to="/login" size="lg" variant="secondary">Sign in</Button>}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-rail px-5 py-8">
        <div className="mx-auto flex max-w-[1160px] flex-col items-start justify-between gap-3 text-sm text-muted sm:flex-row sm:items-center">
          <Logo size={26} wordClass="text-[16px]" />
          <p>Open-source revenue forecasting. Your data stays in your workspace.</p>
        </div>
      </footer>
    </div>
  )
}
