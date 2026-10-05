import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/*
 * Every landing scene is one timeline whose labels mark its chapters. `drive` ties it to the scroll:
 * with motion it scrubs; with reduced motion it jumps to the end of whichever chapter has been reached, so the
 * reader still sees every state without anything moving.
 */

export interface DriveOptions {
  motion: boolean
  /** called when the playhead enters another chapter (label), both directions */
  onChapter?: (i: number) => void
  scrub?: number
}

export function chapterStarts(tl: gsap.core.Timeline) {
  return Object.values(tl.labels).sort((a, b) => a - b)
}

export function drive(tl: gsap.core.Timeline, vars: ScrollTrigger.Vars, { motion, onChapter, scrub = 0.7 }: DriveOptions) {
  tl.pause(0)
  const starts = chapterStarts(tl)
  const at = (time: number) => Math.max(0, starts.filter((s) => s <= time + 1e-6).length - 1)
  let current = -1
  const emit = (i: number) => {
    if (i === current) return
    current = i
    onChapter?.(i)
  }

  if (motion) {
    if (onChapter) tl.eventCallback('onUpdate', () => emit(at(tl.time())))
    emit(0)
    return ScrollTrigger.create({ ...vars, animation: tl, scrub })
  }

  // reduced motion: show the finished state of the chapter the reader has scrolled into
  const ends = starts.map((_, i) => (i + 1 < starts.length ? starts[i + 1] - 1e-4 : tl.duration()))
  const apply = (progress: number) => {
    const i = at(progress * tl.duration())
    tl.time(ends[i], false)
    emit(i)
  }
  return ScrollTrigger.create({ ...vars, onUpdate: (self) => apply(self.progress), onRefresh: (self) => apply(self.progress) })
}

/** Tweens a number held in a proxy and writes it, formatted, into `el` on every frame (scrubs both ways). */
export function countTo(tl: gsap.core.Timeline, el: Element, proxy: { v: number }, to: number, fmt: (n: number) => string, at: number | string, duration = 0.6) {
  return tl.to(proxy, { v: to, duration, ease: 'power1.inOut', onUpdate: () => void (el.textContent = fmt(proxy.v)) }, at)
}

export const q = <T extends Element = SVGElement>(root: ParentNode, sel: string) => gsap.utils.toArray<T>(root.querySelectorAll(sel))
