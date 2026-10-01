import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown } from 'lucide-react'
import { api } from '../api/client'
import { money, useApi, useRun } from '../lib'
import type { RiskDeal } from '../types'
import { DealRow } from '../components/DealRow'
import { Stage } from '../components/Stage'
import { ErrorNote, HighlightWord, PillButton, Skeleton } from '../components/ui'

type SortKey = 'expected_damage' | 'value' | 'p_win' | 'slip_prob' | 'slip_period_prob' | 'days_in_stage'
const COLS: [SortKey | null, string, string][] = [
  [null, 'Deal', 'text-left'],
  ['value', 'Value', 'text-right'],
  ['p_win', 'Chance to win', 'text-left'],
  ['slip_prob', 'Misses its date', 'text-right'],
  ['slip_period_prob', 'Slips to a later month', 'text-right'],
  ['days_in_stage', 'In stage', 'text-right'],
  [null, 'Why', 'text-left'],
  ['expected_damage', 'Expected damage', 'text-right'],
]

const Select = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) => (
  <label className="flex items-center gap-2 text-sm">
    {label}
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-full border-2 border-forest bg-white px-3 py-1">
      <option value="">All</option>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  </label>
)

export default function RiskPage() {
  const { runId } = useRun()
  const { data, error } = useApi(() => api.risk(), [runId])
  // filters can arrive in the link, e.g. from the assistant: /app/risk?rep=Raj+Sharma
  const [params] = useSearchParams()
  const [rep, setRep] = useState(params.get('rep') ?? '')
  const [segment, setSegment] = useState(params.get('segment') ?? '')
  const [sort, setSort] = useState<SortKey>('expected_damage')
  const [all, setAll] = useState(false)
  const TOP = 15

  const rows = useMemo(() => {
    const list = (data ?? []).filter((d) => (!rep || d.rep === rep) && (!segment || d.segment === segment))
    // p_win ascending = least likely first; money columns descending.
    return list.sort((a, b) => (sort === 'p_win' ? a.p_win - b.p_win : (b[sort] ?? 0) - (a[sort] ?? 0)))
  }, [data, rep, segment, sort])
  const uniq = (k: keyof RiskDeal) => [...new Set((data ?? []).map((d) => String(d[k])))].sort()
  const top3 = rows.slice(0, 3).reduce((s, d) => s + d.expected_damage, 0)

  return (
    <Stage
      title={<>Where the <HighlightWord>risk</HighlightWord> sits</>}
      sub="Ranked by expected damage: deal value times the chance it does not close. Open a deal to see its stage and close-date history."
      frameLabel="Deal risk table"
      after={rows.length > 2 && <p className="text-lg">The top 3 rows carry {money(top3)} of expected damage.</p>}
    >
      {error && <ErrorNote>Deal risk did not load. {error}</ErrorNote>}
      {!data && !error && <Skeleton label="Loading deal risk" />}
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-4 border-b border-hair pb-4">
            <Select label="Rep" value={rep} options={uniq('rep')} onChange={setRep} />
            <Select label="Segment" value={segment} options={uniq('segment')} onChange={setSegment} />
            <p className="text-sm text-ink/70 sm:ml-auto">{rows.length} open deals</p>
          </div>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm">No deals match these filters. Set Rep or Segment back to All.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-ink text-xs text-ink/70">
                    {COLS.map(([key, name, align]) => (
                      <th key={name} scope="col" aria-sort={key === sort ? (key === 'p_win' ? 'ascending' : 'descending') : undefined} className={`py-2 pr-4 font-normal last:pr-0 ${align}`}>
                        {key ? (
                          <button type="button" onClick={() => setSort(key)} className={`inline-flex items-center gap-1 ${key === sort ? 'font-medium text-ink' : 'hover:text-ink'}`}>
                            {name}
                            {key === sort && <ArrowDown size={12} aria-hidden className={key === 'p_win' ? 'rotate-180' : ''} />}
                          </button>
                        ) : (
                          name
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(all ? rows : rows.slice(0, TOP)).map((d) => (
                    <DealRow key={d.deal_id} d={d} />
                  ))}
                </tbody>
              </table>
              {rows.length > TOP && (
                <div className="flex justify-center border-t border-hair pt-5">
                  <PillButton variant="secondary" icon={false} onClick={() => setAll((v) => !v)} aria-expanded={all}>
                    {all ? `Show top ${TOP} only` : `Show all ${rows.length} deals`}
                  </PillButton>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Stage>
  )
}
