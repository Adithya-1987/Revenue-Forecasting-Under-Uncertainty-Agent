import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowRight, ArrowUpToLine, Banknote, BookOpenCheck, CircleDot, CircleDollarSign, GitCompareArrows, ShieldCheck, Target } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { money, pct, shortDate, signedMoney, useApi, useRun } from '../lib'
import type { Basis, Forecast } from '../types'
import { CapsuleRange } from '../components/CapsuleRange'
import { ChatBox } from '../components/ChatBox'
import { CAUSE_LABEL, groupCauses } from '../components/Ledger'
import { PageSkeleton } from '../components/Loaders'
import CountUp from '../components/reactbits/CountUp'
import { Card, DeltaBadge, ErrorNote, IconDisc, MoreLink, Segmented } from '../components/ui'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** Four headline figures in one glass strip, each behind an icon disc. */
function StatStrip({ items }: { items: { label: string; icon: typeof Target; value: number | null; format: (n: number) => string; tone?: string; note: string }[] }) {
  return (
    <section aria-label="Headline figures" className="card stagger grid grid-cols-1 divide-y divide-white/60 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 dark:divide-white/5">
      {items.map((s, i) => (
        <div key={s.label} className="flex items-center gap-4 p-5" style={{ '--i': i } as CSSProperties}>
          <IconDisc icon={s.icon} size={44} />
          <div className="min-w-0">
            <p className="truncate text-sm text-muted">{s.label}</p>
            <p className={`mt-0.5 text-[22px] font-semibold leading-tight tracking-tight ${s.tone ?? 'text-ink'}`}>
              {s.value == null ? '—' : <CountUp to={s.value} format={s.format} />}
            </p>
            <p className="truncate text-xs text-faint">{s.note}</p>
          </div>
        </div>
      ))}
    </section>
  )
}

/** The reference's "Top Performance" panel, as the four marks of the range. */
function RangeMarks({ f }: { f: Forecast }) {
  const rows = [
    { icon: ArrowUpToLine, name: 'Best case · P90', note: '1 in 10 futures land above', value: money(f.p90) },
    { icon: CircleDot, name: 'Expected · P50', note: 'Half land above, half below', value: money(f.p50) },
    { icon: ArrowDownToLine, name: 'Worst case · P10', note: '9 in 10 futures land above', value: money(f.p10) },
    { icon: Target, name: `Target ${money(f.target)}`, note: 'Chance of reaching it', value: pct(f.prob_hit_target) },
  ]
  return (
    <div className="rounded-2xl bg-white/80 p-4 shadow-[0_1px_2px_rgb(var(--shadow)/0.06),0_12px_24px_-16px_rgb(var(--shadow)/0.35)] dark:bg-white/[0.06]">
      <p className="text-sm font-semibold">The range</p>
      <ol className="mt-3 space-y-3.5">
        {rows.map(({ icon: Icon, name, note, value }, i) => (
          <li key={name} className="flex items-center gap-3">
            <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-mint via-sky to-lavender text-white">
              <Icon size={16} aria-hidden />
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-navy text-[9px] font-bold text-white ring-2 ring-white dark:ring-transparent">{i + 1}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block truncate text-2xs text-faint">{note}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold">{value}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function DashboardPage() {
  const { me } = useAuth()
  const { runId } = useRun()
  const [basis, setBasis] = useState<Basis>('bookings')
  const { data: f, error, retry } = useApi(() => api.forecast(30, basis), [basis, runId])
  const { data: ch } = useApi(() => api.changes(30, basis), [basis, runId])
  const { data: risk } = useApi(() => api.risk(), [runId])
  const { data: acc } = useApi(() => api.accuracy().catch(() => undefined), [runId])

  const moved = ch?.prev_run_id ? ch.curr_total - ch.prev_total : null
  const reasons = ch ? groupCauses(ch).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 4) : []
  const shares = f?.top_deals ?? []
  const rest = Math.max(1 - shares.reduce((a, d) => a + d.share, 0), 0)
  const maxShare = Math.max(...shares.map((d) => d.share), rest, 0.01)
  const what = basis === 'cash' ? 'cash collected' : 'bookings'

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{greeting()}{me?.user.email ? `, ${me.user.email.split('@')[0]}` : ''}.</span>{' '}
          {me?.workspace?.name ?? 'Your workspace'} · next 30 days{f ? ` · as of ${shortDate(f.as_of)}` : ''}
        </p>
        <Segmented
          label="Basis"
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'bookings', label: 'Bookings', icon: BookOpenCheck },
            { value: 'cash', label: 'Cash', icon: Banknote },
          ]}
        />
      </div>

      {error && <ErrorNote retry={retry}>The dashboard did not load. {error}</ErrorNote>}
      {!f && !error && <PageSkeleton label="Loading dashboard" />}
      {f && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="xl:col-span-2">
            <StatStrip
              items={[
                { label: 'Expected outcome', icon: CircleDollarSign, value: f.p50, format: money, note: f.prev ? `${f.p50 >= f.prev.p50 ? 'Up' : 'Down'} from ${money(f.prev.p50)}` : 'First run' },
                { label: 'Chance of target', icon: Target, value: f.prob_hit_target, format: (n) => pct(n), note: `Target ${money(f.target)}` },
                {
                  label: 'Moved since last run', icon: GitCompareArrows, value: moved, format: signedMoney,
                  tone: moved == null || moved === 0 ? undefined : moved < 0 ? 'text-loss' : 'text-gain',
                  note: ch?.prev_run_id ? `${money(ch.prev_total)} → ${money(ch.curr_total)}` : 'Upload next week to compare',
                },
                { label: 'Forecasts in range', icon: ShieldCheck, value: acc?.coverage ?? null, format: (n) => pct(n), note: acc ? 'Goal 80% of past runs' : 'Builds up with history' },
              ]}
            />
          </div>

          {/* ---------------------------------------------------------------- left column */}
          <div className="min-w-0 space-y-6">

            <Card
              className="write-in"
              title={`30-day ${what}`}
              sub="10,000 simulated futures of your open pipeline"
              action={<MoreLink to="/app/forecast">Full forecast</MoreLink>}
            >
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="min-w-0">
                  <p className="text-[44px] font-semibold leading-none tracking-tight sm:text-[52px]">
                    <CountUp to={f.p50} format={money} />
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                    {f.prev ? <><DeltaBadge value={f.p50 / f.prev.p50 - 1} /> vs last run</> : 'Expected outcome · first run'}
                    <span className="text-faint">· range {money(f.p10)} – {money(f.p90)}</span>
                  </p>
                  <div className="mt-6">
                    <CapsuleRange series={f.series} target={f.target} />
                  </div>
                  <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                    <span className="flex items-center gap-1.5"><span className="ember-fill h-3 w-2 rounded-full" /> Expected by that day</span>
                    <span className="flex items-center gap-1.5"><span className="h-3 w-2 rounded-full bg-ink/10" /> Best case by that day</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-target/70" /> Target</span>
                  </p>
                </div>
                <RangeMarks f={f} />
              </div>
            </Card>

            <Card
              pad={false}
              className="write-in"
              title="Deals to watch"
              sub="Highest expected damage: value × chance it is lost"
              action={<MoreLink to="/app/risk">All deals at risk</MoreLink>}
            >
              <div className="overflow-x-auto px-2 pb-3 sm:px-3">
                <table className="w-full text-sm sm:min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs text-faint">
                      {['ID', 'Deal', 'Owner', 'Chance to win', 'At risk'].map((h, i) => (
                        <th key={h} scope="col" className={`px-2 py-3 font-medium sm:px-3 ${i === 4 ? 'text-right' : ''} ${i === 0 || i === 2 ? 'hidden sm:table-cell' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(risk ?? []).slice(0, 6).map((d, i) => (
                      <tr key={d.deal_id} className="write-in transition-colors hover:bg-white/50 dark:hover:bg-white/5" style={{ animationDelay: `${i * 50}ms` }}>
                        <td className="hidden whitespace-nowrap px-3 py-3 font-medium text-faint sm:table-cell">{d.deal_id}</td>
                        <td className="px-2 py-3 sm:px-3">
                          <span className="block font-semibold">{d.name}</span>
                          <span className="block max-w-[8.5rem] truncate text-xs text-faint sm:max-w-none">{d.reasons.slice(0, 2).join(' · ') || d.segment}</span>
                          <span className="block text-xs text-muted sm:hidden">{d.rep}</span>
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-3 text-muted sm:table-cell">{d.rep}</td>
                        <td className="px-2 py-3 sm:px-3">
                          <span className="flex items-center gap-2 sm:gap-3">
                            <span className="relative h-2 w-14 overflow-hidden rounded-full sm:w-28 bg-ink/[0.08] dark:bg-white/10" aria-hidden>
                              <span className="ember-fill-x absolute inset-y-0 left-0 rounded-full" style={{ width: pct(d.p_win) }} />
                            </span>
                            <span className="w-9 text-xs font-medium">{pct(d.p_win)}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-loss sm:px-3">{money(d.expected_damage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* ---------------------------------------------------------------- right column */}
          <div className="min-w-0 space-y-6">
            <section className="night write-in p-6" aria-labelledby="why-moved">
              <h2 id="why-moved" className="text-xl font-semibold tracking-tight">Why it moved</h2>
              <p className="mt-1 text-sm text-white/60">
                {ch?.prev_run_id ? <>Since the last run · {money(ch.prev_total)} → {money(ch.curr_total)}</> : 'Compared with the previous run'}
              </p>
              {reasons.length ? (
                <ol className="relative mt-6 space-y-6 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-white/15">
                  {reasons.map((g, i) => (
                    <li key={g.type} className="write-in relative pl-7" style={{ animationDelay: `${150 + i * 90}ms` }}>
                      <span aria-hidden className="absolute left-0 top-1.5 size-[11px] rounded-full border-2 border-white bg-[#1a1513]" />
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block font-medium">{CAUSE_LABEL[g.type][0]}</span>
                          <span className="block truncate text-xs text-white/55">
                            {g.items.length === 1 ? `${g.items[0].deal_name ?? ''} · ${g.items[0].description}` : `${g.items.length} deals, led by ${g.items[0].deal_name ?? 'several'}`}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold ${g.amount < 0 ? 'text-[#ffb4a8]' : 'text-[#9fe6bd]'}`}>
                          {signedMoney(g.amount)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-6 text-sm text-white/70">This is the first forecast. Upload next week's pipeline and this lists what moved the number.</p>
              )}
              <Link to="/app/changes" className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-[#f6b48a] hover:text-white">
                Every cause, deal by deal <ArrowRight size={15} aria-hidden />
              </Link>
            </section>

            <Card className="write-in" title="Where it is concentrated" sub={`Top 3 deals carry ${pct(f.top3_share)} of expected revenue`}>
              <ul className="space-y-3">
                {[...shares.map((d, i) => ({ label: ['Largest deal', 'Second', 'Third'][i], name: d.name, share: d.share })), { label: 'Everything else', name: 'All other open deals', share: rest }].map((r, i) => (
                  <li key={r.name} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3">
                    <span className="min-w-0">
                      <span className="block text-2xs text-faint">{r.label}</span>
                      <span className="block truncate text-sm font-semibold">{r.name}</span>
                    </span>
                    <span className="relative h-11 overflow-hidden rounded-xl bg-white/40 dark:bg-white/5">
                      <span
                        className="absolute inset-y-0 left-0 origin-left animate-[grow_900ms_cubic-bezier(0.22,1,0.36,1)_both] rounded-xl bg-gradient-to-r from-mint/30 via-sky/35 to-sky/60"
                        style={{ width: `${Math.max((r.share / maxShare) * 100, 8)}%`, animationDelay: `${200 + i * 90}ms` }}
                      />
                      <span className="absolute inset-y-0 right-3 grid place-items-center text-sm font-semibold text-brand">{pct(r.share, 1)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted">
                Concentration index <strong className="font-semibold text-ink">{f.hhi.toFixed(3)}</strong> · {f.hhi > 0.15 ? 'concentrated: one slip moves the number' : 'well spread across deals'}
              </p>
            </Card>
          </div>

          <div className="xl:col-span-2">
            <ChatBox />
          </div>
        </div>
      )}
    </>
  )
}
