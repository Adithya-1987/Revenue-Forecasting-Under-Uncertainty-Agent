import { api } from '../api/client'
import type { Calibration } from '../types'
import { money, pct, useApi, useRun } from '../lib'
import { AccuracyChart } from '../components/charts'
import { Stage } from '../components/Stage'
import { ErrorNote, HighlightWord, KpiTile, Skeleton } from '../components/ui'

/** Coverage against its 80% goal. The goal tick is this screen's one target marker. */
const CoverageBar = ({ value }: { value: number }) => (
  <span className="relative mt-2 block h-1.5 w-full max-w-[140px] rounded-full bg-hair" aria-hidden>
    <span className="absolute inset-y-0 left-0 rounded-full bg-forest" style={{ width: pct(value) }} />
    <span className="absolute -top-1 h-3.5 border-l-2 border-dashed border-target" style={{ left: '80%' }} />
  </span>
)

/** Backtest figures are null until there is enough history to replay. */
const pp = (x: number | null | undefined) => (x == null ? '—' : pct(x))

const LABEL_TONE = { optimist: 'text-loss', sandbagger: 'text-gain', calibrated: 'text-ink' }
const LABEL = { optimist: '↓ Optimist', sandbagger: '↑ Sandbagger', calibrated: 'Calibrated' }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function TrustPage() {
  const { runId } = useRun()
  const { data: a, error } = useApi(() => api.accuracy(), [runId])

  return (
    <Stage
      title={<>How far to <HighlightWord>trust</HighlightWord> it</>}
      sub="Every past forecast, replayed with only the data known at the time, then checked against what closed."
      frameLabel="Model accuracy"
    >
      {error && <ErrorNote>Accuracy did not load. {error}</ErrorNote>}
      {!a && !error && <Skeleton label="Loading accuracy" />}
      {a && (
        <>
          <div className="grid grid-cols-2 divide-hair border-b border-hair sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
            <KpiTile label="Error, 30 days" value={pp(a.mape['30'])} sub={a.history.length ? 'Mean absolute % error' : 'Needs 200+ closed deals over time'} />
            <KpiTile label="Error, 60 days" value={pp(a.mape['60'])} />
            <KpiTile label="Error, 90 days" value={pp(a.mape['90'])} />
            <KpiTile label="Bias" value={`${a.bias < 0 ? '−' : '+'}${pct(Math.abs(a.bias), 1)}`} sub={Math.abs(a.bias) < 0.01 ? 'About even' : a.bias < 0 ? 'Runs low' : 'Runs high'} />
            <KpiTile label="Inside the range" value={pp(a.coverage)} sub={a.coverage != null ? <>Goal 80%<CoverageBar value={a.coverage} /></> : 'Goal 80%'} />
            <KpiTile label="Stage-% method error" value={pp(a.baseline_mape)} sub={a.baseline_mape != null && a.mape['30'] ? `Ours is ${(a.baseline_mape / a.mape['30']).toFixed(1)}× lower` : undefined} />
          </div>

          {!a.history.length && (
            <p className="mt-6 rounded-card border border-hair p-4 text-sm text-ink/80">
              Accuracy over time needs about 200 closed deals spread over a year, so past forecasts can be replayed. Calibration,
              lost-deal patterns and seasonality below already use the history you have.
            </p>
          )}
          <figure className="mt-8" hidden={!a.history.length}>
            <figcaption className="mb-2 text-sm font-medium">
              30-day forecasts vs actual{' '}
              <span className="font-normal text-ink/70">· green bar expected, shaded worst to best, dot actual, rust dot missed the range</span>
            </figcaption>
            <AccuracyChart history={a.history} />
          </figure>

          <div className="mt-8 grid gap-8 border-t border-hair pt-6 lg:grid-cols-[1.5fr_1fr]">
            <section aria-labelledby="cal">
              <h2 id="cal" className="font-head text-lg font-bold">Rep and team calibration</h2>
              <p className="mb-3 mt-1 text-sm text-ink/70">
                {a.reps.some((r) => r.basis === 'commits')
                  ? 'Committed: what each rep promised for each month. Actual: what they closed in it. Score = actual / committed. Correction: what the forecast applies to their deals.'
                  : 'No rep commits were imported, so committed = what a neutral rep would have closed on the same deals. Correction: what the forecast applies.'}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-ink text-left text-xs text-ink/70">
                      <th scope="col" className="py-2 pr-4 font-normal">Rep</th>
                      <th scope="col" className="py-2 pr-4 text-right font-normal">Committed</th>
                      <th scope="col" className="py-2 pr-4 text-right font-normal">Actual</th>
                      <th scope="col" className="py-2 pr-4 text-right font-normal">Score</th>
                      <th scope="col" className="py-2 pr-4 text-right font-normal">Correction</th>
                      <th scope="col" className="py-2 font-normal">Reads as</th>
                    </tr>
                  </thead>
                  {(a.teams?.length ? a.teams : [{ team: '', reps: a.reps.length, committed: 0, actual: 0, score: 1, label: 'calibrated' as Calibration }]).map((t) => (
                    <tbody key={t.team || 'all'}>
                      {t.team && (
                        <tr className="border-b border-hair bg-lime/25">
                          <th scope="rowgroup" className="py-2 pr-4 text-left font-semibold">Team {t.team} <span className="font-normal text-ink/70">· {t.reps} reps</span></th>
                          <td className="py-2 pr-4 text-right font-medium">{money(t.committed)}</td>
                          <td className="py-2 pr-4 text-right font-medium">{money(t.actual)}</td>
                          <td className="py-2 pr-4 text-right font-medium">×{t.score.toFixed(2)}</td>
                          <td className="py-2 pr-4" />
                          <td className={`py-2 font-medium ${LABEL_TONE[t.label]}`}>{LABEL[t.label]}</td>
                        </tr>
                      )}
                      {a.reps.filter((r) => !t.team || r.team === t.team).map((r) => (
                        <tr key={r.id} className="border-b border-hair last:border-0">
                          <th scope="row" className="py-2.5 pr-4 pl-3 text-left font-normal">{r.name}</th>
                          <td className="py-2.5 pr-4 text-right">{money(r.committed)}</td>
                          <td className="py-2.5 pr-4 text-right">{money(r.actual)}</td>
                          <td className="py-2.5 pr-4 text-right">×{r.score.toFixed(2)}{r.periods ? <span className="block text-[11px] text-ink/60">{r.periods} months</span> : null}</td>
                          <td className="py-2.5 pr-4 text-right text-ink/80">{r.correction != null ? `×${r.correction.toFixed(2)}` : '—'}</td>
                          <td className={`py-2.5 ${LABEL_TONE[r.label]}`}>{LABEL[r.label]}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </section>

            {!!a.lost_patterns?.length && (
              <section aria-labelledby="lost">
                <h2 id="lost" className="font-head text-lg font-bold">What lost deals had in common</h2>
                <p className="mb-3 mt-1 text-sm text-ink/70">Share of closed deals lost, with the sign against without it.</p>
                <ul className="space-y-3">
                  {a.lost_patterns.slice(0, 5).map((l) => (
                    <li key={l.sign} className="text-sm">
                      <p className="flex justify-between gap-3">
                        <span>{l.sign}</span>
                        <span className="text-loss">{pct(l.loss_rate)} lost</span>
                      </p>
                      <span aria-hidden className="relative mt-1 block h-2 rounded-full bg-hair">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-loss/80" style={{ width: pct(l.loss_rate) }} />
                        <span className="absolute -top-0.5 h-3 w-0.5 bg-ink" style={{ left: pct(l.loss_rate_without) }} />
                      </span>
                      <p className="mt-1 text-xs text-ink/70">{pct(l.loss_rate_without)} without it · {l.deals} deals had it</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {a.seasonality && (
            <section aria-labelledby="season" className="mt-8 border-t border-hair pt-6">
              <h2 id="season" className="font-head text-lg font-bold">Seasonality in your closes</h2>
              <p className="mb-4 mt-1 text-sm text-ink/70">Closes per month against an average month (1.0). Close dates in strong months are pulled a little earlier, weak months a little later.</p>
              <div className="grid grid-cols-12 items-end gap-1.5" role="img" aria-label={`Seasonality: ${MONTHS.map((m, i) => `${m} ${a.seasonality![String(i + 1)]?.toFixed(2)}`).join(', ')}`}>
                {MONTHS.map((m, i) => {
                  const v = a.seasonality![String(i + 1)] ?? 1
                  return (
                    <div key={m} className="text-center">
                      <div className="flex h-24 items-end justify-center">
                        <span className={`block w-full max-w-[28px] rounded-t ${v >= 1 ? 'bg-gain' : 'bg-sage/50'}`} style={{ height: `${Math.min(v / 1.6, 1) * 100}%` }} />
                      </div>
                      <p className="mt-1 text-xs">{m}</p>
                      <p className="text-[11px] text-ink/70">×{v.toFixed(2)}</p>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </Stage>
  )
}
