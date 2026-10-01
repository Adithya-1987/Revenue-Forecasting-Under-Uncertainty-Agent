import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Database,
  Megaphone,
  GitCompareArrows,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Play,
  ShieldCheck,
  Sun,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { DEMO } from '../demo'
import { money, useApi, useRun } from '../lib'
import { useTheme } from '../theme'
import { LogoLoader } from './Loaders'
import { Logo } from './Logo'
import { RangeBand } from './RangeBand'
import { Button } from './ui'

type NavItem = { to: string; label: string; title: string; icon: LucideIcon; hint: string }
const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Main menu', items: [{ to: '/app', label: 'Dashboard', title: 'Dashboard', icon: LayoutDashboard, hint: 'This week at a glance' }] },
  {
    section: 'Forecast',
    items: [
      { to: '/app/forecast', label: 'Forecast range', title: 'Forecast', icon: Activity, hint: 'Best, expected and worst case' },
      { to: '/app/changes', label: 'What changed', title: 'What changed', icon: GitCompareArrows, hint: 'Why the number moved' },
      { to: '/app/risk', label: 'Deal risk', title: 'Deal risk', icon: TriangleAlert, hint: 'Who to call first' },
      { to: '/app/trust', label: 'Accuracy', title: 'Accuracy', icon: ShieldCheck, hint: 'How far to trust it' },
    ],
  },
  { section: 'Grow', items: [{ to: '/app/manager', label: 'Manager', title: 'Manager', icon: Megaphone, hint: 'Promotions and marketing' }] },
  { section: 'Workspace', items: [{ to: '/app/data', label: 'Data & targets', title: 'Data & targets', icon: Database, hint: 'Pipeline uploads' }] },
]
const ALL = NAV.flatMap((s) => s.items)

/* ------------------------------------------------------------------ sidebar */

function SideNav({ onNavigate, id }: { onNavigate?: () => void; id: string }) {
  const { pathname } = useLocation()
  const { me } = useAuth()
  const ws = me?.workspace
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-20 shrink-0 items-center px-6">
        <Link to="/app" onClick={onNavigate} aria-label="Rangefinder dashboard" className="rounded-md">
          <Logo size={32} wordClass="text-[18px]" />
        </Link>
      </div>

      <nav aria-label="Main" className="mt-2 flex-1 space-y-7 overflow-y-auto px-4 pb-6">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="px-3 text-xs font-medium text-faint">{group.section}</p>
            <ul className="mt-2 space-y-1">
              {group.items.map(({ to, label, icon: Icon, hint }) => {
                const on = pathname === to
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={onNavigate}
                      title={hint}
                      aria-current={on ? 'page' : undefined}
                      className={`group relative flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-medium transition-colors duration-150 ${
                        on ? 'text-ink' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {on && (
                        <motion.span
                          layoutId={`${id}-active`}
                          aria-hidden
                          className="absolute inset-0 rounded-2xl bg-white/85 shadow-[0_1px_2px_rgb(var(--shadow)/0.08),0_8px_20px_-10px_rgb(var(--shadow)/0.35)] ring-1 ring-white dark:bg-white/10 dark:ring-white/10"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        />
                      )}
                      <Icon size={18} aria-hidden className={`relative transition-colors ${on ? 'text-brand' : 'text-faint group-hover:text-muted'}`} />
                      <span className="relative">{label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-3 p-4">
        {ws && (
          <div className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-navy text-xs font-semibold text-white dark:bg-white/10">
              {ws.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{ws.name}</span>
              <span className="block text-xs text-faint">
                {ws.deals.toLocaleString('en-US')} deals · {ws.runs} {ws.runs === 1 ? 'run' : 'runs'}
              </span>
            </span>
          </div>
        )}
        <p className="px-2 text-xs text-faint">
          {DEMO ? (
            <>
              <span className="chip chip-brand mr-1">Demo</span> Sample data in this browser.
            </>
          ) : (
            'Each run simulates 10,000 futures.'
          )}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ top bar */

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button type="button" onClick={toggle} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} className={`btn btn-secondary !h-10 !w-10 !px-0 ${className}`}>
      {dark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
    </button>
  )
}

/** The reference's profile chip: avatar, name, chevron; opens the account menu. */
function Account() {
  const { me, signOut } = useAuth()
  const navigate = useNavigate()
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const d = ref.current
      if (!d?.open) return
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !d.contains(e.target as Node)) d.open = false
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [])
  if (!me) return null
  const handle = me.user.email?.split('@')[0] ?? 'Account'
  const name = handle.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <details ref={ref} className="group relative">
      <summary
        aria-label={`Account: ${me.user.email}`}
        className="btn btn-secondary !h-12 cursor-pointer list-none gap-2.5 !pl-1.5 !pr-3.5 [&::-webkit-details-marker]:hidden"
      >
        <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#f6c39b] via-[#ec9256] to-[#c98a9b] text-sm font-semibold text-white">
          {name[0]?.toUpperCase()}
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm font-semibold sm:block">{name}</span>
        <ChevronDown size={16} aria-hidden className="text-faint transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="write-in absolute right-0 top-[calc(100%+8px)] z-40 w-64 rounded-2xl border border-line bg-surface p-1.5 text-sm shadow-pop">
        <p className="px-3 pt-2 text-xs text-faint">Signed in as</p>
        <p className="truncate px-3 pb-2 font-medium">{me.user.email}</p>
        {me.workspace && <p className="border-t border-line px-3 py-2 text-xs text-muted">Workspace · {me.workspace.name}</p>}
        <button type="button" onClick={() => signOut().then(() => navigate('/'))} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-muted hover:bg-surface-2 hover:text-ink">
          <LogOut size={15} aria-hidden /> Sign out
        </button>
      </div>
    </details>
  )
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { runId, running, run, updatedAt } = useRun()
  const { me } = useAuth()
  const hasRuns = !!me?.workspace?.runs
  const { data: f } = useApi(() => (hasRuns ? api.forecast(30, 'bookings') : Promise.resolve(undefined)), [runId, hasRuns])
  const { pathname } = useLocation()
  const page = ALL.find((n) => n.to === pathname)

  return (
    <header className="flex flex-wrap items-center gap-3 px-5 pb-2 pt-5 sm:px-8 sm:pt-8">
      <button type="button" onClick={onMenu} aria-label="Open navigation" className="btn btn-secondary !h-10 !w-10 !px-0 lg:hidden">
        <Menu size={19} aria-hidden />
      </button>
      <h1 className="min-w-0 truncate text-[28px] font-semibold leading-none tracking-tight sm:text-[38px]">{page?.title ?? 'Rangefinder'}</h1>

      <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
        {f && (
          <span className="glass hidden h-10 items-center gap-2.5 rounded-full px-3.5 text-xs 2xl:flex" title="30-day bookings, worst to best case">
            <span className="font-medium text-faint">30-day range</span>
            <RangeBand size="nav" low={f.p10} mid={f.p50} high={f.p90} />
            <span className="whitespace-nowrap font-semibold">
              {money(f.p10)} – {money(f.p90)}
            </span>
          </span>
        )}
        <span aria-live="polite" className="hidden whitespace-nowrap text-xs text-faint xl:inline">
          {running ? 'Simulating…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
        <ThemeToggle />
        {hasRuns && (
          <Button onClick={run} busy={running} icon={Play} className="hidden !h-10 !px-4 sm:inline-flex">
            {running ? 'Running' : 'Run forecast'}
          </Button>
        )}
        <Account />
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ run toast */

function RunToast() {
  const { running, error, updatedAt, dismissError } = useRun()
  const [done, setDone] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!updatedAt) return
    setDone(true)
    const t = setTimeout(() => setDone(false), 3500)
    return () => clearTimeout(t)
  }, [updatedAt])

  const show = running || done || !!error
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-6 right-6 z-50 flex justify-end">
      {show && (
        <div
          key={running ? 'run' : error ? 'err' : 'done'}
          role={error ? 'alert' : 'status'}
          className="write-in pointer-events-auto flex w-[min(360px,calc(100vw-3rem))] items-center gap-3 rounded-2xl border border-line bg-surface p-3 pr-4 shadow-pop"
        >
          {running ? (
            <>
              <LogoLoader size={40} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Simulating 10,000 futures</span>
                <span className="block text-xs text-muted">Every screen refreshes when the run lands.</span>
                <span className="rf-line mt-2 block h-0.5 overflow-hidden rounded-full bg-line" />
              </span>
            </>
          ) : error ? (
            <>
              <TriangleAlert size={18} aria-hidden className="shrink-0 text-loss" />
              <span className="flex-1 text-sm">{error}</span>
              <button type="button" onClick={dismissError} aria-label="Dismiss" className="btn btn-ghost !h-8 !w-8 !px-0">
                <X size={16} aria-hidden />
              </button>
            </>
          ) : (
            <>
              <CheckCircle2 size={18} aria-hidden className="shrink-0 text-gain" />
              <span className="text-sm">
                <span className="block font-semibold">Forecast updated</span>
                <span className="text-xs text-muted">All screens show the new run.</span>
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ shell */

/**
 * A frosted frame floating on the warm backdrop: sidebar and content live inside it. From lg up the frame
 * fills the window and the content scrolls inside it; below lg the page scrolls and a drawer holds the nav.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const drawer = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOpen(false)
    scroller.current?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    drawer.current?.querySelector<HTMLElement>('a[href]')?.focus()
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    const page = ALL.find((n) => n.to === pathname)?.title
    document.title = page ? `${page} · Rangefinder` : 'Rangefinder'
  }, [pathname])

  return (
    <div className="min-h-dvh sm:p-3 lg:h-dvh lg:p-5 xl:p-7">
      <a href="#main" className="sr-only z-[100] rounded-full bg-navy px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>

      <div className="frame mx-auto flex min-h-dvh max-w-[1560px] overflow-hidden shadow-frame sm:min-h-[calc(100dvh-1.5rem)] sm:rounded-frame lg:h-full lg:min-h-0">
        <aside className="hidden w-[248px] shrink-0 lg:block">
          <SideNav id="side" />
        </aside>

        <div ref={scroller} className="flex min-w-0 flex-1 flex-col lg:overflow-y-auto">
          <TopBar onMenu={() => setOpen(true)} />
          <main id="main" tabIndex={-1} className="w-full max-w-[1280px] px-5 pb-12 pt-5 outline-none sm:px-8">
            <div key={pathname} className="page-enter">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* mobile drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-navy/30 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} />
        <div
          ref={drawer}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={`absolute inset-y-2 left-2 w-[272px] max-w-[85vw] overflow-hidden rounded-[24px] border border-white/60 bg-surface/95 shadow-pop backdrop-blur-xl transition-transform duration-200 ease-out dark:border-white/10 ${
            open ? 'translate-x-0' : '-translate-x-[110%]'
          }`}
        >
          <SideNav id="drawer" onNavigate={() => setOpen(false)} />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="btn btn-ghost absolute right-3 top-5 !h-9 !w-9 !px-0">
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>
      <RunToast />
    </div>
  )
}

/** Section header under the page title: eyebrow, lead line, one-line purpose, controls on the right. */
export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-brand">{eyebrow}</p>}
        <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{title}</h2>
        {sub && <p className="mt-1 max-w-[72ch] text-pretty text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
