import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { RiskDeal } from '../types'
import { money, pct } from '../lib'
import { RangeBand } from './RangeBand'
import { ReasonChip } from './ui'
import { DealTimeline } from './DealTimeline'

const SEG_TONE: Record<RiskDeal['segment'], string> = {
  Enterprise: 'bg-info/10 text-info',
  'Mid-Market': 'bg-brand-soft text-brand',
  SMB: 'bg-surface-2 text-muted',
}

/** Initials badge, so rows are scannable at a glance. */
const Avatar = ({ name }: { name: string }) => (
  <span aria-hidden className="hidden size-8 shrink-0 place-items-center sm:grid rounded-md bg-surface-2 text-xs font-semibold text-muted ring-1 ring-inset ring-line">
    {name.slice(0, 2).toUpperCase()}
  </span>
)

const COLS = 7

/** One deal; clicking the name opens its history underneath. */
export function DealRow({ d, i = 0, max }: { d: RiskDeal; i?: number; max?: number }) {
  const [open, setOpen] = useState(false)
  return (
  <Fragment>
  <tr className="write-in border-b border-line/70 align-middle transition-colors last:border-0 hover:bg-surface-2/70" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
    <th scope="row" className="py-3 pr-4 text-left font-normal">
      <span className="flex items-center gap-3">
        <Avatar name={d.name} />
        <span className="min-w-0">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1 truncate rounded text-left font-medium text-ink hover:text-brand">
            {d.name}
            <ChevronDown size={14} aria-hidden className={`shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {d.rep}
            <span className={`chip !px-1.5 !py-0 text-xs sm:text-2xs ${SEG_TONE[d.segment]}`}>{d.segment}</span>
          </span>
          {/* phones: the columns hidden on narrow screens, folded in */}
          <span className="mt-1 block text-xs text-faint md:hidden">
            {money(d.value)}
            {d.reasons[0] && ` · ${d.reasons[0]}`}
          </span>
        </span>
      </span>
    </th>
    <td className="hidden py-3 pr-4 text-right font-medium md:table-cell">{money(d.value)}</td>
    <td className="py-3 pr-4">
      <span className="flex items-center gap-2 sm:gap-2.5">
        <RangeBand
          size="row"
          format="pct"
          low={d.p_win_low}
          mid={d.p_win}
          high={d.p_win_high}
          domain={[0, 1]}
          label={`Chance to win ${pct(d.p_win)}, between ${pct(d.p_win_low)} and ${pct(d.p_win_high)}`}
        />
        <span className="text-sm font-medium">{pct(d.p_win)}</span>
      </span>
    </td>
    <td className="hidden py-3 pr-4 text-right md:table-cell">{d.slip_prob == null ? '–' : pct(d.slip_prob)}</td>
    <td className="hidden py-3 pr-4 text-right md:table-cell">{d.slip_period_prob == null ? '–' : pct(d.slip_period_prob)}</td>
    <td className="hidden py-3 pr-4 md:table-cell">
      {d.stage && <span className="block text-xs text-muted">{d.stage}{d.days_in_stage != null && ` · ${d.days_in_stage}d`}</span>}
      <span className="flex flex-wrap gap-1">
        {d.reasons.map((r) => (
          <ReasonChip key={r}>{r}</ReasonChip>
        ))}
      </span>
    </td>
    <td className="py-3 text-right">
      <span className="block font-semibold text-loss">{money(d.expected_damage)}</span>
      {max != null && (
        <span aria-hidden className="ml-auto mt-1 block h-1 w-20 overflow-hidden rounded-full bg-surface-2">
          <span className="block h-full rounded-full bg-loss/70" style={{ width: `${(d.expected_damage / max) * 100}%` }} />
        </span>
      )}
    </td>
  </tr>
  {open && (
    <tr className="border-b border-line/70 bg-surface-2/40">
      <td colSpan={COLS} className="px-2 py-5">
        <DealTimeline id={d.deal_id} />
      </td>
    </tr>
  )}
  </Fragment>
  )
}
