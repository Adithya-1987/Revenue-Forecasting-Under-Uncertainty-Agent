import type { Accuracy, Basis, Changes, DealEvent, DealHistory, Forecast, Horizon, RiskDeal } from '../types'
import { authHeader, type Workspace } from '../auth'
import { DEMO, demo, wait } from '../demo'
import mockForecast from '../mocks/forecast.json'
import mockChanges from '../mocks/changes.json'
import mockRisk from '../mocks/risk.json'
import mockAccuracy from '../mocks/accuracy.json'
import mockHistory from '../mocks/history.json'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

/** Error from our API; `details` lists row-level problems for imports. */
export class ApiError extends Error {
  status: number
  details?: string[]
  constructor(message: string, status: number, details?: string[]) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(await authHeader()), ...init.headers },
    })
  } catch {
    throw new ApiError(`Could not reach the API at ${BASE}. Start it with: cd server && npm start`, 0)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.error ?? `${path} returned ${res.status}. Check the server log for the cause.`, res.status, body?.details)
  }
  return res.json() as Promise<T>
}

const post = <T>(path: string, body: unknown = {}) => call<T>(path, { method: 'POST', body: JSON.stringify(body) })

export interface ImportRecord {
  id: number
  uploaded_at: string
  source: 'csv' | 'sample' | 'nova'
  filename: string | null
  rows: number
  created: number
  updated: number
  missing: number
}
export interface ImportResult {
  stage_changes?: number
  close_date_changes?: number
  created: number
  updated: number
  missing: number
  closed: number
  run_id: string | null
  run_error?: string
}
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}
export type ChatAction =
  | { type: 'navigate'; to: string; label: string }
  | { type: 'run_forecast'; label: string; confirm: true }
  | { type: 'set_target'; horizon: Horizon; basis: Basis; amount: number; label: string; confirm: true }
export interface ChatReply {
  answer: string
  /** figures in the answer that could not be matched to the data */
  unverified: string[]
  provider?: string | null
  /** answered locally: off-topic or not allowed, no model call */
  refused?: boolean
  /** one button the person can click to act on the answer; nothing runs until they click */
  action?: ChatAction | null
  questions_left_today?: number
}
export interface TidySuggestion {
  map: Record<string, string>
  values: Record<'segment' | 'stage' | 'status', Record<string, string>>
  date_formats: Record<string, string>
  notes: string[]
  provider: string | null
}
export interface MarketingContext {
  company: string
  segments: { segment: string; open_deals: number; open_value: number; won: number; lost: number; avg_won_deal: number; avg_days_to_win: number; win_rate: number | null }[]
  best_customers: { name: string; segment: string; won_value: number; deals: number }[]
  strongest_months: { month: string; factor: number }[]
  weakest_months: { month: string; factor: number }[]
  quiet_open_deals: { quiet_open_deals: number; quiet_value: number; activity_tracked: boolean }
  recently_lost: { lost_last_90_days: number; lost_value: number }
  next_90_days: { median: number; target: number | null; gap_to_target: number | null; chance_of_target: number | null } | null
}
export type NovaSyncResult = ImportResult & { found: Record<string, number>; skipped: Record<string, number>; replaced_sample?: boolean }
export type AiInfo = { provider: 'gemini' | null; name: string | null; questions_left_today?: number }
export type VoiceInfo = { tts: boolean; stt: 'elevenlabs' | 'off' }

/** Voice calls carry audio, not JSON, so they skip `call`. */
async function audioCall(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(BASE + path, { ...init, headers: { ...(await authHeader()), ...init.headers } }).catch(() => {
    throw new ApiError('Could not reach the API. Start it with: cd server && npm start', 0)
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw Object.assign(new ApiError(body?.error ?? `Voice request failed (${res.status}).`, res.status), { code: body?.code as string | undefined })
  }
  return res
}

export interface Target {
  horizon: Horizon
  basis: Basis
  amount: number
}

const live = {
  forecast: (horizon: Horizon, basis: Basis) => call<Forecast>(`/forecast?horizon=${horizon}&basis=${basis}`),
  changes: (horizon: Horizon = 30, basis: Basis = 'bookings') => call<Changes>(`/forecast/changes?horizon=${horizon}&basis=${basis}`),
  risk: () => call<RiskDeal[]>('/deals/risk'),
  dealHistory: (id: string) => call<DealHistory>(`/deals/${encodeURIComponent(id)}/history`),
  events: (limit = 50) => call<DealEvent[]>(`/events?limit=${limit}`),
  accuracy: () => call<Accuracy>('/metrics/accuracy'),
  run: () => post<{ run_id: string }>('/run'),
  ai: () => call<AiInfo>('/ai'),
  chat: (question: string, history: ChatTurn[] = []) => post<ChatReply>('/chat', { question, history }),
  marketing: (question: string, history: ChatTurn[] = []) => post<ChatReply>('/marketing/chat', { question, history }),
  marketingInfo: () => call<{ name: string | null; questions_left_today: number; context: MarketingContext }>('/marketing'),
  voice: () => call<VoiceInfo>('/voice'),
  speak: async (text: string) =>
    (await audioCall('/voice/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })).blob(),
  transcribe: async (audio: Blob) =>
    (await (await audioCall('/voice/transcribe', { method: 'POST', headers: { 'content-type': audio.type || 'audio/webm' }, body: audio })).json()) as { text: string },
  tidy: (headers: string[], samples: Record<string, string[]>, map: Record<string, string | undefined>) =>
    post<TidySuggestion>('/imports/tidy', { headers, samples, map }),
  nova: () => call<{ available: boolean; server_key: boolean }>('/integrations/nova'),
  syncNova: (apiKey?: string) => post<NovaSyncResult>('/integrations/nova/sync', apiKey ? { api_key: apiKey } : {}),
  createWorkspace: (name: string, targets: Target[]) => post<Workspace>('/workspaces', { name, targets }),
  loadSample: (kind?: 'aczen') => post<{ deals: number }>('/workspaces/sample', kind ? { kind } : {}),
  importRows: (filename: string, rows: Record<string, string>[]) => post<ImportResult>('/imports', { filename, rows }),
  imports: () => call<ImportRecord[]>('/imports'),
  targets: () => call<Target[]>('/targets'),
  saveTargets: (t: Target[]) => call<Target[]>('/targets', { method: 'PUT', body: JSON.stringify(t) }),
}

/** Same surface as `live`, answered from the bundled sample company with realistic latency. */
const mock: typeof live = {
  async forecast(horizon, basis) {
    await wait(550)
    const f = (mockForecast as Record<string, Forecast>)[`${horizon}-${basis}`]
    const t = demo.targets().find((x) => x.horizon === horizon && x.basis === basis)
    return t ? { ...f, target: t.amount } : f
  },
  async changes() {
    await wait(650)
    return mockChanges as Changes
  },
  async risk() {
    await wait(600)
    return mockRisk as RiskDeal[]
  },
  async accuracy() {
    await wait(700)
    return mockAccuracy as Accuracy
  },
  async dealHistory(id) {
    await wait(400)
    const deal = mockHistory.deals.find((d) => d.id === id)
    if (!deal) throw new ApiError('No deal with that id in this workspace.', 404)
    return { deal, events: mockHistory.events.filter((e) => e.deal_id === id) } as DealHistory
  },
  async events(limit = 50) {
    await wait(450)
    return (mockHistory.events as DealEvent[])
      .filter((e) => e.kind !== 'created')
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at) || b.at.localeCompare(a.at))
      .slice(0, limit)
  },
  async run() {
    await wait(2600)
    demo.bumpRuns()
    return { run_id: `demo-${Date.now()}` }
  },
  async ai() {
    return { provider: 'gemini', name: 'Demo assistant', questions_left_today: 60 }
  },
  async marketing(question) {
    await wait(1100)
    return {
      answer:
        `Demo answer to “${question.trim()}”.\n\n` +
        '- Lead with your strongest segment on LinkedIn in the month before your peak closing month.\n' +
        '- Re-engage quiet deals with a short case-study email, then a WhatsApp Business follow-up.\n' +
        '- Ask your three biggest customers for a referral or a short testimonial.',
      unverified: [],
    }
  },
  async marketingInfo() {
    await wait(500)
    return {
      name: 'Demo assistant',
      questions_left_today: 40,
      context: {
        company: demo.me()?.workspace?.name ?? 'Demo company',
        segments: [
          { segment: 'Enterprise', open_deals: 18, open_value: 9_600_000, won: 120, lost: 140, avg_won_deal: 610_000, avg_days_to_win: 118, win_rate: 0.46 },
          { segment: 'Mid-Market', open_deals: 46, open_value: 8_100_000, won: 260, lost: 300, avg_won_deal: 215_000, avg_days_to_win: 74, win_rate: 0.46 },
          { segment: 'SMB', open_deals: 86, open_value: 4_900_000, won: 380, lost: 520, avg_won_deal: 58_000, avg_days_to_win: 36, win_rate: 0.42 },
        ],
        best_customers: (mockRisk as RiskDeal[]).slice(0, 5).map((d) => ({ name: d.name, segment: d.segment, won_value: d.value, deals: 3 })),
        strongest_months: [{ month: 'Mar', factor: 1.4 }, { month: 'Dec', factor: 1.3 }, { month: 'Sep', factor: 1.2 }],
        weakest_months: [{ month: 'Apr', factor: 0.7 }, { month: 'Jan', factor: 0.85 }, { month: 'Jul', factor: 0.9 }],
        quiet_open_deals: { quiet_open_deals: 14, quiet_value: 2_300_000, activity_tracked: true },
        recently_lost: { lost_last_90_days: 31, lost_value: 4_100_000 },
        next_90_days: { median: 5_400_000, target: 6_000_000, gap_to_target: -600_000, chance_of_target: 0.18 },
      },
    }
  },
  async voice() {
    return { tts: false, stt: 'off' }
  },
  async speak() {
    throw new ApiError('Voice needs the live API and an ElevenLabs key.', 503)
  },
  async transcribe() {
    throw new ApiError('Voice needs the live API and an ElevenLabs key.', 503)
  },
  async tidy() {
    throw new ApiError('Suggested fixes need the live API. Match the columns by hand in the demo.', 503)
  },
  async nova() {
    return { available: false, server_key: false }
  },
  async syncNova() {
    throw new ApiError('Aczen Nova sync needs the live API.', 503)
  },
  async chat(question) {
    await wait(1200)
    const top = (mockRisk as RiskDeal[])[0]
    const c = mockChanges as Changes
    const drop = c.prev_total - c.curr_total
    return {
      answer:
        `Demo answer to “${question.trim()}”.\n\n` +
        `The 30-day forecast moved from ₹${(c.prev_total / 1e6).toFixed(2)}M to ₹${(c.curr_total / 1e6).toFixed(2)}M, a drop of ₹${Math.round(drop / 1000)}k. ` +
        `The biggest single cause is ${top.name}: ${top.reasons.join(', ')}. It has a ${Math.round(top.p_win * 100)}% chance to close, so call ${top.rep} about it first.`,
      unverified: [],
    }
  },
  async createWorkspace(name) {
    await wait(700)
    return demo.saveWorkspace(name)
  },
  async loadSample() {
    await wait(3200)
    demo.addImport({ source: 'sample', filename: null, rows: 1240, created: 1240, updated: 0, missing: 0 })
    demo.bumpRuns(150)
    return { deals: 150 }
  },
  async importRows(filename, rows) {
    await wait(3000)
    const closed = rows.filter((r) => /won|lost/i.test(r.status ?? '')).length
    demo.addImport({ source: 'csv', filename, rows: rows.length, created: rows.length, updated: 0, missing: 0 })
    demo.bumpRuns(rows.length - closed)
    return { created: rows.length, updated: 0, missing: 0, closed, run_id: `demo-${Date.now()}` }
  },
  async imports() {
    await wait(450)
    return demo.imports()
  },
  async targets() {
    await wait(350)
    return demo.targets()
  },
  async saveTargets(t) {
    await wait(600)
    demo.saveTargets(t)
    return t
  },
}

export const api = DEMO ? mock : live
