import { ChevronRight } from 'lucide-react'
import type { Cause, CauseType, Changes } from '../types'
import { figure } from '../lib'

/** Fixed attribution order. Never reorder: interaction effects leak into later steps. */
export const CAUSE_ORDER: CauseType[] = [
  'closed_won',
  'closed_lost',
  'new_deal',
  'value_change',
  'stage_move',
  'close_date',
  'decay',
  'calibration',
  'window_shift',
]

export const CAUSE_LABEL: Record<CauseType, [long: string, short: string]> = {
  closed_won: ['Closed won', 'Won'],
  closed_lost: ['Closed lost', 'Lost'],
  new_deal: ['New deals', 'New'],
  value_change: ['Deal value changed', 'Value'],
  stage_move: ['Stage moved', 'Stage'],
  close_date: ['Close date moved', 'Date'],
  decay: ['Activity and silence', 'Activity'],
  calibration: ['Model and rep calibration', 'Model'],
  window_shift: ['Time passed', 'Time'],
}

export interface CauseGroup {
  type: CauseType
  amount: number
  items: Cause[]
}

export function groupCauses(c: Changes): CauseGroup[] {
  return CAUSE_ORDER.map((type) => {
    const items = c.causes.filter((x) => x.cause_type === type)
    return { type, items, amount: items.reduce((s, x) => s + x.amount, 0) }
  }).filter((g) => g.items.length)
}

/** Bar from a shared zero in the middle of the cell. Sign is also in the figure, never colour alone. */
function ZeroBar({ amount, max }: { amount: number; max: number }) {
  const w = `${(Math.abs(amount) / max) * 50}%`
  return (
    <div aria-hidden className="relative h-3 w-24 sm:w-40">
      <div className="absolute inset-y-[-3px] left-1/2 w-px bg-ink/30" />
      <div
        className={`absolute inset-y-0 ${amount < 0 ? 'right-1/2 bg-loss' : 'left-1/2 bg-gain'}`}
        style={{ width: w }}
      />
    </div>
  )
}

interface Props {
  changes: Changes
  expanded: CauseType | null
  onToggle: (t: CauseType) => void
  /** Run id; rows write in after each completed run (after the band finishes moving). 0 = no animation. */
  animate?: number
}

export function Ledger({ changes, expanded, onToggle, animate }: Props) {
  const groups = groupCauses(changes)
  const total = changes.curr_total - changes.prev_total
  const max = Math.max(...groups.map((g) => Math.abs(g.amount)), Math.abs(changes.residual), 1)
  const rowAnim = (i: number) =>
    animate ? { className: 'write-in', style: { animationDelay: `${650 + i * 70}ms` } } : {}

  return (
    <table className="w-full font-mono text-sm">
      <caption className="sr-only">Causes of the forecast change, in attribution order</caption>
      <thead>
        <tr className="border-b border-ink text-left text-xs text-ink/70">
          <th scope="col" className="py-2 pr-3 font-normal">Cause</th>
          <th scope="col" className="hidden py-2 pr-3 font-normal sm:table-cell">Deals</th>
          <th scope="col" className="py-2 pr-3 text-right font-normal">Amount</th>
          <th scope="col" className="py-2 font-normal"><span className="sr-only">Size from zero</span></th>
        </tr>
      </thead>
      {groups.map((g, i) => {
        const open = expanded === g.type
        const one = g.items.length === 1 ? g.items[0] : null
        return (
          <tbody key={`${g.type}-${animate}`} {...rowAnim(i)}>
            <tr className={open ? 'bg-lime/40' : 'hover:bg-lime/25'}>
              <td className="py-2.5 pr-3">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => onToggle(g.type)}
                  className="flex items-start gap-1.5 text-left"
                >
                  <ChevronRight size={16} aria-hidden className={`mt-0.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                  <span>
                    {CAUSE_LABEL[g.type][0]}
                    {one && <span className="block text-xs text-ink/70">{one.deal_name}</span>}
                  </span>
                </button>
              </td>
              <td className="hidden py-2.5 pr-3 text-ink/70 sm:table-cell">
                {one?.deal_name ?? `${g.items.length} deals`}
              </td>
              <td className={`py-2.5 pr-3 text-right ${g.amount < 0 ? 'text-loss' : 'text-gain'}`}>{figure(g.amount)}</td>
              <td className="py-2.5"><ZeroBar amount={g.amount} max={max} /></td>
            </tr>
            {open &&
              g.items.map((x) => (
                <tr key={x.deal_id ?? x.description} className="bg-lime/20 text-xs">
                  <td colSpan={2} className="py-1.5 pl-7 pr-3">
                    <span className="font-medium">{x.deal_name ?? 'All deals'}</span>
                    <span className="block font-sans text-ink/70 sm:inline sm:before:content-['_·_']">{x.description}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right">{figure(x.amount)}</td>
                  <td />
                </tr>
              ))}
          </tbody>
        )
      })}
      <tbody key={`end-${animate}`} {...rowAnim(groups.length)}>
        <tr className="text-ink/70">
          <td className="py-2.5 pr-3 pl-[22px]">
            Interaction residual
            <span className="block font-sans text-xs">What the fixed order could not assign</span>
          </td>
          <td className="hidden sm:table-cell" />
          <td className="py-2.5 pr-3 text-right">{figure(changes.residual)}</td>
          <td className="py-2.5"><ZeroBar amount={changes.residual} max={max} /></td>
        </tr>
        <tr className="border-t border-ink font-medium">
          <td className="py-3 pr-3 pl-[22px]">Total change</td>
          <td className="hidden sm:table-cell" />
          <td className={`py-3 pr-3 text-right ${total < 0 ? 'text-loss' : 'text-gain'}`}>{figure(total)}</td>
          <td />
        </tr>
        {Math.abs(groups.reduce((s, g) => s + g.amount, 0) + changes.residual - total) > 1 && (
          <tr>
            <td colSpan={4} role="alert" className="py-2 font-sans text-xs text-loss">
              These lines do not add up to the total change. Rerun the forecast to rebuild the attribution.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
