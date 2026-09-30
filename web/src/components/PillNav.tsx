// Adapted from React Bits PillNav (MIT, reactbits.dev). Changes: TypeScript; nav links are plain
// links (no menubar/menuitem roles) with aria-current; optional logo pill; reduced-motion aware;
// sentence-case labels; no autoplay entrance by default.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import './PillNav.css'

export interface PillNavItem {
  label: string
  href: string
  ariaLabel?: string
}

interface Props {
  items: PillNavItem[]
  activeHref?: string
  logo?: string
  logoAlt?: string
  className?: string
  ease?: string
  baseColor?: string
  pillColor?: string
  hoveredPillTextColor?: string
  pillTextColor?: string
  onMobileMenuClick?: () => void
  initialLoadAnimation?: boolean
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The rising-circle hover, shared by PillNav and PillTabs. Each pill holds a .hover-circle,
 * .pill-label and .pill-label-hover; the circle is sized so, scaled up, it sweeps up and covers the pill.
 */
export function usePillHover(ease: string, deps: unknown[]) {
  const circles = useRef<(HTMLSpanElement | null)[]>([])
  const tls = useRef<(gsap.core.Timeline | undefined)[]>([])
  const tweens = useRef<(gsap.core.Tween | undefined)[]>([])

  useEffect(() => {
    const layout = () => {
      circles.current.forEach((circle, index) => {
        if (!circle?.parentElement) return
        const pill = circle.parentElement
        const { width: w, height: h } = pill.getBoundingClientRect()
        if (!w || !h) return
        const R = ((w * w) / 4 + h * h) / (2 * h)
        const D = Math.ceil(2 * R) + 2
        const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1
        circle.style.width = `${D}px`
        circle.style.height = `${D}px`
        circle.style.bottom = `-${delta}px`
        gsap.set(circle, { xPercent: -50, scale: 0, transformOrigin: `50% ${D - delta}px` })
        const label = pill.querySelector('.pill-label')
        const hover = pill.querySelector('.pill-label-hover')
        if (label) gsap.set(label, { y: 0 })
        if (hover) gsap.set(hover, { y: Math.ceil(h + 100), opacity: 0 })
        tls.current[index]?.kill()
        const tl = gsap.timeline({ paused: true })
        tl.to(circle, { scale: 1.2, xPercent: -50, duration: 2, ease, overwrite: 'auto' }, 0)
        if (label) tl.to(label, { y: -(h + 8), duration: 2, ease, overwrite: 'auto' }, 0)
        if (hover) tl.to(hover, { y: 0, opacity: 1, duration: 2, ease, overwrite: 'auto' }, 0)
        tls.current[index] = tl
      })
    }
    layout()
    window.addEventListener('resize', layout)
    document.fonts?.ready.then(layout).catch(() => {})
    return () => window.removeEventListener('resize', layout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const tweenTo = (i: number, to: 'end' | 'start') => {
    const tl = tls.current[i]
    if (!tl) return
    tweens.current[i]?.kill()
    // reduced motion: jump to the end state instead of sweeping
    tweens.current[i] = tl.tweenTo(to === 'end' ? tl.duration() : 0, { duration: reducedMotion() ? 0 : to === 'end' ? 0.3 : 0.2, ease, overwrite: 'auto' })
  }
  return {
    circleRef: (i: number) => (el: HTMLSpanElement | null) => void (circles.current[i] = el),
    enter: (i: number) => tweenTo(i, 'end'),
    leave: (i: number) => tweenTo(i, 'start'),
  }
}

/** Label stack used inside every pill. */
const PillLabel = ({ text }: { text: string }) => (
  <span className="label-stack">
    <span className="pill-label">{text}</span>
    <span className="pill-label-hover" aria-hidden="true">
      {text}
    </span>
  </span>
)

export default function PillNav({
  items,
  activeHref,
  logo,
  logoAlt = 'Logo',
  className = '',
  ease = 'power3.easeOut',
  baseColor = '#fff',
  pillColor = '#120F17',
  hoveredPillTextColor = '#120F17',
  pillTextColor,
  onMobileMenuClick,
  initialLoadAnimation = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const hover = usePillHover(ease, [items.length, ease])
  const logoImgRef = useRef<HTMLImageElement>(null)
  const logoTweenRef = useRef<gsap.core.Tween>(undefined)
  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const navItemsRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (mobileMenuRef.current) gsap.set(mobileMenuRef.current, { visibility: 'hidden', opacity: 0 })

    if (initialLoadAnimation && !reducedMotion()) {
      if (logoRef.current) gsap.fromTo(logoRef.current, { scale: 0 }, { scale: 1, duration: 0.6, ease })
      if (navItemsRef.current) {
        gsap.set(navItemsRef.current, { width: 0, overflow: 'hidden' })
        gsap.to(navItemsRef.current, { width: 'auto', duration: 0.6, ease })
      }
    }
  }, [ease, initialLoadAnimation])

  const handleLogoEnter = () => {
    const img = logoImgRef.current
    if (!img || reducedMotion()) return
    logoTweenRef.current?.kill()
    gsap.set(img, { rotate: 0 })
    logoTweenRef.current = gsap.to(img, { rotate: 360, duration: 0.2, ease, overwrite: 'auto' })
  }

  const toggleMobileMenu = () => {
    const next = !open
    setOpen(next)
    const d = reducedMotion() ? 0 : 0.3
    const lines = hamburgerRef.current?.querySelectorAll('.hamburger-line')
    if (lines) {
      gsap.to(lines[0], { rotation: next ? 45 : 0, y: next ? 3 : 0, duration: d, ease })
      gsap.to(lines[1], { rotation: next ? -45 : 0, y: next ? -3 : 0, duration: d, ease })
    }
    const menu = mobileMenuRef.current
    if (menu) {
      if (next) {
        gsap.set(menu, { visibility: 'visible' })
        gsap.fromTo(menu, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: d, ease, transformOrigin: 'top center' })
      } else {
        gsap.to(menu, { opacity: 0, y: 10, duration: d * 0.7, ease, onComplete: () => void gsap.set(menu, { visibility: 'hidden' }) })
      }
    }
    onMobileMenuClick?.()
  }

  const closeMenu = () => open && toggleMobileMenu()

  const cssVars = {
    '--base': baseColor,
    '--pill-bg': pillColor,
    '--hover-text': hoveredPillTextColor,
    '--pill-text': pillTextColor ?? baseColor,
  } as CSSProperties

  return (
    <div className={`pill-nav-container ${className}`}>
      <nav className="pill-nav" aria-label="Main" style={cssVars}>
        {logo && (
          <Link className="pill-logo" to={items[0]?.href ?? '/'} aria-label="Home" onMouseEnter={handleLogoEnter} ref={logoRef}>
            <img src={logo} alt={logoAlt} ref={logoImgRef} />
          </Link>
        )}

        <div className="pill-nav-items desktop-only" ref={navItemsRef}>
          <ul className="pill-list">
            {items.map((item, i) => (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className={`pill${activeHref === item.href ? ' is-active' : ''}`}
                  aria-label={item.ariaLabel}
                  aria-current={activeHref === item.href ? 'page' : undefined}
                  onMouseEnter={() => hover.enter(i)}
                  onMouseLeave={() => hover.leave(i)}
                  onFocus={() => hover.enter(i)}
                  onBlur={() => hover.leave(i)}
                >
                  <span className="hover-circle" aria-hidden="true" ref={hover.circleRef(i)} />
                  <PillLabel text={item.label} />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          className="mobile-menu-button mobile-only"
          onClick={toggleMobileMenu}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="pill-nav-mobile"
          ref={hamburgerRef}
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
      </nav>

      <div id="pill-nav-mobile" className="mobile-menu-popover mobile-only" ref={mobileMenuRef} style={cssVars}>
        <ul className="mobile-menu-list">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                to={item.href}
                className={`mobile-menu-link${activeHref === item.href ? ' is-active' : ''}`}
                aria-current={activeHref === item.href ? 'page' : undefined}
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

interface TabsProps<T extends string | number> {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
  /** 'lime' pills sit on lime grounds (hero); 'white' pills sit on white panels. */
  tone?: 'lime' | 'white'
}

/** Section switcher with the header's rising-circle pills. A radio group: one value is always chosen. */
export function PillTabs<T extends string | number>({ options, value, onChange, label, tone = 'lime' }: TabsProps<T>) {
  const hover = usePillHover('power2.easeOut', [options.length])
  const vars = {
    '--base': '#1e2d26',
    '--pill-bg': tone === 'lime' ? '#d9f79a' : '#ffffff',
    '--pill-text': '#1e2d26',
    '--hover-text': '#ffffff',
  } as CSSProperties
  return (
    <div className="pill-nav-items pill-tabs" style={vars} role="radiogroup" aria-label={label}>
      <ul className="pill-list">
        {options.map((o, i) => (
          <li key={o.value}>
            <button
              type="button"
              role="radio"
              aria-checked={o.value === value}
              onClick={() => onChange(o.value)}
              onMouseEnter={() => o.value !== value && hover.enter(i)}
              onMouseLeave={() => hover.leave(i)}
              className={`pill${o.value === value ? ' is-selected' : ''}`}
            >
              <span className="hover-circle" aria-hidden="true" ref={hover.circleRef(i)} />
              <PillLabel text={o.label} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
