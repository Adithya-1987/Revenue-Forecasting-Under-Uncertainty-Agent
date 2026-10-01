import { useRef, useState } from 'react'
import { ArrowRightLeft, History, ListChecks, Sigma } from 'lucide-react'
import { api } from '../api/client'
import { money, pct, signedMoney, useApi, useRun } from '../lib'
import type { CauseType, Changes } from '../types'
import { PageHeader } from '../components/AppShell'
import { ChatBox } from '../components/ChatBox'
import { Ledger } from '../components/Ledger'
import { Waterfall } from '../components/charts'
import { PageSkeleton } from '../components/Loaders'
import { Card, DeltaBadge, EmptyState, ErrorNote, StatCard } from '../components/ui'

/** Fewest deals whose moves explain 80% of the absolute change. */
function dealsFor80(c: Changes) {
  const moves = c.causes.map((x) => Math.abs(x.amount)).sort((a, b) => b - a)
  const need = 0.8 * moves.reduce((s, x) => s + x, 0)
  let sum = 0
  return moves.findIndex((m) => (sum += m) >= need) + 1
}

export default function ChangesPage() {
  const { runId } = useRun()
  const { data: c, error, retry } = useApi(() => api.changes(), [runId])
  const [open, setOpen] = useState<CauseType | null>(null)
  const ledgerRef = useRef<HTMLDivElement>(null)

  const total = c ? c.curr_total - c.prev_total : 0
  const residualShare = c ? Math.abs(c.residual / (total || 1)) : 0
  const toggle = (t: CauseType) => setOpen((o) => (o === t ? null : t))
  const fromChart = (t: CauseType) => {
    setOpen(t)
    ledgerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <>
      <PageHeader
        title="Why the number moved"
        sub={
          c
            ? `Average ${c.horizon}-day bookings moved from ${money(c.prev_total)} to ${money(c.curr_total)}. Every line below adds up to the total.`
            : 'Comparing the latest two runs.'
        }
      />

      {error && <ErrorNote retry={retry}>Changes did not load. {error}</ErrorNote>}
      {!c && !error && <PageSkeleton label="Loading changes" variant="chart" />}
      {c && c.causes.length === 0 && (
        <Card>
          <EmptyState icon={History} title="Nothing moved between the last two runs">
            Run the forecast again after the pipeline changes, or upload next week's export.
          </EmptyState>
        </Card>
      )}
      {c && c.causes.length > 0 && (
        <div className="space-y-6">
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard i={0} label="Total change" icon={ArrowRightLeft} value={total} format={signedMoney} tone={total < 0 ? 'loss' : 'gain'} foot={<><DeltaBadge value={total / c.prev_total} /> vs last run</>} />
            <StatCard i={1} label="Last run → this run" icon={History} value={`${money(c.prev_total)} → ${money(c.curr_total)}`} foot="Average outcome, same horizon" />
            <StatCard i={2} label="Deals explaining 80%" icon={ListChecks} value={dealsFor80(c)} foot="of all deal moves" />
            <StatCard
              i={3}
              label="Unexplained residual"
              icon={Sigma}
              value={residualShare}
              format={(n) => pct(n, 1)}
              tone={residualShare > 0.05 ? 'loss' : 'ink'}
              foot={<span className={`chip ${residualShare > 0.05 ? 'chip-loss' : 'chip-gain'}`}>{residualShare > 0.05 ? 'Above' : 'Within'} the 5% goal</span>}
            />
          </div>

          <Card
            className="write-in"
            title="From last run to this run"
            sub="Select a bar to open the deals behind it."
            action={
              <ul className="flex items-center gap-4 text-xs text-muted">
                <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-gain" /> Added</li>
                <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-loss" /> Removed</li>
                <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" /> Total</li>
              </ul>
            }
          >
            <Waterfall changes={c} selected={open} onSelect={fromChart} />
          </Card>

          <div ref={ledgerRef} className="scroll-mt-24">
            <Card className="write-in" title="Ledger" sub={`Causes in fixed attribution order · ${signedMoney(total)} in total`}>
              <div className="-mx-1 overflow-x-auto px-1">
                <Ledger changes={c} expanded={open} onToggle={toggle} animate={runId} />
              </div>
            </Card>
          </div>

          <ChatBox />
        </div>
      )}
    </>
  )
}
