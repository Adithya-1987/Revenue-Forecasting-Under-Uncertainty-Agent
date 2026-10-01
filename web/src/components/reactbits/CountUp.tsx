// From React Bits CountUp (MIT, reactbits.dev), TS-TW variant. Changes: optional `format` so money and
// percentages count in their own notation; reduced-motion jumps straight to the final value;
// re-animates from the previous value when `to` changes (a new forecast run).
import { useInView, useMotionValue, useSpring } from 'motion/react'
import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../../theme'

interface CountUpProps {
  to: number
  from?: number
  delay?: number
  duration?: number
  className?: string
  format?: (n: number) => string
}

export default function CountUp({ to, from = 0, delay = 0, duration = 1.1, className = '', format = (n) => Math.round(n).toLocaleString('en-US') }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(from)
  const springValue = useSpring(motionValue, { damping: 20 + 40 * (1 / duration), stiffness: 100 * (1 / duration) })
  const isInView = useInView(ref, { once: true, margin: '0px' })
  const fmt = useRef(format)
  useEffect(() => void (fmt.current = format))

  useEffect(() => {
    if (!isInView) return
    if (prefersReducedMotion()) {
      motionValue.jump(to)
      springValue.jump(to)
      return
    }
    const id = setTimeout(() => motionValue.set(to), delay * 1000)
    return () => clearTimeout(id)
  }, [isInView, motionValue, springValue, to, delay])

  useEffect(() => {
    if (ref.current) ref.current.textContent = fmt.current(springValue.get())
    return springValue.on('change', (v: number) => {
      if (ref.current) ref.current.textContent = fmt.current(v)
    })
  }, [springValue])

  return <span className={className} ref={ref} aria-label={format(to)} />
}
