import { useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { money, useApi, useRun } from '../lib'
import { RangeBand } from './RangeBand'
import PillNav from './PillNav'
import { PillButton } from './ui'

/** Curved edge: `top` colour above the curve, the parent's background below it. */
export const WaveDivider = ({ flip = false, top = 'rgb(var(--lime))', className = '' }) => (
  <svg
    viewBox="0 0 1440 140"
    preserveAspectRatio="none"
    aria-hidden
    className={`block h-[70px] w-full sm:h-[140px] ${flip ? '-scale-x-100' : ''} ${className}`}
  >
    <path d="M0 0H1440V36C1180 118 930 132 690 92 450 52 250 30 0 88Z" fill={top} />
  </svg>
)

export const DeviceFrame = ({ children, label, roomy }: { children: ReactNode; label?: string; roomy?: boolean }) => (
  <section
    aria-label={label}
    className="relative rounded-frame bg-ink p-2.5 ring-1 ring-white/10 sm:p-3.5"
  >
    <span aria-hidden className="absolute left-1/2 top-1 size-1.5 -translate-x-1/2 rounded-full bg-white/20 sm:top-1.5" />
    <div className={`overflow-hidden rounded-[18px] bg-white p-4 sm:p-8 ${roomy ? 'xl:px-28' : ''}`}>{children}</div>
  </section>
)

const LEAF = 'M0 200C30 90 120 10 260 0 240 110 150 190 0 200Z'

/** Quiet texture on the sage band: two hand-drawn leaf silhouettes. */
export const Leaves = () => (
  <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMax slice">
    <g fill="#ffffff" fillOpacity="0.05" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="2">
      <g transform="translate(-40 520) rotate(-18) scale(2.2)">
        <path d={LEAF} />
        <path d="M0 200C80 120 170 50 260 0" fill="none" />
      </g>
      <g transform="translate(1180 460) rotate(24) scale(1.8)">
        <path d={LEAF} />
        <path d="M0 200C80 120 170 50 260 0" fill="none" />
      </g>
    </g>
  </svg>
)

/** Logo mark: the range band as a glyph. */
export const Mark = () => (
  <span aria-hidden className="grid size-[42px] shrink-0 place-items-center rounded-full bg-forest">
    <svg viewBox="0 0 24 24" className="size-5">
      <rect x="3" y="11" width="18" height="2" rx="1" fill="#d9f79a" />
      <circle cx="10" cy="12" r="3.5" fill="#d9f79a" />
    </svg>
  </span>
)

const LINKS = [
  ['/app', 'Dashboard'],
  ['/app/forecast', 'Forecast'],
  ['/app/changes', 'What changed'],
  ['/app/risk', 'Deal risk'],
  ['/app/trust', 'Trust'],
  ['/app/data', 'Data'],
]

/** Account menu: native <details> gives open/close, Escape-free keyboard use and no extra state. */
function Account() {
  const { me, signOut } = useAuth()
  const navigate = useNavigate()
  if (!me) return null
  const initial = (me.user.email?.[0] ?? '?').toUpperCase()
  return (
    <details className="group relative">
      <summary
        aria-label={`Account: ${me.user.email}`}
        className="grid size-[42px] cursor-pointer list-none place-items-center rounded-full border border-forest/20 bg-white font-medium text-forest [&::-webkit-details-marker]:hidden"
      >
        {initial}
      </summary>
      <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-64 rounded-card border border-forest/10 bg-white p-2 text-sm shadow-[0_16px_40px_-16px_rgba(22,32,30,0.45)]">
        <p className="px-3 pt-2 text-xs text-ink/70">Signed in as</p>
        <p className="truncate px-3 pb-2 font-medium">{me.user.email}</p>
        {me.workspace && <p className="border-t border-hair px-3 py-2 text-xs text-ink/70">Workspace · {me.workspace.name}</p>}
        <button
          type="button"
          onClick={() => signOut().then(() => navigate('/'))}
          className="w-full rounded-lg px-3 py-2 text-left hover:bg-lime/60"
        >
          Sign out
        </button>
      </div>
    </details>
  )
}

function Nav() {
  const { runId, running, error, updatedAt, run } = useRun()
  const { me } = useAuth()
  const hasRuns = !!me?.workspace?.runs
  const { data: f } = useApi(() => (hasRuns ? api.forecast(30, 'bookings') : Promise.resolve(undefined)), [runId, hasRuns])
  const { pathname } = useLocation()
  useEffect(() => {
    const page = LINKS.find(([to]) => to === pathname)?.[1]
    document.title = page ? `${page} · Rangefinder` : 'Rangefinder'
  }, [pathname])

  return (
    <div className="sticky top-0 z-30 bg-lime shadow-[0_1px_0_rgba(30,45,38,0.1)]">
      <div className="mx-auto grid h-[68px] max-w-[1200px] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 min-[861px]:grid-cols-[1fr_auto_1fr]">
        <Link to="/app" className="flex items-center gap-2.5 justify-self-start rounded-lg" aria-label="Rangefinder dashboard">
          <Mark />
          <span className="hidden font-logo text-[22px] leading-none text-forest min-[420px]:inline">Rangefinder</span>
        </Link>

        <PillNav
          items={LINKS.map(([href, label]) => ({ href, label }))}
          activeHref={pathname}
          className="order-last justify-self-end min-[861px]:order-none min-[861px]:justify-self-center"
          ease="power2.easeOut"
          baseColor="#1e2d26"
          pillColor="#d9f79a"
          pillTextColor="#1e2d26"
          hoveredPillTextColor="#ffffff"
        />

        <div className="flex items-center gap-3 justify-self-end">
          {f && (
            <span className="hidden items-center gap-2 text-xs text-forest xl:flex" title="30-day bookings range">
              <RangeBand size="nav" low={f.p10} mid={f.p50} high={f.p90} />
              <span className="whitespace-nowrap">
                {money(f.p10)} to {money(f.p90)}
              </span>
            </span>
          )}
          <span aria-live="polite" className="hidden whitespace-nowrap text-xs text-forest/80 lg:inline">
            {running ? 'Running 10,000 futures' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          {hasRuns && (
            <PillButton onClick={run} busy={running} icon={!running} className="!h-[42px] !px-5">
              {running ? 'Running' : 'Run forecast'}
            </PillButton>
          )}
          <Account />
        </div>
      </div>
      {error && (
        <p role="alert" className="mx-auto max-w-[1200px] px-4 pb-2 text-right text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  )
}

interface StageProps {
  title: ReactNode
  sub: string
  controls?: ReactNode
  /** StatFloats: absolute on xl around the frame, inline grid below it otherwise. */
  floats?: ReactNode
  frameLabel: string
  children: ReactNode
  after?: ReactNode
  /** Small chip pinned to the frame's top edge, as in the reference. */
  chip?: ReactNode
}

/** Every screen: lime hero, wave into forest, device frame straddling the edge, sage below. */
export function Stage({ title, sub, controls, floats, frameLabel, children, after, chip }: StageProps) {
  return (
    <>
      <Nav />
      <header className="bg-lime pb-6 text-forest">
        <div className="mx-auto max-w-[900px] px-4 pt-10 text-center sm:pt-14">
          <h1 className="text-balance font-head text-[36px] font-bold uppercase leading-[1.02] tracking-tight sm:text-2xl">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-[60ch] text-pretty text-base text-forest/90">{sub}</p>
          {controls && <div className="mt-6 flex flex-wrap justify-center gap-3">{controls}</div>}
        </div>
      </header>

      <main className="relative overflow-hidden bg-sage pb-16">
        <Leaves />
        <div aria-hidden className="absolute inset-x-0 top-0 h-[420px] bg-forest" />
        <WaveDivider className="absolute inset-x-0 top-0" />
        <div className="relative mx-auto max-w-[1100px] px-4 pt-6 sm:pt-12">
          <div className="relative">
            <DeviceFrame label={frameLabel} roomy={!!floats}>{children}</DeviceFrame>
            {chip}
            {floats && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:mt-0 xl:block">{floats}</div>}
          </div>
          {after && <div className="on-dark mt-8 text-white">{after}</div>}
        </div>
      </main>
    </>
  )
}
