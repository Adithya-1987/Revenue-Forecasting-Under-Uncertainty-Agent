import { useState, type ReactNode } from 'react'
import changes from '../mocks/changes.json'
import forecast from '../mocks/forecast.json'
import risk from '../mocks/risk.json'
import type { CauseType, Changes, Forecast, RiskDeal } from '../types'
import { RangeBand } from '../components/RangeBand'
import { Ledger } from '../components/Ledger'
import { Waterfall } from '../components/charts'
import { DealRow } from '../components/DealRow'
import { DeviceFrame, WaveDivider } from '../components/Stage'
import { PillTabs } from '../components/PillNav'
import { HighlightWord, KpiTile, PillButton, ReasonChip, StatFloat } from '../components/ui'

const Section = ({ name, children, dark }: { name: string; children: ReactNode; dark?: boolean }) => (
  <section className={`border-t border-forest/20 py-8 ${dark ? 'bg-forest px-6 text-white' : ''}`}>
    <h2 className="mb-4 text-sm font-medium">{name}</h2>
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
    <div className="min-h-screen bg-lime px-4 py-10 text-forest sm:px-10">
      <h1 className="font-head text-xl font-bold uppercase">Rangefinder <HighlightWord>parts</HighlightWord></h1>

      <Section name="RangeBand: hero, target inside, target above best, target below worst">
        <div className="grid gap-10 rounded-card bg-white p-6 lg:grid-cols-3">
          <RangeBand low={1520000} mid={1920000} high={2380000} target={2100000} />
          <RangeBand low={820000} mid={1100000} high={1450000} target={1600000} />
          <RangeBand low={3100000} mid={3700000} high={4400000} target={2900000} />
        </div>
        <div className="mt-4 flex items-center gap-8 rounded-card bg-white p-4">
          <span className="flex items-center gap-2 text-xs">Row <RangeBand size="row" format="pct" low={0.26} mid={0.38} high={0.51} domain={[0, 1]} /></span>
          <span className="flex items-center gap-2 text-xs">Nav <RangeBand size="nav" low={f.p10} mid={f.p50} high={f.p90} /></span>
        </div>
      </Section>

      <Section name="PillButton, PillTabs, ReasonChip">
        <div className="flex flex-wrap items-center gap-3">
          <PillButton>Run forecast</PillButton>
          <PillButton variant="secondary">See deals at risk</PillButton>
          <PillTabs label="Horizon" value={h} onChange={setH} options={[30, 60, 90].map((v) => ({ value: v, label: `${v} days` }))} />
          <ReasonChip>silent 24 days</ReasonChip>
          <ReasonChip>3rd date push</ReasonChip>
        </div>
      </Section>

      <Section name="StatFloat, KpiTile">
        <div className="flex flex-wrap gap-4">
          <StatFloat label="Expected" value="₹1.92M" delta={-0.2} note="vs last run" />
          <StatFloat label="Chance of hitting target" value="30%" delta={0.041} />
          <div className="rounded-card bg-white"><KpiTile label="Error, 30 days" value="11%" sub="Mean absolute % error" /></div>
        </div>
      </Section>

      <Section name="WaveDivider into forest, DeviceFrame" dark>
        <div className="-mx-6 bg-forest"><WaveDivider /></div>
        <div className="mx-auto max-w-xl py-6"><DeviceFrame label="Sample frame"><p className="text-ink">Frame content sits on white.</p></DeviceFrame></div>
      </Section>

      <Section name="Waterfall and Ledger (select a bar)">
        <div className="rounded-card bg-white p-6">
          <Waterfall changes={c} selected={open} onSelect={setOpen} />
          <div className="mt-6 overflow-x-auto"><Ledger changes={c} expanded={open} onToggle={(t) => setOpen((o) => (o === t ? null : t))} /></div>
        </div>
      </Section>

      <Section name="DealRow">
        <div className="overflow-x-auto rounded-card bg-white p-6">
          <table className="w-full min-w-[720px] text-sm"><tbody>{(risk as RiskDeal[]).slice(0, 2).map((d) => <DealRow key={d.deal_id} d={d} />)}</tbody></table>
        </div>
      </Section>
    </div>
  )
}
