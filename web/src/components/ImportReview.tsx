import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { api } from '../api/client'
import { OPTIONAL, REQUIRED, type Column } from '../csv'
import { money } from '../lib'
import { applyFixups, autoFix, CANON, DATE_COLS, DATE_FORMATS, distinct, KINDS, problems, type DateFormat, type Fixups, type Kind } from '../tidy'
import { Button } from './ui'

export interface Parsed {
  filename: string
  headers: string[]
  rows: string[][]
  fx: Fixups
}

const PREVIEW: Column[] = ['deal_id', 'deal_name', 'account', 'segment', 'value', 'stage', 'status', 'expected_close_date']
const KIND_LABEL: Record<Kind, string> = { segment: 'Segments', stage: 'Stages', status: 'Status (open, won, lost)' }

const Tag = () => <span className="chip chip-brand ml-1.5 !px-1.5 !py-0 text-2xs">AI suggested</span>

/** Re-run the built-in rules after the column map changes, keeping choices already made. */
function remap(file: Parsed, map: Fixups['map']): Fixups {
  const next = autoFix(file.headers, file.rows, map)
  for (const k of KINDS)
    for (const [raw, v] of Object.entries(file.fx.values[k])) if (distinct(file.headers, file.rows, next.map[k]).includes(raw)) next.values[k][raw] = v
  for (const c of DATE_COLS) if (file.fx.dates[c] && next.map[c] === file.fx.map[c]) next.dates[c] = file.fx.dates[c]
  next.suggested = file.fx.suggested
  return next
}

interface Props {
  file: Parsed
  setFile: (f: Parsed) => void
  aiName: string | null
  onImport: (rows: Record<string, string>[]) => void
  onCancel: () => void
}

export function ImportReview({ file, setFile, aiName, onImport, onCancel }: Props) {
  const { headers, rows, fx } = file
  const [asking, setAsking] = useState(false)
  const [aiNote, setAiNote] = useState<{ text: string; error?: boolean }>()
  const missing = REQUIRED.filter((c) => !fx.map[c])
  const p = useMemo(() => problems(headers, rows, fx), [headers, rows, fx])
  const clean = useMemo(() => applyFixups(headers, rows, fx), [headers, rows, fx])
  const count = (s: string) => clean.filter((r) => r.status === s).length
  const blocking = missing.length + p.total
  const set = (patch: Partial<Fixups>) => setFile({ ...file, fx: { ...fx, ...patch } })

  const suggest = async () => {
    setAsking(true)
    setAiNote(undefined)
    try {
      // column names plus up to 25 distinct sample values per column; never whole rows
      const samples = Object.fromEntries(headers.map((h) => [h, distinct(headers, rows, h).slice(0, 25)]))
      const s = await api.tidy(headers, samples, fx.map)
      const suggested = new Set(fx.suggested)
      // AI fills gaps only; anything the person or the rules already decided stays
      const map = { ...fx.map }
      for (const [col, h] of Object.entries(s.map)) if (!map[col as Column]) (map[col as Column] = h), suggested.add(`map:${col}`)
      const merged = remap({ ...file, fx: { ...fx, suggested } }, map)
      for (const k of KINDS)
        for (const [raw, v] of Object.entries(s.values[k] ?? {}))
          if (!merged.values[k][raw]) (merged.values[k][raw] = v), suggested.add(`${k}:${raw}`)
      for (const [col, f] of Object.entries(s.date_formats))
        if (merged.map[col as Column] && (p.badDates[col as (typeof DATE_COLS)[number]] || !merged.dates[col as (typeof DATE_COLS)[number]]))
          (merged.dates[col as (typeof DATE_COLS)[number]] = f as DateFormat), suggested.add(`date:${col}`)
      merged.suggested = suggested
      setFile({ ...file, fx: merged })
      const n = suggested.size - fx.suggested.size
      setAiNote({ text: n ? `${s.provider} suggested ${n} fix${n === 1 ? '' : 'es'}, marked below. Check them before importing.${s.notes.length ? ' ' + s.notes.join(' ') : ''}` : `${s.provider} found nothing more to fix. Match the rest by hand.` })
    } catch (e) {
      setAiNote({ text: (e as Error).message, error: true })
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="card card-pad write-in space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{file.filename}</h2>
        <p className="text-sm text-muted">
          {rows.length.toLocaleString('en-US')} rows · {count('open')} open · {count('won')} won · {count('lost')} lost
        </p>
      </div>

      {/* status line + AI helper */}
      <div className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${blocking ? 'border-loss/40' : 'border-gain/40'}`}>
        <p className="text-sm" aria-live="polite">
          {blocking ? (
            <span className="text-loss">
              {blocking} thing{blocking === 1 ? '' : 's'} to fix before import
              {missing.length ? `: match ${missing.join(', ')}` : ''}.
            </span>
          ) : (
            <span className="text-gain">Everything matches. Ready to import.</span>
          )}
        </p>
        {aiName && blocking > 0 && (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button variant="secondary" size="sm" onClick={suggest} busy={asking}>
              <Sparkles aria-hidden size={15} /> Suggest fixes with {aiName}
            </Button>
            <span className="text-xs text-faint">Sends column names and up to 25 sample values per column.</span>
          </div>
        )}
      </div>
      {aiNote && <p role={aiNote.error ? 'alert' : 'status'} className={`-mt-4 text-sm ${aiNote.error ? 'text-loss' : 'text-muted'}`}>{aiNote.text}</p>}

      {/* 1. columns */}
      <fieldset>
        <legend className="mb-2 font-medium">1. Columns</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...REQUIRED, ...OPTIONAL].map((col) => {
            const need = (REQUIRED as readonly string[]).includes(col)
            return (
              <label key={col} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${need && !fx.map[col] ? 'border-loss/50' : 'border-line'}`}>
                <span>
                  {fx.map[col] ? <span className="text-gain">✓ </span> : need ? <span className="text-loss">! </span> : null}
                  {col}
                  {!need && <span className="text-xs text-faint"> optional</span>}
                  {fx.suggested.has(`map:${col}`) && <Tag />}
                </span>
                <select
                  value={fx.map[col] ?? ''}
                  onChange={(e) => setFile({ ...file, fx: remap(file, { ...fx.map, [col]: e.target.value || undefined }) })}
                  className="max-w-[52%] truncate rounded-lg border border-line bg-surface px-2 py-1 text-xs"
                >
                  <option value="">Not in file</option>
                  {headers.map((h) => <option key={h}>{h}</option>)}
                </select>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* 2. labels */}
      <fieldset>
        <legend className="mb-2 font-medium">2. Labels</legend>
        <div className="grid gap-4 lg:grid-cols-3">
          {KINDS.map((k) => {
            const raws = distinct(headers, rows, fx.map[k])
            return (
              <div key={k} className="rounded-xl border border-line p-3">
                <p className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{KIND_LABEL[k]}</span>
                  <span className={`text-xs ${!fx.map[k] || p.unmatched[k].length ? 'text-loss' : 'text-gain'}`}>
                    {!fx.map[k] ? 'column not matched' : p.unmatched[k].length ? `${p.unmatched[k].length} to match` : 'all matched'}
                  </span>
                </p>
                <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {raws.slice(0, 60).map((raw) => (
                    <li key={raw} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate" title={raw}>
                        {raw}
                        {fx.suggested.has(`${k}:${raw}`) && <Tag />}
                      </span>
                      <select
                        aria-label={`${KIND_LABEL[k]}: ${raw}`}
                        value={fx.values[k][raw] ?? ''}
                        onChange={(e) => set({ values: { ...fx.values, [k]: { ...fx.values[k], [raw]: e.target.value } } })}
                        className={`w-[118px] shrink-0 rounded-lg border bg-surface px-1.5 py-1 ${fx.values[k][raw] ? 'border-line' : 'border-loss/60'}`}
                      >
                        <option value="">Choose…</option>
                        {CANON[k].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </li>
                  ))}
                  {raws.length > 60 && <li className="text-xs text-loss">{raws.length} different values: this column may be the wrong one.</li>}
                </ul>
              </div>
            )
          })}
        </div>
      </fieldset>

      {/* 3. dates and amounts */}
      <fieldset>
        <legend className="mb-2 font-medium">3. Dates and amounts</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DATE_COLS.filter((c) => fx.map[c]).map((c) => {
            const sample = distinct(headers, rows, fx.map[c])[0] ?? ''
            return (
              <label key={c} className={`rounded-lg border px-3 py-2 text-sm ${p.badDates[c] ? 'border-loss/50' : 'border-line'}`}>
                <span className="flex items-center justify-between gap-2">
                  <span>
                    {c}
                    {fx.suggested.has(`date:${c}`) && <Tag />}
                  </span>
                  <select
                    value={fx.dates[c] ?? ''}
                    onChange={(e) => set({ dates: { ...fx.dates, [c]: e.target.value as DateFormat } })}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-xs"
                  >
                    <option value="">Choose format</option>
                    {DATE_FORMATS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </span>
                <span className={`mt-1 block text-xs ${p.badDates[c] ? 'text-loss' : 'text-faint'}`}>
                  {p.badDates[c] ? `${p.badDates[c]} values do not fit this format` : `e.g. "${sample}"`}
                </span>
              </label>
            )
          })}
          <p className={`rounded-lg border px-3 py-2 text-sm ${p.badAmounts ? 'border-loss/50 text-loss' : 'border-line'}`}>
            value
            <span className={`mt-1 block text-xs ${p.badAmounts ? '' : 'text-faint'}`}>
              {p.badAmounts
                ? `${p.badAmounts} rows are not amounts. Use numbers like 500000, ₹5,00,000, 5 L or 2.5 Cr.`
                : `Reads ₹, commas, L (lakh), Cr (crore), k and M${clean[0]?.value ? `: first row ${money(Number(clean[0].value))}` : ''}`}
            </span>
          </p>
        </div>
      </fieldset>

      {/* preview of what will be imported */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="mb-2 text-left font-medium">4. First rows, as they will be imported</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              {PREVIEW.map((c) => <th key={c} scope="col" className="py-2 pr-3 font-medium">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {clean.slice(0, 6).map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {PREVIEW.map((c) => (
                  <td key={c} className="max-w-[160px] truncate py-2 pr-3">
                    {r[c] ? (c === 'value' && Number(r[c]) > 0 ? money(Number(r[c])) : r[c]) : <span className="text-loss">empty</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => onImport(clean)} disabled={blocking > 0} arrow>
          Import {rows.length.toLocaleString('en-US')} deals and run forecast
        </Button>
        <Button variant="secondary" onClick={onCancel}>Choose another file</Button>
      </div>
    </div>
  )
}
