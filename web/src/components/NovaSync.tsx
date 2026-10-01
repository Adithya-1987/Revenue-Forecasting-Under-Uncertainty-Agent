import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { api, ApiError } from '../api/client'
import { useApi } from '../lib'
import { Button } from './ui'

/** Pull quotations, clients, invoices and payments from Aczen Nova (read-only) and forecast them. */
export function NovaSync({ onDone }: { onDone: () => Promise<void> }) {
  const { data: info } = useApi(() => api.nova().catch(() => ({ available: true, server_key: false })), [])
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; details?: string[] }>()
  const [note, setNote] = useState<string>()

  const sync = async () => {
    setBusy(true)
    setError(undefined)
    setNote(undefined)
    try {
      const r = await api.syncNova(key.trim() || undefined)
      setKey('')
      const f = r.found
      setNote(
        `Read ${f.quotations} quotations, ${f.clients} clients, ${f.invoices} invoices and ${f.payments} payments. ` +
          `${r.created} new deals, ${r.updated} updated${r.stage_changes ? `, ${r.stage_changes} stage changes recorded` : ''}.` +
          (r.replaced_sample ? ' The sample company was removed so it does not mix with your real records.' : '') +
          (r.run_error ? ` The forecast could not run: ${r.run_error}` : ''),
      )
      if (!r.run_error) await onDone()
    } catch (e) {
      setError({ message: (e as Error).message, details: e instanceof ApiError ? e.details : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="nova" className="card card-pad write-in flex flex-col gap-4 border-l-4 border-l-brand lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-[60ch]">
        <h2 id="nova" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Link2 aria-hidden size={18} className="text-brand" /> Sync from Aczen Nova
        </h2>
        <p className="mt-1 text-sm text-muted">
          Reads your quotations as the pipeline, with clients, payment terms, invoices and payments for real close and cash dates.
          Read-only: nothing in Aczen changes. If this workspace holds the sample company, it is replaced.
        </p>
        {busy && <p role="status" className="mt-2 text-sm">Reading from Aczen Nova, then running the forecast. About 15 seconds.</p>}
        {note && <p className="mt-2 text-sm text-gain">{note}</p>}
        {error && (
          <div role="alert" className="mt-2 text-sm text-loss">
            {error.message}
            {error.details && <ul className="mt-1 list-disc pl-5">{error.details.slice(0, 5).map((d) => <li key={d}>{d}</li>)}</ul>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        {info && !info.server_key && (
          <label className="text-sm">
            <span className="sr-only">Aczen Nova API key</span>
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="nova_sk_…"
              className="field field-sm sm:!w-64"
            />
          </label>
        )}
        <Button onClick={sync} arrow busy={busy} disabled={!info || (!info.server_key && !key.trim())}>
          {info?.server_key ? 'Sync now' : 'Connect and sync'}
        </Button>
      </div>
      {info && !info.server_key && <p className="text-xs text-faint lg:hidden">The key is used for this sync only and is not stored.</p>}
    </section>
  )
}
