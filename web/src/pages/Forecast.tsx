import { useState } from 'react'
import { api } from '../api/client'
import { money, pct, shortDate, useApi, useRun } from '../lib'
import type { Basis, Forecast, Horizon } from '../types'
import { RangeBand } from '../components/RangeBand'
import { FanLanding } from '../components/charts'
import { Stage } from '../components/Stage'
import { PillTabs } from '../components/PillNav'
import { ErrorNote, HighlightWord, PillButton, RingGauge, Skeleton, StatFloat } from '../components/ui'

const HORIZONS = [30, 60, 90].map((h) => ({ value: h as Horizon, label: `${h} days` }))
const BASES = [
  { value: 'bookings' as Basis, label: 'Bookings' },
  { value: 'cash' as Basis, label: 'Cash' },
]

/** Last run's range above this run's, on one scale: the move reads as a shift, not a number. */
function RunCompare({ f }: { f: Forecast }) {
  if (!f.prev) return null
  const domain: [number, number] = [Math.min(f.prev.p10, f.p10) * 0.9, Math.max(f.prev.p90, f.p90) * 1.05]
  return (
    <dl className="mt-3 space-y-2 border-t border-hair pt-3 text-xs">
      {[
        ['Last run', f.prev],
        ['This run', f],
      ].map(([name, r]) => {
        const v = r as { p10: number; p50: number; p90: number }
        return (
          <div key={name as string} className="grid grid-cols-[52px_1fr] items-center gap-2">
            <dt className="text-ink/70">{name as string}</dt>
            <dd><RangeBand size="card" low={v.p10} mid={v.p50} high={v.p90} domain={domain} /></dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Where the expected revenue is concentrated: named deals, share bars from zero. */
function TopDeals({ f }: { f: Forecast }) {
  const deals = f.top_deals ?? []
  if (!deals.length) return null
  const max = Math.max(...deals.map((d) => d.share))
  return (
    <div>
      <h2 className="text-lg">
        Top 3 deals carry <strong className="font-head">{pct(f.top3_share)}</strong> of expected revenue
      </h2>
      <ul className="mt-4 space-y-2.5">
        {deals.map((d) => (
          <li key={d.name} className="grid grid-cols-[minmax(0,160px)_1fr_48px] items-center gap-3 text-sm">
            <span className="truncate">{d.name}</span>
            <span aria-hidden className="h-2 rounded-full bg-white/15">
              <span className="block h-2 rounded-full bg-lime" style={{ width: `${(d.share / max) * 100}%` }} />
            </span>
            <span className="text-right">{pct(d.share, 1)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ForecastPage() {
  const [horizon, setHorizon] = useState<Horizon>(30)
  const [basis, setBasis] = useState<Basis>('bookings')
  const { runId } = useRun()
  const { data: f, error } = useApi(() => api.forecast(horizon, basis), [horizon, basis, runId])
  const gap = f ? f.p50 - f.target : 0
  const delta = f?.prev ? f.p50 / f.prev.p50 - 1 : undefined

  return (
    <Stage
      title={<>Your revenue, as a <HighlightWord>range</HighlightWord></>}
      sub="Ten thousand simulated futures of your open pipeline, not one hopeful number."
      controls={
        <>
          <PillTabs label="Horizon" options={HORIZONS} value={horizon} onChange={setHorizon} />
          <PillTabs label="Basis" options={BASES} value={basis} onChange={setBasis} />
        </>
      }
      frameLabel="Live forecast"
      floats={
        f && (
          <>
            <StatFloat className="xl:absolute xl:-left-28 xl:top-36 xl:w-[220px]" label="Median outcome" value={money(f.p50)} delta={delta}>
              <RunCompare f={f} />
            </StatFloat>
            <StatFloat
              className="xl:absolute xl:-right-20 xl:top-16"
              label="Chance of hitting target"
              value={pct(f.prob_hit_target)}
              note={`Target ${money(f.target)}`}
              visual={<RingGauge value={f.prob_hit_target} label={`${pct(f.prob_hit_target)} chance of reaching ${money(f.target)}`} />}
            />
          </>
        )
      }
      after={
        f && (
          <div className="grid gap-8 border-t border-white/25 pt-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <TopDeals f={f} />
            <div className="flex flex-col gap-4 lg:items-end lg:text-right">
              <p className="text-lg">
                Gap to target at the median:{' '}
                <strong className="font-head">{gap >= 0 ? '+' : '−'}{money(Math.abs(gap))}</strong>
                {f.top_deal && <span className="block text-base text-white/90">Biggest risk: {f.top_deal}. Call them first.</span>}
              </p>
              <PillButton to="/app/risk" variant="secondary">See deals at risk</PillButton>
            </div>
          </div>
        )
      }
    >
      {error && <ErrorNote>Forecast did not load. {error}</ErrorNote>}
      {!f && !error && <Skeleton label="Loading forecast" />}
      {f && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-head text-lg font-bold">
              {f.horizon}-day {f.basis === 'cash' ? 'cash collected' : 'bookings'}
            </h2>
            <p className="text-xs text-ink/70">As of {shortDate(f.as_of)} · 10,000 simulated futures</p>
          </div>
          <div className="mt-8 px-2 sm:px-6">
            <RangeBand low={f.p10} mid={f.p50} high={f.p90} target={f.target} />
          </div>
          <figure className="mt-8 border-t border-hair pt-6">
            <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">How the range opens up, and where it lands</span>
              <span className="text-xs text-ink/70">
                Dark band: middle half of futures · light band: 8 in 10 · green: reach the target
              </span>
            </figcaption>
            <FanLanding f={f} />
          </figure>
        </>
      )}
    </Stage>
  )
}
