import type { Accuracy, Basis, Changes, Forecast, Horizon, RiskDeal } from '../types'
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
  source: 'csv' | 'sample'
  filename: string | null
  rows: number
  created: number
  updated: number
  missing: number
}
export interface ImportResult {
  created: number
  updated: number
  missing: number
  closed: number
  run_id: string | null
  run_error?: string
}
export interface Target {
  horizon: Horizon
  basis: Basis
  amount: number
}

export const api = {
  forecast: (horizon: Horizon, basis: Basis) => call<Forecast>(`/forecast?horizon=${horizon}&basis=${basis}`),
  changes: (horizon: Horizon = 30, basis: Basis = 'bookings') => call<Changes>(`/forecast/changes?horizon=${horizon}&basis=${basis}`),
  risk: () => call<RiskDeal[]>('/deals/risk'),
  accuracy: () => call<Accuracy>('/metrics/accuracy'),
  run: () => post<{ run_id: string }>('/run'),
  chat: (question: string) => post<{ answer: string }>('/chat', { question }),
  createWorkspace: (name: string, targets: Target[]) => post<Workspace>('/workspaces', { name, targets }),
  loadSample: () => post<{ deals: number }>('/workspaces/sample'),
  importRows: (filename: string, rows: Record<string, string>[]) => post<ImportResult>('/imports', { filename, rows }),
  imports: () => call<ImportRecord[]>('/imports'),
  targets: () => call<Target[]>('/targets'),
  saveTargets: (t: Target[]) => call<Target[]>('/targets', { method: 'PUT', body: JSON.stringify(t) }),
}
