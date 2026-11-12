import type * as THREE from 'three'

/** Per-frame state shared with every section. */
export interface Frame {
  /** Viewport size in CSS pixels. */
  w: number
  h: number
  time: number
  dt: number
  /** Smoothed scroll velocity in CSS pixels per frame (signed). */
  vel: number
  /** Pointer in normalised device coordinates (-1..1, y up). */
  mouse: THREE.Vector2
  reduced: boolean
  coarse: boolean
}

/** One page section rendered into its own clipped region of the shared canvas. */
export interface SectionView {
  /** Element whose on-screen box is the clip region. */
  panel: HTMLElement
  /** Scroll container used for progress (same as panel for unpinned sections). */
  outer: HTMLElement
  scene: THREE.Scene
  camera: THREE.Camera
  bg: THREE.Color
  /** true: scene is laid out in full-screen pixels and only clipped by the panel. */
  fullViewport: boolean
  /** true if the section has a light background (the nav switches to dark text over it). */
  light?: boolean
  resize(w: number, h: number): void
  update(frame: Frame, rect: DOMRect, progress: number): void
  /** Called when the section is off screen. */
  idle?(): void
  dispose(): void
}

export interface Fonts {
  display: string
  mono: string
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** Frame-rate independent damping. */
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt))

export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose?.()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose?.()
  })
}
