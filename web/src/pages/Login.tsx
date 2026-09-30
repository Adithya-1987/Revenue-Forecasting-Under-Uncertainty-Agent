import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Eye, EyeOff, X } from 'lucide-react'
import { supabase, useAuth } from '../auth'
import { PillTabs } from '../components/PillNav'
import { RangeBand } from '../components/RangeBand'
import { Mark } from '../components/Stage'
import { PillButton } from '../components/ui'

type Mode = 'signin' | 'signup'

// Mirror these in Supabase > Authentication > Providers > Email > Password requirements,
// so the rule also holds for anyone calling the Auth API directly.
const RULES: [label: string, test: (p: string) => boolean][] = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['A capital letter (A–Z)', (p) => /[A-Z]/.test(p)],
  ['A small letter (a–z)', (p) => /[a-z]/.test(p)],
  ['A number (0–9)', (p) => /[0-9]/.test(p)],
  ['A special character (! @ # $ …)', (p) => /[^A-Za-z0-9]/.test(p)],
]
// name@domain.tld, no spaces; the browser's own check allows "a@b"
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const field = 'mt-1.5 w-full rounded-xl border border-forest/20 bg-white px-4 py-3.5 text-base outline-none transition-colors focus:border-forest'

export default function LoginPage() {
  const { session, refresh } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const next = params.get('next')?.startsWith('/app') ? params.get('next')! : '/app'

  if (session) return <Navigate to={next} replace />

  const signup = mode === 'signup'
  const passed = RULES.map(([, t]) => t(password))
  const strong = passed.every(Boolean)
  const emailOk = EMAIL.test(email.trim())
  const matches = password === confirm
  const canSubmit = emailOk && password.length > 0 && (!signup || (strong && matches))

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(undefined)
    setNotice(undefined)
    setTouched(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!canSubmit) return
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    const creds = { email: email.trim().toLowerCase(), password }
    const res = signup ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds)
    setBusy(false)
    if (res.error) {
      const m = res.error.message
      return setError(
        /invalid login credentials/i.test(m)
          ? 'Email or password is wrong. New here? Choose Create account.'
          : /already registered/i.test(m)
            ? 'An account with this email exists. Choose Sign in.'
            : /email not confirmed/i.test(m)
              ? 'Confirm your email first: open the link we sent, then sign in.'
              : m,
      )
    }
    if (!res.data.session) {
      // the project requires email confirmation before the first sign-in
      switchMode('signin')
      return setNotice(`Account created. Open the confirmation link sent to ${creds.email}, then sign in here.`)
    }
    await refresh()
    navigate(signup ? '/onboarding' : next, { replace: true })
  }

  return (
    <main className="min-h-screen bg-lime text-forest">
      <div className="mx-auto grid min-h-screen max-w-[1200px] items-center gap-10 px-4 py-10 lg:grid-cols-[1fr_auto_1fr] lg:gap-16 lg:px-10">
        {/* brand side */}
        <section aria-label="Rangefinder" className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <Link to="/" className="flex items-center gap-4" aria-label="Rangefinder home">
            <span className="scale-[1.4] lg:scale-[1.7]"><Mark /></span>
            <span className="ml-2 font-logo text-[44px] leading-none lg:ml-5 lg:text-[60px]">Rangefinder</span>
          </Link>
          <p className="mt-6 max-w-[34ch] text-pretty text-lg text-forest/90">
            Your pipeline, simulated ten thousand times. See where revenue will land, and exactly why it moved.
          </p>
          <div className="mt-8 hidden w-full max-w-[420px] rounded-card bg-white/60 p-5 lg:block" aria-hidden>
            <p className="mb-1 text-xs text-ink/70">Next 30 days, sample company</p>
            <RangeBand low={1520000} mid={1920000} high={2380000} target={2100000} />
          </div>
        </section>

        {/* divider: vertical on wide screens, horizontal when stacked */}
        <div aria-hidden className="h-px w-full bg-forest/15 lg:h-[70vh] lg:w-px" />

        {/* form side */}
        <section className="w-full justify-self-center lg:justify-self-start">
          <div className="w-full max-w-[500px] rounded-frame bg-white p-7 shadow-[0_24px_60px_-32px_rgba(30,45,38,0.55)] sm:p-10">
            <h1 className="font-head text-xl font-bold uppercase leading-none">{signup ? 'Start forecasting' : 'Welcome back'}</h1>
            <p className="mt-2 text-sm text-ink/70">
              {signup ? 'Create an account. You will name your workspace next.' : 'Sign in to your workspace.'}
            </p>
            <div className="mt-7">
              <PillTabs
                label="Sign in or create an account"
                tone="white"
                value={mode}
                onChange={switchMode}
                options={[
                  { value: 'signin', label: 'Sign in' },
                  { value: 'signup', label: 'Create account' },
                ]}
              />
            </div>

            <form onSubmit={submit} noValidate className="mt-7 space-y-5">
              <label className="block text-sm">
                Work email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={touched && !emailOk}
                  aria-describedby="email-hint"
                  className={`${field} ${touched && !emailOk ? 'border-loss' : ''}`}
                />
                {touched && !emailOk && (
                  <span id="email-hint" className="mt-1 block text-xs text-loss">Enter an email like name@company.com.</span>
                )}
              </label>

              <label className="block text-sm">
                Password
                <span className="relative block">
                  <input
                    type={show ? 'text' : 'password'}
                    required
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby={signup ? 'pw-rules' : undefined}
                    aria-invalid={touched && signup && !strong}
                    className={`${field} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 mt-[3px] grid size-9 -translate-y-1/2 place-items-center rounded-lg text-ink/60 hover:text-ink"
                  >
                    {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                  </button>
                </span>
              </label>

              {signup && (
                <>
                  <div id="pw-rules">
                    <div className="flex gap-1" aria-hidden>
                      {passed.map((_, i) => (
                        <span key={i} className={`h-1.5 flex-1 rounded-full ${passed.filter(Boolean).length > i ? (strong ? 'bg-gain' : 'bg-forest') : 'bg-hair'}`} />
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-medium">
                      {strong ? 'Strong password' : `Password needs ${RULES.length - passed.filter(Boolean).length} more`}
                    </p>
                    <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                      {RULES.map(([label], i) => (
                        <li key={label} className={`flex items-center gap-1.5 ${passed[i] ? 'text-gain' : touched ? 'text-loss' : 'text-ink/70'}`}>
                          {passed[i] ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
                          <span>
                            {label}
                            <span className="sr-only">{passed[i] ? ', done' : ', missing'}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <label className="block text-sm">
                    Confirm password
                    <input
                      type={show ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      aria-invalid={touched && !matches}
                      className={`${field} ${touched && confirm && !matches ? 'border-loss' : ''}`}
                    />
                    {confirm && !matches && <span className="mt-1 block text-xs text-loss">Passwords do not match yet.</span>}
                  </label>
                </>
              )}

              <div aria-live="polite">
                {error && <p role="alert" className="text-sm text-loss">{error}</p>}
                {notice && <p className="text-sm text-gain">{notice}</p>}
              </div>

              <PillButton type="submit" busy={busy} className="w-full justify-center !py-3.5">
                {signup ? 'Create account' : 'Sign in'}
              </PillButton>
            </form>
          </div>
          <p className="mt-6 max-w-[500px] text-center text-sm">
            <Link to="/" className="underline decoration-forest/30 underline-offset-4 hover:decoration-forest">Back to Rangefinder</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
