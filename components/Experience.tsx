'use client'

import { useEffect, useRef } from 'react'
import { site } from '@/content/site'

/** Mounts the shared WebGL canvas and runs the engine for the lifetime of the page. */
export default function Experience() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let engine: { destroy(): void } | undefined
    let cancelled = false

    import('@/webgl/engine').then(({ Engine }) => {
      if (cancelled) return
      const e = new Engine(canvas, site)
      engine = e
      e.start().catch((err) => {
        console.error(err)
        document.documentElement.classList.add('no-webgl')
      })
    })

    return () => {
      cancelled = true
      engine?.destroy()
    }
  }, [])

  return <canvas ref={ref} className="gl" aria-hidden="true" />
}
