import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownToLine, ArrowUpToLine, Banknote, BookOpenCheck, CircleDot, Target } from 'lucide-react'
import { api } from '../api/client'
import { money, pct, shortDate, useApi, useRun } from '../lib'
import type { Basis, Forecast, Horizon } from '../types'
import { PageHeader } from '../components/AppShell'
import { FanLanding, ShareBars } from '../components/charts'
import { PageSkeleton } from '../components/Loaders'
import { RangeBand } from '../components/RangeBand'
import { Button, Card, DeltaBadge, ErrorNote, RingGauge, Segmented, StatCard } from '../components/ui'

const HORIZONS = [30, 60, 90].map((h) => ({ value: h as Horizon, label: `${h} days` }))
const BASES = [
  { value: 'bookings' as Basis, label: 'Bookings', icon: BookOpenCheck },
  { value: 'cash' as Basis, label: 'Cash', icon: Banknote },
]

/** Last run's range above this run's, on one scale: the move reads as a shift, not a number. */
function RunCompare({ f }: { f: Forecast }) {
  if (!f.prev) return <p className="text-sm text-muted">This is the first run. The next one draws here, on the same scale as this one.</p>
  const domain: [number, number] = [Math.min(f.prev.p10, f.p10) * 0.9, Math.max(f.prev.p90, f.p90) * 1.05]
  return (
    <dl className="space-y-4 text-sm">
      {[
        ['Last run', f.prev],
        ['This run', f],
      ].map(([name, r]) => {
        const v = r as { p10: number; p50: number; p90: number }
        return (
          <div key={name as string}>
            <dt className="mb-2 flex justify-between text-xs text-muted">
              <span>{name as string}</span>
              <span className="font-medium text-ink">{money(v.p10)} – {money(v.p90)}</span>
            </dt>
            <dd><RangeBand size="card" low={v.p10} mid={v.p50} high={v.p90} domain={domain} /></dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Booked revenue that lands after the window, and invoices already past their terms. */
function CashRisk({ f }: { f: Forecast }) {
  const c = f.cash_risk
  if (!c) return null
  return (
    <Card className="write-in" title="Revenue at risk of late collection" sub={`Next ${f.horizon} days · from each customer's payment terms and payment history`}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr_1.4fr]">
        <div>
          <p className="text-xs text-muted">Booked in the window, paid after it</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{money(c.booked_paid_later)}</p>
          <p className="mt-1 text-xs text-muted">expected value</p>
        </div>
        <div>
          <p className="text-xs text-muted">Invoices already overdue</p>
          <p className={`mt-1 text-2xl font-semibold tracking-tight ${c.overdue_count ? 'text-loss' : ''}`}>{money(c.overdue_receivables)}</p>
          <p className="mt-1 text-xs text-muted">{c.overdue_count} unpaid past their terms</p>
        </div>
        <ul className="divide-y divide-line text-sm">
          {c.top.slice(0, 4).map((t) => (
            <li key={t.name + t.kind} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.name}</span>
                <span className={`text-xs ${t.kind.includes('overdue') ? 'text-loss' : 'text-muted'}`}>{t.kind}</span>
              </span>
              <span className="shrink-0 font-medium">{money(t.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

export default function ForecastPage() {
  const [params] = useSearchParams()
  const [horizon, setHorizon] = useState<Horizon>(([30, 60, 90].includes(Number(params.get('horizon'))) ? Number(params.get('horizon')) : 30) as Horizon)
  const [basis, setBasis] = useState<Basis>(params.get('basis') === 'cash' ? 'cash' : 'bookings')
  const { runId } = useRun()
  const { data: f, error, retry } = useApi(() => api.forecast(horizon, basis), [horizon, basis, runId])
  const gap = f ? f.p50 - f.target : 0
  const delta = f?.prev ? f.p50 / f.prev.p50 - 1 : undefined

  return (
    <>
      <PageHeader
        title="Your revenue, as a range"
        sub="Ten thousand simulated futures of your open pipeline, not one hopeful number."
        actions={
          <>
            <Segmented label="Horizon" options={HORIZONS} value={horizon} onChange={setHorizon} />
            <Segmented label="Basis" options={BASES} value={basis} onChange={setBasis} />
          </>
        }
      />

      {error && <ErrorNote retry={retry}>Forecast did not load. {error}</ErrorNote>}
      {!f && !error && <PageSkeleton label="Loading forecast" variant="chart" />}
      {f && (
        <div className="space-y-6">
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard i={0} label="Worst case · P10" icon={ArrowDownToLine} value={f.p10} format={money} foot="9 in 10 futures land above this" />
            <StatCard i={1} label="Expected outcome · P50" icon={CircleDot} value={f.p50} format={money} foot={delta != null ? <><DeltaBadge value={delta} /> vs last run</> : 'First run'} />
            <StatCard i={2} label="Best case · P90" icon={ArrowUpToLine} value={f.p90} format={money} foot="1 in 10 futures land above this" />
            <StatCard
              i={3}
              label="Chance of hitting target"
              icon={Target}
              value={f.prob_hit_target}
              format={(n) => pct(n)}
              visual={<RingGauge value={f.prob_hit_target} label={`${pct(f.prob_hit_target)} chance of reaching ${money(f.target)}`} />}
              foot={<>Target {money(f.target)}</>}
            />
          </div>

          <Card
            className="write-in"
            title={`${f.horizon}-day ${f.basis === 'cash' ? 'cash collected' : 'bookings'}`}
            sub={`As of ${shortDate(f.as_of)} · 10,000 simulated futures`}
            action={
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-brand/40" /> Middle half</li>
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-brand/15" /> 8 in 10</li>
                <li className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-target" /> Target</li>
              </ul>
            }
          >
            <div className="px-2 pt-2 sm:px-6">
              <RangeBand low={f.p10} mid={f.p50} high={f.p90} target={f.target} />
            </div>
            <div className="mt-4 border-t border-line pt-5">
              <FanLanding f={f} />
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="write-in" title="Run over run" sub="Same horizon and basis, one scale">
              <RunCompare f={f} />
            </Card>
            <Card className="write-in" title="Gap to target" sub="At the median outcome">
              <p className={`font-head text-3xl font-bold ${gap >= 0 ? 'text-gain' : 'text-loss'}`}>
                {gap >= 0 ? '+' : '−'}
                {money(Math.abs(gap))}
              </p>
              <p className="mt-2 text-sm text-muted">
                {gap >= 0 ? 'The median future clears the target.' : `The median future falls short of ${money(f.target)}.`}
                {f.top_deal && <> Biggest single risk: <strong className="font-semibold text-ink">{f.top_deal}</strong>.</>}
              </p>
              <Button to="/app/risk" variant="secondary" arrow className="mt-5">See deals at risk</Button>
            </Card>
            <Card className="write-in" title="Where it is concentrated" sub={`Top 3 deals carry ${pct(f.top3_share)} of expected revenue`}>
              {f.top_deals?.length ? <ShareBars items={f.top_deals} format={(n) => pct(n, 1)} /> : <p className="text-sm text-muted">No single deal dominates.</p>}
              {f.concentration?.largest && f.concentration.effective_deals && (
                <p className="mt-4 text-xs text-muted">
                  Spread like {Math.round(f.concentration.effective_deals)} equal-sized deals. If {f.concentration.largest.name} slips out of the window,
                  the expected figure falls {pct(f.concentration.largest.share)} ({money(f.concentration.largest.expected)}).
                </p>
              )}
            </Card>
          </div>

          <CashRisk f={f} />
        </div>
      )}
    </>
  )
}
