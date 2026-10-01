import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, Check, Mic, Sparkles, Square, Volume2, VolumeX } from 'lucide-react'
import { api, type ChatAction, type ChatTurn } from '../api/client'
import { useApi, useRun } from '../lib'
import { browserRecognition, listenInBrowser, speakAnswer, startRecording, stopSpeaking } from '../voice'
import { PillButton } from './ui'

interface Message extends ChatTurn {
  unverified?: string[]
  error?: boolean
  refused?: boolean
  action?: ChatAction | null
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
      setMsg(action.type === 'run_forecast' ? 'Forecast is running. Screens refresh when it finishes.' : 'Target saved. Run the forecast to apply it.')
    } catch (e) {
      setState('error')
      setMsg((e as Error).message)
    }
  }
  return (
    <div className="mt-3 border-t border-hair pt-3">
      {state === 'done' ? (
        <p className="flex items-center gap-1.5 text-xs text-gain"><Check size={14} aria-hidden /> {msg}</p>
      ) : (
        <>
          <button
            type="button"
            onClick={go}
            disabled={state === 'busy' || running}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest px-3.5 py-1.5 text-xs font-medium text-white hover:bg-ink disabled:opacity-60"
          >
            {action.label} <ArrowUpRight size={13} aria-hidden />
          </button>
          {'confirm' in action && <span className="ml-2 text-xs text-ink/60">Nothing changes until you click.</span>}
          {state === 'error' && <p role="alert" className="mt-1 text-xs text-loss">{msg}</p>}
        </>
      )}
    </div>
  )
}

const MODES = {
  forecast: {
    title: 'Ask about this forecast',
    placeholder: 'Ask about the range, a deal, or what changed',
    busyText: "Reading this run's numbers…",
    starters: [
      'Why did the forecast move since last run?',
      'Which three deals should I call first, and why?',
      'How much cash will we collect in 30 days?',
      'Which reps are optimists?',
    ],
  },
  marketing: {
    title: 'Growth agent',
    placeholder: 'Ask for a campaign, a channel plan, post copy or an offer',
    busyText: 'Reading your segments, seasons and customers…',
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
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const lines = b.split('\n').filter(Boolean)
        return lines.every((l) => /^\s*[-*•]\s+/.test(l)) ? (
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

/** Ask about the current numbers. Answers come only from this run's data, and every figure is checked against it. */
export function ChatBox({ mode = 'forecast' }: { mode?: Mode }) {
  const cfg = MODES[mode]
  const { data: ai } = useApi(
    () => (mode === 'marketing' ? api.marketingInfo().then((m) => ({ provider: m.name ? ('gemini' as const) : null, name: m.name, questions_left_today: m.questions_left_today })) : api.ai()),
    [mode],
  )
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState<number>()
  const list = useRef<HTMLDivElement>(null)
  const questionsLeft = left ?? ai?.questions_left_today

  // ---- voice agent ----
  const { data: voice } = useApi(() => api.voice().catch(() => ({ tts: false, stt: 'off' as const })), [])
  const [readAloud, setReadAloud] = useState(false)
  const [mic, setMic] = useState<'idle' | 'recording' | 'listening' | 'transcribing'>('idle')
  const [speaking, setSpeaking] = useState<number | null>(null)
  const [voiceNote, setVoiceNote] = useState<string>()
  const [useBrowserStt, setUseBrowserStt] = useState(false)
  const stopMic = useRef<() => void>(() => {})
  const canListen = !!voice?.tts && (voice.stt === 'elevenlabs' || browserRecognition())
  useEffect(() => {
    if (voice?.stt === 'off') setUseBrowserStt(true)
  }, [voice?.stt])
  useEffect(() => () => stopSpeaking(), [])

  const say = (text: string, index: number) => {
    setSpeaking(index)
    speakAnswer(text, () => setSpeaking((s) => (s === index ? null : s))).catch((e: Error) => {
      setSpeaking(null)
      setVoiceNote(`Could not read that aloud. ${e.message}`)
    })
  }

  const micClick = async () => {
    setVoiceNote(undefined)
    if (mic !== 'idle') return stopMic.current()
    stopSpeaking()
    try {
      if (useBrowserStt) {
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
            setUseBrowserStt(true)
            setVoiceNote(
              browserRecognition()
                ? 'ElevenLabs speech-to-text is not enabled on this key, so the browser will listen instead. Press the mic again.'
                : 'ElevenLabs speech-to-text is not enabled on this key. Turn on the speech_to_text permission for the key in ElevenLabs.',
            )
          } else setVoiceNote((e as Error).message)
        }
      }
    } catch (e) {
      setMic('idle')
      setVoiceNote((e as Error).message.includes('Permission') ? 'Microphone access was blocked. Allow it in the browser and try again.' : (e as Error).message)
    }
  }

  // keep the newest message in view inside the chat box only; the page itself never jumps.
  // (Braces matter: newer browsers return a Promise from scroll calls, and an effect must not return one.)
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

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
      // a spoken question gets a spoken answer; typed ones only when "read answers aloud" is on
      if (voice?.tts && (spoken || readAloud)) say(r.answer, index)
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: (e as Error).message, error: true }])
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    ask(question)
  }

  const off = ai && !ai.provider

  return (
    <section aria-label={cfg.title} className="rounded-frame bg-forest p-6 text-white sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-head text-lg font-bold">
          <Sparkles aria-hidden size={18} className="text-lime" /> {cfg.title}
        </h2>
        <div className="flex items-center gap-3">
          <p className="text-xs text-white/80">
            {ai?.name
              ? mode === 'marketing'
                ? `${ai.name}, using your segments, seasons and customers · company figures are checked`
                : `Answered by ${ai.name} from this run's numbers · every figure is checked`
              : off ? 'Chat is off' : ''}
            {questionsLeft != null && ai?.name ? ` · ${questionsLeft} questions left today` : ''}
          </p>
          {voice?.tts && (
            <button
              type="button"
              aria-pressed={readAloud}
              onClick={() => (setReadAloud((v) => !v), stopSpeaking())}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${readAloud ? 'border-lime bg-lime text-forest' : 'border-white/30 text-white hover:border-lime'}`}
            >
              {readAloud ? <Volume2 size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />} Read answers aloud
            </button>
          )}
        </div>
      </div>

      {off ? (
        <p className="mt-3 max-w-[70ch] text-sm text-white/90">
          Connect an AI to ask questions: set GEMINI_API_KEYS in .env, then restart the API.
        </p>
      ) : (
        <>
          {messages.length > 0 && (
            <div ref={list} aria-live="polite" className="mt-5 max-h-[420px] space-y-4 overflow-y-auto overscroll-contain pr-1">
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <p key={i} className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-lime px-4 py-2.5 text-sm text-forest">{m.content}</p>
                ) : (
                  <div key={i} className={`max-w-[88%] rounded-2xl rounded-bl-md px-4 py-3 text-sm ${m.error || m.refused ? 'border border-white/30 text-white' : 'bg-white text-ink'}`}>
                    {m.error ? <p role="alert">{m.content}</p> : <Reply text={m.content} />}
                    {voice?.tts && !m.error && !m.refused && (
                      <button
                        type="button"
                        onClick={() => (speaking === i ? (stopSpeaking(), setSpeaking(null)) : say(m.content, i))}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-ink/60 hover:text-ink"
                      >
                        {speaking === i ? <><Square size={12} aria-hidden /> Stop</> : <><Volume2 size={12} aria-hidden /> Listen</>}
                      </button>
                    )}
                    {m.action && !m.error && <ActionButton action={m.action} />}
                    {!!m.unverified?.length && (
                      <p className="mt-3 flex items-start gap-1.5 border-t border-hair pt-2 text-xs text-loss">
                        <AlertTriangle aria-hidden size={14} className="mt-px shrink-0" />
                        Not found in your data: {m.unverified.join(', ')}. It may be a calculation or a typical industry figure; check it before you rely on it.
                      </p>
                    )}
                  </div>
                ),
              )}
              {busy && (
                <p role="status" className="w-fit rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5 text-sm text-white/90">
                  {cfg.busyText}
                </p>
              )}
            </div>
          )}

          {messages.length === 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Suggested questions">
              {cfg.starters.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => ask(s)} className="rounded-full border border-white/30 px-3.5 py-1.5 text-sm text-white transition-colors hover:border-lime hover:bg-lime hover:text-forest">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p aria-live="polite" className="mt-3 min-h-[1rem] text-xs text-white/80">
            {mic === 'recording' ? 'Recording… press the square to send (stops on its own after 30 seconds).' : mic === 'listening' ? 'Listening…' : mic === 'transcribing' ? 'Turning your question into text…' : voiceNote ?? ''}
          </p>
          <form onSubmit={submit} className="on-dark mt-2 flex flex-col gap-3 sm:flex-row">
            <label htmlFor="chat-q" className="sr-only">Your question</label>
            <input
              id="chat-q"
              value={question}
              maxLength={500}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={cfg.placeholder}
              className="flex-1 rounded-full border border-white/20 bg-white px-5 py-3 text-sm text-ink placeholder:text-ink/55"
            />
            {canListen && (
              <button
                type="button"
                onClick={micClick}
                disabled={busy || mic === 'transcribing'}
                aria-pressed={mic === 'recording' || mic === 'listening'}
                aria-label={mic === 'idle' ? 'Ask by voice' : 'Stop and send'}
                className={`grid size-[46px] shrink-0 place-items-center self-center rounded-full border transition-colors ${
                  mic === 'recording' || mic === 'listening' ? 'animate-pulse border-loss bg-loss text-white motion-reduce:animate-none' : 'border-white/30 text-white hover:border-lime hover:bg-lime hover:text-forest'
                } disabled:opacity-50`}
              >
                {mic === 'recording' || mic === 'listening' ? <Square size={16} aria-hidden /> : <Mic size={18} aria-hidden />}
              </button>
            )}
            <PillButton type="submit" variant="secondary" busy={busy} disabled={!question.trim()}>
              Ask
            </PillButton>
          </form>
        </>
      )}
    </section>
  )
}
