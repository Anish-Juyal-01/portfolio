'use client'

import { createElement, useEffect, useRef, useState } from 'react'

interface Props {
  text: string
  /** Element to render, e.g. "p", "h2", "li". */
  as?: string
  className?: string
  /** Milliseconds to wait after the element scrolls into view. */
  delay?: number
  /** Milliseconds per character. */
  speed?: number
}

/**
 * Types its text out character by character the first time it scrolls into view.
 * The full text is always in the layout (the untyped part is just transparent), so nothing
 * jumps as it types, and screen readers get the whole sentence at once.
 */
export default function Typed({ text, as = 'p', className, delay = 0, speed = 16 }: Props) {
  const ref = useRef<HTMLElement>(null)
  // null = not started yet (server render and first paint show nothing typed)
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(text.length)
      return
    }

    let timer = 0
    let interval = 0
    let begun = false
    const begin = () => {
      if (begun) return
      begun = true
      timer = window.setTimeout(() => {
        const started = performance.now()
        setCount(0)
        // driven by elapsed time, so a slow frame catches up instead of dragging the typing out
        interval = window.setInterval(() => {
          const n = Math.min(text.length, Math.floor((performance.now() - started) / speed))
          setCount(n)
          if (n >= text.length) window.clearInterval(interval)
        }, 16)
      }, delay)
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        begin()
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    // already on screen when the page opens: start at once rather than wait on the observer
    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight * 0.92 && r.bottom > 0) begin()
    else io.observe(el)

    return () => {
      io.disconnect()
      window.clearTimeout(timer)
      window.clearInterval(interval)
    }
  }, [text, delay, speed])

  const n = count ?? 0
  const typing = count !== null && n < text.length

  return createElement(
    as,
    { ref, className: `typed ${className ?? ''}`.trim(), 'aria-label': text },
    <span aria-hidden="true">
      {text.slice(0, n)}
      <span className={`typed-caret${typing ? ' is-on' : ''}`} />
      <span className="typed-rest">{text.slice(n)}</span>
    </span>,
  )
}
