import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpRight, Loader2 } from 'lucide-react'

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
  to?: string
  icon?: boolean
  busy?: boolean
}

/** The one button style: a lifting pill. Primary is forest, secondary is white. */
export function PillButton({ variant = 'primary', to, icon = true, busy, className = '', children, ...rest }: PillProps) {
  const cls = `btn-lift ${variant === 'secondary' ? 'btn-lift--light' : ''} ${className}`
  const body = (
    <>
      {busy && <Loader2 size={15} aria-hidden className="animate-spin motion-reduce:animate-none" />}
      {children}
      {icon && !busy && <ArrowUpRight size={15} aria-hidden />}
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

/** White chip behind one key headline word, as in the reference. One per headline. */
export const HighlightWord = ({ children }: { children: ReactNode }) => (
  <span className="rounded-lg bg-white px-2 [box-decoration-break:clone]">{children}</span>
)

export const ReasonChip = ({ children }: { children: ReactNode }) => (
  <span className="inline-block rounded-full bg-[#eef3e8] px-2 py-0.5 text-xs text-forest">
    {children}
  </span>
)

/** Circular arrow badge + signed percent. Arrow carries the meaning, colour backs it up. */
export function DeltaBadge({ value }: { value: number }) {
  const up = value >= 0
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${up ? 'text-gain' : 'text-loss'}`}>
      <span className={`grid size-5 place-items-center rounded-full border ${up ? 'border-gain' : 'border-loss'}`}>
        <Icon size={12} aria-hidden />
      </span>
      {up ? '+' : '−'}
      {Math.abs(value * 100).toFixed(1)}%
    </span>
  )
}

interface StatProps {
  label: string
  value: string
  delta?: number
  note?: string
  className?: string
  /** A small picture of the number, drawn beside it. */
  visual?: ReactNode
  children?: ReactNode
}

/** White card that overlaps the device frame on wide screens and becomes an inline tile on mobile. */
export const StatFloat = ({ label, value, delta, note, className = '', visual, children }: StatProps) => (
  <div className={`rounded-card border border-forest/10 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(30,45,38,0.06),0_12px_32px_-16px_rgba(30,45,38,0.35)] xl:min-w-[184px] ${className}`}>
    <p className="text-xs text-ink/70">{label}</p>
    <div className="mt-1 flex items-center justify-between gap-3">
      <p className="font-head text-xl font-bold">{value}</p>
      {visual}
    </div>
    {delta != null && (
      <p className="mt-1">
        <DeltaBadge value={delta} />
      </p>
    )}
    {note && <p className="mt-1 text-xs text-ink/70">{note}</p>}
    {children}
  </div>
)

export const KpiTile = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="px-4 py-3">
    <p className="text-xs text-ink/70">{label}</p>
    <p className="mt-1 font-head text-xl font-bold">{value}</p>
    {sub && <div className="mt-1 text-xs text-ink/70">{sub}</div>}
  </div>
)

export const ErrorNote = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-card border border-loss/40 bg-white p-4 text-sm text-loss">
    {children}
  </p>
)

/** Small chip pinned to the top edge of the device frame. */
export const FrameChip = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`absolute -top-4 z-10 flex items-center gap-2 rounded-full border border-forest/15 bg-white px-3 py-1.5 text-xs ${className}`}>
    {children}
  </div>
)

/** Static placeholder while data loads: the shape of what is coming, no shimmer. */
export const Skeleton = ({ label }: { label: string }) => (
  <div role="status" aria-label={label} className="space-y-6">
    <div className="h-6 w-48 rounded-md bg-hair/70" />
    <div className="h-20 rounded-card bg-hair/50" />
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="h-52 rounded-card bg-hair/50" />
      <div className="h-52 rounded-card bg-hair/50" />
    </div>
  </div>
)

/** Probability as a ring: the arc is the share of futures that make it. */
export function RingGauge({ value, label }: { value: number; label: string }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 48 48" className="size-12 -rotate-90" role="img" aria-label={label}>
      <circle cx="24" cy="24" r={r} fill="none" stroke="rgb(var(--hair))" strokeWidth="6" />
      <circle cx="24" cy="24" r={r} fill="none" stroke="rgb(var(--gain))" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c * Math.min(Math.max(value, 0), 1)} ${c}`} className="band-move" />
    </svg>
  )
}
