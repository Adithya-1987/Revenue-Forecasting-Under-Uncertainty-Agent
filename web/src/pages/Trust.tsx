import { Award, Crosshair, Gauge, Scale } from 'lucide-react'
import { api } from '../api/client'
import { money, pct, useApi, useRun } from '../lib'
import { PageHeader } from '../components/AppShell'
import { AccuracyChart } from '../components/charts'
import { PageSkeleton } from '../components/Loaders'
import { Card, ErrorNote, StatCard } from '../components/ui'
import CountUp from '../components/reactbits/CountUp'

const LABEL = {
  optimist: ['↓ Optimist', 'chip-loss'],
  sandbagger: ['↑ Sandbagger', 'chip-gain'],
  calibrated: ['Calibrated', 'chip-brand'],
} as const

export default function TrustPage() {
  const { runId } = useRun()
  const { data: a, error, retry } = useApi(() => api.accuracy(), [runId])
  const lift = a ? a.baseline_mape / a.mape['30'] : 0
  const maxScore = a ? Math.max(...a.reps.map((r) => Math.abs(r.score - 1)), 0.01) : 1

  return (
    <>
      <PageHeader title="How far to trust it" sub="Every past forecast, replayed with only the data known at the time, then checked against what closed." />

      {error && <ErrorNote retry={retry}>Accuracy did not load. {error}</ErrorNote>}
      {!a && !error && <PageSkeleton label="Loading accuracy" variant="chart" />}
      {a && (
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_2fr]">
            {/* the one number that sells it */}
            <section className="card card-pad write-in flex flex-col justify-between border-l-4 border-l-brand">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-muted">
                  <Award size={15} aria-hidden className="text-faint" /> Versus the stage-percentage method
                </p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-brand">
                  <CountUp to={lift} format={(n) => `${n.toFixed(1)}×`} />
                </p>
                <p className="mt-1 text-muted">lower error on 30-day forecasts</p>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                <div>
                  <dt className="text-xs text-faint">Stage-% method</dt>
                  <dd className="font-semibold">{pct(a.baseline_mape)} error</dd>
                </div>
                <div>
                  <dt className="text-xs text-faint">Rangefinder</dt>
                  <dd className="font-semibold text-brand">{pct(a.mape['30'])} error</dd>
                </div>
              </dl>
            </section>

            <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(['30', '60', '90'] as const).map((h, i) => (
                <StatCard key={h} i={i} label={`Error, ${h} days`} icon={Crosshair} value={a.mape[h]} format={(n) => pct(n)} foot={i === 0 ? 'Mean absolute % error' : 'Longer horizons are harder'} />
              ))}
              <StatCard i={3} label="Bias" icon={Scale} value={`${a.bias < 0 ? '−' : '+'}${pct(Math.abs(a.bias), 1)}`} foot={Math.abs(a.bias) < 0.01 ? 'About even' : a.bias < 0 ? 'Runs slightly low' : 'Runs slightly high'} />
              <div className="col-span-2 lg:col-span-4" style={{ '--i': 4 } as React.CSSProperties}>
                <Card>
                  <div className="flex flex-wrap items-center gap-4">
                    <Gauge size={18} aria-hidden className="text-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-muted">Actuals inside the worst-to-best range</p>
                      <p className="text-2xl font-semibold"><CountUp to={a.coverage} format={(n) => pct(n)} /></p>
                    </div>
                    <div className="w-full sm:w-72">
                      <div className="relative h-2.5 rounded-full bg-surface-2">
                        <span className="absolute inset-y-0 left-0 origin-left animate-[grow_1s_cubic-bezier(0.22,1,0.36,1)_both] rounded-full bg-brand" style={{ width: pct(a.coverage) }} />
                        <span className="absolute -top-1.5 h-5 border-l-2 border-dashed border-target" style={{ left: '80%' }} />
                      </div>
                      <p className="mt-1.5 flex justify-between text-xs text-faint">
                        <span>0%</span>
                        <span className="text-target">goal 80%</span>
                        <span>100%</span>
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          <Card
            className="write-in"
            title="30-day forecasts vs actual"
            sub="Replayed monthly, using only what was known then"
            action={
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-2 rounded-sm bg-brand" /> Expected</li>
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-brand/20" /> Worst to best</li>
                <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-ink" /> Actual</li>
                <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-loss" /> Missed the range</li>
              </ul>
            }
          >
            <AccuracyChart history={a.history} />
          </Card>

          <Card className="write-in" title="Rep calibration" sub="Committed versus closed. The model scales each rep's deals by their score.">
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-faint">
                    <th scope="col" className="py-2.5 pr-4 font-medium">Rep</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-medium">Committed</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-medium">Actual</th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">Score</th>
                    <th scope="col" className="py-2.5 font-medium">Reads as</th>
                  </tr>
                </thead>
                <tbody>
                  {a.reps.map((r, i) => {
                    const off = r.score - 1
                    return (
                      <tr key={r.id} className="write-in border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/70" style={{ animationDelay: `${i * 50}ms` }}>
                        <th scope="row" className="py-3 pr-4 text-left font-medium">{r.name}</th>
                        <td className="py-3 pr-4 text-right">{money(r.committed)}</td>
                        <td className="py-3 pr-4 text-right">{money(r.actual)}</td>
                        <td className="py-3 pr-4">
                          <span className="flex items-center gap-3">
                            <span className="w-12 font-mono">×{r.score.toFixed(2)}</span>
                            {/* bar from a centre line at ×1.00 */}
                            <span aria-hidden className="relative h-2 w-28 rounded-full bg-surface-2">
                              <span className="absolute inset-y-[-3px] left-1/2 w-px bg-line" />
                              <span className={`absolute inset-y-0 rounded-full ${off < 0 ? 'right-1/2 bg-loss/80' : 'left-1/2 bg-gain/80'}`} style={{ width: `${(Math.abs(off) / maxScore) * 50}%` }} />
                            </span>
                          </span>
                        </td>
                        <td className="py-3"><span className={`chip ${LABEL[r.label][1]}`}>{LABEL[r.label][0]}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
