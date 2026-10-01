import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Home, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../auth'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui'
import './NotFound.css'

// Simulated paths that all land inside the band; the page you asked for did not.
const PATHS = Array.from({ length: 9 }, (_, i) => {
  const end = 70 + i * 16
  return `M40 150 C 140 ${150 + ((i * 13) % 9) - 4}, 230 ${(150 + end) / 2}, 360 ${end}`
})

/** 404: every simulated future landed in the range. This URL is the one outlier. */
export default function NotFoundPage() {
  const { pathname } = useLocation()
  const { session } = useAuth()
  const navigate = useNavigate()
  useEffect(() => void (document.title = 'Page not found · Rangefinder'), [])

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-5 py-10">
      <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(60%_55%_at_50%_45%,#000,transparent)]" />
      <Link to="/" className="absolute left-5 top-5 rounded-lg sm:left-8 sm:top-8" aria-label="Rangefinder home">
        <Logo />
      </Link>

      <div className="page-enter relative flex w-full max-w-[640px] flex-col items-center text-center">
        <svg viewBox="0 0 480 300" className="nf-chart w-full max-w-[520px]" role="img" aria-label="A forecast fan where every path lands in range, and one point, this page, sits far outside it">
          <path d="M40 150 L360 60 L360 220 Z" className="nf-band" />
          {PATHS.map((d, i) => (
            <path key={i} d={d} pathLength={1} className="nf-path" style={{ animationDelay: `${150 + i * 70}ms` }} />
          ))}
          <path d="M40 150 C 140 150, 230 146, 360 140" pathLength={1} className="nf-mid" />
          <line x1="360" y1="48" x2="360" y2="232" className="nf-edge" />
          <circle cx="40" cy="150" r="6" className="nf-origin" />
          {/* the outlier */}
          <g className="nf-outlier">
            <line x1="360" y1="140" x2="430" y2="36" className="nf-leader" pathLength={1} />
            <circle cx="430" cy="36" r="16" className="nf-halo" />
            <circle cx="430" cy="36" r="7" className="nf-dot" />
          </g>
          <text x="360" y="258" textAnchor="middle" className="nf-label">P10 – P90</text>
        </svg>

        <p className="eyebrow mt-4">Error 404 · outside the range</p>
        <h1 className="mt-3 font-head text-4xl font-extrabold tracking-tight sm:text-5xl">This page fell outside the forecast</h1>
        <p className="mt-4 max-w-[52ch] text-pretty text-muted">
          We ran 10,000 futures and none of them landed on <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-sm text-ink">{pathname}</code>. It may have moved, or the link has a typo.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {session ? (
            <Button to="/app" icon={LayoutDashboard} size="lg">Go to dashboard</Button>
          ) : (
            <Button to="/" icon={Home} size="lg">Back to home</Button>
          )}
          <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
            Go back
          </Button>
        </div>
      </div>
    </main>
  )
}
