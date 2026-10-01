// Voice agent: ElevenLabs speech-to-text for questions and text-to-speech for answers.
// The key stays here. Only answers the chat actually produced can be spoken (no free TTS on our quota),
// and spoken audio is cached so a repeated answer costs nothing.
import { createHash } from 'node:crypto'

const API = 'https://api.elevenlabs.io/v1'
const KEY = () => process.env.ELEVENLABS_API_KEY
const VOICE = () => process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'
const TTS_MODEL = () => process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2'
const STT_MODEL = () => process.env.ELEVENLABS_STT_MODEL || 'scribe_v2'
export const MAX_SPEAK_CHARS = 700
export const MAX_AUDIO_BYTES = 4_000_000 // ~30 s of browser opus audio, with room to spare

export class VoiceError extends Error {
  constructor(message, status = 502, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const voiceEnabled = () => !!KEY()
// learned from attempts: a refusal switches speech-to-text off for 2 minutes, then we try again
// (so turning the permission on in ElevenLabs is picked up without a restart)
let sttDeniedAt = 0
const sttDenied = () => Date.now() - sttDeniedAt < 120_000
export const sttState = () => (sttDenied() ? 'off' : 'elevenlabs')

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 32)

// ---- what may be spoken: answers this user just received ----------------------------------------
const spoken = new Map() // user -> recent answer hashes
export function allowSpeech(user, text) {
  const list = spoken.get(user) ?? []
  list.push(hash(speakable(text)))
  spoken.set(user, list.slice(-20))
}
export const maySpeak = (user, text) => (spoken.get(user) ?? []).includes(hash(speakable(text)))

/** Text a voice reads well: no markdown, rupees and lakh/crore said in words. */
export function speakable(text) {
  const unit = { k: ' thousand', l: ' lakh', lakh: ' lakh', cr: ' crore', crore: ' crore', m: ' million', mn: ' million' }
  return String(text)
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/₹\s?(\d[\d,]*(?:\.\d+)?)\s?(k|l|lakh|cr|crore|m|mn)?(?![a-z])/gi, (_, n, u) => `${n}${u ? unit[u.toLowerCase()] : ''} rupees`)
    .replace(/(\d)%/g, '$1 percent')
    .replace(/\s*·\s*/g, ', ')
    .replace(/→/g, ' to ')
    .replace(/\n+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_SPEAK_CHARS)
}

const audioCache = new Map() // hash -> Buffer
export async function speak(text) {
  const say = speakable(text)
  if (!say) throw new VoiceError('Nothing to say.', 400)
  const h = hash(say)
  if (audioCache.has(h)) return audioCache.get(h)
  const res = await fetch(`${API}/text-to-speech/${VOICE()}?output_format=mp3_44100_128`, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { 'xi-api-key': KEY(), 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: say, model_id: TTS_MODEL() }),
  }).catch((e) => {
    throw new VoiceError(`Could not reach ElevenLabs (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`)
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg = body?.detail?.message ?? `status ${res.status}`
    if (res.status === 429) throw new VoiceError('The voice service is busy. Try again in a moment.', 429)
    if (res.status === 401) throw new VoiceError(`ElevenLabs rejected the key: ${msg}`, 502, 'tts_key')
    throw new VoiceError(`ElevenLabs could not speak this answer: ${msg}`)
  }
  const audio = Buffer.from(await res.arrayBuffer())
  audioCache.set(h, audio)
  if (audioCache.size > 60) audioCache.delete(audioCache.keys().next().value)
  return audio
}

export async function transcribe(audio, mime = 'audio/webm') {
  if (sttDenied()) throw new VoiceError('ElevenLabs speech-to-text is not enabled for this key.', 403, 'stt_permission')
  if (!audio?.length) throw new VoiceError('No audio arrived. Hold the mic button a little longer.', 400)
  if (audio.length > MAX_AUDIO_BYTES) throw new VoiceError('That recording is too long. Keep questions under 30 seconds.', 413)
  const form = new FormData()
  form.append('model_id', STT_MODEL())
  form.append('file', new Blob([audio], { type: mime }), `question.${mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm'}`)
  const res = await fetch(`${API}/speech-to-text`, {
    method: 'POST',
    signal: AbortSignal.timeout(45_000),
    headers: { 'xi-api-key': KEY() },
    body: form,
  }).catch((e) => {
    throw new VoiceError(`Could not reach ElevenLabs (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`)
  })
  const body = await res.json().catch(() => null)
  if (res.status === 401 && /speech_to_text/.test(body?.detail?.message ?? '')) {
    sttDeniedAt = Date.now()
    throw new VoiceError('ElevenLabs speech-to-text is not enabled for this key.', 403, 'stt_permission')
  }
  if (!res.ok) throw new VoiceError(`ElevenLabs could not transcribe that: ${body?.detail?.message ?? `status ${res.status}`}`)
  sttDeniedAt = 0
  return String(body?.text ?? '').trim()
}
