import { useEffect, useState } from 'react'
import './Splash.css'

const MIN_MS = 1900 // the intro finishes at ~1.6s; hold a beat, then leave
const FADE_MS = 450

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Full-page intro on every page load, after the Uiverse logo card (Smit-Prajapati), autoplayed and
 * recoloured to the Rangefinder palette. Stays until `ready` (auth checked) and the intro has played.
 */
export function Splash({ ready }: { ready: boolean }) {
  const [minDone, setMinDone] = useState(false)
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in')

  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), reduced() ? 300 : MIN_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (ready && minDone && phase === 'in') setPhase('out')
  }, [ready, minDone, phase])

  // separate effect: the fade timer must not be cancelled by the phase change that starts it
  useEffect(() => {
    if (phase !== 'out') return
    const t = setTimeout(() => setPhase('gone'), reduced() ? 0 : FADE_MS)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    document.documentElement.style.overflow = phase === 'gone' ? '' : 'hidden'
    return () => void (document.documentElement.style.overflow = '')
  }, [phase])

  if (phase === 'gone') return null
  return (
    <div className={`splash ${phase === 'out' ? 'splash--out' : ''}`} role="status" aria-live="polite" aria-label="Loading Rangefinder">
      <span className="splash-border" aria-hidden />
      <div className="splash-content" aria-hidden>
        <div className="splash-logo">
          <span className="splash-mark">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="2" rx="1" />
              <circle cx="10" cy="12" r="3.5" />
            </svg>
          </span>
          <span className="splash-word">
            Rangefinder
            <span className="splash-trail" />
          </span>
        </div>
        <span className="splash-band">
          <span className="splash-band-track" />
          <span className="splash-band-dot" />
        </span>
        <span className="splash-tagline">Revenue, as a range</span>
      </div>
      <span className="splash-bottom" aria-hidden>
        Loading your forecast
      </span>
    </div>
  )
}
