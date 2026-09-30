import { createClient, type Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// Anon key is public by design; the browser only uses Supabase for sign-in. Data goes through our API.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

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

export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return setMe(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/me`, { headers: { authorization: `Bearer ${data.session.access_token}` } })
      const body = await res.json().catch(() => null)
      setMe(res.ok ? body : null)
      setError(res.ok ? undefined : body?.error ?? `The API returned ${res.status}.`)
    } catch {
      setMe(null)
      setError('Could not reach the API. Start it with: cd server && npm start')
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await refresh()
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (!s) setMe(null)
      // never await Supabase inside its own callback (it can deadlock); defer the refresh
      else if (event === 'SIGNED_IN') setTimeout(refresh, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setMe(null)
  }, [])

  return <Ctx.Provider value={{ session, me, loading, error, refresh, signOut }}>{children}</Ctx.Provider>
}
