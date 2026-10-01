import { BellRing, CalendarRange, Trophy, Undo2, Users } from 'lucide-react'
import { api } from '../api/client'
import { money, pct, useApi, useRun } from '../lib'
import { PageHeader } from '../components/AppShell'
import { ChatBox } from '../components/ChatBox'
import { PageSkeleton } from '../components/Loaders'
import { Card, EmptyState, ErrorNote, StatCard } from '../components/ui'

/** Manager page: the facts a marketer needs, then an agent that turns them into campaigns. */
export default function ManagerPage() {
  const { runId } = useRun()
  const { data, error, retry } = useApi(() => api.marketingInfo(), [runId])
  const c = data?.context
  const best = c?.segments.filter((x) => x.win_rate != null).sort((a, b) => (b.win_rate ?? 0) * b.avg_won_deal - (a.win_rate ?? 0) * a.avg_won_deal)[0]
  const gap = c?.next_90_days?.gap_to_target

  return (
    <>
      <PageHeader
        title="Grow the pipeline"
        sub="Where to promote, to whom and when, worked out from your own wins, losses and seasons. Then ask the growth agent for the campaign."
      />

      {error && <ErrorNote retry={retry}>The growth overview did not load. {error}</ErrorNote>}
      {!c && !error && <PageSkeleton label="Loading growth overview" variant="table" />}
      {c && (
        <div className="space-y-6">
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              i={0}
              label="Best segment to promote"
              icon={Trophy}
              value={best?.segment ?? '—'}
              foot={best ? `${pct(best.win_rate ?? 0)} win rate · ${money(best.avg_won_deal)} average deal` : 'Needs closed deals per segment'}
            />
            <StatCard
              i={1}
              label="Promote before"
              icon={CalendarRange}
              value={c.strongest_months.map((m) => m.month).join(', ') || '—'}
              foot="Your strongest closing months"
            />
            <StatCard
              i={2}
              label="Quiet deals to re-engage"
              icon={BellRing}
              value={c.quiet_open_deals.activity_tracked ? c.quiet_open_deals.quiet_open_deals : '—'}
              foot={c.quiet_open_deals.activity_tracked ? `${money(c.quiet_open_deals.quiet_value)} silent 14+ days` : 'No activity log, so silence cannot be measured'}
            />
            <StatCard
              i={3}
              label="Lost in the last 90 days"
              icon={Undo2}
              value={c.recently_lost.lost_last_90_days}
              tone={c.recently_lost.lost_last_90_days ? 'loss' : 'ink'}
              foot={`${money(c.recently_lost.lost_value)} to win back`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card pad={false} className="write-in overflow-hidden" title="Who buys, and how fast" sub="Win rate, deal size and cycle by segment">
              <div className="overflow-x-auto px-4 pb-2 sm:px-6">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-faint">
                      {['Segment', 'Win rate', 'Average deal', 'Days to win', 'Open pipeline'].map((h, i) => (
                        <th key={h} scope="col" className={`py-3 pr-4 font-medium last:pr-0 ${i ? 'text-right' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.segments.map((s, i) => (
                      <tr key={s.segment} className="write-in border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/70" style={{ animationDelay: `${i * 50}ms` }}>
                        <th scope="row" className="py-3 pr-4 text-left font-medium">
                          {s.segment}
                          {s.segment === best?.segment && <span className="chip chip-brand ml-2 !py-0 text-2xs">Best</span>}
                        </th>
                        <td className="py-3 pr-4 text-right">{s.win_rate != null ? pct(s.win_rate) : '—'}</td>
                        <td className="py-3 pr-4 text-right">{money(s.avg_won_deal)}</td>
                        <td className="py-3 pr-4 text-right">{s.avg_days_to_win || '—'}</td>
                        <td className="py-3 text-right">{money(s.open_value)} <span className="text-xs text-faint">· {s.open_deals}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="write-in" title="Best customers to find more of" sub="Ranked by revenue won">
              {c.best_customers.length ? (
                <ol className="divide-y divide-line text-sm">
                  {c.best_customers.map((b) => (
                    <li key={b.name} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{b.name}</span>
                        <span className="text-xs text-muted">{b.segment} · {b.deals} deals won</span>
                      </span>
                      <span className="shrink-0 font-medium">{money(b.won_value)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState icon={Users} title="No won customers yet">Close a few deals and your best-fit customers show here.</EmptyState>
              )}
            </Card>
          </div>

          {gap != null && c.next_90_days && (
            <Card className="write-in">
              <p className="text-sm">
                <span className="font-medium">Next 90 days:</span> median {money(c.next_90_days.median)} against a target of {money(c.next_90_days.target ?? 0)}
                {gap < 0 ? <> · <span className="text-loss">{money(-gap)} short</span>, which marketing can help close.</> : <> · <span className="text-gain">on track</span>.</>}
              </p>
            </Card>
          )}

          <ChatBox mode="marketing" />
        </div>
      )}
    </>
  )
}
