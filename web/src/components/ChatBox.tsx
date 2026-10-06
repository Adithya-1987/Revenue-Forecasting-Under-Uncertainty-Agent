import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, MessageSquareText, Mic, Megaphone, Send, Square, Volume2, VolumeX } from 'lucide-react'
import { api, type AiInfo, type ChatAction, type ChatTurn } from '../api/client'
import { useApi, useRun } from '../lib'
import { browserRecognition, listenInBrowser, speakAnswer, startRecording, stopSpeaking } from '../voice'
import { Dots } from './Loaders'
import { Button } from './ui'

interface Message extends ChatTurn {
  unverified?: string[]
  error?: boolean
  refused?: boolean
  action?: ChatAction | null
}

const MODES = {
  forecast: {
    title: 'Ask about this forecast',
    sub: "Answers use only this run's numbers, and every figure is checked.",
    icon: MessageSquareText,
    placeholder: 'Which deal should I call first, and why?',
    starters: ['Why did the forecast move since last run?', 'Which three deals should I call first, and why?', 'How much cash will we collect in 30 days?', 'Which reps are optimists?'],
  },
  marketing: {
    title: 'Growth agent',
    sub: 'Campaigns, channels, copy and timing, worked out from your segments, seasons and customers.',
    icon: Megaphone,
    placeholder: 'Plan a LinkedIn campaign for our best segment',
    starters: [
      'Plan a LinkedIn campaign for our best segment',
      'How do we re-engage quiet and recently lost deals?',
      'What should we promote before our strongest month?',
      'Write 3 email subject lines for Mid-Market buyers',
      'Where should next quarter’s marketing budget go?',
    ],
  },
} as const
type Mode = keyof typeof MODES

/** Light formatting for model replies: paragraphs and "- " bullets, no HTML from the model. */
function Reply({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split(/\n{2,}/).map((b, i) => {
        const lines = b.split('\n').filter(Boolean)
        return lines.length && lines.every((l) => /^\s*[-*•]\s+/.test(l)) ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {lines.map((l, j) => <li key={j}>{l.replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, '')}</li>)}
          </ul>
        ) : (
          <p key={i}>{b.replace(/\*\*/g, '')}</p>
        )
      })}
    </div>
  )
}

/** The one thing the assistant offers to do. Nothing happens until the person clicks it. */
function ActionButton({ action }: { action: ChatAction }) {
  const navigate = useNavigate()
  const { run, running, bump } = useRun()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState<string>()
  const go = async () => {
    if (action.type === 'navigate') return navigate(action.to)
    setState('busy')
    try {
      if (action.type === 'run_forecast') run()
      else {
        await api.saveTargets([{ horizon: action.horizon, basis: action.basis, amount: action.amount }])
        bump()
      }
      setState('done')
      setMsg(action.type === 'run_forecast' ? 'Forecast is running. Screens refresh when it lands.' : 'Target saved. Run the forecast to apply it.')
    } catch (e) {
      setState('error')
      setMsg((e as Error).message)
    }
  }
  return (
    <div className="mt-3 border-t border-line pt-3">
      {state === 'done' ? (
        <p className="flex items-center gap-1.5 text-xs text-gain"><Check size={14} aria-hidden /> {msg}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={go} busy={state === 'busy'} disabled={running}>
            {action.label} <ArrowRight size={14} aria-hidden />
          </Button>
          {'confirm' in action && <span className="text-xs text-faint">Nothing changes until you click.</span>}
          {state === 'error' && <p role="alert" className="w-full text-xs text-loss">{msg}</p>}
        </div>
      )}
    </div>
  )
}

/** Chat with the forecast (default) or the growth agent. Spoken questions get spoken answers. */
export function ChatBox({ mode = 'forecast' }: { mode?: Mode }) {
  const cfg = MODES[mode]
  const Icon = cfg.icon
  const { data: ai } = useApi(
    () => (mode === 'marketing' ? api.marketingInfo().then((m): AiInfo => ({ provider: null, name: m.name, questions_left_today: m.questions_left_today })) : api.ai()),
    [mode],
  )
  const { data: voice } = useApi(() => api.voice().catch(() => ({ tts: false, stt: 'off' as const })), [])
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState<number>()
  const [readAloud, setReadAloud] = useState(false)
  const [mic, setMic] = useState<'idle' | 'recording' | 'listening' | 'transcribing'>('idle')
  const [speaking, setSpeaking] = useState<number | null>(null)
  const [voiceNote, setVoiceNote] = useState<string>()
  const [browserStt, setBrowserStt] = useState(false)
  const stopMic = useRef<() => void>(() => {})
  const list = useRef<HTMLDivElement>(null)
  const questionsLeft = left ?? ai?.questions_left_today
  const canListen = !!voice?.tts && (voice.stt === 'elevenlabs' || browserRecognition())

  // keep the newest message in view inside the box only (braces: scroll calls may return a Promise)
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])
  useEffect(() => {
    if (voice?.stt === 'off') setBrowserStt(true)
  }, [voice?.stt])
  useEffect(() => () => stopSpeaking(), [])

  const say = (text: string, index: number) => {
    setSpeaking(index)
    speakAnswer(text, () => setSpeaking((s) => (s === index ? null : s))).catch((e: Error) => {
      setSpeaking(null)
      setVoiceNote(`Could not read that aloud. ${e.message}`)
    })
  }

  const ask = async (q: string, spoken = false) => {
    const text = q.trim()
    if (!text || busy) return
    const history = messages.filter((m) => !m.error && !m.refused).map(({ role, content }) => ({ role, content }))
    setMessages((m) => [...m, { role: 'user', content: text }])
    setQuestion('')
    setBusy(true)
    try {
      const r = await (mode === 'marketing' ? api.marketing : api.chat)(text, history)
      let index = 0
      setMessages((m) => ((index = m.length), [...m, { role: 'assistant', content: r.answer, unverified: r.unverified, refused: r.refused, action: r.action }]))
      if (r.questions_left_today != null) setLeft(r.questions_left_today)
      if (voice?.tts && (spoken || readAloud)) say(r.answer, index)
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: (e as Error).message, error: true }])
    } finally {
      setBusy(false)
    }
  }

  const micClick = async () => {
    setVoiceNote(undefined)
    if (mic !== 'idle') return stopMic.current()
    stopSpeaking()
    try {
      if (browserStt) {
        const l = listenInBrowser()
        stopMic.current = l.stop
        setMic('listening')
        const text = await l.result
        setMic('idle')
        return text ? ask(text, true) : setVoiceNote('I did not catch that. Try again a little closer to the mic.')
      }
      const rec = await startRecording()
      setMic('recording')
      stopMic.current = async () => {
        const audio = await rec.stop()
        setMic('transcribing')
        try {
          const { text } = await api.transcribe(audio)
          setMic('idle')
          if (text) ask(text, true)
          else setVoiceNote('I did not catch that. Try again a little closer to the mic.')
        } catch (e) {
          setMic('idle')
          if ((e as { code?: string }).code === 'stt_permission') {
            setBrowserStt(true)
            setVoiceNote(browserRecognition()
              ? 'ElevenLabs speech-to-text is not enabled on this key, so the browser will listen instead. Press the mic again.'
              : 'ElevenLabs speech-to-text is not enabled on this key. Turn on its speech_to_text permission.')
          } else setVoiceNote((e as Error).message)
        }
      }
    } catch (e) {
      setMic('idle')
      setVoiceNote((e as Error).message.includes('Permission') ? 'Microphone access was blocked. Allow it in the browser and try again.' : (e as Error).message)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    ask(question)
  }
  const live = mic === 'recording' || mic === 'listening'

  return (
    <section id={`agent-${mode}`} data-agent aria-label={cfg.title} className="card card-pad scroll-mt-6 sm:!p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Icon size={22} aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{cfg.title}</h2>
            <p className="mt-0.5 text-base text-muted">
              {cfg.sub}
              {ai?.name && questionsLeft != null ? ` ${questionsLeft} left today.` : ''}
            </p>
          </div>
        </div>
        {voice?.tts && (
          <button
            type="button"
            aria-pressed={readAloud}
            onClick={() => (setReadAloud((v) => !v), stopSpeaking())}
            className={`chip ${readAloud ? 'chip-brand' : 'chip-neutral'} cursor-pointer`}
          >
            {readAloud ? <Volume2 size={13} aria-hidden /> : <VolumeX size={13} aria-hidden />} Read answers aloud
          </button>
        )}
      </div>

      {messages.length > 0 && (
        <div ref={list} aria-live="polite" className="mt-6 max-h-[560px] space-y-4 overflow-y-auto overscroll-contain pr-1">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <p key={i} className="write-in ml-auto w-fit max-w-[80%] rounded-xl bg-surface-2 px-4 py-2.5 text-base">{m.content}</p>
            ) : (
              <div
                key={i}
                className={`write-in max-w-[88%] rounded-xl px-4 py-3 text-base leading-relaxed ${
                  m.error ? 'bg-loss/10 text-loss' : m.refused ? 'border border-dashed border-line text-muted' : 'border border-line'
                }`}
              >
                {m.error ? <p role="alert">{m.content}</p> : <Reply text={m.content} />}
                {voice?.tts && !m.error && !m.refused && (
                  <button
                    type="button"
                    onClick={() => (speaking === i ? (stopSpeaking(), setSpeaking(null)) : say(m.content, i))}
                    className="mt-2 inline-flex items-center gap-1 text-sm text-faint hover:text-ink"
                  >
                    {speaking === i ? <><Square size={12} aria-hidden /> Stop</> : <><Volume2 size={12} aria-hidden /> Listen</>}
                  </button>
                )}
                {m.action && !m.error && <ActionButton action={m.action} />}
                {!!m.unverified?.length && (
                  <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-2 text-xs text-loss">
                    <AlertTriangle aria-hidden size={14} className="mt-px shrink-0" />
                    Not found in your data: {m.unverified.join(', ')}. It may be a calculation or a typical figure; check it before relying on it.
                  </p>
                )}
              </div>
            ),
          )}
          {busy && (
            <p className="write-in inline-flex items-center gap-2 rounded-lg border border-line px-3.5 py-2.5 text-brand">
              <Dots /> <span className="sr-only">Thinking</span>
            </p>
          )}
        </div>
      )}

      {messages.length === 0 && (
        <div className="mt-6 flex flex-wrap gap-2.5" role="list" aria-label="Suggested questions">
          {cfg.starters.map((s) => (
            <button key={s} type="button" role="listitem" onClick={() => ask(s)} className="rounded-lg border border-line px-3.5 py-2 text-sm text-muted transition-colors hover:border-brand/40 hover:text-brand">
              {s}
            </button>
          ))}
        </div>
      )}

      <p aria-live="polite" className="mt-4 min-h-[1.25rem] text-sm text-faint">
        {mic === 'recording' ? 'Recording… press the square to send (stops after 30 seconds).' : mic === 'listening' ? 'Listening…' : mic === 'transcribing' ? 'Turning your question into text…' : voiceNote ?? ''}
      </p>
      <form onSubmit={submit} className="mt-1 flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`q-${mode}`} className="sr-only">Question</label>
        <input id={`q-${mode}`} value={question} maxLength={500} onChange={(e) => setQuestion(e.target.value)} placeholder={cfg.placeholder} className="field !h-14 !text-md sm:flex-1 sm:!text-base" />
        {canListen && (
          <button
            type="button"
            onClick={micClick}
            disabled={busy || mic === 'transcribing'}
            aria-pressed={live}
            aria-label={mic === 'idle' ? 'Ask by voice' : 'Stop and send'}
            className={`btn !h-14 !w-14 !px-0 ${live ? 'animate-pulse bg-loss text-white motion-reduce:animate-none' : 'btn-secondary'}`}
          >
            {live ? <Square size={16} aria-hidden /> : <Mic size={18} aria-hidden />}
          </button>
        )}
        <Button type="submit" busy={busy} icon={Send} size="lg" className="!h-14" disabled={!question.trim()}>
          {busy ? 'Asking' : 'Ask'}
        </Button>
      </form>
    </section>
  )
}
