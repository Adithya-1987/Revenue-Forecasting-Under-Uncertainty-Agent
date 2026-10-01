import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
type Resolved = 'light' | 'dark'

const KEY = 'rf-theme'
const read = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}
const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

interface ThemeState {
  pref: ThemePref
  theme: Resolved
  setPref: (p: ThemePref) => void
  toggle: () => void
}
const Ctx = createContext<ThemeState>({ pref: 'system', theme: 'light', setPref: () => {}, toggle: () => {} })
export const useTheme = () => useContext(Ctx)

/** Light / dark / follow-the-system. The choice is a per-browser convenience, so localStorage is fine. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(read)
  const [sys, setSys] = useState<boolean>(systemDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSys(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const theme: Resolved = pref === 'system' ? (sys ? 'dark' : 'light') : pref

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#161311' : '#EFE3DA')
  }, [theme])

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p)
    try {
      localStorage.setItem(KEY, p)
    } catch {
      /* private mode: the choice lasts for this tab only */
    }
  }, [])
  const toggle = useCallback(() => setPref(theme === 'dark' ? 'light' : 'dark'), [theme, setPref])

  const value = useMemo(() => ({ pref, theme, setPref, toggle }), [pref, theme, setPref, toggle])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Mirror of the chart-relevant tokens in index.css; keep the two in step. */
const PALETTE = {
  light: {
    ink: '#1C1917', muted: '#57504A', faint: '#6E665F', line: '#E4DCD5', surface: '#FCFAF8', surface2: '#F3EEEA',
    brand: '#D9692E', accent: '#F09258', navy: '#1C1816', gain: '#15803D', loss: '#B91C1C', target: '#7E3A6E', info: '#6956CF',
    mint: '#F6C39B', sky: '#EC9256', lavender: '#C98A9B',
  },
  dark: {
    ink: '#F3EDE8', muted: '#C2B7AE', faint: '#9E938A', line: '#423A34', surface: '#26211E', surface2: '#302A26',
    brand: '#F2975E', accent: '#F2975E', navy: '#0C0A09', gain: '#5CC88C', loss: '#F57C70', target: '#D68EC4', info: '#A496F0',
    mint: '#FACDA8', sky: '#F0965C', lavender: '#D496A8',
  },
}
export type ChartColors = (typeof PALETTE)['light']

/** SVG presentation attributes cannot read CSS variables, so charts take resolved colours for the active theme. */
export const useChartColors = (): ChartColors => PALETTE[useTheme().theme]

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
