import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollSmoother } from 'gsap/ScrollSmoother'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { useAuth } from '../auth'
import { ThemeToggle } from '../components/AppShell'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui'
import { rng } from '../components/landing/data'
import { Engine, buildEngine } from '../components/landing/Engine'
import { Moved, buildMoved } from '../components/landing/Moved'
import { Proof, buildProof } from '../components/landing/Proof'
import { RangeLab, buildLab } from '../components/landing/RangeLab'
import { q } from '../components/landing/scroll'

gsap.registerPlugin(ScrollTrigger, ScrollSmoother)

/*
 * The landing page is one scroll story (docs/landing_scroll_story.md). Every scene is built from data and tied to
 * the scroll; nothing sits still waiting to be read. Scenes are built top to bottom in one effect so the pins
 * stack correctly, and everything is reverted together.
 */

const NAV = [
  ['engine', 'How it works'],
  ['lab', 'Try the range'],
  ['moved', 'Why it moved'],
  ['proof', 'Proof'],
] as const

const ROWS = [
  ['30, 60 and 90-day horizons', 'Bookings and collected cash', '10,000 simulated futures', 'Salesperson calibration', 'Seasonality learned from your closes'],
  ['Every change attributed to a deal', 'Backtested against actuals', 'Concentration risk', 'Inactivity decay', 'CSV in, range out'],
]

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

/* ------------------------------------------------------------------ the fan */

/** Revenue paths fanning out of one point: best case on top (peach), expected (ember), worst (rose). */
function Fan({ n = 36, className = '' }: { n?: number; className?: string }) {
  const paths = useMemo(() => {
    const r = rng(3)
    return Array.from({ length: n }, (_, k) => {
      const t = k / (n - 1)
      const end = 60 + t * 540
      const mid = 560 - (560 - end) * 0.4 + (r() - 0.5) * 36
      return { t, d: `M-20,560 C380,${(560 + mid) / 2} 680,${mid.toFixed(1)} 1220,${end.toFixed(1)}` }
    })
  }, [n])
  return (
    <svg viewBox="0 0 1200 640" preserveAspectRatio="xMidYMax slice" className={`h-full w-full ${className}`} aria-hidden>
      <g className="fan-scroll">
        <g className="fan-tilt">
          <g className="fan-inner">
            {paths.map(({ t, d }, k) => (
              <path
                key={k}
                d={d}
                className={`fan-path ${k === n >> 1 ? 'stroke-brand' : t < 0.22 ? 'stroke-mint' : t > 0.78 ? 'stroke-lavender' : 'stroke-sky'}`}
                fill="none"
                strokeWidth={k === n >> 1 ? 2.5 : 1.25}
                strokeOpacity={k === n >> 1 ? 0.9 : 0.5}
                pathLength={1}
                strokeDasharray="1"
              />
            ))}
          </g>
        </g>
      </g>
    </svg>
  )
}

function Words({ text, className, wordClass = '' }: { text: string; className: string; wordClass?: string }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <span key={i} className="-mb-[0.16em] inline-block overflow-hidden pb-[0.16em] align-bottom">
          <span className={`${className} inline-block ${wordClass}`}>{w}</span>
          &nbsp;
        </span>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ scene builders */

const ORIGIN = '-20 560'

function buildHero(hero: HTMLElement, motion: boolean) {
  if (!motion) return () => {}
  gsap
    .timeline({ delay: 0.1 })
    .fromTo(q(hero, '.fan-path'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.8, stagger: { each: 0.025, from: 'center' }, ease: 'power2.out' }, 0)
    .fromTo(q(hero, '.hero-w'), { yPercent: 118 }, { yPercent: 0, duration: 1.1, stagger: 0.06, ease: 'power4.out' }, 0.15)
    .fromTo(q(hero, '.hero-fade'), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out' }, 0.6)
  gsap.to(hero.querySelector('.fan-inner'), { scaleY: 1.07, svgOrigin: ORIGIN, duration: 3.4, yoyo: true, repeat: -1, ease: 'sine.inOut' })
  gsap.to(hero.querySelector('.cue-line'), { scaleY: 0.25, transformOrigin: '50% 100%', duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' })

  // the fan leans toward the pointer
  const tilt = hero.querySelector('.fan-tilt')!
  gsap.set(tilt, { svgOrigin: ORIGIN })
  const rot = gsap.quickTo(tilt, 'rotation', { duration: 1, ease: 'power3.out' })
  const shift = gsap.quickTo(tilt, 'x', { duration: 1, ease: 'power3.out' })
  const onMove = (e: PointerEvent) => {
    rot((e.clientY / innerHeight - 0.5) * -7)
    shift((e.clientX / innerWidth - 0.5) * 40)
  }
  hero.addEventListener('pointermove', onMove)

  // leaving: the copy lifts away and the fan collapses into the single number the CRM gives you
  gsap
    .timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6 } })
    .to(hero.querySelector('.hero-copy'), { y: -120, autoAlpha: 0, ease: 'power1.in' }, 0)
    .to(hero.querySelector('.fan-scroll'), { scaleY: 0.02, svgOrigin: ORIGIN, ease: 'power2.in' }, 0)
    .to(hero.querySelector('.cue'), { autoAlpha: 0, duration: 0.2 }, 0)
  return () => hero.removeEventListener('pointermove', onMove)
}

/** Two rows of type drifting in opposite directions; scrolling speeds them up and leans them. */
function buildMarquee(el: HTMLElement, motion: boolean) {
  if (!motion) return () => {}
  const rows = q<HTMLElement>(el, '.mq-row')
  const loops = rows.map((r, k) => gsap.fromTo(r, { xPercent: k ? -50 : 0 }, { xPercent: k ? 0 : -50, duration: 46, ease: 'none', repeat: -1 }))
  const skew = gsap.quickTo(rows, 'skewX', { duration: 0.5, ease: 'power3.out' })
  let speed = 1
  let boost = 0
  let dir = 1
  ScrollTrigger.create({
    trigger: el,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => {
      const v = self.getVelocity()
      dir = self.direction
      boost = Math.min(6, Math.abs(v) / 350)
      skew(gsap.utils.clamp(-7, 7, v / -260))
    },
  })
  const tick = () => {
    boost *= 0.92
    speed += (dir * (1 + boost) - speed) * 0.1
    loops.forEach((l) => l.timeScale(speed))
  }
  gsap.ticker.add(tick)
  return () => gsap.ticker.remove(tick)
}

/** A pinned scene's frame rises in before its pin starts, so nothing waits on screen fully formed. */
function rise(section: HTMLElement) {
  gsap.fromTo(q<HTMLElement>(section, '[data-rise]'), { y: 70, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.12, ease: 'power2.out', scrollTrigger: { trigger: section, start: 'top 92%', end: 'top 12%', scrub: 0.6 } })
}

function buildCta(cta: HTMLElement) {
  gsap
    .timeline({ scrollTrigger: { trigger: cta, start: 'top 85%', end: 'center 55%', scrub: 0.6 } })
    .fromTo(q(cta, '.fan-scroll'), { scaleY: 0.02, svgOrigin: ORIGIN }, { scaleY: 1, svgOrigin: ORIGIN, ease: 'power2.out' }, 0)
    .fromTo(q(cta, '.cta-w'), { opacity: 0.1 }, { opacity: 1, stagger: 0.12, ease: 'none' }, 0)
    .fromTo(q(cta, '.cta-fade'), { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.12 }, 0.5)
}

/* ------------------------------------------------------------------ page */

export default function LandingPage() {
  const { session } = useAuth()
  const root = useRef<HTMLDivElement>(null)
  const smoother = useRef<ScrollSmoother | null>(null)
  const [active, setActive] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const motion = useMedia('(prefers-reduced-motion: no-preference)')
  const narrow = !useMedia('(min-width: 1024px)')

  useEffect(() => void (document.title = 'Rangefinder · Revenue forecasting under uncertainty'), [])

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    // a fixed backdrop layer instead of body's fixed background, which repaints on every scroll frame
    const html = document.documentElement
    const prevBg = document.body.style.backgroundImage
    const prevBehavior = html.style.scrollBehavior
    document.body.style.backgroundImage = 'none'
    html.style.scrollBehavior = 'auto'
    const cleanups: (() => void)[] = []
    const scene = (id: string) => el.querySelector<HTMLElement>(`#${id}`)!

    const ctx = gsap.context(() => {
      if (motion) smoother.current = ScrollSmoother.create({ wrapper: '#smooth-wrapper', content: '#smooth-content', smooth: 1.2, smoothTouch: 0.1, effects: false })

      // top to bottom, so every pin knows the pins above it
      cleanups.push(buildHero(scene('top'), motion))
      buildEngine(scene('engine'), narrow, motion)
      cleanups.push(buildMarquee(el.querySelector('.mq')!, motion))
      buildLab(scene('lab'), motion)
      buildMoved(scene('moved'), motion)
      buildProof(scene('proof'), motion)

      if (motion) {
        ;['engine', 'moved', 'proof'].forEach((id) => rise(scene(id)))
        gsap.fromTo(q(scene('lab'), '.lab-w'), { opacity: 0.12 }, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: scene('lab'), start: 'top 80%', end: 'top 25%', scrub: 0.6 } })
        buildCta(scene('cta'))
        gsap.fromTo(el.querySelector('footer'), { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, scrollTrigger: { trigger: el.querySelector('footer'), start: 'top bottom', end: 'top 75%', scrub: 0.6 } })
      }

      const bar = gsap.quickSetter(el.querySelector('.nav-progress'), 'scaleX')
      ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => bar(self.progress) })
      ScrollTrigger.create({ start: 24, end: 'max', onToggle: (self) => setScrolled(self.isActive) })
      NAV.forEach(([id]) => {
        const s = scene(id)
        const span = s.parentElement?.classList.contains('pin-spacer') ? s.parentElement : s
        ScrollTrigger.create({ trigger: span, start: 'top center', end: 'bottom center', onToggle: (self) => self.isActive && setActive(id), onLeaveBack: () => id === 'engine' && setActive('') })
      })
    }, el)

    // text metrics change once the web fonts land
    let live = true
    document.fonts?.ready.then(() => live && ScrollTrigger.refresh())

    return () => {
      live = false
      cleanups.forEach((c) => c())
      smoother.current?.kill()
      smoother.current = null
      ctx.revert()
      document.body.style.backgroundImage = prevBg
      html.style.scrollBehavior = prevBehavior
    }
  }, [motion, narrow])

  const go = (id: string) => (e: MouseEvent) => {
    e.preventDefault()
    if (smoother.current) smoother.current.scrollTo(`#${id}`, true, 'top top')
    else document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }

  const primary = session ? { to: '/app', label: 'Open dashboard' } : { to: '/login?mode=signup', label: 'Get started' }

  return (
    <div ref={root}>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 [background:var(--backdrop)]" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3">
        <div
          className={`relative flex h-14 w-full max-w-[1180px] items-center justify-between gap-3 overflow-hidden rounded-full border pl-4 pr-2 transition-[background-color,border-color,box-shadow] duration-300 sm:pl-5 ${
            scrolled ? 'glass shadow-card' : 'border-transparent'
          }`}
        >
          <Link to="/" aria-label="Rangefinder home" className="shrink-0 rounded-full">
            <Logo size={28} wordClass="text-[17px]" />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-1 text-sm lg:flex">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={go(id)}
                aria-current={active === id ? 'true' : undefined}
                className={`rounded-full px-3.5 py-1.5 font-medium transition-colors duration-200 ${active === id ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {!session && (
              <Button to="/login" variant="ghost" className="hidden sm:inline-flex">
                Sign in
              </Button>
            )}
            <Button to={primary.to}>{primary.label}</Button>
          </div>
          <span aria-hidden className="nav-progress absolute inset-x-6 bottom-0 h-[2px] origin-left scale-x-0 rounded-full bg-brand" />
        </div>
      </header>

      <div id="smooth-wrapper">
        <div id="smooth-content">
          <main id="main" className="w-full max-w-full overflow-x-clip">
            {/* ---------------------------------------------------------------- hero */}
            <section id="top" className="relative isolate flex min-h-[100svh] items-center overflow-hidden px-4 pb-24 pt-32">
              <div className="absolute inset-x-0 bottom-0 -z-10 h-[78%] opacity-70 [mask-image:linear-gradient(to_bottom,transparent,black_35%)]">
                <Fan />
              </div>
              <div className="hero-copy mx-auto w-full max-w-6xl text-center">
                <h1 className="text-[clamp(2.6rem,5.7vw,5.6rem)] font-bold leading-[1] tracking-[-0.05em]">
                  <span className="block">
                    <Words text="Forecast revenue as a range." className="hero-w" />
                  </span>
                  <span className="block">
                    <Words text="Explain every change." className="hero-w" wordClass="text-ember" />
                  </span>
                </h1>
                <p className="hero-fade mx-auto mt-7 max-w-[58ch] text-pretty text-lg text-muted sm:text-xl">
                  Rangefinder turns your CRM pipeline into the range of outcomes you can actually expect, the honest chance of hitting target, and a reason for every move.
                </p>
                <div className="hero-fade mt-10 flex flex-wrap justify-center gap-3">
                  <Button to={primary.to} size="lg" arrow className="rounded-full">
                    {primary.label}
                  </Button>
                  <a href="#engine" onClick={go('engine')} className="btn btn-lg btn-secondary rounded-full">
                    See how it works
                  </a>
                </div>
              </div>
              <a href="#engine" onClick={go('engine')} className="cue absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-xs font-medium text-faint" aria-label="Scroll to how it works">
                <span className="cue-line block h-10 w-px bg-faint" />
                <ArrowDown size={14} aria-hidden />
              </a>
            </section>

            {/* ---------------------------------------------------------------- the engine */}
            <Engine narrow={narrow} />

            {/* ---------------------------------------------------------------- capabilities */}
            <section className="mq overflow-hidden py-20 sm:py-28" aria-label="Capabilities">
              {ROWS.map((row, k) => (
                <div key={k} className={`flex w-max py-[0.12em] ${k ? 'mt-2 text-faint' : 'text-ink'}`}>
                  <div className="mq-row flex shrink-0 items-center whitespace-nowrap font-head text-[clamp(2rem,5.5vw,4.75rem)] font-bold leading-[1.12] tracking-[-0.045em]">
                    {[...row, ...row].map((item, i) => (
                      <span key={i} className="flex items-center">
                        {item}
                        <span aria-hidden className="mx-[0.45em] inline-block size-[0.28em] rounded-full bg-brand" />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {/* ---------------------------------------------------------------- range lab */}
            <section id="lab" className="px-4 py-24 sm:py-36" aria-label="Try the range">
              <div className="mx-auto max-w-[1180px]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Scenario and range output</p>
                <h2 className="mt-4 max-w-4xl text-[clamp(2.25rem,5vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.045em]">
                  {'Move the target. Watch the odds move with it.'.split(' ').map((w, i) => (
                    <span key={i} className="lab-w">
                      {w}{' '}
                    </span>
                  ))}
                </h2>
                <p className="mt-6 max-w-[60ch] text-lg text-muted">
                  These are the sample company’s real simulated outcomes. Switch the horizon or basis, then drag the target across the distribution.
                </p>
              </div>
              <div className="mt-14">
                <RangeLab motion={motion} />
              </div>
            </section>

            {/* ---------------------------------------------------------------- why it moved, proof */}
            <Moved />
            <Proof />

            {/* ---------------------------------------------------------------- close */}
            <section id="cta" className="relative isolate overflow-hidden px-4 py-36 text-center sm:py-52">
              <div className="absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]">
                <Fan n={30} />
              </div>
              <h2 className="mx-auto max-w-5xl text-[clamp(2.5rem,6.4vw,5.75rem)] font-bold leading-[1] tracking-[-0.05em]">
                {'Stop forecasting one hopeful number.'.split(' ').map((w, i) => (
                  <span key={i} className={`cta-w ${w === 'hopeful' ? 'text-ember' : ''}`}>
                    {w}{' '}
                  </span>
                ))}
              </h2>
              <p className="cta-fade mx-auto mt-7 max-w-[56ch] text-pretty text-lg text-muted">
                See it on a sample company in under a minute: two years of history, 150 open deals and a week of changes. Upload a CSV when you are ready.
              </p>
              <div className="cta-fade mt-10 flex flex-wrap justify-center gap-3">
                <Link to={session ? '/app/data' : '/login?mode=signup'} className="btn btn-lg btn-primary group rounded-full">
                  {session ? 'Go to data' : 'Create your workspace'}
                  <ArrowRight size={16} aria-hidden className="transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                </Link>
                {!session && (
                  <Button to="/login" size="lg" variant="secondary" className="rounded-full">
                    Sign in
                  </Button>
                )}
              </div>
            </section>

            <footer className="px-4 pb-10">
              <div className="mx-auto flex max-w-[1180px] flex-col gap-6 border-t border-line pt-8 text-sm text-muted md:flex-row md:items-center md:justify-between">
                <Logo size={26} wordClass="text-[16px]" />
                <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
                  {NAV.map(([id, label]) => (
                    <a key={id} href={`#${id}`} onClick={go(id)} className="hover:text-ink">
                      {label}
                    </a>
                  ))}
                </nav>
                <p>Open-source revenue forecasting. Your data stays in your workspace.</p>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  )
}
