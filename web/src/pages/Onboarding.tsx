import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Target } from '../api/client'
import { useAuth } from '../auth'
import { Mark } from '../components/Stage'
import { PillButton } from '../components/ui'

const HORIZONS = [30, 60, 90] as const

export default function OnboardingPage() {
  const { me, refresh, signOut } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    const list: Target[] = HORIZONS.filter((h) => Number(targets[h]) > 0).map((h) => ({ horizon: h, basis: 'bookings', amount: Number(targets[h]) }))
    try {
      await api.createWorkspace(name, list)
      await refresh()
      navigate('/app/data', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-lime px-4 py-10 text-forest">
      <div className="w-full max-w-[520px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <Mark />
          <span className="font-logo text-[24px] leading-none">Rangefinder</span>
        </div>
        <ol aria-label="Setup steps" className="mb-4 flex justify-center gap-2 text-xs">
          {['Account', 'Workspace', 'Data'].map((s, i) => (
            <li key={s} className={`rounded-full px-3 py-1 ${i === 1 ? 'bg-forest text-white' : i < 1 ? 'bg-white text-forest' : 'border border-forest/25'}`}>
              {i < 1 ? '✓ ' : `${i + 1}. `}{s}
            </li>
          ))}
        </ol>
        <form onSubmit={submit} className="rounded-frame bg-white p-6 shadow-[0_24px_60px_-32px_rgba(30,45,38,0.55)] sm:p-8">
          <h1 className="font-head text-xl font-bold uppercase leading-none">Name your workspace</h1>
          <p className="mt-2 text-sm text-ink/70">One workspace per company. Your pipeline and forecasts stay inside it.</p>
          <label className="mt-6 block text-sm">
            Company name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Industries"
              className="mt-1.5 w-full rounded-xl border border-forest/20 px-4 py-3 text-base outline-none placeholder:text-ink/40 focus:border-forest"
            />
          </label>
          <fieldset className="mt-6">
            <legend className="text-sm">Bookings targets <span className="text-ink/70">(optional, in ₹)</span></legend>
            <p className="mt-1 text-xs text-ink/70">Leave blank and we set them 10% above your first forecast. You can change them later.</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {HORIZONS.map((h) => (
                <label key={h} className="text-xs text-ink/70">
                  Next {h} days
                  <input
                    inputMode="numeric"
                    value={targets[h] ?? ''}
                    onChange={(e) => setTargets((t) => ({ ...t, [h]: e.target.value.replace(/[^0-9]/g, '') }))}
                    placeholder="2500000"
                    className="mt-1 w-full rounded-xl border border-forest/20 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-forest"
                  />
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="mt-4 text-sm text-loss">{error}</p>}
          <PillButton type="submit" busy={busy} className="mt-6 w-full justify-center">
            Create workspace
          </PillButton>
        </form>
        <p className="mt-6 text-center text-sm">
          Signed in as {me?.user.email} ·{' '}
          <button type="button" onClick={signOut} className="underline decoration-forest/30 underline-offset-4 hover:decoration-forest">
            Sign out
          </button>
        </p>
      </div>
    </main>
  )
}
