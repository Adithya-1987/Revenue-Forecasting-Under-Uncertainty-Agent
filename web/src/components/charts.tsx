import { useId } from 'react'
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
import { money, shortDate, useMedia } from '../lib'
import { prefersReducedMotion, useChartColors } from '../theme'
import { CAUSE_LABEL, groupCauses } from './Ledger'

const moneyTick = (v: number) => money(v)
const anim = () => ({ isAnimationActive: !prefersReducedMotion(), animationDuration: 900, animationEasing: 'ease-out' as const })

function useAxis() {
  const c = useChartColors()
  return { tick: { fontSize: 11, fill: c.faint, fontFamily: 'Manrope Variable, Manrope, sans-serif' }, c }
}

type TipLine = [label: string, value: string, tone?: 'gain' | 'loss']
interface TipProps<T> {
  active?: boolean
  payload?: readonly { payload?: T }[]
  title: (d: T) => string
  lines: (d: T) => TipLine[]
}

/** House tooltip: themed card, hairline, tabular figures. */
function ChartTip<T>({ active, payload, title, lines }: TipProps<T>) {
  const d = payload?.[0]?.payload
  if (!active || !d) return null
  return (
    <div className="min-w-[170px] rounded-xl border border-line bg-surface/95 px-3 py-2.5 text-xs shadow-pop backdrop-blur">
      <p className="mb-1.5 font-semibold text-ink">{title(d)}</p>
      {lines(d).map(([k, v, tone]) => (
        <p key={k} className="flex justify-between gap-4 py-0.5">
          <span className="text-muted">{k}</span>
          <span className={`font-medium ${tone === 'loss' ? 'text-loss' : tone === 'gain' ? 'text-gain' : 'text-ink'}`}>{v}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * The signature chart: futures fan out over the horizon (left), then land (right).
 * Both halves share one money axis, so the landing curve reads straight off the fan's end,
 * and the target line runs through both. Blue under the curve = futures that reach the target.
 */
export function FanLanding({ f, height = 'h-72 sm:h-80' }: { f: Forecast; height?: string }) {
  const { tick, c } = useAxis()
  const id = useId().replace(/:/g, '')
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
      className={`grid grid-cols-[1fr_minmax(110px,26%)] ${height}`}
    >
      <ResponsiveContainer>
        <ComposedChart data={f.series} margin={{ ...margin, right: 4 }}>
          <defs>
            <linearGradient id={`outer${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c.sky} stopOpacity={0.28} />
              <stop offset="1" stopColor={c.sky} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={tick} tickLine={false} axisLine={{ stroke: c.line }} minTickGap={28} height={24} />
          <YAxis domain={domain} tickFormatter={moneyTick} tick={tick} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            cursor={{ stroke: c.brand, strokeOpacity: 0.35, strokeDasharray: '4 4' }}
            content={(p) => (
              <ChartTip<Forecast['series'][0]> {...p} title={(d) => `By ${shortDate(d.date)}`}
                lines={(d) => [['Best (P90)', money(d.p90)], ['Median', money(d.p50)], ['Worst (P10)', money(d.p10)]]} />
            )}
          />
          <Area type="monotone" dataKey={(d: Forecast['series'][0]) => band(d, 'p10', 'p90')} fill={`url(#outer${id})`} stroke={c.sky} strokeOpacity={0.6} strokeWidth={1} {...anim()} />
          <Area type="monotone" dataKey={(d: Forecast['series'][0]) => band(d, 'p25', 'p75')} fill={c.brand} fillOpacity={0.18} stroke="none" {...anim()} />
          <Line type="monotone" dataKey="p50" stroke={c.brand} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: c.surface }} {...anim()} />
          <ReferenceLine y={f.target} stroke={c.target} strokeDasharray="6 4" strokeWidth={1.5}
            label={{ value: `Target ${money(f.target)}`, position: 'insideTopLeft', fontSize: 11, fill: c.target, offset: 8 }} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="relative border-l border-dashed border-line">
        <ResponsiveContainer>
          <AreaChart data={land} layout="vertical" margin={{ ...margin, left: 0 }}>
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            {/* vertical layout counts downward; reverse so money rises like the fan's axis */}
            <YAxis type="number" dataKey="mid" domain={domain} hide reversed />
            {/* a hidden x axis still needs the fan's bottom axis height so both plots line up */}
            <XAxis xAxisId="pad" orientation="bottom" height={24} tick={false} axisLine={false} />
            <Area type="monotone" dataKey="miss" fill={c.faint} fillOpacity={0.14} stroke={c.faint} strokeOpacity={0.45} strokeWidth={1} {...anim()} />
            <Area type="monotone" dataKey="hit" fill={c.brand} fillOpacity={0.35} stroke={c.brand} strokeWidth={1.5} {...anim()} />
            <ReferenceLine y={f.target} stroke={c.target} strokeDasharray="6 4" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
        <p className="pointer-events-none absolute right-2 top-1 text-right text-2xs leading-tight text-faint">
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
  const { tick, c } = useAxis()
  // phones: eight labels do not fit side by side, so they lean
  const narrow = useMedia('(max-width: 639px)')
  const steps = [
    ...groupCauses(changes).map((g) => ({ name: CAUSE_LABEL[g.type][1], type: g.type as CauseType | null, amount: g.amount })),
    { name: 'Residual', type: null, amount: changes.residual },
  ]
  // Each step is a floating [lo, hi] range bar; totals run from the axis floor.
  let run = changes.prev_total
  const moves = steps.map((s) => {
    const from = run
    run += s.amount
    return { name: s.name, lo: Math.min(from, run), hi: Math.max(from, run), signed: s.amount, fill: s.amount < 0 ? c.loss : c.gain, type: s.type }
  })
  const floor = Math.floor((Math.min(...moves.map((m) => m.lo), changes.curr_total) * 0.9) / 1e5) * 1e5
  const data = [
    { name: 'Last run', lo: floor, hi: changes.prev_total, signed: changes.prev_total, fill: c.faint, type: null },
    ...moves,
    { name: 'This run', lo: floor, hi: changes.curr_total, signed: changes.curr_total, fill: c.brand, type: null },
  ]

  return (
    <div role="img" aria-label={`Waterfall from ${money(changes.prev_total)} to ${money(changes.curr_total)}. The ledger lists every step.`} className="h-72">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="name" tick={tick} tickLine={false} axisLine={{ stroke: c.line }} interval={0} angle={narrow ? -40 : 0} textAnchor={narrow ? 'end' : 'middle'} height={narrow ? 56 : 30} />
          <YAxis domain={[floor, 'auto']} tickFormatter={moneyTick} tick={tick} tickLine={false} axisLine={false} width={narrow ? 46 : 56} />
          <Tooltip
            cursor={{ fill: c.ink, fillOpacity: 0.04 }}
            content={(p) => (
              <ChartTip<(typeof data)[number]> {...p} title={(d) => d.name}
                lines={(d) => [[d.type || d.name === 'Residual' ? 'Change' : 'Total', money(d.signed), d.type || d.name === 'Residual' ? (d.signed < 0 ? 'loss' : 'gain') : undefined]]} />
            )}
          />
          <Bar
            dataKey={(d: { lo: number; hi: number }) => [d.lo, d.hi]}
            radius={3}
            {...anim()}
            onClick={(d) => {
              const t = (d as unknown as { type: CauseType | null }).type
              if (t) onSelect(t)
            }}
          >
            {data.map((d) => (
              <Cell
                key={d.name}
                fill={d.fill}
                fillOpacity={selected && d.type && d.type !== selected ? 0.35 : 1}
                cursor={d.type ? 'pointer' : 'default'}
                stroke={d.type && d.type === selected ? c.ink : 'none'}
                strokeWidth={2}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Predicted bars, P10-P90 band, actual dots. A red dot fell outside the band. */
export function AccuracyChart({ history }: { history: Accuracy['history'] }) {
  const { tick, c } = useAxis()
  return (
    <div role="img" aria-label="Past 30-day forecasts against what actually closed" className="h-72">
      <ResponsiveContainer>
        <ComposedChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="run_at" tick={tick} tickLine={false} axisLine={{ stroke: c.line }} minTickGap={16} />
          <YAxis tickFormatter={moneyTick} tick={tick} tickLine={false} axisLine={false} width={56} domain={['dataMin - 200000', 'auto']} />
          <Tooltip
            cursor={{ fill: c.brand, fillOpacity: 0.06 }}
            content={(p) => (
              <ChartTip<Accuracy['history'][0]> {...p} title={(d) => d.run_at}
                lines={(d) => [['Forecast', money(d.predicted)], ['Actual', money(d.actual), d.actual < d.p10 || d.actual > d.p90 ? 'loss' : undefined], ['Range', `${money(d.p10)} to ${money(d.p90)}`]]} />
            )}
          />
          <Area dataKey={(d: Accuracy['history'][0]) => [d.p10, d.p90]} name="Worst to best" fill={c.sky} fillOpacity={0.2} stroke={c.sky} strokeOpacity={0.5} {...anim()} />
          <Bar dataKey="predicted" name="Expected" fill={c.brand} fillOpacity={0.85} barSize={14} radius={[5, 5, 0, 0]} {...anim()} />
          <Scatter
            dataKey="actual"
            name="Actual"
            {...anim()}
            shape={(p: { cx?: number; cy?: number; payload?: Accuracy['history'][0] }) => {
              const h = p.payload!
              const out = h.actual < h.p10 || h.actual > h.p90
              return <circle cx={p.cx} cy={p.cy} r={5} fill={out ? c.loss : c.surface} stroke={out ? c.loss : c.ink} strokeWidth={2} />
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Tiny trend line for KPI cards. */
export function Sparkline({ values, tone = 'brand' }: { values: number[]; tone?: 'brand' | 'gain' | 'loss' }) {
  const c = useChartColors()
  const id = useId().replace(/:/g, '')
  const color = c[tone]
  const data = values.map((v, i) => ({ i, v }))
  return (
    <div aria-hidden className="h-10 w-24">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.35} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp${id})`} {...anim()} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontal share bars (top deals), grown from zero on mount. */
export function ShareBars({ items, format }: { items: { name: string; share: number }[]; format: (n: number) => string }) {
  const max = Math.max(...items.map((d) => d.share), 0.0001)
  return (
    <ul className="space-y-3 stagger">
      {items.map((d, i) => (
        <li key={d.name} className="grid grid-cols-[minmax(0,140px)_1fr_52px] items-center gap-3 text-sm" style={{ '--i': i } as React.CSSProperties}>
          <span className="truncate font-medium">{d.name}</span>
          <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full origin-left animate-[grow_800ms_cubic-bezier(0.22,1,0.36,1)_both] rounded-full bg-brand"
              style={{ width: `${(d.share / max) * 100}%`, animationDelay: `${200 + i * 90}ms` }}
            />
          </span>
          <span className="text-right text-muted">{format(d.share)}</span>
        </li>
      ))}
    </ul>
  )
}
