import type { Accuracy, Basis, Changes, DealHistory, Forecast, Horizon, RiskDeal } from '../types'
import { authHeader, type Workspace } from '../auth'

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
export interface ChatReply {
  answer: string
  /** figures in the answer that could not be matched to the forecast data */
  unverified: string[]
  provider?: string | null
  /** answered locally: off-topic or not allowed, no model call */
  refused?: boolean
  /** one button the person can click to act on the answer; nothing runs until they click */
  action?: ChatAction | null
  questions_left_today?: number
}
export type ChatAction =
  | { type: 'navigate'; to: string; label: string }
  | { type: 'run_forecast'; label: string; confirm: true }
  | { type: 'set_target'; horizon: Horizon; basis: Basis; amount: number; label: string; confirm: true }

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

export interface TidySuggestion {
  map: Record<string, string>
  values: Record<'segment' | 'stage' | 'status', Record<string, string>>
  date_formats: Record<string, string>
  notes: string[]
  provider: string | null
}
export interface Target {
  horizon: Horizon
  basis: Basis
  amount: number
}

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

export const api = {
  voice: () => call<{ tts: boolean; stt: 'elevenlabs' | 'off' }>('/voice'),
  speak: async (text: string) =>
    (await audioCall('/voice/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })).blob(),
  transcribe: async (audio: Blob) =>
    (await (await audioCall('/voice/transcribe', { method: 'POST', headers: { 'content-type': audio.type || 'audio/webm' }, body: audio })).json()) as { text: string },
  forecast: (horizon: Horizon, basis: Basis) => call<Forecast>(`/forecast?horizon=${horizon}&basis=${basis}`),
  changes: (horizon: Horizon = 30, basis: Basis = 'bookings') => call<Changes>(`/forecast/changes?horizon=${horizon}&basis=${basis}`),
  risk: () => call<RiskDeal[]>('/deals/risk'),
  history: (dealId: string) => call<DealHistory>(`/deals/${encodeURIComponent(dealId)}/history`),
  accuracy: () => call<Accuracy>('/metrics/accuracy'),
  run: () => post<{ run_id: string }>('/run'),
  ai: () => call<{ provider: 'nova' | 'gemini' | null; name: string | null; questions_left_today?: number }>('/ai'),
  chat: (question: string, history: ChatTurn[]) => post<ChatReply>('/chat', { question, history }),
  marketing: (question: string, history: ChatTurn[]) => post<ChatReply>('/marketing/chat', { question, history }),
  marketingInfo: () => call<{ name: string | null; questions_left_today: number; context: MarketingContext }>('/marketing'),
  nova: () => call<{ available: boolean; server_key: boolean }>('/integrations/nova'),
  syncNova: (apiKey?: string) => post<ImportResult & { found: Record<string, number>; skipped: Record<string, number>; replaced_sample?: boolean }>('/integrations/nova/sync', apiKey ? { api_key: apiKey } : {}),
  tidy: (headers: string[], samples: Record<string, string[]>, map: Record<string, string | undefined>) =>
    post<TidySuggestion>('/imports/tidy', { headers, samples, map }),
  createWorkspace: (name: string, targets: Target[]) => post<Workspace>('/workspaces', { name, targets }),
  loadSample: (kind?: 'aczen') => post<{ deals: number }>('/workspaces/sample', kind ? { kind } : {}),
  importRows: (filename: string, rows: Record<string, string>[]) => post<ImportResult>('/imports', { filename, rows }),
  imports: () => call<ImportRecord[]>('/imports'),
  targets: () => call<Target[]>('/targets'),
  saveTargets: (t: Target[]) => call<Target[]>('/targets', { method: 'PUT', body: JSON.stringify(t) }),
}
