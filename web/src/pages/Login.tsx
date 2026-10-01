import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Eye, EyeOff, GitCompareArrows, Lock, Mail, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { authenticate, useAuth } from '../auth'
import { DEMO } from '../demo'
import { LogoMark, Logo, Wordmark } from '../components/Logo'
import { Button } from '../components/ui'
import './Login.css'

type Mode = 'signin' | 'signup'

/* ------------------------------------------------------------------ fields */

function EmailField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="label">Work email</label>
      <div className="relative">
        <Mail size={17} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input id={id} type="email" required autoComplete="email" value={value} onChange={(e) => onChange(e.target.value)} placeholder="you@company.com" className="field !pl-10" />
      </div>
    </div>
  )
}

function PasswordField({ id, value, onChange, mode }: { id: string; value: string; onChange: (v: string) => void; mode: Mode }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="label">Password</label>
        {mode === 'signup' && <span className="text-xs text-faint">At least 8 characters</span>}
      </div>
      <div className="relative">
        <Lock size={17} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required
          minLength={8}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="field !px-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {show ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
        </button>
      </div>
      {mode === 'signup' && <Strength value={value} />}
    </div>
  )
}

/** Four-segment strength meter; words carry the meaning, colour backs it up. */
function Strength({ value }: { value: string }) {
  const score = [value.length >= 8, /[A-Z]/.test(value) && /[a-z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value) || value.length >= 14].filter(Boolean).length
  const words = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
  const tone = score <= 1 ? 'bg-loss' : score === 2 ? 'bg-target' : 'bg-gain'
  if (!value) return null
  return (
    <div className="mt-2 flex items-center gap-3" aria-live="polite">
      <div aria-hidden className="grid flex-1 grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 rounded-full transition-colors duration-300 ${i < score ? tone : 'bg-surface-2'}`} />
        ))}
      </div>
      <span className="w-16 text-right text-xs text-muted">{words[value.length < 8 ? 0 : score]}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ one form */

interface FormProps {
  mode: Mode
  active: boolean
  email: string
  setEmail: (v: string) => void
  onSwitch: () => void
  onDone: () => void
  notice?: string
  setNotice: (n?: string) => void
}

function AuthForm({ mode, active, email, setEmail, onSwitch, onDone, notice, setNotice }: FormProps) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const form = useRef<HTMLFormElement>(null)
  const signin = mode === 'signin'

  useEffect(() => {
    if (!active) return
    setError(undefined)
    // focus once the slide has settled, so the caret does not jump mid-motion
    const t = setTimeout(() => form.current?.querySelector('input')?.focus({ preventScroll: true }), 650)
    return () => clearTimeout(t)
  }, [active])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    const res = await authenticate(mode, email, password)
    setBusy(false)
    if (res.error) return setError(res.error)
    if (res.needsConfirm) {
      setNotice(`Check ${email} for a confirmation link, then sign in here.`)
      return onSwitch()
    }
    onDone()
  }

  return (
    <div className={`auth-form mx-auto w-full max-w-[400px] ${active ? 'is-active' : ''}`}>
      <div className="auth-stagger">
        <p className="text-sm font-medium text-brand">{signin ? 'Welcome back' : 'Get started free'}</p>
        <h1 className="mt-2 text-3xl font-semibold">{signin ? 'Sign in to Rangefinder' : 'Create your account'}</h1>
        <p className="mt-2 text-muted">
          {signin ? 'Pick up where this week’s forecast left off.' : 'Two minutes to your first honest forecast. You’ll name your workspace next.'}
        </p>
      </div>

      <form onSubmit={submit} className="auth-stagger mt-8 space-y-4" ref={form}>
        <EmailField id={`${mode}-email`} value={email} onChange={setEmail} />
        <PasswordField id={`${mode}-password`} value={password} onChange={setPassword} mode={mode} />
        <div aria-live="polite" className="min-h-[20px]">
          {error && <p role="alert" className="write-in text-sm text-loss">{error}</p>}
          {signin && notice && <p className="write-in text-sm text-gain">{notice}</p>}
        </div>
        <Button type="submit" busy={busy} size="lg" className="w-full" arrow>
          {busy ? (signin ? 'Signing in' : 'Creating account') : signin ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      <p className="auth-stagger mt-6 text-center text-sm text-muted">
        {signin ? 'New to Rangefinder? ' : 'Already have an account? '}
        <button type="button" onClick={onSwitch} className="link">
          {signin ? 'Create an account' : 'Sign in'}
        </button>
      </p>
      {DEMO && (
        <p className="auth-stagger mt-5 flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-3 text-xs text-muted">
          <Sparkles size={14} aria-hidden className="mt-0.5 shrink-0 text-brand" />
          Demo mode: any email and 8-character password work. {signin ? 'Signing in opens a ready sample workspace.' : 'A new account walks you through setup.'}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ middle panel */

const POINTS = [
  { icon: TrendingUp, text: 'Best, expected and worst case for 30, 60 and 90 days' },
  { icon: GitCompareArrows, text: 'Every change since last week, named deal by deal' },
  { icon: ShieldCheck, text: 'Backtested: see how often the range was right' },
]

function BrandPanel({ mode, onSwitch }: { mode: Mode; onSwitch: () => void }) {
  const signin = mode === 'signin'
  return (
    <div className="relative flex h-full flex-col items-center justify-center glass border-y-0 px-10 text-center">
      <div className="relative flex max-w-[380px] flex-col items-center">
        {/* re-keyed so the mark rebuilds itself on every switch */}
        <LogoMark key={mode} size={128} animated title="Rangefinder" />
        <Wordmark className="mt-5 text-3xl" />
        <p className="mt-2 text-sm text-muted">Revenue forecasting under uncertainty</p>

        <div key={`cta-${mode}`} className="brand-swap mt-10 w-full rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-lg font-semibold">{signin ? 'New to Rangefinder?' : 'Already have an account?'}</p>
          <p className="mt-1 text-sm text-muted">
            {signin ? 'Create a workspace and see next quarter as a range in minutes.' : 'Sign in to see what moved since your last forecast.'}
          </p>
          <button type="button" onClick={onSwitch} className="btn btn-secondary group mt-5 w-full">
            {!signin && <ArrowLeft size={16} aria-hidden className="transition-transform group-hover:-translate-x-0.5" />}
            {signin ? 'Create an account' : 'Sign in'}
            {signin && <ArrowRight size={16} aria-hidden className="transition-transform group-hover:translate-x-0.5" />}
          </button>
        </div>

        <ul className="mt-8 w-full space-y-3 text-left text-sm text-muted">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <Icon size={16} aria-hidden className="shrink-0 text-brand" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

/**
 * Sign in / create account on one sliding track: [sign-in form | Rangefinder panel | sign-up form].
 * Two thirds are visible at a time. Choosing "create account" slides everything left, so the fields
 * move left and the logo panel sits in the middle of the track, between the two forms.
 * Below lg the panel folds into a header and the two forms slide as a pair.
 */
export default function LoginPage() {
  const { session, refresh } = useAuth()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState<string>()
  const next = params.get('next')?.startsWith('/app') ? params.get('next')! : '/app'

  useEffect(() => void (document.title = mode === 'signin' ? 'Sign in · Rangefinder' : 'Create account · Rangefinder'), [mode])

  if (session) return <Navigate to={next} replace />

  const switchTo = (m: Mode) => {
    setMode(m)
    const p = new URLSearchParams(params)
    if (m === 'signup') p.set('mode', 'signup')
    else p.delete('mode')
    setParams(p, { replace: true })
  }
  const done = async () => {
    await refresh()
    navigate(next, { replace: true })
  }
  const signup = mode === 'signup'

  return (
    <main className="relative min-h-dvh overflow-clip">
      {/* compact header for small screens; the middle panel carries the brand on large ones */}
      <header className="glass border-x-0 border-t-0 px-5 pb-5 pt-5 lg:hidden">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Rangefinder home" className="rounded-md">
            <Logo size={30} wordClass="text-[18px]" />
          </Link>
          <Link to="/" className="text-sm text-muted hover:text-ink">Home</Link>
        </div>
        <div className="relative mt-5 flex rounded-lg border border-line bg-surface-2 p-0.5" role="tablist" aria-label="Sign in or create an account">
          <span aria-hidden className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-surface shadow-[0_1px_2px_rgb(var(--shadow)/0.1),0_0_0_1px_rgb(var(--line))] transition-transform duration-300 ease-out ${signup ? 'translate-x-full' : ''}`} />
          {(['signin', 'signup'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchTo(m)} className={`relative z-10 h-9 flex-1 rounded-md text-sm font-medium transition-colors ${mode === m ? 'text-ink' : 'text-muted'}`}>
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      </header>

      <Link to="/" className="absolute left-6 top-6 z-20 hidden items-center gap-2 rounded-lg text-sm text-muted transition-colors hover:text-ink lg:inline-flex" style={{ opacity: signup ? 0 : 1, pointerEvents: signup ? 'none' : 'auto' }}>
        <ArrowLeft size={16} aria-hidden /> Back to home
      </Link>

      <div className="relative overflow-clip lg:min-h-dvh">
        <div className={`auth-track flex w-[200%] lg:min-h-dvh lg:w-[150%] ${signup ? 'is-signup' : ''}`}>
          <section inert={signup} aria-hidden={signup} className="flex w-1/2 items-center px-5 py-10 sm:px-10 lg:w-1/3 lg:px-16">
            <AuthForm mode="signin" active={!signup} email={email} setEmail={setEmail} onSwitch={() => switchTo('signup')} onDone={done} notice={notice} setNotice={setNotice} />
          </section>

          <section aria-label="Rangefinder" className="hidden lg:block lg:w-1/3">
            <BrandPanel mode={mode} onSwitch={() => switchTo(signup ? 'signin' : 'signup')} />
          </section>

          <section inert={!signup} aria-hidden={!signup} className="flex w-1/2 items-center px-5 py-10 sm:px-10 lg:w-1/3 lg:px-16">
            <AuthForm mode="signup" active={signup} email={email} setEmail={setEmail} onSwitch={() => switchTo('signin')} onDone={done} notice={notice} setNotice={setNotice} />
          </section>
        </div>
      </div>
    </main>
  )
}
