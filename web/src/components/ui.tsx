import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, RotateCw, type LucideIcon } from 'lucide-react'
import CountUp from './reactbits/CountUp'
import { Spinner } from './Loaders'

/* ------------------------------------------------------------------ buttons */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'onnavy'
  size?: 'sm' | 'md' | 'lg'
  to?: string
  busy?: boolean
  icon?: LucideIcon
  /** Trailing arrow for "go somewhere" actions. */
  arrow?: boolean
}

export function Button({ variant = 'primary', size = 'md', to, busy, icon: Icon, arrow, className = '', children, ...rest }: ButtonProps) {
  const cls = `btn btn-${variant} ${size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : ''} group ${className}`
  const body = (
    <>
      {busy ? <Spinner size={16} /> : Icon && <Icon size={size === 'sm' ? 15 : 17} aria-hidden />}
      {children}
      {arrow && !busy && (
        <ArrowRight size={16} aria-hidden className="transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
      )}
    </>
  )
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" {...rest} className={cls} disabled={busy || rest.disabled} aria-busy={busy || undefined}>
      {body}
    </button>
  )
}

export const MoreLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="group inline-flex items-center gap-1 rounded-md text-sm font-medium text-brand">
    {children}
    <ArrowRight aria-hidden size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
  </Link>
)

/* ------------------------------------------------------------------ surfaces */

export function Card({ title, sub, action, children, className = '', pad = true, style }: {
  title?: ReactNode
  sub?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  pad?: boolean
  style?: React.CSSProperties
}) {
  const inner = (
    <>
      {(title || action) && (
        <div className={`flex flex-wrap items-start justify-between gap-3 ${pad ? '' : 'px-5 pt-5 sm:px-6 sm:pt-6'}`}>
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
            {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={title || action ? 'mt-4' : ''}>{children}</div>
    </>
  )
  return (
    <section className={`card ${pad ? 'card-pad' : ''} ${className}`} style={style}>
      {inner}
    </section>
  )
}

/* ------------------------------------------------------------------ figures */

/** Signed % change with an arrow; the arrow and sign carry meaning, colour backs them up. */
export function DeltaBadge({ value, invert = false }: { value: number; invert?: boolean }) {
  const up = value >= 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`chip ${good ? 'chip-gain' : 'chip-loss'}`}>
      <Icon size={13} aria-hidden />
      {up ? '+' : '−'}
      {Math.abs(value * 100).toFixed(1)}%
    </span>
  )
}

interface StatProps {
  label: string
  icon?: LucideIcon
  /** Animated when numeric; `format` renders it. */
  value: number | string
  format?: (n: number) => string
  tone?: 'ink' | 'gain' | 'loss'
  foot?: ReactNode
  visual?: ReactNode
  i?: number
}

/** KPI tile: label, counting figure, footnote. Icon sits quietly beside the label. */
export function StatCard({ label, icon: Icon, value, format, tone = 'ink', foot, visual, i = 0 }: StatProps) {
  return (
    <div className="card card-pad" style={{ '--i': i } as React.CSSProperties}>
      <div className="flex items-center gap-3 text-sm text-muted">
        {Icon && <IconDisc icon={Icon} />}
        {label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className={`text-[26px] font-semibold leading-none tracking-tight ${tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-ink'}`}>
          {typeof value === 'number' ? <CountUp to={value} format={format} /> : value}
        </p>
        {visual}
      </div>
      {foot && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">{foot}</div>}
    </div>
  )
}

/** An icon on a white disc: the reference's stat marker. */
export const IconDisc = ({ icon: Icon, size = 40 }: { icon: LucideIcon; size?: number }) => (
  <span
    className="grid shrink-0 place-items-center rounded-full bg-white/90 text-brand shadow-[0_1px_2px_rgb(var(--shadow)/0.08),0_6px_14px_-8px_rgb(var(--shadow)/0.35)] dark:bg-white/10"
    style={{ width: size, height: size }}
  >
    <Icon size={Math.round(size * 0.45)} aria-hidden />
  </span>
)

export const ReasonChip = ({ children }: { children: ReactNode }) => <span className="chip chip-neutral">{children}</span>

/** Probability as a ring: the arc is the share of futures that make it. */
export function RingGauge({ value, label, size = 48 }: { value: number; label: string; size?: number }) {
  const r = 19
  const c = 2 * Math.PI * r
  const [shown, setShown] = useState(0)
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setShown(Math.min(Math.max(value, 0), 1)))
    return () => cancelAnimationFrame(id)
  }, [value])
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="-rotate-90" role="img" aria-label={label}>
      <circle cx="24" cy="24" r={r} fill="none" stroke="rgb(var(--ink) / 0.08)" strokeWidth="6" />
      <circle cx="24" cy="24" r={r} fill="none" stroke="rgb(var(--sky))" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c * shown} ${c}`} className="band-move" />
    </svg>
  )
}

/* ------------------------------------------------------------------ states */

export function ErrorNote({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-start gap-3 border-loss/30 p-5 sm:flex-row sm:items-center">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-loss/10 text-loss">
        <AlertTriangle size={18} aria-hidden />
      </span>
      <p className="flex-1 text-sm text-ink">{children}</p>
      {retry && (
        <Button variant="secondary" size="sm" icon={RotateCw} onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <IconDisc icon={Icon} size={48} />
      <p className="mt-4 text-md font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-[46ch] text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ segmented control */

interface SegProps<T extends string | number> {
  options: { value: T; label: string; icon?: LucideIcon }[]
  value: T
  onChange: (v: T) => void
  label: string
  size?: 'sm' | 'md'
}

/** Radio group with a thumb that glides to the selected option. */
export function Segmented<T extends string | number>({ options, value, onChange, label, size = 'md' }: SegProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [thumb, setThumb] = useState<{ left: number; width: number }>()
  const idx = options.findIndex((o) => o.value === value)

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[idx]
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [idx, options.length])

  const move = (dir: 1 | -1) => {
    const n = (idx + dir + options.length) % options.length
    onChange(options[n].value)
    refs.current[n]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className="glass relative inline-flex rounded-full p-1">
      {thumb && (
        <span
          aria-hidden
          className="absolute inset-y-1 rounded-full bg-white shadow-[0_1px_2px_rgb(var(--shadow)/0.12),0_4px_10px_-4px_rgb(var(--shadow)/0.3)] transition-all duration-200 ease-out dark:bg-white/15"
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
      {options.map((o, i) => {
        const on = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            ref={(el) => void (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') (e.preventDefault(), move(1))
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') (e.preventDefault(), move(-1))
            }}
            className={`relative z-10 inline-flex items-center gap-1.5 rounded-full font-medium transition-colors duration-200 ${
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm'
            } ${on ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {Icon && <Icon size={14} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
