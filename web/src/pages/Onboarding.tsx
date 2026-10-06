import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Check, LogOut } from 'lucide-react'
import { api, type Target } from '../api/client'
import { useAuth } from '../auth'
import { money } from '../lib'
import { Logo, LogoMark } from '../components/Logo'
import { HORIZONS, TargetPreview, suggestedTarget, type Horizon } from '../components/TargetPreview'
import { Button } from '../components/ui'

const STEPS = ['Account', 'Workspace', 'Data']

/** Three-step progress with a filling rail; done steps tick, the current one pulses. */
function Stepper({ at }: { at: number }) {
  return (
    <ol aria-label="Setup steps" className="relative flex items-center justify-between">
      <span aria-hidden className="absolute inset-x-4 top-4 h-0.5 bg-line" />
      <span aria-hidden className="absolute left-4 top-4 h-0.5 bg-brand transition-[width] duration-700 ease-out" style={{ width: `calc(${(at / (STEPS.length - 1)) * 100}% - 2rem)` }} />
      {STEPS.map((s, i) => (
        <li key={s} className="relative flex flex-col items-center gap-2" aria-current={i === at ? 'step' : undefined}>
          <span
            className={`grid size-8 place-items-center rounded-full border-2 text-xs font-bold transition-all duration-500 ${
              i < at ? 'border-brand bg-brand text-on-brand' : i === at ? 'border-brand bg-surface text-brand ring-4 ring-brand/15' : 'border-line bg-surface text-faint'
            }`}
          >
            {i < at ? <Check size={14} strokeWidth={3} aria-hidden /> : i + 1}
          </span>
          <span className={`text-xs font-medium ${i <= at ? 'text-ink' : 'text-faint'}`}>{s}</span>
        </li>
      ))}
    </ol>
  )
}

export default function OnboardingPage() {
  const { me, refresh, signOut } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [active, setActive] = useState<Horizon>(30)
  const fields = useRef<Record<number, HTMLInputElement | null>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => void (document.title = 'Set up your workspace · Rangefinder'), [])

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

  // the preview follows the field being edited; picking a horizon there jumps to its field
  const typed = Number(targets[active]) || 0
  const pick = (h: Horizon) => (setActive(h), fields.current[h]?.focus())

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,0.8fr)]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <button type="button" onClick={signOut} className="btn btn-ghost btn-sm">
            <LogOut size={15} aria-hidden /> Sign out
          </button>
        </div>

        <div className="page-enter mx-auto my-auto w-full max-w-[520px] py-10">
          <Stepper at={1} />
          <form onSubmit={submit} className="card card-pad mt-8 sm:p-8">
            <Building2 size={22} aria-hidden className="text-brand" />
            <h1 className="mt-3 text-2xl font-semibold">Name your workspace</h1>
            <p className="mt-1 text-sm text-muted">One workspace per company. Your pipeline and forecasts stay inside it.</p>

            <label htmlFor="ws-name" className="label mt-6">Company name</label>
            <input id="ws-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Industries" className="field" />

            <fieldset className="mt-6">
              <legend className="text-sm font-medium">
                Bookings targets <span className="font-normal text-faint">(optional, in ₹)</span>
              </legend>
              <p className="mt-1 text-xs text-muted">Leave blank and we set them 10% above your first forecast. You can change them later.</p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
                {HORIZONS.map((h) => (
                  <label key={h} className="min-w-0 text-xs text-muted">
                    Next {h} days
                    <input
                      ref={(el) => void (fields.current[h] = el)}
                      inputMode="numeric"
                      value={targets[h] ?? ''}
                      onFocus={() => setActive(h)}
                      onChange={(e) => setTargets((t) => ({ ...t, [h]: e.target.value.replace(/[^0-9]/g, '') }))}
                      placeholder={String(suggestedTarget(h))}
                      className="field field-sm mt-1"
                    />
                    <span className="mt-1 block h-4 text-faint">{targets[h] ? money(Number(targets[h])) : ''}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {/* phones and tablets have no side panel, so the preview sits under the targets */}
            <div className="mt-5 rounded-lg border border-line p-4 lg:hidden">
              <TargetPreview compact horizon={active} typed={typed} onHorizon={pick} />
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-loss">{error}</p>}
            <Button type="submit" busy={busy} size="lg" arrow className="mt-6 w-full">
              Create workspace
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted">Signed in as {me?.user.email}</p>
        </div>
      </div>

      {/* live preview: the workspace name and target appear on the product as you type */}
      <aside className="relative hidden border-l border-line bg-rail p-10 lg:flex lg:flex-col lg:justify-center">
        <div className="relative mx-auto w-full max-w-[440px]">
          <p className="text-sm font-medium text-muted">Preview</p>
          <div className="mt-3 rounded-card border border-line bg-surface p-6 shadow-card">
            <div className="flex items-center gap-3">
              <LogoMark size={36} />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{name || 'Your company'}</p>
                <p className="text-xs text-faint">Next {active} days · bookings</p>
              </div>
            </div>
            <div className="mt-6">
              <TargetPreview horizon={active} typed={typed} onHorizon={pick} />
            </div>
            <p className="mt-4 text-sm text-muted">
              Each bar is a slice of ten thousand simulated futures. Once your pipeline lands, they are your real deals, and the lit bars are the futures that reach your target.
            </p>
          </div>
        </div>
      </aside>
    </main>
  )
}
