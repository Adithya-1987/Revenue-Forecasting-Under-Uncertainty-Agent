import type { RiskDeal } from '../types'
import { money, pct } from '../lib'
import { RangeBand } from './RangeBand'
import { ReasonChip } from './ui'

export const DealRow = ({ d }: { d: RiskDeal }) => (
  <tr className="border-b border-hair align-top last:border-0">
    <th scope="row" className="py-3 pr-4 text-left font-medium">
      {d.name}
      <span className="block text-xs font-normal text-ink/70">
        {d.rep} · {d.segment}
      </span>
    </th>
    <td className="py-3 pr-4 text-right">{money(d.value)}</td>
    <td className="py-3 pr-4">
      <span className="flex items-center gap-2">
        <RangeBand
          size="row"
          format="pct"
          low={d.p_win_low}
          mid={d.p_win}
          high={d.p_win_high}
          domain={[0, 1]}
          label={`Chance to win ${pct(d.p_win)}, between ${pct(d.p_win_low)} and ${pct(d.p_win_high)}`}
        />
        <span className="text-sm">{pct(d.p_win)}</span>
      </span>
    </td>
    <td className="py-3 pr-4">
      <span className="flex flex-wrap gap-1">
        {d.reasons.map((r) => (
          <ReasonChip key={r}>{r}</ReasonChip>
        ))}
      </span>
    </td>
    <td className="py-3 text-right font-medium text-loss">{money(d.expected_damage)}</td>
  </tr>
)
