import { useEffect, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, FileUp, Sparkles } from 'lucide-react'
import { api, ApiError, type ImportResult, type Target } from '../api/client'
import { useAuth } from '../auth'
import { downloadTemplate, guessMapping, OPTIONAL, parseCSV, REQUIRED } from '../csv'
import { autoFix } from '../tidy'
import { ImportReview, type Parsed } from '../components/ImportReview'
import { NovaSync } from '../components/NovaSync'
import { money, useApi, useRun } from '../lib'
import { PillTabs } from '../components/PillNav'
import { Stage } from '../components/Stage'
import { ErrorNote, HighlightWord, PillButton, Skeleton } from '../components/ui'

type Tab = 'upload' | 'history' | 'targets'

const input = 'w-full rounded-xl border border-forest/20 bg-white px-3 py-2.5 text-sm outline-none focus:border-forest'

function Upload() {
  const { me, refresh } = useAuth()
  const { bump } = useRun()
  const navigate = useNavigate()
  const [file, setFile] = useState<Parsed>()
  const [phase, setPhase] = useState<'idle' | 'importing' | 'sample' | 'done'>('idle')
  const [result, setResult] = useState<ImportResult>()
  const [error, setError] = useState<{ message: string; details?: string[] }>()
  const [confirmSample, setConfirmSample] = useState(false)
  const deals = me?.workspace?.deals ?? 0

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(undefined)
    setResult(undefined)
    if (f.size > 10_000_000) return setError({ message: `${f.name} is ${(f.size / 1e6).toFixed(1)} MB. The limit is 10 MB.` })
    const [headers, ...rows] = parseCSV(await f.text())
    if (!headers || !rows.length) return setError({ message: `${f.name} has no data rows. Export it again with a header row and at least one deal.` })
    setFile({ filename: f.name, headers, rows, fx: autoFix(headers, rows, guessMapping(headers)) })
  }

  const { data: ai } = useApi(() => api.ai().catch(() => ({ provider: null, name: null })), [])

  const finish = async () => {
    await refresh()
    bump()
  }

  const doImport = async (rows: Record<string, string>[]) => {
    if (!file) return
    setPhase('importing')
    setError(undefined)
    try {
      const r = await api.importRows(file.filename, rows)
      setResult(r)
      setPhase('done')
      await finish()
    } catch (e) {
      setError({ message: (e as Error).message, details: e instanceof ApiError ? e.details : undefined })
      setPhase('idle')
    }
  }

  const { data: nova } = useApi(() => api.nova().catch(() => ({ available: true, server_key: false })), [])
  const doSample = async (kind?: 'aczen') => {
    setPhase('sample')
    setError(undefined)
    try {
      await api.loadSample(kind)
      await finish()
      navigate('/app')
    } catch (e) {
      setError({ message: (e as Error).message })
      setPhase('idle')
    }
  }

  if (phase === 'importing' || phase === 'sample')
    return (
      <div role="status" className="grid min-h-[320px] place-items-center text-center">
        <div>
          <span aria-hidden className="mx-auto mb-4 block size-10 animate-spin rounded-full border-4 border-hair border-t-forest motion-reduce:animate-none" />
          <p className="font-head text-lg font-bold">{phase === 'sample' ? 'Building the sample company' : `Importing ${(file?.rows.length ?? 0).toLocaleString('en-US')} deals`}</p>
          <p className="mt-1 max-w-[46ch] text-sm text-ink/70">
            Saving deals, learning from closed history, then simulating 10,000 futures. This takes about 15 seconds.
          </p>
        </div>
      </div>
    )

  if (phase === 'done' && result)
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden className="mt-0.5 shrink-0 text-gain" />
          <div>
            <h2 className="font-head text-lg font-bold">Imported {file?.filename}</h2>
            <p className="mt-1 text-sm text-ink/70">
              {result.created.toLocaleString('en-US')} new deals, {result.updated.toLocaleString('en-US')} updated
              {result.missing ? `, ${result.missing} open deals were not in this file and were left as they are` : ''}.
            </p>
          </div>
        </div>
        {result.run_error ? (
          <ErrorNote>The data is saved, but the forecast could not run. {result.run_error}</ErrorNote>
        ) : (
          <PillButton onClick={() => navigate('/app')}>Open dashboard</PillButton>
        )}
        <button type="button" onClick={() => (setPhase('idle'), setFile(undefined))} className="block text-sm underline decoration-forest/30 underline-offset-4">
          Upload another file
        </button>
      </div>
    )

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-card border border-loss/40 bg-white p-4 text-sm">
          <p className="text-loss">{error.message}</p>
          {error.details && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/80">
              {error.details.map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
        </div>
      )}

      {!file && <NovaSync onDone={async () => (await finish(), navigate('/app'))} />}
      {!file ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <label className="group flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-forest/25 bg-lime/15 p-6 text-center transition-colors hover:border-forest/50 hover:bg-lime/30 focus-within:border-forest">
            <FileUp aria-hidden className="mb-3 size-8 text-forest" />
            <span className="font-head text-lg font-bold">Upload your pipeline CSV</span>
            <span className="mt-1 max-w-[42ch] text-sm text-ink/70">
              Open deals plus at least 200 closed ones (won and lost), so the model can learn how your deals really behave.
            </span>
            <span className="btn-lift mt-4 pointer-events-none">Choose a CSV file</span>
            <input type="file" accept=".csv,text/csv" onChange={pick} className="sr-only" />
          </label>
          <div className="flex flex-col justify-between rounded-card border border-hair p-6">
            <div>
              <Sparkles aria-hidden className="mb-3 size-6 text-forest" />
              <h2 className="font-head text-lg font-bold">No file yet?</h2>
              <p className="mt-1 text-sm text-ink/70">
                Load a sample company: two years of history, 150 open deals and a week of changes, so every screen has a story.
                {nova?.server_key && ' Or the Aczen demo: the same simulated history built on your real Aczen clients, reps and payment terms, with monthly rep commits.'}
              </p>
            </div>
            {confirmSample ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-loss">This replaces all {deals.toLocaleString('en-US')} deals and forecasts in this workspace.</p>
                <div className="flex flex-wrap gap-2">
                  <PillButton onClick={() => doSample()} icon={false}>Replace with sample</PillButton>
                  {nova?.server_key && <PillButton onClick={() => doSample('aczen')} icon={false}>Replace with Aczen demo</PillButton>}
                  <PillButton variant="secondary" icon={false} onClick={() => setConfirmSample(false)}>Keep my data</PillButton>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <PillButton variant="secondary" onClick={() => (deals ? setConfirmSample(true) : doSample())}>
                  Load sample company
                </PillButton>
                {nova?.server_key && (
                  <PillButton variant="secondary" onClick={() => (deals ? setConfirmSample(true) : doSample('aczen'))}>
                    Load Aczen demo
                  </PillButton>
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-ink/70 lg:col-span-2">
            Columns: {REQUIRED.join(', ')}; optional {OPTIONAL.join(', ')}. Dates as YYYY-MM-DD.{' '}
            <button type="button" onClick={downloadTemplate} className="font-medium text-forest underline decoration-forest/30 underline-offset-4">
              Download the template
            </button>
          </p>
        </div>
      ) : (
        <ImportReview file={file} setFile={setFile} aiName={ai?.name ?? null} onImport={doImport} onCancel={() => setFile(undefined)} />
      )}
    </div>
  )
}

function History() {
  const { runId } = useRun()
  const { data, error } = useApi(() => api.imports(), [runId])
  if (error) return <ErrorNote>Upload history did not load. {error}</ErrorNote>
  if (!data) return <Skeleton label="Loading upload history" />
  if (!data.length) return <p className="py-10 text-center text-sm">No uploads yet. Upload a CSV or load the sample company to start.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-ink text-left text-xs text-ink/70">
            {['When', 'Source', 'Rows', 'New', 'Updated', 'Not in file'].map((h, i) => (
              <th key={h} scope="col" className={`py-2 pr-4 font-normal ${i > 1 ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-b border-hair last:border-0">
              <td className="py-2.5 pr-4">{new Date(r.uploaded_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td className="py-2.5 pr-4">{r.source === 'sample' ? 'Sample company' : r.source === 'nova' ? 'Aczen Nova sync' : r.filename}</td>
              {[r.rows, r.created, r.updated, r.missing].map((n, i) => <td key={i} className="py-2.5 pr-4 text-right">{n.toLocaleString('en-US')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Targets() {
  const { bump } = useRun()
  const { data, error } = useApi(() => api.targets(), [])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [saveError, setSaveError] = useState<string>()
  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.map((t) => [`${t.basis}-${t.horizon}`, String(Math.round(t.amount))])))
  }, [data])
  if (error) return <ErrorNote>Targets did not load. {error}</ErrorNote>
  if (!data) return <Skeleton label="Loading targets" />

  const save = async () => {
    setState('saving')
    setSaveError(undefined)
    const list = Object.entries(draft)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => ({ basis: k.split('-')[0], horizon: Number(k.split('-')[1]), amount: Number(v) }) as Target)
    try {
      await api.saveTargets(list)
      setState('saved')
      bump()
    } catch (e) {
      setSaveError((e as Error).message)
      setState('idle')
    }
  }

  return (
    <div className="max-w-[640px] space-y-5">
      <p className="text-sm text-ink/70">Targets set the dashed line and the chance of hitting it. New targets apply from the next forecast run.</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink/70">
            <th scope="col" className="pb-2 font-normal"><span className="sr-only">Basis</span></th>
            {[30, 60, 90].map((h) => <th key={h} scope="col" className="pb-2 pl-2 font-normal">Next {h} days</th>)}
          </tr>
        </thead>
        <tbody>
          {(['bookings', 'cash'] as const).map((b) => (
            <tr key={b}>
              <th scope="row" className="py-1.5 pr-2 text-left font-medium capitalize">{b}</th>
              {[30, 60, 90].map((h) => (
                <td key={h} className="py-1.5 pl-2">
                  <input
                    aria-label={`${b} target, next ${h} days, in rupees`}
                    inputMode="numeric"
                    value={draft[`${b}-${h}`] ?? ''}
                    onChange={(e) => (setDraft((d) => ({ ...d, [`${b}-${h}`]: e.target.value.replace(/[^0-9]/g, '') })), setState('idle'))}
                    className={input}
                  />
                  {draft[`${b}-${h}`] && <span className="mt-1 block text-xs text-ink/60">{money(Number(draft[`${b}-${h}`]))}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {saveError && <p role="alert" className="text-sm text-loss">{saveError}</p>}
      <div className="flex items-center gap-3">
        <PillButton onClick={save} busy={state === 'saving'} icon={false}>Save targets</PillButton>
        <span aria-live="polite" className="text-sm text-gain">{state === 'saved' ? 'Saved. Run the forecast to apply them.' : ''}</span>
      </div>
    </div>
  )
}

export default function DataPage() {
  const { me } = useAuth()
  const [tab, setTab] = useState<Tab>('upload')
  const first = !me?.workspace?.runs
  return (
    <Stage
      title={<>Bring in your <HighlightWord>pipeline</HighlightWord></>}
      sub={
        first
          ? 'Upload a CSV export from your CRM, or explore with a sample company. Your first forecast runs as soon as the data lands.'
          : "Upload this week's pipeline to see what changed. Re-uploads update deals and count date pushes for you."
      }
      controls={
        <PillTabs
          label="Data sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upload', label: 'Upload' },
            { value: 'history', label: 'History' },
            { value: 'targets', label: 'Targets' },
          ]}
        />
      }
      frameLabel="Data"
    >
      {tab === 'upload' && <Upload />}
      {tab === 'history' && <History />}
      {tab === 'targets' && <Targets />}
    </Stage>
  )
}
