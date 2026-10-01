import { useState } from 'react'
import { ArrowRight, CalendarClock, ChevronDown, CircleCheck, CircleX, IndianRupee, Layers, Plus, type LucideIcon } from 'lucide-react'
import { api } from '../api/client'
import { money, shortDate, useApi, useRun } from '../lib'
import type { DealEvent } from '../types'
import { Card, EmptyState, ErrorNote, Segmented } from './ui'
import { Shimmer, TableSkeleton } from './Loaders'

type Filter = 'all' | 'stage' | 'close_date' | 'value' | 'status'

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const TODAY = new Date().toISOString().slice(0, 10) // days-in-stage is counted to the day the page loaded
const withYear = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Icon, tone and one plain sentence per logged change. */
function describe(e: DealEvent): { icon: LucideIcon; tone: string; text: string; note?: string } {
  switch (e.kind) {
    case 'created':
      return { icon: Plus, tone: 'text-brand bg-brand-soft', text: `Created at ${e.to_value?.toLowerCase()}` }
    case 'stage':
      return { icon: Layers, tone: 'text-brand bg-brand-soft', text: `${e.from_value} → ${e.to_value}` }
    case 'close_date': {
      const shift = e.from_value && e.to_value ? days(e.from_value, e.to_value) : 0
      return {
        icon: CalendarClock,
        tone: shift > 0 ? 'text-target bg-target/10' : 'text-gain bg-gain/10',
        text: `Close date ${shortDate(e.from_value ?? '')} → ${shortDate(e.to_value ?? '')}`,
        note: shift ? `${shift > 0 ? 'pushed' : 'pulled in'} ${Math.abs(shift)} days` : undefined,
      }
    }
    case 'value': {
      const from = Number(e.from_value)
      const to = Number(e.to_value)
      return {
        icon: IndianRupee,
        tone: to < from ? 'text-loss bg-loss/10' : 'text-gain bg-gain/10',
        text: `Value ${money(from)} → ${money(to)}`,
        note: from ? `${to < from ? '−' : '+'}${Math.round((Math.abs(to - from) / from) * 100)}%` : undefined,
      }
    }
    case 'status':
      if (e.to_value === 'won') return { icon: CircleCheck, tone: 'text-gain bg-gain/10', text: 'Closed won' }
      if (e.to_value === 'lost') return { icon: CircleX, tone: 'text-loss bg-loss/10', text: 'Closed lost' }
      return { icon: ArrowRight, tone: 'text-muted bg-surface-2', text: `Reopened (${e.from_value} → ${e.to_value})` }
  }
}

function ChangeIcon({ e }: { e: DealEvent }) {
  const { icon: Icon, tone } = describe(e)
  return (
    <span className={`relative grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-surface ${tone}`}>
      <Icon size={14} aria-hidden />
    </span>
  )
}

/** The whole life of one deal: facts on the left, every logged change in date order on the right. */
export function DealTimeline({ id }: { id: string }) {
  const { data, error, retry } = useApi(() => api.dealHistory(id), [id])
  if (error) return <ErrorNote retry={retry}>History did not load. {error}</ErrorNote>
  if (!data)
    return (
      <div className="space-y-3 py-2" aria-busy>
        <Shimmer className="h-4 w-2/3 rounded" />
        <Shimmer className="h-4 w-1/2 rounded" />
        <Shimmer className="h-4 w-3/5 rounded" />
      </div>
    )
  const d = data.deal
  const facts: [string, string][] = [
    ['Account', `${d.account} · ${d.segment}`],
    ['Owner', d.team ? `${d.rep} · ${d.team} team` : d.rep],
    ['Value', money(d.value)],
    d.status === 'open'
      ? ['In stage', `${d.stage} for ${Math.max(days(d.stage_entered_at, TODAY), 0)} days`]
      : ['Outcome', `${d.status === 'won' ? 'Won' : 'Lost'} at ${d.stage.toLowerCase()}`],
    ['Close date', `${withYear(d.expected_close_date)}${d.push_count ? ` · pushed ${d.push_count}×` : ''}`],
    ['Payment terms', `${d.payment_terms_days} days`],
  ]
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,15rem)_1fr]">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-1">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-faint">{k}</dt>
            <dd className="font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-line" aria-label={`History of ${d.name}`}>
        {data.events.map((e, i) => {
          const { text, note } = describe(e)
          return (
            <li key={i} className="relative flex items-start gap-3">
              <ChangeIcon e={e} />
              <div className="min-w-0 pt-0.5 text-sm">
                <p className="font-medium text-ink">{text}</p>
                <p className="text-xs text-faint">
                  {withYear(e.at)}
                  {note && <> · {note}</>}
                  {e.source === 'csv' && <> · from a CSV upload</>}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'stage', label: 'Stage' },
  { value: 'close_date', label: 'Close date' },
  { value: 'value', label: 'Value' },
  { value: 'status', label: 'Outcome' },
]

/** Latest stage moves, date pushes, value changes and outcomes across the workspace. A row opens that deal's history. */
export function PipelineChanges() {
  const { runId } = useRun()
  const { data, error, retry } = useApi(() => api.events(100), [runId])
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const rows = (data ?? []).filter((e) => filter === 'all' || e.kind === filter)

  return (
    <Card
      pad={false}
      title="Pipeline changes"
      sub="Stage moves, close-date changes, value changes and outcomes, logged as your data comes in. Select one to see the deal's full history."
      action={<Segmented label="Change type" size="sm" options={FILTERS} value={filter} onChange={setFilter} />}
    >
      {error && <div className="px-6 pb-6"><ErrorNote retry={retry}>Changes did not load. {error}</ErrorNote></div>}
      {!data && !error && <div className="px-6 pb-6"><TableSkeleton rows={5} /></div>}
      {data && !rows.length && (
        <EmptyState icon={Layers} title={data.length ? 'Nothing of this type yet' : 'No changes yet'}>
          {data.length ? 'Try another change type.' : 'Upload next week’s pipeline: every stage move and date push shows up here.'}
        </EmptyState>
      )}
      {!!rows.length && (
        <ul className="divide-y divide-line/70 border-t border-line">
          {rows.map((e, i) => {
            const { text, note } = describe(e)
            const key = `${e.deal_id}-${e.kind}-${e.at}-${i}`
            const isOpen = open === key
            return (
              <li key={key} className="write-in" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-surface-2/70"
                >
                  <ChangeIcon e={e} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{e.deal_name}</span>
                    <span className="block truncate text-sm text-muted">
                      {text}
                      {note && <span className="text-faint"> · {note}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-faint">{shortDate(e.at)}</span>
                  <ChevronDown size={16} aria-hidden className={`shrink-0 text-faint transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="write-in border-t border-line/70 bg-surface-2/50 px-6 py-5">
                    <DealTimeline id={e.deal_id} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
