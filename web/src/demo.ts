/**
 * Demo mode: the whole app runs in the browser on the bundled sample company, with no Supabase
 * project or API server. On when VITE_USE_MOCK=true, or when no Supabase URL is configured.
 * Everything here is per-browser convenience state, so localStorage is the right home for it.
 */
import type { Me, Workspace } from './auth'
import type { ImportRecord, Target } from './api/client'
import forecast from './mocks/forecast.json'

export const DEMO = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_SUPABASE_URL

const K = { session: 'rf-demo-session', ws: 'rf-demo-workspace', imports: 'rf-demo-imports', targets: 'rf-demo-targets' }

function get<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function set(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage blocked: demo state lasts for this page only */
  }
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const demo = {
  session: () => get<{ email: string } | null>(K.session, null),
  signIn(email: string) {
    set(K.session, { email })
    // an existing account lands on a ready workspace, so every screen has a story
    if (!get<Workspace | null>(K.ws, null)) this.saveWorkspace('Northwind Traders', 150, 4)
  },
  signUp(email: string) {
    set(K.session, { email })
    set(K.ws, null)
    set(K.imports, null)
  },
  signOut: () => set(K.session, null),

  me(): Me | null {
    const s = this.session()
    if (!s) return null
    return { user: { id: 'demo-user', email: s.email }, workspace: get<Workspace | null>(K.ws, null) }
  },
  saveWorkspace(name: string, deals = 0, runs = 0): Workspace {
    const ws: Workspace = { id: 'demo', name, role: 'owner', deals, runs, last_run_at: runs ? new Date().toISOString() : null }
    set(K.ws, ws)
    return ws
  },
  bumpRuns(deals?: number) {
    const ws = get<Workspace | null>(K.ws, null)
    if (!ws) return
    set(K.ws, { ...ws, deals: deals ?? ws.deals, runs: ws.runs + 1, last_run_at: new Date().toISOString() })
  },

  imports: () => get<ImportRecord[]>(K.imports, []),
  addImport(rec: Omit<ImportRecord, 'id' | 'uploaded_at'>) {
    const list = this.imports()
    set(K.imports, [{ ...rec, id: list.length + 1, uploaded_at: new Date().toISOString() }, ...list])
  },

  targets(): Target[] {
    const f = forecast as Record<string, { target: number }>
    return get<Target[]>(
      K.targets,
      ([30, 60, 90] as const).flatMap((h) =>
        (['bookings', 'cash'] as const).map((b) => ({ horizon: h, basis: b, amount: f[`${h}-${b}`]?.target ?? 0 })),
      ),
    )
  },
  saveTargets: (t: Target[]) => set(K.targets, t),
}
