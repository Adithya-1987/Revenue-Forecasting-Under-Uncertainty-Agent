import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { api } from '../api/client'
import type { DealHistory, RiskDeal } from '../types'
import { money, pct, shortDate } from '../lib'
import { RangeBand } from './RangeBand'
import { ReasonChip } from './ui'

export const DEAL_COLUMNS = 8

/** Stage changes and close-date pushes, oldest first, from the deal's event log. */
function Timeline({ dealId }: { dealId: string }) {
  const [h, setH] = useState<DealHistory | null>()
  const [error, setError] = useState<string>()
  if (h === undefined && !error) {
    setH(null)
    api.history(dealId).then(setH, (e: Error) => setError(e.message))
  }
  if (error) return <p className="text-sm text-loss">History did not load. {error}</p>
  if (!h) return <p role="status" className="text-sm text-ink/70">Loading history…</p>
  if (!h.events.length) return <p className="text-sm text-ink/70">No stage changes or date pushes recorded yet. They appear after the next upload.</p>
  return (
    <ol className="relative space-y-2 border-l border-hair pl-4 text-sm">
      {h.events.map((e, i) => (
        <li key={i} className="relative">
          <span aria-hidden className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full ${e.kind === 'close_date' ? 'bg-loss' : 'bg-forest'}`} />
          <span className="text-xs text-ink/70">{shortDate(e.changed_at)}</span>{' '}
          {e.kind === 'stage'
            ? e.before ? <>Stage <b className="font-medium">{e.before}</b> → <b className="font-medium">{e.after}</b></> : <>Created at <b className="font-medium">{e.after}</b></>
            : <>Close date pushed {e.before ? shortDate(e.before) : ''} → <b className="font-medium">{shortDate(e.after)}</b></>}
        </li>
      ))}
    </ol>
  )
}

export function DealRow({ d }: { d: RiskDeal }) {
  const [open, setOpen] = useState(false)
  const slip = d.slip_prob ?? null
  const slipMonth = d.slip_period_prob ?? null
  return (
    <>
      <tr className={`border-b border-hair align-top ${open ? 'bg-lime/20' : ''}`}>
        <th scope="row" className="max-w-[220px] py-3 pr-4 text-left font-medium">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-start gap-1.5 text-left">
            <ChevronRight size={16} aria-hidden className={`mt-0.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
            <span>
              {d.name}
              <span className="block text-xs font-normal text-ink/70">
                {d.rep} · {d.segment}
              </span>
            </span>
          </button>
        </th>
        <td className="py-3 pr-4 text-right">{money(d.value)}</td>
        <td className="py-3 pr-4">
          <span className="flex items-center gap-2">
            <RangeBand size="row" format="pct" low={d.p_win_low} mid={d.p_win} high={d.p_win_high} domain={[0, 1]}
              label={`Chance to win ${pct(d.p_win)}, between ${pct(d.p_win_low)} and ${pct(d.p_win_high)}`} />
            <span className="text-sm">{pct(d.p_win)}</span>
          </span>
        </td>
        <td className={`py-3 pr-4 text-right ${slip != null && slip >= 0.6 ? 'text-loss' : ''}`}>{slip == null ? '—' : pct(slip)}</td>
        <td className={`py-3 pr-4 text-right ${slipMonth != null && slipMonth >= 0.6 ? 'text-loss' : ''}`}>{slipMonth == null ? '—' : pct(slipMonth)}</td>
        <td className={`py-3 pr-4 text-right ${(d.days_in_stage ?? 0) >= 45 ? 'text-loss' : ''}`}>{d.days_in_stage ?? '—'}{d.days_in_stage != null && <span className="text-xs text-ink/60"> d</span>}</td>
        <td className="w-[240px] py-3 pr-4">
          <span className="flex max-w-[240px] flex-wrap gap-1">
            {d.reasons.map((r) => <ReasonChip key={r}>{r}</ReasonChip>)}
          </span>
        </td>
        <td className="py-3 text-right font-medium text-loss">{money(d.expected_damage)}</td>
      </tr>
      {open && (
        <tr className="border-b border-hair bg-lime/20">
          <td colSpan={DEAL_COLUMNS} className="px-6 pb-4 pt-1">
            <p className="mb-2 text-xs text-ink/70">
              {d.stage ?? ''} {d.days_in_stage != null ? `for ${d.days_in_stage} days` : ''}
              {d.expected_close_date ? ` · promised close ${shortDate(d.expected_close_date)}` : ''}
              {d.age_days != null ? ` · open ${d.age_days} days` : ''}
            </p>
            <Timeline dealId={d.deal_id} />
          </td>
        </tr>
      )}
    </>
  )
}
