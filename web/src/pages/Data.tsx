import { useEffect, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Download, FileSpreadsheet, FileUp, History as HistoryIcon, Inbox, Sparkles, Target as TargetIcon, Upload as UploadIcon } from 'lucide-react'
import { api, ApiError, type ImportResult, type Target } from '../api/client'
import { useAuth } from '../auth'
import { downloadTemplate, guessMapping, OPTIONAL, parseCSV, REQUIRED } from '../csv'
import { autoFix } from '../tidy'
import { ImportReview, type Parsed } from '../components/ImportReview'
import { NovaSync } from '../components/NovaSync'
import { money, useApi, useRun } from '../lib'
import { PageHeader } from '../components/AppShell'
import { PipelineChanges } from '../components/DealTimeline'
import { EngineLoader, StepProgress, TableSkeleton } from '../components/Loaders'
import { Button, Card, EmptyState, ErrorNote, Segmented } from '../components/ui'

type Tab = 'upload' | 'history' | 'targets'

const STEPS = ['Saving deals', 'Learning from closed history', 'Calibrating reps and timing', 'Simulating 10,000 futures', 'Explaining what changed']

function Upload() {
  const { me, refresh } = useAuth()
  const { bump } = useRun()
  const navigate = useNavigate()
  const [file, setFile] = useState<Parsed>()
  const [phase, setPhase] = useState<'idle' | 'importing' | 'sample' | 'done'>('idle')
  const [result, setResult] = useState<ImportResult>()
  const [error, setError] = useState<{ message: string; details?: string[] }>()
  const [confirmSample, setConfirmSample] = useState(false)
  const [drag, setDrag] = useState(false)
  const deals = me?.workspace?.deals ?? 0

  const load = async (f?: File) => {
    if (!f) return
    setError(undefined)
    setResult(undefined)
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setError({ message: `${f.name} is not a CSV. Export your pipeline as CSV and try again.` })
    if (f.size > 10_000_000) return setError({ message: `${f.name} is ${(f.size / 1e6).toFixed(1)} MB. The limit is 10 MB.` })
    const [headers, ...rows] = parseCSV(await f.text())
    if (!headers || !rows.length) return setError({ message: `${f.name} has no data rows. Export it again with a header row and at least one deal.` })
    setFile({ filename: f.name, headers, rows, fx: autoFix(headers, rows, guessMapping(headers)) })
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    load(e.dataTransfer.files?.[0])
  }

  const { data: ai } = useApi(() => api.ai().catch(() => ({ provider: null, name: null })), [])
  const { data: nova } = useApi(() => api.nova().catch(() => ({ available: true, server_key: false })), [])

  const finish = async () => {
    await refresh()
    bump()
  }

  const doImport = async (mapped: Record<string, string>[]) => {
    if (!file) return
    setPhase('importing')
    setError(undefined)
    try {
      const r = await api.importRows(file.filename, mapped)
      setResult(r)
      setPhase('done')
      await finish()
    } catch (e) {
      setError({ message: (e as Error).message, details: e instanceof ApiError ? e.details : undefined })
      setPhase('idle')
    }
  }

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
      <Card>
        <div className="py-6 text-center">
          <EngineLoader
            title={phase === 'sample' ? 'Building the sample company' : `Importing ${(file?.rows.length ?? 0).toLocaleString('en-US')} deals`}
            note="Saving deals, learning from closed history, then simulating 10,000 futures. This takes about 15 seconds."
          />
          <StepProgress steps={phase === 'sample' ? ['Creating two years of history', ...STEPS.slice(1)] : STEPS} every={phase === 'sample' ? 700 : 650} />
        </div>
      </Card>
    )

  if (phase === 'done' && result)
    return (
      <Card>
        <div className="flex flex-col items-center py-8 text-center">
          <span className="grid size-14 animate-[rise_400ms_ease-out_both] place-items-center rounded-full bg-gain/10 text-gain">
            <CheckCircle2 size={30} aria-hidden />
          </span>
          <h2 className="mt-4 text-xl font-semibold">Imported {file?.filename}</h2>
          <p className="mt-1 max-w-[52ch] text-sm text-muted">
            {result.created.toLocaleString('en-US')} new deals, {result.updated.toLocaleString('en-US')} updated
            {result.missing ? `, ${result.missing} open deals were not in this file and were left as they are` : ''}.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {result.run_error ? (
              <ErrorNote>The data is saved, but the forecast could not run. {result.run_error}</ErrorNote>
            ) : (
              <Button onClick={() => navigate('/app')} arrow>Open dashboard</Button>
            )}
            <Button variant="secondary" icon={UploadIcon} onClick={() => (setPhase('idle'), setFile(undefined))}>Upload another file</Button>
          </div>
        </div>
      </Card>
    )

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="card border-loss/30 p-4 text-sm">
          <p className="font-medium text-loss">{error.message}</p>
          {error.details && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {error.details.map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
        </div>
      )}

      {!file && <NovaSync onDone={async () => (await finish(), navigate('/app'))} />}
      {!file ? (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <label
            onDragOver={(e) => (e.preventDefault(), setDrag(true))}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`group relative flex min-h-[300px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-card border border-dashed p-8 text-center transition-all duration-300 focus-within:border-brand ${
              drag ? 'border-brand bg-brand-soft/60' : 'border-faint/40 bg-surface hover:border-brand/60 hover:bg-brand-soft/30'
            }`}
          >
                        <span className={`relative grid size-12 place-items-center rounded-lg border border-line bg-surface-2 text-brand transition-transform duration-200 ${drag ? '-translate-y-1' : 'group-hover:-translate-y-0.5'}`}>
              <FileUp size={22} aria-hidden />
            </span>
            <span className="relative mt-4 text-lg font-semibold">{drag ? 'Drop to upload' : 'Upload your pipeline CSV'}</span>
            <span className="relative mt-1.5 max-w-[46ch] text-sm text-muted">
              Drag a file here or browse. Open deals plus at least 200 closed ones (won and lost), so the model learns how your deals really behave.
            </span>
            <span className="btn btn-primary pointer-events-none relative mt-6">
              <UploadIcon size={17} aria-hidden /> Choose a CSV file
            </span>
            <input type="file" accept=".csv,text/csv" onChange={(e) => (load(e.target.files?.[0]), (e.target.value = ''))} className="sr-only" />
          </label>

          <div className="flex flex-col gap-6">
            <Card className="flex-1">
              <Sparkles size={20} aria-hidden className="text-brand" />
              <h2 className="mt-3 text-md font-semibold">No file yet?</h2>
              <p className="mt-1 text-sm text-muted">Load a sample company: two years of history, 150 open deals and a week of changes, so every screen has a story.
                {nova?.server_key && ' Or the Aczen demo: the same simulated history built on your real Aczen clients, reps and payment terms, with monthly rep commits.'}</p>
              {confirmSample ? (
                <div className="write-in mt-4 space-y-3 rounded-xl bg-loss/10 p-3">
                  <p className="text-sm text-loss">This replaces all {deals.toLocaleString('en-US')} deals and forecasts in this workspace.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => doSample()} size="sm">Replace with sample</Button>
                    {nova?.server_key && <Button onClick={() => doSample('aczen')} size="sm">Replace with Aczen demo</Button>}
                    <Button variant="secondary" size="sm" onClick={() => setConfirmSample(false)}>Keep my data</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="secondary" arrow onClick={() => (deals ? setConfirmSample(true) : doSample())}>
                    Load sample company
                  </Button>
                  {nova?.server_key && (
                    <Button variant="secondary" arrow onClick={() => (deals ? setConfirmSample(true) : doSample('aczen'))}>
                      Load Aczen demo
                    </Button>
                  )}
                </div>
              )}
            </Card>
            <Card>
              <div className="flex items-start gap-3">
                <FileSpreadsheet size={20} aria-hidden className="mt-0.5 shrink-0 text-brand" />
                <div className="text-sm">
                  <p className="font-medium">Columns we read</p>
                  <p className="mt-1 text-muted">
                    {REQUIRED.join(', ')}; optional {OPTIONAL.join(', ')}. Dates as YYYY-MM-DD.
                  </p>
                  <Button variant="ghost" size="sm" icon={Download} onClick={downloadTemplate} className="-ml-3 mt-2 !text-brand">
                    Download the template
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <ImportReview file={file} setFile={setFile} aiName={ai?.name ?? null} onImport={doImport} onCancel={() => setFile(undefined)} />
      )}
    </div>
  )
}

function History() {
  const { runId } = useRun()
  const { data, error, retry } = useApi(() => api.imports(), [runId])
  if (error) return <ErrorNote retry={retry}>Upload history did not load. {error}</ErrorNote>
  if (!data) return <TableSkeleton rows={4} />
  if (!data.length)
    return (
      <Card>
        <EmptyState icon={Inbox} title="No uploads yet">Upload a CSV or load the sample company to start.</EmptyState>
      </Card>
    )
  return (
    <Card pad={false} title="Uploads" sub="Each file and sample load, newest first">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-line text-left text-xs text-faint">
              {['When', 'Source', 'Rows', 'New', 'Updated', 'Not in file'].map((h, i) => (
                <th key={h} scope="col" className={`px-6 py-3 font-medium ${i > 1 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.id} className="write-in border-b border-line/70 last:border-0 hover:bg-surface-2/70" style={{ animationDelay: `${i * 50}ms` }}>
                <td className="px-6 py-3">{new Date(r.uploaded_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-6 py-3">
                  <span className={`chip ${r.source === 'csv' ? 'chip-neutral' : 'chip-brand'}`}>{r.source === 'sample' ? 'Sample company' : r.source === 'nova' ? 'Aczen Nova sync' : r.filename}</span>
                </td>
                {[r.rows, r.created, r.updated, r.missing].map((n, k) => <td key={k} className="px-6 py-3 text-right">{n.toLocaleString('en-US')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Targets() {
  const { bump } = useRun()
  const { data, error, retry } = useApi(() => api.targets(), [])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [saveError, setSaveError] = useState<string>()
  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.map((t) => [`${t.basis}-${t.horizon}`, String(Math.round(t.amount))])))
  }, [data])
  if (error) return <ErrorNote retry={retry}>Targets did not load. {error}</ErrorNote>
  if (!data) return <TableSkeleton rows={2} />

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

  const cell = (b: 'bookings' | 'cash', h: number) => {
    const k = `${b}-${h}`
    return (
      <>
        <div className="relative mt-1 sm:mt-0">
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">₹</span>
          <input
            aria-label={`${b} target, next ${h} days, in rupees`}
            inputMode="numeric"
            value={draft[k] ?? ''}
            onChange={(e) => (setDraft((d) => ({ ...d, [k]: e.target.value.replace(/[^0-9]/g, '') })), setState('idle'))}
            className="field field-sm !pl-7"
          />
        </div>
        {draft[k] && <span className="mt-1 block text-xs normal-case text-faint">{money(Number(draft[k]))}</span>}
      </>
    )
  }

  return (
    <Card title="Revenue targets" sub="Targets set the dashed line and the chance of hitting it. New targets apply from the next forecast run." className="max-w-3xl">
      {/* phones: one row per horizon, bookings and cash side by side */}
      <div className="space-y-4 sm:hidden">
        {[30, 60, 90].map((h) => (
          <fieldset key={h}>
            <legend className="mb-1.5 text-sm font-semibold">Next {h} days</legend>
            <div className="grid grid-cols-2 gap-3">
              {(['bookings', 'cash'] as const).map((b) => (
                <label key={b} className="min-w-0 text-xs capitalize text-muted">
                  {b}
                  {cell(b, h)}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-faint">
              <th scope="col" className="pb-2 font-medium"><span className="sr-only">Basis</span></th>
              {[30, 60, 90].map((h) => <th key={h} scope="col" className="pb-2 pl-2 font-medium">Next {h} days</th>)}
            </tr>
          </thead>
          <tbody>
            {(['bookings', 'cash'] as const).map((b) => (
              <tr key={b}>
                <th scope="row" className="py-2 pr-2 text-left font-semibold capitalize">{b}</th>
                {[30, 60, 90].map((h) => (
                  <td key={h} className="py-2 pl-2 align-top">
                    {cell(b, h)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {saveError && <p role="alert" className="mt-3 text-sm text-loss">{saveError}</p>}
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} busy={state === 'saving'} icon={TargetIcon}>Save targets</Button>
        <span aria-live="polite" className="text-sm text-gain">{state === 'saved' ? '✓ Saved. Run the forecast to apply them.' : ''}</span>
      </div>
    </Card>
  )
}

export default function DataPage() {
  const { me } = useAuth()
  const [tab, setTab] = useState<Tab>('upload')
  const first = !me?.workspace?.runs
  return (
    <>
      <PageHeader
        eyebrow={first ? 'Step 3 of 3' : undefined}
        title="Bring in your pipeline"
        sub={
          first
            ? 'Upload a CSV export from your CRM, or explore with a sample company. Your first forecast runs as soon as the data lands.'
            : "Upload this week's pipeline to see what changed. Re-uploads update deals and count date pushes for you."
        }
        actions={
          <Segmented
            label="Data sections"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'upload', label: 'Upload', icon: UploadIcon },
              { value: 'history', label: 'History', icon: HistoryIcon },
              { value: 'targets', label: 'Targets', icon: TargetIcon },
            ]}
          />
        }
      />
      <div key={tab} className="page-enter">
        {tab === 'upload' && <Upload />}
        {tab === 'history' && (
          <div className="space-y-6">
            <PipelineChanges />
            <History />
          </div>
        )}
        {tab === 'targets' && <Targets />}
      </div>
    </>
  )
}
