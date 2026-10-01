import { useState, type ReactNode } from 'react'
import { CircleDollarSign, Inbox, Play, Target } from 'lucide-react'
import changes from '../mocks/changes.json'
import forecast from '../mocks/forecast.json'
import risk from '../mocks/risk.json'
import type { CauseType, Changes, Forecast, RiskDeal } from '../types'
import { money, pct } from '../lib'
import { ThemeToggle } from '../components/AppShell'
import { Ledger } from '../components/Ledger'
import { Sparkline, Waterfall } from '../components/charts'
import { DealRow } from '../components/DealRow'
import { ChartSkeleton, Dots, EngineLoader, KpiSkeleton, LogoLoader, Spinner } from '../components/Loaders'
import { Logo, LogoMark } from '../components/Logo'
import { RangeBand } from '../components/RangeBand'
import { Button, Card, DeltaBadge, EmptyState, ReasonChip, RingGauge, Segmented, StatCard } from '../components/ui'

const SWATCHES = [
  ['canvas', 'Canvas'], ['rail', 'Rail'], ['surface', 'Surface'], ['surface-2', 'Surface 2'], ['line', 'Line'],
  ['ink', 'Ink'], ['muted', 'Muted'], ['brand', 'Cobalt'], ['navy', 'Navy'],
  ['gain', 'Gain'], ['loss', 'Loss'], ['target', 'Target'], ['mint', 'Fan · best'],
  ['sky', 'Fan · expected'], ['lavender', 'Fan · worst'],
] as const

const Section = ({ name, children }: { name: string; children: ReactNode }) => (
  <section className="border-t border-line py-10">
    <h2 className="mb-5 text-lg font-semibold">{name}</h2>
    {children}
  </section>
)

/** Component sheet. Not linked from the nav. */
export default function DesignPage() {
  const f = (forecast as Record<string, Forecast>)['30-bookings']
  const c = changes as Changes
  const [h, setH] = useState(30)
  const [open, setOpen] = useState<CauseType | null>('close_date')

  return (
    <div className="min-h-dvh bg-canvas px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-[1160px]">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Design system</p>
            <h1 className="mt-1 text-3xl font-semibold">Rangefinder parts</h1>
          </div>
          <ThemeToggle />
        </div>

        <Section name="Palette: cobalt on mist">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {SWATCHES.map(([v, name]) => (
              <div key={v} className="card overflow-hidden">
                <div className="h-16 border-b border-line" style={{ background: `rgb(var(--${v}))` }} />
                <p className="px-3 py-2 text-xs"><span className="font-medium">{name}</span><span className="block text-faint">--{v}</span></p>
              </div>
            ))}
          </div>
        </Section>

        <Section name="Logo">
          <div className="flex flex-wrap items-center gap-8">
            <Logo />
            <div className="rounded-lg bg-[#0B0F17] p-4"><Logo tone="white" /></div>
            <LogoMark size={96} animated />
            <LogoMark size={32} />
            <LogoMark size={16} />
          </div>
        </Section>

        <Section name="Buttons and controls">
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={Play}>Run forecast</Button>
            <Button variant="secondary" arrow>See deals at risk</Button>
            <Button variant="ghost">Ghost</Button>
            <Button busy>Running</Button>
            <Segmented label="Horizon" value={h} onChange={setH} options={[30, 60, 90].map((v) => ({ value: v, label: `${v} days` }))} />
            <ReasonChip>silent 24 days</ReasonChip>
            <DeltaBadge value={-0.2} />
            <DeltaBadge value={0.041} />
          </div>
        </Section>

        <Section name="KPI cards">
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard i={0} label="Median outcome" icon={CircleDollarSign} value={f.p50} format={money} visual={<Sparkline values={f.series.map((s) => s.p50)} />} foot={<><DeltaBadge value={-0.2} /> vs last run</>} />
            <StatCard i={1} label="Chance of hitting target" icon={Target} value={f.prob_hit_target} format={(n) => pct(n)} visual={<RingGauge value={f.prob_hit_target} label="chance" />} />
            <StatCard i={2} label="Moved since last run" value={-480000} format={money} tone="loss" />
          </div>
        </Section>

        <Section name="RangeBand: target inside, above best, below worst">
          <div className="card card-pad grid gap-12 lg:grid-cols-3">
            <RangeBand low={1520000} mid={1920000} high={2380000} target={2100000} />
            <RangeBand low={820000} mid={1100000} high={1450000} target={1600000} />
            <RangeBand low={3100000} mid={3700000} high={4400000} target={2900000} />
          </div>
        </Section>

        <Section name="Loaders">
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Inline (buttons, chat)"><div className="flex items-center gap-6 text-brand"><Spinner size={22} /><Dots /></div></Card>
            <Card title="Logo loader"><LogoLoader size={96} /></Card>
            <Card title="Engine"><EngineLoader title="Simulating 10,000 futures" /></Card>
          </div>
          <div className="mt-4 space-y-4"><KpiSkeleton /><ChartSkeleton h="h-40" /></div>
        </Section>

        <Section name="Waterfall and ledger (select a bar)">
          <Card>
            <Waterfall changes={c} selected={open} onSelect={setOpen} />
            <div className="mt-6 overflow-x-auto"><Ledger changes={c} expanded={open} onToggle={(t) => setOpen((o) => (o === t ? null : t))} /></div>
          </Card>
        </Section>

        <Section name="Deal rows and empty state">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm"><tbody>{(risk as RiskDeal[]).slice(0, 3).map((d, i) => <DealRow key={d.deal_id} d={d} i={i} max={400000} />)}</tbody></table>
            </div>
          </Card>
          <Card className="mt-4"><EmptyState icon={Inbox} title="No uploads yet" action={<Button variant="secondary">Upload</Button>}>Upload a CSV or load the sample company to start.</EmptyState></Card>
        </Section>
      </div>
    </div>
  )
}
