import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import forecast from '../mocks/forecast.json'
import type { Forecast } from '../types'
import { FanLanding } from '../components/charts'
import { RangeBand } from '../components/RangeBand'
import { DeviceFrame, Leaves, Mark, WaveDivider } from '../components/Stage'
import { HighlightWord, PillButton } from '../components/ui'

// Illustrative numbers from the sample company, drawn with the real charts.
const preview = (forecast as Record<string, Forecast>)['30-bookings']

const STEPS = [
  ['Upload your pipeline', 'Export open and closed deals from your CRM as a CSV. No integration to set up.'],
  ['We run 10,000 futures', 'Each deal gets its own chance to close, a realistic close date and a cash date, learned from your history.'],
  ['See the range, and why it moved', 'Worst, median and best for 30, 60 and 90 days, with every change since last week named, deal by deal.'],
]

export default function LandingPage() {
  const { session } = useAuth()
  useEffect(() => void (document.title = 'Rangefinder · Revenue forecasts as a range'), [])

  return (
    <>
      <header className="bg-lime">
        <div className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Rangefinder home">
            <Mark />
            <span className="font-logo text-[22px] leading-none text-forest">Rangefinder</span>
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            {session ? (
              <PillButton to="/app">Open dashboard</PillButton>
            ) : (
              <>
                <PillButton to="/login" variant="secondary" icon={false}>Sign in</PillButton>
                <PillButton to="/login?mode=signup" className="hidden sm:inline-flex">Start free</PillButton>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="bg-lime pb-8 text-forest">
          <div className="mx-auto max-w-[920px] px-4 pt-12 text-center sm:pt-20">
            <h1 className="text-balance font-head text-[40px] font-bold uppercase leading-[1.02] tracking-tight sm:text-2xl">
              See next quarter as a <HighlightWord>range</HighlightWord>
            </h1>
            <p className="mx-auto mt-5 max-w-[58ch] text-pretty text-lg text-forest/90">
              Your CRM gives one hopeful number. Rangefinder simulates your pipeline ten thousand times and shows where revenue
              will really land, and exactly why it moved since last week.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <PillButton to={session ? '/app' : '/login?mode=signup'}>{session ? 'Open dashboard' : 'Start free'}</PillButton>
              <PillButton to={session ? '/app/data' : '/login'} variant="secondary" icon={false}>
                {session ? 'Upload data' : 'Sign in'}
              </PillButton>
            </div>
          </div>
        </section>

        <section aria-label="Product preview" className="relative overflow-hidden bg-sage pb-20">
          <Leaves />
          <div aria-hidden className="absolute inset-x-0 top-0 h-[420px] bg-forest" />
          <WaveDivider className="absolute inset-x-0 top-0" />
          <div className="relative mx-auto max-w-[1000px] px-4 pt-6 sm:pt-12">
            <DeviceFrame label="Example forecast">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-head text-lg font-bold">30-day bookings</p>
                <p className="text-xs text-ink/70">Sample company · illustrative</p>
              </div>
              <div className="mt-8 px-2 sm:px-6">
                <RangeBand low={preview.p10} mid={preview.p50} high={preview.p90} target={preview.target} />
              </div>
              <div className="mt-6 border-t border-hair pt-6">
                <FanLanding f={preview} />
              </div>
            </DeviceFrame>

            <ol className="mt-14 grid gap-8 text-white md:grid-cols-3">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="border-t border-white/30 pt-5">
                  <p className="text-sm font-medium text-lime">Step {i + 1}</p>
                  <h2 className="mt-2 font-head text-lg font-bold">{title}</h2>
                  <p className="mt-2 text-pretty text-base text-white/90">{body}</p>
                </li>
              ))}
            </ol>

            <div className="mt-14 flex flex-col items-start justify-between gap-4 rounded-frame bg-forest p-8 text-white sm:flex-row sm:items-center">
              <p className="max-w-[46ch] text-lg">Try it with a sample company in under a minute. No CRM connection needed.</p>
              <div className="on-dark">
                <PillButton to={session ? '/app/data' : '/login?mode=signup'} variant="secondary">
                  {session ? 'Go to data' : 'Create your workspace'}
                </PillButton>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-sage pb-10">
        <p className="mx-auto max-w-[1000px] border-t border-white/25 px-4 pt-6 text-sm text-white">
          Rangefinder · open-source forecasting. Your data stays in your workspace.
        </p>
      </footer>
    </>
  )
}
