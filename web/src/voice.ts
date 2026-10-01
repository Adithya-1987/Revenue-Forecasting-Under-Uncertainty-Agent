// Browser side of the voice agent: record a question, play an answer.
import { api } from './api/client'

const MAX_MS = 30_000

/** Records from the mic until stop() (or 30 s). Resolves with the audio. */
export async function startRecording(): Promise<{ stop: () => Promise<Blob>; cancel: () => void }> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record audio.')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
  const chunks: BlobPart[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      resolve(new Blob(chunks, { type: (rec.mimeType || 'audio/webm').split(';')[0] }))
    }
  })
  rec.start()
  const timer = setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_MS)
  return {
    stop: () => {
      clearTimeout(timer)
      if (rec.state === 'recording') rec.stop()
      return done
    },
    cancel: () => {
      clearTimeout(timer)
      if (rec.state === 'recording') rec.stop()
    },
  }
}

// ---- browser speech recognition, used when ElevenLabs speech-to-text is not enabled for the key ----
type Recognition = { lang: string; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null }
const Ctor = (): (new () => Recognition) | undefined =>
  (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition
export const browserRecognition = () => !!Ctor()

/** One utterance via the browser's own recognizer. Resolves with the transcript. */
export function listenInBrowser(): { result: Promise<string>; stop: () => void } {
  const R = Ctor()
  if (!R) return { result: Promise.reject(new Error('This browser has no speech recognition.')), stop: () => {} }
  const r = new R()
  r.lang = 'en-IN'
  r.interimResults = false
  const result = new Promise<string>((resolve, reject) => {
    let text = ''
    r.onresult = (e) => (text = Array.from(e.results).map((x) => x[0].transcript).join(' '))
    r.onerror = (e) => reject(new Error(e.error === 'not-allowed' ? 'Microphone access was blocked.' : e.error === 'network' ? 'This browser blocks its speech service (Brave does). Enable speech-to-text on the ElevenLabs key, or use Chrome.' : `Speech recognition failed (${e.error}).`))
    r.onend = () => resolve(text.trim())
  })
  r.start()
  return { result, stop: () => r.stop() }
}

// ---- playback: one answer at a time ----
let current: HTMLAudioElement | null = null
export function stopSpeaking() {
  current?.pause()
  current = null
}
export async function speakAnswer(text: string, onEnd?: () => void) {
  stopSpeaking()
  const url = URL.createObjectURL(await api.speak(text))
  const audio = new Audio(url)
  current = audio
  audio.onended = audio.onpause = () => {
    URL.revokeObjectURL(url)
    if (current === audio) current = null
    onEnd?.()
  }
  await audio.play()
}
