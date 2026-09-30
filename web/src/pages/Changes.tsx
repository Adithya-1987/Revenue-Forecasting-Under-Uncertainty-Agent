import { useRef, useState } from 'react'
import { api } from '../api/client'
import { money, pct, useApi, useRun } from '../lib'
import type { CauseType, Changes } from '../types'
import { ChatBox } from '../components/ChatBox'
import { Ledger } from '../components/Ledger'
import { Waterfall } from '../components/charts'
import { Stage } from '../components/Stage'
import { ErrorNote, FrameChip, HighlightWord, Skeleton, StatFloat } from '../components/ui'

/** Fewest deals whose moves explain 80% of the absolute change. */
function dealsFor80(c: Changes) {
  const moves = c.causes.map((x) => Math.abs(x.amount)).sort((a, b) => b - a)
  const need = 0.8 * moves.reduce((s, x) => s + x, 0)
  let sum = 0
  return moves.findIndex((m) => (sum += m) >= need) + 1
}

export default function ChangesPage() {
  const { runId } = useRun()
  const { data: c, error } = useApi(() => api.changes(), [runId])
  const [open, setOpen] = useState<CauseType | null>(null)
  const ledgerRef = useRef<HTMLDivElement>(null)

  const total = c ? c.curr_total - c.prev_total : 0
  const toggle = (t: CauseType) => setOpen((o) => (o === t ? null : t))
  const fromChart = (t: CauseType) => {
    setOpen(t)
    ledgerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <Stage
      title={<>Why the number <HighlightWord>moved</HighlightWord></>}
      sub={c ? `Average ${c.horizon}-day bookings moved from ${money(c.prev_total)} to ${money(c.curr_total)}. Every line below adds up to the total.` : 'Loading the latest two runs.'}
      frameLabel="Forecast change breakdown"
      after={<ChatBox />}
      chip={
        c && (
          <FrameChip className="left-8 sm:left-40">
            Unexplained {pct(Math.abs(c.residual / (total || 1)), 1)} of the change
          </FrameChip>
        )
      }
      floats={
        c && (
          <>
            <StatFloat className="xl:absolute xl:-left-20 xl:top-12" label="Total change" value={money(total)} delta={total / c.prev_total} />
            <StatFloat className="xl:absolute xl:-right-16 xl:top-28" label="Deals explaining 80%" value={String(dealsFor80(c))} note="of all deal moves" />
          </>
        )
      }
    >
      {error && <ErrorNote>Changes did not load. {error}</ErrorNote>}
      {!c && !error && <Skeleton label="Loading changes" />}
      {c && c.causes.length === 0 && (
        <p className="text-sm">Nothing moved between the last two runs. Run the forecast again after the pipeline changes.</p>
      )}
      {c && c.causes.length > 0 && (
        <>
          <h2 className="font-head text-lg font-bold">From last run to this run</h2>
          <p className="mt-1 text-sm text-ink/70">Select a bar to see the deals behind it.</p>
          <div className="mt-4">
            <Waterfall changes={c} selected={open} onSelect={fromChart} />
          </div>
          <div ref={ledgerRef} className="mt-8 border-t border-hair pt-6">
            <h2 className="mb-3 font-head text-lg font-bold">Ledger</h2>
            <div className="overflow-x-auto">
              <Ledger changes={c} expanded={open} onToggle={toggle} animate={runId} />
            </div>
          </div>
        </>
      )}
    </Stage>
  )
}
