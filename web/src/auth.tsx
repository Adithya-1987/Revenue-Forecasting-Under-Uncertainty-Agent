import { createClient, type Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEMO, demo, wait } from './demo'

// Anon key is public by design; the browser only uses Supabase for sign-in. Data goes through our API.
// In demo mode there is no Supabase project, so no client is created.
export const supabase = DEMO ? null : createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

export interface Workspace {
  id: string
  name: string
  role: 'owner' | 'member'
  deals: number
  runs: number
  last_run_at?: string | null
}
export interface Me {
  user: { id: string; email: string }
  workspace: Workspace | null
}

interface AuthState {
  session: Session | null
  me: Me | null
  /** true until the first session check (and /me, when signed in) finishes */
  loading: boolean
  /** why /me failed, when signed in but the API could not answer */
  error?: string
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>({ session: null, me: null, loading: true, refresh: async () => {}, signOut: async () => {} })
export const useAuth = () => useContext(Ctx)

const demoSession = () => {
  const s = demo.session()
  return s ? ({ access_token: 'demo', user: { email: s.email } } as unknown as Session) : null
}

export async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}
}

export type AuthResult = { error?: string; needsConfirm?: boolean }

/** Sign in or create an account. Returns a readable error instead of throwing. */
export async function authenticate(mode: 'signin' | 'signup', email: string, password: string): Promise<AuthResult> {
  if (!supabase) {
    await wait(700)
    if (mode === 'signin') demo.signIn(email)
    else demo.signUp(email)
    window.dispatchEvent(new Event('rf-demo-auth'))
    return {}
  }
  email = email.trim().toLowerCase()
  const res =
    mode === 'signin' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password })
  if (res.error) {
    const m = res.error.message
    return {
      error: /invalid login credentials/i.test(m)
        ? 'Email or password is wrong. New here? Choose Create account.'
        : /already registered/i.test(m)
          ? 'An account with this email exists. Choose Sign in.'
          : /email not confirmed/i.test(m)
            ? 'Confirm your email first: open the link we sent, then sign in.'
            : m,
    }
  }
  if (!res.data.session) return { needsConfirm: true }
  return {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    if (!supabase) {
      setSession(demoSession())
      setMe(demo.me())
      return
    }
    const { data } = await supabase.auth.getSession()
    if (!data.session) return setMe(null)
    try {
      // Render free tier sleeps when idle; the proxy 502s/504s until it wakes (~1 min), so retry.
      let res = await fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/me`, { headers: { authorization: `Bearer ${data.session.access_token}` } })
      for (let i = 0; i < 8 && [502, 503, 504].includes(res.status); i++) {
        await new Promise((r) => setTimeout(r, 8000))
        res = await fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/me`, { headers: { authorization: `Bearer ${data.session.access_token}` } })
      }
      const body = await res.json().catch(() => null)
      setMe(res.ok ? body : null)
      setError(res.ok ? undefined : body?.error ?? `The API returned ${res.status}.`)
    } catch {
      setMe(null)
      setError('Could not reach the API. Start it with: cd server && npm start')
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      refresh().then(() => setLoading(false))
      const on = () => void refresh()
      window.addEventListener('rf-demo-auth', on)
      return () => window.removeEventListener('rf-demo-auth', on)
    }
    const sb = supabase
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await refresh()
      setLoading(false)
    })
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (!s) setMe(null)
      // never await Supabase inside its own callback (it can deadlock); defer the refresh
      else if (event === 'SIGNED_IN') setTimeout(refresh, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    else demo.signOut()
    setSession(null)
    setMe(null)
  }, [])

  return <Ctx.Provider value={{ session, me, loading, error, refresh, signOut }}>{children}</Ctx.Provider>
}
