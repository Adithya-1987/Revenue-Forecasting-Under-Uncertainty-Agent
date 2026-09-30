import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Accuracy, Changes, CauseType, Forecast } from '../types'
import { money, shortDate } from '../lib'
import { CAUSE_LABEL, groupCauses } from './Ledger'

const C = { forest: '#1e2d26', sage: '#62785a', gain: '#3f7d3a', loss: '#b5452f', hair: '#dfe5dc', mute: '#c9d3c4' }
const axis = { fontSize: 11, fill: '#16201e', fontFamily: 'Inter' }
const moneyTick = (v: number) => money(v)
// Recharts' formatter value type is loose; everything we chart is a number or [lo, hi].

type Line = [label: string, value: string, tone?: 'gain' | 'loss']
interface TipProps<T> {
  active?: boolean
  payload?: readonly { payload?: T }[]
  title: (d: T) => string
  lines: (d: T) => Line[]
}

/** House tooltip: white card, hairline, tabular figures. Replaces Recharts' default grey box. */
function ChartTip<T>({ active, payload, title, lines }: TipProps<T>) {
  const d = payload?.[0]?.payload
  if (!active || !d) return null
  return (
    <div className="min-w-[160px] rounded-card border border-forest/10 bg-white px-3 py-2 text-xs shadow-[0_8px_24px_-12px_rgba(30,45,38,0.4)]">
      <p className="mb-1 font-medium text-ink">{title(d)}</p>
      {lines(d).map(([k, v, tone]) => (
        <p key={k} className="flex justify-between gap-4">
          <span className="text-ink/70">{k}</span>
          <span className={`font-medium ${tone === 'loss' ? 'text-loss' : tone === 'gain' ? 'text-gain' : 'text-ink'}`}>{v}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * The signature chart: futures fan out over the horizon (left), then land (right).
 * Both halves share one money axis, so the landing curve reads straight off the fan's end,
 * and the target line runs through both. Green under the curve = futures that reach the target.
 */
export function FanLanding({ f }: { f: Forecast }) {
  const width = f.histogram.length > 1 ? f.histogram[1].bin - f.histogram[0].bin : 1
  // 3-bin moving average: the curve shows the shape, not sampling noise
  const smooth = f.histogram.map((_, i, h) => (h[Math.max(i - 1, 0)].count + 2 * h[i].count + h[Math.min(i + 1, h.length - 1)].count) / 4)
  const land = f.histogram.map((b, i) => {
    const mid = b.bin + width / 2
    return { mid, hit: mid >= f.target - width / 2 ? smooth[i] : 0, miss: mid <= f.target + width / 2 ? smooth[i] : 0 }
  })
  const top = Math.max(f.p90, f.target, ...f.histogram.map((b) => b.bin + width)) * 1.04
  const domain: [number, number] = [0, Math.ceil(top / 1e5) * 1e5]
  const margin = { top: 12, right: 0, left: 0, bottom: 0 }
  const band = (d: Forecast['series'][0], lo: 'p10' | 'p25', hi: 'p90' | 'p75') => [d[lo] ?? d.p10, d[hi] ?? d.p90]

  return (
    <div
      role="img"
      aria-label={`Over ${f.horizon} days the range widens to ${money(f.p10)} to ${money(f.p90)}. ` +
        `${Math.round(f.prob_hit_target * 100)}% of 10,000 simulated futures reach the target of ${money(f.target)}.`}
      className="grid h-72 grid-cols-[1fr_minmax(120px,26%)] sm:h-80"
    >
      <ResponsiveContainer>
        <ComposedChart data={f.series} margin={{ ...margin, right: 4 }}>
          <CartesianGrid stroke={C.hair} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} tickLine={false} axisLine={{ stroke: C.hair }} minTickGap={28} height={24} />
          <YAxis domain={domain} tickFormatter={moneyTick} tick={axis} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            cursor={{ stroke: C.forest, strokeOpacity: 0.2 }}
            content={(p) => (
              <ChartTip<Forecast['series'][0]> {...p} title={(d) => `By ${shortDate(d.date)}`}
                lines={(d) => [['Best', money(d.p90)], ['Median', money(d.p50)], ['Worst', money(d.p10)]]} />
            )}
          />
          <Area type="monotone" dataKey={(d: Forecast['series'][0]) => band(d, 'p10', 'p90')} fill={C.sage} fillOpacity={0.16} stroke={C.sage} strokeOpacity={0.35} strokeWidth={1} isAnimationActive={false} />
          <Area type="monotone" dataKey={(d: Forecast['series'][0]) => band(d, 'p25', 'p75')} fill={C.sage} fillOpacity={0.3} stroke="none" isAnimationActive={false} />
          <Line type="monotone" dataKey="p50" stroke={C.forest} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <ReferenceLine y={f.target} stroke={C.forest} strokeDasharray="5 4" strokeOpacity={0.7}
            label={{ value: `Target ${money(f.target)}`, position: 'insideTopLeft', fontSize: 11, fill: C.forest, offset: 8 }} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="relative border-l border-hair">
        <ResponsiveContainer>
          <AreaChart data={land} layout="vertical" margin={{ ...margin, left: 0 }}>
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            {/* vertical layout counts downward; reverse so money rises like the fan's axis */}
            <YAxis type="number" dataKey="mid" domain={domain} hide reversed />
            {/* a hidden x axis still needs the fan's bottom axis height so both plots line up */}
            <XAxis xAxisId="pad" orientation="bottom" height={24} tick={false} axisLine={false} />
            <Area type="monotone" dataKey="miss" fill={C.mute} fillOpacity={0.9} stroke={C.sage} strokeWidth={1} isAnimationActive={false} />
            <Area type="monotone" dataKey="hit" fill={C.gain} fillOpacity={0.9} stroke={C.gain} strokeWidth={1.5} isAnimationActive={false} />
            <ReferenceLine y={f.target} stroke={C.forest} strokeDasharray="5 4" strokeOpacity={0.7} />
          </AreaChart>
        </ResponsiveContainer>
        <p className="pointer-events-none absolute right-2 top-1 text-right text-xs leading-tight text-ink/70">
          Where 10,000
          <br />
          futures land
        </p>
      </div>
    </div>
  )
}

interface WaterfallProps {
  changes: Changes
  selected: CauseType | null
  onSelect: (t: CauseType) => void
}

/** Previous total, one floating bar per cause, residual, current total. Cause bars are clickable. */
export function Waterfall({ changes, selected, onSelect }: WaterfallProps) {
  const steps = [
    ...groupCauses(changes).map((g) => ({ name: CAUSE_LABEL[g.type][1], type: g.type as CauseType | null, amount: g.amount })),
    { name: 'Residual', type: null, amount: changes.residual },
  ]
  // Each step is a floating [lo, hi] range bar; totals run from the axis floor.
  let run = changes.prev_total
  const moves = steps.map((s) => {
    const from = run
    run += s.amount
    return { name: s.name, lo: Math.min(from, run), hi: Math.max(from, run), signed: s.amount, fill: s.amount < 0 ? C.loss : C.gain, type: s.type }
  })
  const floor = Math.floor((Math.min(...moves.map((m) => m.lo), changes.curr_total) * 0.9) / 1e5) * 1e5
  const data = [
    { name: 'Last run', lo: floor, hi: changes.prev_total, signed: changes.prev_total, fill: C.forest, type: null },
    ...moves,
    { name: 'This run', lo: floor, hi: changes.curr_total, signed: changes.curr_total, fill: C.forest, type: null },
  ]

  return (
    <div role="img" aria-label={`Waterfall from ${money(changes.prev_total)} to ${money(changes.curr_total)}. The table below lists every step.`} className="h-64">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.hair} vertical={false} />
          <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={{ stroke: C.hair }} interval={0} />
          <YAxis domain={[floor, 'auto']} tickFormatter={moneyTick} tick={axis} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            cursor={{ fill: '#d9f79a', fillOpacity: 0.35 }}
            content={(p) => (
              <ChartTip<(typeof data)[number]> {...p} title={(d) => d.name}
                lines={(d) => [[d.type || d.name === 'Residual' ? 'Change' : 'Total', money(d.signed), d.type || d.name === 'Residual' ? (d.signed < 0 ? 'loss' : 'gain') : undefined]]} />
            )}
          />
          <Bar
            dataKey={(d: { lo: number; hi: number }) => [d.lo, d.hi]}
            radius={3}
            isAnimationActive={false}
            onClick={(d) => {
              const t = (d as unknown as { type: CauseType | null }).type
              if (t) onSelect(t)
            }}
          >
            {data.map((d) => (
              <Cell
                key={d.name}
                fill={d.fill}
                cursor={d.type ? 'pointer' : 'default'}
                stroke={d.type && d.type === selected ? C.forest : 'none'}
                strokeWidth={2}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Predicted bars, P10-P90 band, actual dots. A rust dot fell outside the band. */
export function AccuracyChart({ history }: { history: Accuracy['history'] }) {
  return (
    <div role="img" aria-label="Past 30-day forecasts against what actually closed" className="h-64">
      <ResponsiveContainer>
        <ComposedChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.hair} vertical={false} />
          <XAxis dataKey="run_at" tick={axis} tickLine={false} axisLine={{ stroke: C.hair }} minTickGap={16} />
          <YAxis tickFormatter={moneyTick} tick={axis} tickLine={false} axisLine={false} width={56} domain={['dataMin - 200000', 'auto']} />
          <Tooltip
            cursor={{ fill: C.forest, fillOpacity: 0.05 }}
            content={(p) => (
              <ChartTip<Accuracy['history'][0]> {...p} title={(d) => d.run_at}
                lines={(d) => [['Forecast', money(d.predicted)], ['Actual', money(d.actual), d.actual < d.p10 || d.actual > d.p90 ? 'loss' : undefined], ['Range', `${money(d.p10)} to ${money(d.p90)}`]]} />
            )}
          />
          <Area dataKey={(d: Accuracy['history'][0]) => [d.p10, d.p90]} name="Worst to best" fill={C.sage} fillOpacity={0.2} stroke="none" isAnimationActive={false} />
          <Bar dataKey="predicted" name="Expected" fill={C.gain} barSize={14} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Scatter
            dataKey="actual"
            name="Actual"
            isAnimationActive={false}
            shape={(p: { cx?: number; cy?: number; payload?: Accuracy['history'][0] }) => {
              const h = p.payload!
              const out = h.actual < h.p10 || h.actual > h.p90
              return <circle cx={p.cx} cy={p.cy} r={5} fill={out ? C.loss : '#fff'} stroke={out ? C.loss : C.forest} strokeWidth={2} />
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
