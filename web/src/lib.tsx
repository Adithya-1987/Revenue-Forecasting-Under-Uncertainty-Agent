import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api/client'
import { useAuth } from './auth'

const MINUS = '−'

/** ₹1.92M / ₹310k, or full ₹1,920,000 when compact=false. Minus sign is a real minus. */
export function money(n: number, compact = true) {
  const sign = n < 0 ? MINUS : ''
  const a = Math.abs(n)
  if (!compact) return `${sign}₹${Math.round(a).toLocaleString('en-US')}`
  if (a >= 1e6) return `${sign}₹${(a / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`
  if (a >= 1e3) return `${sign}₹${Math.round(a / 1e3)}k`
  return `${sign}₹${Math.round(a)}`
}

/** Signed money: +₹105k / −₹310k. */
export const signedMoney = (n: number) => (n > 0 ? '+' : '') + money(n)

/** Ledger figure: signed, grouped, no currency symbol. */
export const figure = (n: number) =>
  (n > 0 ? '+' : n < 0 ? MINUS : '') + Math.abs(Math.round(n)).toLocaleString('en-US')

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Fetch on deps change; keeps the previous data while refetching so the band can animate old -> new. */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let live = true
    setLoading(true)
    fn()
      .then(
        (d) => live && (setData(d), setError(undefined)),
        (e: Error) => live && setError(e.message),
      )
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])
  const retry = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, retry }
}

interface RunState {
  runId: number
  running: boolean
  error?: string
  /** When the last run finished in this session. */
  updatedAt?: Date
  run: () => void
  bump: () => void
  dismissError: () => void
}
const RunCtx = createContext<RunState>({ runId: 0, running: false, run: () => {}, bump: () => {}, dismissError: () => {} })
export const useRun = () => useContext(RunCtx)

export function RunProvider({ children }: { children: ReactNode }) {
  const [runId, setRunId] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string>()
  const [updatedAt, setUpdatedAt] = useState<Date>()
  const { refresh } = useAuth()
  const run = useCallback(() => {
    setRunning(true)
    setError(undefined)
    api
      .run()
      .then(() => {
        setRunId((r) => r + 1)
        setUpdatedAt(new Date())
        return refresh()
      })
      .catch((e: Error) => setError(`Forecast run failed. ${e.message}`))
      .finally(() => setRunning(false))
  }, [refresh])
  /** Imports and sample loads run the engine server-side; bump so every screen refetches. */
  const bump = useCallback(() => {
    setRunId((r) => r + 1)
    setUpdatedAt(new Date())
  }, [])
  const dismissError = useCallback(() => setError(undefined), [])
  return <RunCtx.Provider value={{ runId, running, error, updatedAt, run, bump, dismissError }}>{children}</RunCtx.Provider>
}
