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

const live = {
  forecast: (horizon: Horizon, basis: Basis) => call<Forecast>(`/forecast?horizon=${horizon}&basis=${basis}`),
  changes: (horizon: Horizon = 30, basis: Basis = 'bookings') => call<Changes>(`/forecast/changes?horizon=${horizon}&basis=${basis}`),
  risk: () => call<RiskDeal[]>('/deals/risk'),
  dealHistory: (id: string) => call<DealHistory>(`/deals/${encodeURIComponent(id)}/history`),
  events: (limit = 50) => call<DealEvent[]>(`/events?limit=${limit}`),
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
