import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check } from 'lucide-react'
import { LogoMark, Wordmark } from './Logo'
import './loaders.css'

/* ------------------------------------------------------------------ small inline loaders */

/** Ring spinner, for inside buttons only. */
export const Spinner = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={`rf-spin shrink-0 ${className}`}>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

/** Three dots, for "thinking" (chat answers). */
export const Dots = ({ className = '' }: { className?: string }) => (
  <span aria-hidden className={`rf-dots inline-flex items-center gap-1 ${className}`}>
    <span />
    <span />
    <span />
  </span>
)

/**
 * The logo builds itself, then its fan keeps folding and re-opening while work is in flight.
 * The one loading motif across the product: page loads, forecast runs, imports.
 */
export const LogoLoader = ({ size = 64, className = '' }: { size?: number; className?: string }) => (
  <LogoMark size={size} animated loop className={className} />
)

/* ------------------------------------------------------------------ page level */

/** Thin brand bar across the top of the viewport on every route change. */
export function TopProgress() {
  const { pathname } = useLocation()
  const [key, setKey] = useState(0)
  useEffect(() => setKey((k) => k + 1), [pathname])
  return <div key={key} aria-hidden className="rf-top-progress" />
}

/** Whole-screen wait (auth check, workspace load), with a way forward when something failed. */
export function FullPageLoader({ label = 'Opening your workspace', error, retry }: { label?: string; error?: string; retry?: () => void }) {
  return (
    <div role={error ? 'alert' : 'status'} className="grid min-h-dvh place-items-center bg-canvas px-4 text-center">
      <div className="flex max-w-md flex-col items-center">
        {error ? <LogoMark size={56} /> : <LogoLoader size={72} />}
        {error ? (
          <>
            <p className="mt-6 text-lg font-semibold">Your workspace did not load</p>
            <p className="mt-1.5 text-sm text-muted">{error}</p>
            {retry && (
              <button type="button" onClick={retry} className="btn btn-primary mt-5">
                Try again
              </button>
            )}
          </>
        ) : (
          <>
            <Wordmark className="mt-5 text-xl" />
            <p className="mt-1 text-sm text-muted">{label}</p>
            <span className="rf-line mt-5 block h-0.5 w-32 overflow-hidden rounded-full bg-line" />
          </>
        )}
      </div>
    </div>
  )
}

/** Engine work inside a card: logo loader + what is happening. */
export function EngineLoader({ title, note }: { title: string; note?: string }) {
  return (
    <div role="status" className="grid min-h-[260px] place-items-center text-center">
      <div className="flex flex-col items-center">
        <LogoLoader size={72} />
        <p className="mt-5 text-lg font-semibold">{title}</p>
        {note && <p className="mt-1 max-w-[46ch] text-sm text-muted">{note}</p>}
      </div>
    </div>
  )
}

/** Vertical step list that ticks through while a long job runs. */
export function StepProgress({ steps, every = 1100 }: { steps: string[]; every?: number }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), every)
    return () => clearInterval(t)
  }, [steps.length, every])
  return (
    <ol className="mx-auto mt-6 w-full max-w-xs space-y-2.5 text-left text-sm">
      {steps.map((s, k) => (
        <li key={s} className={`flex items-center gap-3 transition-colors duration-300 ${k <= i ? 'text-ink' : 'text-faint'}`}>
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-300 ${
              k < i ? 'border-brand bg-brand text-on-brand' : k === i ? 'border-brand text-brand' : 'border-line'
            }`}
          >
            {k < i ? <Check size={12} strokeWidth={3} /> : k === i ? <Spinner size={12} /> : null}
          </span>
          {s}
        </li>
      ))}
    </ol>
  )
}

/* ------------------------------------------------------------------ skeletons */

export const Shimmer = ({ className = '' }: { className?: string }) => <div aria-hidden className={`shimmer ${className}`} />

export const KpiSkeleton = ({ n = 4 }: { n?: number }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="card card-pad space-y-3">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-7 w-32" />
        <Shimmer className="h-3 w-16" />
      </div>
    ))}
  </div>
)

export const ChartSkeleton = ({ h = 'h-72' }: { h?: string }) => (
  <div className="card card-pad">
    <Shimmer className="h-4 w-48" />
    <Shimmer className="mt-2 h-3 w-64" />
    <div className={`mt-6 flex items-end gap-2 ${h}`}>
      {Array.from({ length: 18 }, (_, i) => (
        <Shimmer key={i} className="flex-1 rounded-sm" />
      ))}
    </div>
  </div>
)

export const TableSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="card card-pad space-y-4">
    <Shimmer className="h-4 w-40" />
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-4">
        <Shimmer className="size-8 rounded-md" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-3 w-1/3" />
          <Shimmer className="h-3 w-1/5" />
        </div>
        <Shimmer className="h-3 w-20" />
      </div>
    ))}
  </div>
)

/** Screen-shaped placeholder; announces what is loading. */
export const PageSkeleton = ({ label, variant = 'dashboard' }: { label: string; variant?: 'dashboard' | 'chart' | 'table' }) => (
  <div role="status" aria-label={label} className="space-y-6">
    {variant !== 'table' && <KpiSkeleton />}
    {variant === 'table' ? <TableSkeleton rows={8} /> : <ChartSkeleton />}
    {variant === 'dashboard' && (
      <div className="grid gap-6 lg:grid-cols-2">
        <TableSkeleton rows={3} />
        <TableSkeleton rows={3} />
      </div>
    )}
  </div>
)
