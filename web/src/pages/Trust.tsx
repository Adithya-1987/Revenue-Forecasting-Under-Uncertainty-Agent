import { api } from '../api/client'
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

const LABEL_TONE = { optimist: 'text-loss', sandbagger: 'text-gain', calibrated: 'text-ink' }

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
            <KpiTile label="Error, 30 days" value={pct(a.mape['30'])} sub="Mean absolute % error" />
            <KpiTile label="Error, 60 days" value={pct(a.mape['60'])} />
            <KpiTile label="Error, 90 days" value={pct(a.mape['90'])} />
            <KpiTile label="Bias" value={`${a.bias < 0 ? '−' : '+'}${pct(Math.abs(a.bias), 1)}`} sub={Math.abs(a.bias) < 0.01 ? 'About even' : a.bias < 0 ? 'Runs low' : 'Runs high'} />
            <KpiTile label="Inside the range" value={pct(a.coverage)} sub={<>Goal 80%<CoverageBar value={a.coverage} /></>} />
            <KpiTile label="Stage-% method error" value={pct(a.baseline_mape)} sub={`Ours is ${(a.baseline_mape / a.mape['30']).toFixed(1)}× lower`} />
          </div>

          <figure className="mt-8">
            <figcaption className="mb-2 text-sm font-medium">
              30-day forecasts vs actual{' '}
              <span className="font-normal text-ink/70">· green bar expected, shaded worst to best, dot actual, rust dot missed the range</span>
            </figcaption>
            <AccuracyChart history={a.history} />
          </figure>

          <div className="mt-8 border-t border-hair pt-6">
            <h2 className="mb-3 font-head text-lg font-bold">Rep calibration</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-ink text-left text-xs text-ink/70">
                    <th scope="col" className="py-2 pr-4 font-normal">Rep</th>
                    <th scope="col" className="py-2 pr-4 text-right font-normal">Committed</th>
                    <th scope="col" className="py-2 pr-4 text-right font-normal">Actual</th>
                    <th scope="col" className="py-2 pr-4 text-right font-normal">Score</th>
                    <th scope="col" className="py-2 font-normal">Reads as</th>
                  </tr>
                </thead>
                <tbody>
                  {a.reps.map((r) => (
                    <tr key={r.id} className="border-b border-hair last:border-0">
                      <th scope="row" className="py-2.5 pr-4 text-left font-medium">{r.name}</th>
                      <td className="py-2.5 pr-4 text-right">{money(r.committed)}</td>
                      <td className="py-2.5 pr-4 text-right">{money(r.actual)}</td>
                      <td className="py-2.5 pr-4 text-right">×{r.score.toFixed(2)}</td>
                      <td className={`py-2.5 ${LABEL_TONE[r.label]}`}>
                        {r.label === 'optimist' ? '↓ Optimist' : r.label === 'sandbagger' ? '↑ Sandbagger' : 'Calibrated'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Stage>
  )
}
