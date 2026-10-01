import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../theme'
import { LogoMark, Wordmark } from './Logo'
import './Splash.css'

const MIN_MS = 1500 // the mark finishes building at ~1.4s
const FADE_MS = 350

/**
 * Boot screen: the mark builds itself on the page ground, the wordmark fades in beneath it,
 * a thin progress line fills, then the screen fades away once the session check is done.
 */
export function Splash({ ready }: { ready: boolean }) {
  const [minDone, setMinDone] = useState(false)
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in')

  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), prefersReducedMotion() ? 200 : MIN_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (ready && minDone && phase === 'in') setPhase('out')
  }, [ready, minDone, phase])

  // separate effect: the fade timer must not be cancelled by the phase change that starts it
  useEffect(() => {
    if (phase !== 'out') return
    const t = setTimeout(() => setPhase('gone'), prefersReducedMotion() ? 0 : FADE_MS)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    document.documentElement.style.overflow = phase === 'gone' ? '' : 'hidden'
    return () => void (document.documentElement.style.overflow = '')
  }, [phase])

  if (phase === 'gone') return null
  return (
    <div className={`splash ${phase === 'out' ? 'splash--out' : ''}`} role="status" aria-live="polite" aria-label="Loading Rangefinder">
      <div className="splash-content" aria-hidden>
        <LogoMark size={96} animated loop />
        <Wordmark className="splash-word mt-5 text-2xl" />
        <span className="splash-tag">Revenue forecasting under uncertainty</span>
        <span className="splash-bar" />
      </div>
    </div>
  )
}
