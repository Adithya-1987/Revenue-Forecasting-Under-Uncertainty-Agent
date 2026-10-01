import { useId } from 'react'
import './loaders.css'

/**
 * The Rangefinder mark: a cobalt R whose leg opens into a forecast fan — best case (mint),
 * expected (sky, with the median path and its points) and worst case (lavender).
 * Drawn in the reference artwork's own coordinates; public/favicon.svg uses the same paths.
 *
 * `animated` builds the mark (stem, bowl, leg, then the fan unfolds and the median draws).
 * `loop` keeps the fan cycling after the build, for loading states.
 */
export function LogoMark({ size = 36, animated = false, loop = false, className = '', title }: { size?: number; animated?: boolean; loop?: boolean; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '')
  const u = (n: string) => `url(#${n}${id})`
  return (
    <svg
      viewBox="238 192 850 850"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`shrink-0 ${animated ? 'rl-build' : ''} ${loop ? 'rl-loop' : ''} ${className}`}
    >
      <defs>
        <linearGradient id={`st${id}`} x1="258" y1="0" x2="440" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1347C2" />
          <stop offset="1" stopColor="#0A2A78" />
        </linearGradient>
        <linearGradient id={`tp${id}`} x1="300" y1="300" x2="820" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0A2A78" />
          <stop offset="0.65" stopColor="#1452D6" />
          <stop offset="1" stopColor="#2F80F0" />
        </linearGradient>
        <linearGradient id={`lg${id}`} x1="480" y1="640" x2="960" y2="970" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0A2566" />
          <stop offset="0.5" stopColor="#1044B4" />
          <stop offset="1" stopColor="#0A2566" />
        </linearGradient>
        <linearGradient id={`m${id}`} x1="600" y1="0" x2="1052" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5CC6A2" />
          <stop offset="1" stopColor="#CBF5E2" />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="560" y1="0" x2="1066" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2F7FEE" />
          <stop offset="1" stopColor="#D3E8FC" />
        </linearGradient>
        <linearGradient id={`l${id}`} x1="600" y1="0" x2="1050" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9483EE" />
          <stop offset="1" stopColor="#CFC6FB" />
        </linearGradient>
      </defs>

      {/* the R */}
      <path className="rl-stem" fill={u('st')} d="M258 272 Q258 250 276 264 L428 410 Q440 422 440 442 L440 848 Q440 870 422 883 L286 975 Q258 994 258 964 Z" />
      <path className="rl-top" fill={u('tp')} d="M268 256 L620 256 C715 256 790 300 822 378 L700 440 C676 398 640 372 596 372 L384 372 Z" />
      <path className="rl-leg" fill={u('lg')} d="M480 636 L612 636 C642 636 666 648 684 668 L956 958 Q970 978 946 978 L794 978 C762 978 737 966 718 942 L470 662 Q458 636 480 636 Z" />

      {/* the fan: best / expected / worst */}
      <path className="rl-wedge rl-w1" fill={u('m')} d="M484 562 L1020 292 Q1052 278 1052 312 L1052 378 Z" />
      <path className="rl-wedge rl-w2" fill={u('s')} d="M490 566 L1042 396 Q1066 391 1066 416 L1066 602 Q1066 629 1040 626 Z" />
      <path className="rl-wedge rl-w3" fill={u('l')} d="M488 572 L1028 638 Q1050 642 1050 664 L1050 740 Q1050 774 1018 761 Z" />

      {/* the median path */}
      <path className="rl-line" d="M498 566 C600 566 700 561 838 540 C930 526 975 488 1015 462" fill="none" stroke="#0B45C6" strokeWidth="11" strokeLinecap="round" pathLength={1} />
      <circle className="rl-dot rl-d1" cx="672" cy="561" r="15" fill="#0B45C6" stroke="#fff" strokeWidth="4" />
      <circle className="rl-dot rl-d2" cx="838" cy="540" r="18" fill="#0B45C6" stroke="#fff" strokeWidth="4" />
      <circle className="rl-dot rl-d3" cx="1015" cy="462" r="22" fill="#0B45C6" stroke="#fff" strokeWidth="4" />
    </svg>
  )
}

export function Wordmark({ className = '', tone = 'ink' }: { className?: string; tone?: 'ink' | 'white' }) {
  return <span className={`font-head font-bold tracking-[-0.02em] ${tone === 'white' ? 'text-white' : 'text-ink'} ${className}`}>Rangefinder</span>
}

/** Mark + wordmark lockup. */
export function Logo({ size = 32, tone = 'ink', animated, className = '', wordClass = 'text-[19px]' }: { size?: number; tone?: 'ink' | 'white'; animated?: boolean; className?: string; wordClass?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} animated={animated} />
      <Wordmark tone={tone} className={`leading-none ${wordClass}`} />
    </span>
  )
}
