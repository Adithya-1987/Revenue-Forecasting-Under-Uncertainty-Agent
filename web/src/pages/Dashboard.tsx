import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { figure, money, pct, shortDate, useApi, useRun } from '../lib'
import type { Basis } from '../types'
import { ChatBox } from '../components/ChatBox'
import { CAUSE_LABEL, groupCauses } from '../components/Ledger'
import { FanLanding } from '../components/charts'
import { PillTabs } from '../components/PillNav'
import { RangeBand } from '../components/RangeBand'
import { Stage } from '../components/Stage'
import { DeltaBadge, ErrorNote, HighlightWord, ReasonChip, RingGauge, Skeleton } from '../components/ui'

const More = ({ to, children }: { to: string; children: string }) => (
  <Link to={to} className="group inline-flex items-center gap-1 text-sm font-medium text-forest">
    {children}
    <ArrowRight aria-hidden size={15} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
  </Link>
)

/** One figure in the strip; a rule separates it from its neighbour. */
const Figure = ({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) => (
  <div className="px-4 py-4">
    <p className="text-xs text-ink/70">{label}</p>
    <div className="mt-1 flex items-center gap-3">{children}</div>
    {sub && <div className="mt-1 text-xs text-ink/70">{sub}</div>}
  </div>
)

export default function DashboardPage() {
  const { me } = useAuth()
  const { runId } = useRun()
  const [basis, setBasis] = useState<Basis>('bookings')
  const { data: f, error } = useApi(() => api.forecast(30, basis), [basis, runId])
  const { data: ch } = useApi(() => api.changes(30, basis), [basis, runId])
  const { data: risk } = useApi(() => api.risk(), [runId])
  const { data: acc } = useApi(() => api.accuracy().catch(() => undefined), [runId])

  const total = ch ? ch.curr_total - ch.prev_total : 0
  const reasons = ch ? groupCauses(ch).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 3) : []

  return (
    <Stage
      title={<>This week at a <HighlightWord>glance</HighlightWord></>}
      sub={`${me?.workspace?.name ?? 'Your workspace'} · next 30 days${f ? ` · as of ${shortDate(f.as_of)}` : ''}. Where you will land, why it moved, and who to call.`}
      controls={
        <PillTabs
          label="Basis"
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'bookings', label: 'Bookings' },
            { value: 'cash', label: 'Cash' },
          ]}
        />
      }
      frameLabel="Dashboard"
      after={<ChatBox />}
    >
      {error && <ErrorNote>The dashboard did not load. {error}</ErrorNote>}
      {!f && !error && <Skeleton label="Loading dashboard" />}
      {f && (
        <>
          <div className="grid grid-cols-2 border-b border-hair lg:grid-cols-4 lg:divide-x lg:divide-hair">
            <Figure label="Median outcome" sub={f.prev ? <DeltaBadge value={f.p50 / f.prev.p50 - 1} /> : 'First run'}>
              <span className="font-head text-xl font-bold">{money(f.p50)}</span>
            </Figure>
            <Figure label="Chance of hitting target" sub={`Target ${money(f.target)}`}>
              <span className="font-head text-xl font-bold">{pct(f.prob_hit_target)}</span>
              <RingGauge value={f.prob_hit_target} label={`${pct(f.prob_hit_target)} chance of reaching ${money(f.target)}`} />
            </Figure>
            <Figure label="Moved since last run" sub={ch?.prev_run_id ? `${money(ch.prev_total)} to ${money(ch.curr_total)}` : 'Upload next week to compare'}>
              <span className={`font-head text-xl font-bold ${total < 0 ? 'text-loss' : total > 0 ? 'text-gain' : ''}`}>
                {ch?.prev_run_id ? `${total >= 0 ? '+' : '−'}${money(Math.abs(total))}` : '—'}
              </span>
            </Figure>
            <Figure label="Past forecasts inside the range" sub={acc ? 'Goal 80%' : 'Builds up as history grows'}>
              <span className="font-head text-xl font-bold">{acc?.coverage != null ? pct(acc.coverage) : '—'}</span>
            </Figure>
          </div>

          <div className="mt-8 px-2 sm:px-6">
            <RangeBand low={f.p10} mid={f.p50} high={f.p90} target={f.target} />
          </div>

          <figure className="mt-6 border-t border-hair pt-6">
            <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">How the next 30 days open up, and where they land</span>
              <More to="/app/forecast">Full forecast</More>
            </figcaption>
            <FanLanding f={f} />
          </figure>

          <div className="mt-8 grid gap-8 border-t border-hair pt-6 lg:grid-cols-2 lg:gap-10">
            <section aria-labelledby="why">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 id="why" className="font-head text-lg font-bold">Why it moved</h2>
                <More to="/app/changes">All causes</More>
              </div>
              {reasons.length ? (
                <ol className="divide-y divide-hair">
                  {reasons.map((g) => (
                    <li key={g.type} className="flex items-baseline justify-between gap-4 py-3">
                      <span>
                        <span className="block font-medium">{CAUSE_LABEL[g.type][0]}</span>
                        <span className="text-xs text-ink/70">
                          {g.items.length === 1 ? g.items[0].deal_name : `${g.items.length} deals`}
                        </span>
                      </span>
                      <span className={`font-mono text-sm ${g.amount < 0 ? 'text-loss' : 'text-gain'}`}>{figure(g.amount)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink/70">This is the first forecast. Upload next week's pipeline and this lists what moved the number.</p>
              )}
            </section>

            <section aria-labelledby="call">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 id="call" className="font-head text-lg font-bold">Call first</h2>
                <More to="/app/risk">All deals at risk</More>
              </div>
              <ol className="divide-y divide-hair">
                {(risk ?? []).slice(0, 5).map((d) => (
                  <li key={d.deal_id} className="flex items-center justify-between gap-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{d.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {d.reasons.slice(0, 2).map((r) => <ReasonChip key={r}>{r}</ReasonChip>)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-medium text-loss">{money(d.expected_damage)}</span>
                      <span className="text-xs text-ink/70">{pct(d.p_win)} to win</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}
    </Stage>
  )
}
