import { useState, type FormEvent } from 'react'
import { MessageSquareText, Send } from 'lucide-react'
import { api } from '../api/client'
import { Dots } from './Loaders'
import { Button } from './ui'

const SUGGESTIONS = ['Which deal should I call first, and why?', 'Why did the forecast drop?', 'How likely are we to hit target?']

/** Ask about the current numbers. Answers come only from this run's forecast, changes and risk data. */
export function ChatBox() {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState<string>()
  const [answer, setAnswer] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const ask = (q: string) => {
    if (!q.trim()) return
    setBusy(true)
    setError(undefined)
    setAnswer(undefined)
    setAsked(q)
    api
      .chat(q)
      .then((r) => setAnswer(r.answer))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    ask(question)
    setQuestion('')
  }

  return (
    <section aria-label="Ask about this forecast" className="card card-pad">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <MessageSquareText size={17} aria-hidden />
        </span>
        <div>
          <h2 className="text-md font-semibold">Ask about this forecast</h2>
          <p className="text-sm text-muted">Answers use only this run's numbers.</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="q" className="sr-only">Question</label>
        <input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Which deal should I call first, and why?" className="field flex-1" />
        <Button type="submit" busy={busy} icon={Send} className="!h-11">
          {busy ? 'Asking' : 'Ask'}
        </Button>
      </form>

      {!asked && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} className="rounded-md border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-brand/40 hover:text-brand">
              {s}
            </button>
          ))}
        </div>
      )}

      <div aria-live="polite" className="mt-4 max-w-[76ch] space-y-3">
        {asked && <p className="write-in ml-auto w-fit max-w-full rounded-lg bg-surface-2 px-3.5 py-2 text-sm">{asked}</p>}
        {busy && (
          <p className="write-in inline-flex items-center gap-2 rounded-lg border border-line px-3.5 py-2.5 text-brand">
            <Dots /> <span className="sr-only">Thinking</span>
          </p>
        )}
        {error && <p role="alert" className="write-in rounded-lg bg-loss/10 px-3.5 py-2.5 text-sm text-loss">{error}</p>}
        {answer && !error && <p className="write-in whitespace-pre-line rounded-lg border border-line px-3.5 py-2.5 text-sm leading-relaxed">{answer}</p>}
      </div>
    </section>
  )
}
