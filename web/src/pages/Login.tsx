import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, useAuth } from '../auth'
import { PillTabs } from '../components/PillNav'
import { Mark } from '../components/Stage'
import { PillButton } from '../components/ui'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  const { session, refresh } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const next = params.get('next')?.startsWith('/app') ? params.get('next')! : '/app'

  if (session) return <Navigate to={next} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    const res =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (res.error) return setError(res.error.message)
    if (!res.data.session) {
      // project requires email confirmation
      setMode('signin')
      return setNotice(`Check ${email} for a confirmation link, then sign in here.`)
    }
    await refresh()
    navigate(next, { replace: true })
  }

  return (
    <main className="grid min-h-screen place-items-center bg-lime px-4 py-10 text-forest">
      <div className="w-full max-w-[420px]">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Mark />
          <span className="font-logo text-[24px] leading-none">Rangefinder</span>
        </Link>
        <section className="rounded-frame bg-white p-6 shadow-[0_24px_60px_-32px_rgba(30,45,38,0.55)] sm:p-8">
          <h1 className="text-balance font-head text-xl font-bold uppercase leading-none">
            {mode === 'signin' ? 'Welcome back' : 'Start forecasting'}
          </h1>
          <p className="mt-2 text-sm text-ink/70">
            {mode === 'signin' ? 'Sign in to your workspace.' : 'Create an account. You will name your workspace next.'}
          </p>
          <div className="mt-6">
            <PillTabs
              label="Sign in or create an account"
              tone="white"
              value={mode}
              onChange={(m) => {
                setMode(m)
                setError(undefined)
              }}
              options={[
                { value: 'signin', label: 'Sign in' },
                { value: 'signup', label: 'Create account' },
              ]}
            />
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm">
              Work email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/20 bg-white px-4 py-3 text-base outline-none focus:border-forest"
              />
            </label>
            <label className="block text-sm">
              Password
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/20 bg-white px-4 py-3 text-base outline-none focus:border-forest"
              />
              {mode === 'signup' && <span className="mt-1 block text-xs text-ink/70">At least 8 characters.</span>}
            </label>
            <div aria-live="polite">
              {error && <p role="alert" className="text-sm text-loss">{error}</p>}
              {notice && <p className="text-sm text-gain">{notice}</p>}
            </div>
            <PillButton type="submit" busy={busy} className="w-full justify-center">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </PillButton>
          </form>
        </section>
        <p className="mt-6 text-center text-sm">
          <Link to="/" className="underline decoration-forest/30 underline-offset-4 hover:decoration-forest">Back to Rangefinder</Link>
        </p>
      </div>
    </main>
  )
}
