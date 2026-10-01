import { api } from '../api/client'
import { money, pct, useApi, useRun } from '../lib'
import { ChatBox } from '../components/ChatBox'
import { Stage } from '../components/Stage'
import { ErrorNote, HighlightWord, Skeleton } from '../components/ui'

/** Manager page: the facts a marketer needs, then an agent that turns them into campaigns. */
export default function ManagerPage() {
  const { runId } = useRun()
  const { data, error } = useApi(() => api.marketingInfo(), [runId])
  const c = data?.context
  const best = c?.segments.filter((x) => x.win_rate != null).sort((a, b) => (b.win_rate ?? 0) * b.avg_won_deal - (a.win_rate ?? 0) * a.avg_won_deal)[0]

  return (
    <Stage
      title={<>Grow the <HighlightWord>pipeline</HighlightWord></>}
      sub="Where to promote, to whom and when, worked out from your own wins, losses and seasons. Then ask the growth agent for the campaign."
      frameLabel="Growth overview"
      after={<ChatBox mode="marketing" />}
    >
      {error && <ErrorNote>The growth overview did not load. {error}</ErrorNote>}
      {!c && !error && <Skeleton label="Loading growth overview" />}
      {c && (
        <>
          <div className="grid grid-cols-2 border-b border-hair lg:grid-cols-4 lg:divide-x lg:divide-hair">
            <div className="px-4 py-4">
              <p className="text-xs text-ink/70">Best segment to promote</p>
              <p className="mt-1 font-head text-xl font-bold">{best?.segment ?? '—'}</p>
              {best && <p className="mt-1 text-xs text-ink/70">{pct(best.win_rate ?? 0)} win rate · {money(best.avg_won_deal)} average deal</p>}
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-ink/70">Promote before</p>
              <p className="mt-1 font-head text-xl font-bold">{c.strongest_months.map((m) => m.month).join(', ') || '—'}</p>
              <p className="mt-1 text-xs text-ink/70">your strongest closing months</p>
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-ink/70">Quiet deals to re-engage</p>
              <p className="mt-1 font-head text-xl font-bold">{c.quiet_open_deals.activity_tracked ? c.quiet_open_deals.quiet_open_deals : '—'}</p>
              <p className="mt-1 text-xs text-ink/70">
                {c.quiet_open_deals.activity_tracked ? `${money(c.quiet_open_deals.quiet_value)} silent 14+ days` : 'Your data has no activity log, so silence cannot be measured'}
              </p>
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-ink/70">Lost in the last 90 days</p>
              <p className="mt-1 font-head text-xl font-bold">{c.recently_lost.lost_last_90_days}</p>
              <p className="mt-1 text-xs text-ink/70">{money(c.recently_lost.lost_value)} to win back</p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <section aria-labelledby="segs">
              <h2 id="segs" className="mb-3 font-head text-lg font-bold">Who buys, and how fast</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-ink text-left text-xs text-ink/70">
                      {['Segment', 'Win rate', 'Average deal', 'Days to win', 'Open pipeline'].map((h, i) => (
                        <th key={h} scope="col" className={`py-2 pr-4 font-normal ${i ? 'text-right' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.segments.map((s) => (
                      <tr key={s.segment} className="border-b border-hair last:border-0">
                        <th scope="row" className="py-2.5 pr-4 text-left font-medium">{s.segment}</th>
                        <td className="py-2.5 pr-4 text-right">{s.win_rate != null ? pct(s.win_rate) : '—'}</td>
                        <td className="py-2.5 pr-4 text-right">{money(s.avg_won_deal)}</td>
                        <td className="py-2.5 pr-4 text-right">{s.avg_days_to_win || '—'}</td>
                        <td className="py-2.5 pr-4 text-right">{money(s.open_value)} <span className="text-xs text-ink/60">· {s.open_deals}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section aria-labelledby="best">
              <h2 id="best" className="mb-3 font-head text-lg font-bold">Best customers to find more of</h2>
              <ol className="divide-y divide-hair text-sm">
                {c.best_customers.map((b) => (
                  <li key={b.name} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{b.name}</span>
                      <span className="text-xs text-ink/70">{b.segment} · {b.deals} deals won</span>
                    </span>
                    <span className="shrink-0">{money(b.won_value)}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          {c.next_90_days?.gap_to_target != null && (
            <p className="mt-6 border-t border-hair pt-4 text-sm">
              Next 90 days: median {money(c.next_90_days.median)} against a target of {money(c.next_90_days.target ?? 0)}
              {c.next_90_days.gap_to_target < 0 ? ` · ${money(-c.next_90_days.gap_to_target)} short, which marketing can help close.` : ' · on track.'}
            </p>
          )}
        </>
      )}
    </Stage>
  )
}
