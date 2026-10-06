import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown, Briefcase, Flame, Search, SearchX, TriangleAlert } from 'lucide-react'
import { api } from '../api/client'
import { money, pct, useApi, useRun } from '../lib'
import type { RiskDeal } from '../types'
import { PageHeader } from '../components/AppShell'
import { DealRow } from '../components/DealRow'
import { PageSkeleton } from '../components/Loaders'
import { Button, Card, EmptyState, ErrorNote, StatCard } from '../components/ui'

type SortKey = 'expected_damage' | 'value' | 'p_win' | 'slip_prob' | 'slip_period_prob'
// On phones only Deal, Chance to win and Expected damage are columns; the rest folds into the deal cell.
const WIDE = 'hidden md:table-cell'
const COLS: [SortKey | null, string, string][] = [
  [null, 'Deal', 'text-left'],
  ['value', 'Value', `text-right ${WIDE}`],
  ['p_win', 'Chance to win', 'text-left'],
  ['slip_prob', 'Misses its date', `text-right ${WIDE}`],
  ['slip_period_prob', 'Slips a month', `text-right ${WIDE}`],
  [null, 'Stage · why', `text-left ${WIDE}`],
  ['expected_damage', 'Expected damage', 'text-right'],
]

const Select = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) => (
  <label className="flex items-center gap-2 text-sm text-muted">
    <span className="whitespace-nowrap">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="field field-sm !w-auto cursor-pointer pr-8">
      <option value="">All</option>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  </label>
)

export default function RiskPage() {
  const { runId } = useRun()
  const { data, error, retry } = useApi(() => api.risk(), [runId])
  const [params] = useSearchParams()
  const [rep, setRep] = useState(params.get('rep') ?? '')
  const [segment, setSegment] = useState(params.get('segment') ?? '')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('expected_damage')
  const [all, setAll] = useState(false)
  const TOP = 15

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = (data ?? []).filter(
      (d) => (!rep || d.rep === rep) && (!segment || d.segment === segment) && (!needle || `${d.name} ${d.rep} ${d.reasons.join(' ')}`.toLowerCase().includes(needle)),
    )
    // p_win ascending = least likely first; money columns descending.
    return [...list].sort((a, b) => (sort === 'p_win' ? a.p_win - b.p_win : (b[sort] ?? 0) - (a[sort] ?? 0)))
  }, [data, rep, segment, q, sort])
  const uniq = (k: keyof RiskDeal) => [...new Set((data ?? []).map((d) => String(d[k])))].sort()
  const damage = rows.reduce((s, d) => s + d.expected_damage, 0)
  const top3 = rows.slice(0, 3).reduce((s, d) => s + d.expected_damage, 0)
  const max = Math.max(...rows.map((d) => d.expected_damage), 1)
  const clear = () => (setRep(''), setSegment(''), setQ(''))

  return (
    <>
      <PageHeader title="Where the risk sits" sub="Ranked by expected damage: deal value times the chance it does not close. Call from the top." />

      {error && <ErrorNote retry={retry}>Deal risk did not load. {error}</ErrorNote>}
      {!data && !error && <PageSkeleton label="Loading deal risk" variant="table" />}
      {data && (
        <div className="space-y-6">
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard i={0} label="Open deals in view" icon={Briefcase} value={rows.length} />
            <StatCard i={1} label="Expected damage" icon={TriangleAlert} value={damage} format={money} tone="loss" foot="Value at risk across these deals" />
            <StatCard i={2} label="Carried by the top 3" icon={Flame} value={damage ? top3 / damage : 0} format={(n) => pct(n)} foot={`${money(top3)} in three calls`} />
          </div>

          <Card pad={false} className="write-in overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
              <label className="relative flex-1 sm:min-w-[220px]">
                <span className="sr-only">Search deals</span>
                <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deal, rep or reason" className="field field-sm !pl-9" />
              </label>
              <Select label="Rep" value={rep} options={uniq('rep')} onChange={setRep} />
              <Select label="Segment" value={segment} options={uniq('segment')} onChange={setSegment} />
            </div>

            {rows.length === 0 ? (
              <EmptyState icon={SearchX} title="No deals match" action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}>
                Try another search, or set Rep and Segment back to All.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto px-4 sm:px-6">
                <table className="w-full text-sm md:min-w-[960px]">
                  <thead>
                    <tr className="border-b border-line text-xs text-faint">
                      {COLS.map(([key, name, align]) => (
                        <th key={name} scope="col" aria-sort={key === sort ? (key === 'p_win' ? 'ascending' : 'descending') : undefined} className={`py-3 pr-4 font-medium last:pr-0 ${align}`}>
                          {key ? (
                            <button type="button" onClick={() => setSort(key)} className={`-my-2 inline-flex min-h-10 items-center gap-1 rounded transition-colors ${key === sort ? 'text-brand' : 'hover:text-ink'}`}>
                              {name}
                              <ArrowDown size={12} aria-hidden className={`transition-all duration-300 ${key === sort ? 'opacity-100' : 'opacity-0'} ${key === 'p_win' ? 'rotate-180' : ''}`} />
                            </button>
                          ) : (
                            name
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody key={`${sort}-${rep}-${segment}`}>
                    {(all ? rows : rows.slice(0, TOP)).map((d, i) => (
                      <DealRow key={d.deal_id} d={d} i={i} max={max} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length > TOP && (
              <div className="flex justify-center border-t border-line p-4">
                <Button variant="secondary" onClick={() => setAll((v) => !v)} aria-expanded={all}>
                  {all ? `Show top ${TOP} only` : `Show all ${rows.length} deals`}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
