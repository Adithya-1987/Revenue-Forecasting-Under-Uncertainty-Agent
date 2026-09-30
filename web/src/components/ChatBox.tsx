import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { PillButton } from './ui'

/** Ask about the current numbers. Answers come only from this run's forecast, changes and risk data. */
export function ChatBox() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const ask = (e: FormEvent) => {
    e.preventDefault()
    if (!question.trim()) return
    setBusy(true)
    setError(undefined)
    api
      .chat(question)
      .then((r) => setAnswer(r.answer))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }

  return (
    <section aria-label="Ask about this forecast" className="rounded-frame bg-forest p-6 sm:p-8">
      <h2 className="font-head text-lg font-bold">Ask about this change</h2>
      <p className="mt-1 text-sm text-white/80">Answers use only this run's numbers.</p>
      <form onSubmit={ask} className="mt-3 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="q" className="sr-only">Question</label>
        <input
          id="q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Which deal should I call first, and why?"
          className="flex-1 rounded-full border border-white/20 bg-white px-5 py-3 text-sm text-ink placeholder:text-ink/55"
        />
        <PillButton type="submit" variant="secondary" busy={busy}>
          {busy ? 'Asking' : 'Ask'}
        </PillButton>
      </form>
      <div aria-live="polite" className="mt-3 max-w-[70ch] text-base">
        {error && <p role="alert">{error}</p>}
        {answer && !error && <p className="whitespace-pre-line">{answer}</p>}
      </div>
    </section>
  )
}
