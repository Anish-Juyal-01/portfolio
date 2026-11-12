import * as THREE from 'three'
import Lenis from 'lenis'
import type { Site } from '@/content/site'
import { Flow, fullscreenTriangle } from './flow'
import { cardTexture } from './textures'
import { clamp, lerp, type Fonts, type Frame, type SectionView } from './types'
import { HeroSection } from './sections/hero'
import { WorkSection } from './sections/work'
import { GallerySection } from './sections/gallery'
import { CorridorSection } from './sections/corridor'

/**
 * One canvas, one render loop.
 *   1. update the cursor flow field
 *   2. render every on-screen section into a shared buffer, each clipped to its DOM box
 *   3. draw that buffer to the screen, pushed around by the flow field
 */

const postVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const postFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tFlow;
  uniform float uStrength;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec3 flow = texture2D(tFlow, vUv).rgb;
    vec2 push = flow.rg * uStrength;
    vec2 uv = vUv - push;
    // colours separate along the direction of the smear
    vec2 split = push * 0.4;
    vec3 col = texture2D(tScene, uv).rgb;
    if (dot(split, split) > 1e-7) {
      col.r = texture2D(tScene, uv - split).r;
      col.b = texture2D(tScene, uv + split).b;
    }
    vec2 v = vUv - 0.5;
    col *= 1.0 - dot(v, v) * 0.55;
    col += (hash(vUv * 900.0 + fract(uTime) * 31.0) - 0.5) * 0.008;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export class Engine {
  private renderer!: THREE.WebGLRenderer
  private target!: THREE.WebGLRenderTarget
  private flow!: Flow
  private post!: THREE.ShaderMaterial
  private postScene = new THREE.Scene()
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private sections: SectionView[] = []
  private corridor?: CorridorSection
  private textures: THREE.Texture[] = []
  private lenis?: Lenis
  private raf = 0
  private dead = false
  private w = 1
  private h = 1
  private dpr = 1
  private last = 0
  private vel = 0
  private lastScroll = 0
  private pointer = { x: -1, y: -1, seen: false }
  private prevUv = new THREE.Vector2()
  private uv = new THREE.Vector2(-1, -1)
  private delta = new THREE.Vector2()
  private frame: Frame = { w: 1, h: 1, time: 0, dt: 0.016, vel: 0, mouse: new THREE.Vector2(), reduced: false, coarse: false }
  private clear = new THREE.Color('#0a0a0b')
  private slowSum = 0
  private slowCount = 0
  private warmup = 2
  private nav: HTMLElement | null = null
  private navDark = false
  private cleanup: Array<() => void> = []

  constructor(private canvas: HTMLCanvasElement, private site: Site) {}

  async start() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    this.frame.reduced = reduced
    this.frame.coarse = coarse

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'high-performance' })
    } catch {
      document.documentElement.classList.add('no-webgl')
      return
    }
    this.renderer.autoClear = false
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setPixelRatio(this.dpr)

    const fonts = await loadFonts()
    if (this.dead) return

    // 8-bit sRGB storage, no multisampling: a fraction of the cost of a float MSAA buffer,
    // and the GPU still hands the shaders linear values
    this.target = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })
    this.target.texture.colorSpace = THREE.SRGBColorSpace
    this.flow = new Flow()
    this.post = new THREE.ShaderMaterial({
      vertexShader: postVertex,
      fragmentShader: postFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.target.texture },
        tFlow: { value: null },
        uStrength: { value: 0 },
        uTime: { value: 0 },
      },
    })
    const quad = new THREE.Mesh(fullscreenTriangle(), this.post)
    quad.frustumCulled = false
    this.postScene.add(quad)

    const q = (name: string) => document.querySelector<HTMLElement>(`[data-section="${name}"]`)!
    this.textures = this.site.projects.map((p, i) => cardTexture(p, i, fonts))
    this.corridor = new CorridorSection(q('about'), this.site.contactLine, fonts, [...this.site.about.map((c) => c.color), this.site.contactColor])
    this.sections = [
      new HeroSection(q('hero'), this.site.name, fonts),
      new WorkSection(q('work'), this.textures),
      new GallerySection(q('gallery'), this.textures, this.site.projects, fonts, this.site.wallText),
      this.corridor,
    ]

    if (!reduced) {
      this.lenis = new Lenis({ autoRaf: false, lerp: 0.1, anchors: true })
    }

    this.nav = document.querySelector<HTMLElement>('.nav')
    const onResize = () => this.resize()
    const onPointer = (e: PointerEvent) => {
      this.pointer.x = e.clientX
      this.pointer.y = e.clientY
    }
    const onEnd = (e: Event) => {
      e.preventDefault()
      const end = document.documentElement.scrollHeight - window.innerHeight
      if (this.lenis) this.lenis.scrollTo(end, { duration: 3.2 })
      else window.scrollTo(0, end)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointer, { passive: true })
    const ends = Array.from(document.querySelectorAll('[data-scroll-end]'))
    ends.forEach((el) => el.addEventListener('click', onEnd))
    this.cleanup.push(() => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointer)
      ends.forEach((el) => el.removeEventListener('click', onEnd))
    })

    this.resize()
    this.lastScroll = window.scrollY
    document.documentElement.classList.add('is-ready')
    this.raf = requestAnimationFrame(this.tick)
  }

  private setResolution() {
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(this.w, this.h, false)
    this.target.setSize(Math.floor(this.w * this.dpr), Math.floor(this.h * this.dpr))
  }

  /** If frames are running slow, render fewer pixels. Steps down only, never back up. */
  private watchFrameRate(ms: number) {
    if (ms > 100) return // tab was hidden or stalled; not a fair sample
    this.slowSum += ms
    if (++this.slowCount < 40) return
    const avg = this.slowSum / this.slowCount
    this.slowSum = this.slowCount = 0
    if (this.warmup > 0) {
      this.warmup--
      return
    }
    // never below 1: under that, text in the cards turns to mush
    if (avg > 21 && this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr * 0.85)
      this.setResolution()
      this.warmup = 1
    }
  }

  private resize() {
    this.w = window.innerWidth
    this.h = window.innerHeight
    this.setResolution()
    this.flow.resize(this.w, this.h)
    for (const s of this.sections) s.resize(this.w, this.h)
  }

  private tick = (now: number) => {
    if (this.dead) return
    this.raf = requestAnimationFrame(this.tick)
    const { renderer, frame, w, h, dpr } = this
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016)
    if (this.last) this.watchFrameRate(now - this.last)
    this.last = now

    this.lenis?.raf(now)
    const scroll = window.scrollY
    const raw = this.lenis ? this.lenis.velocity : scroll - this.lastScroll
    this.lastScroll = scroll
    this.vel = lerp(this.vel, raw, 0.2)

    frame.w = w
    frame.h = h
    frame.dt = dt
    frame.time = now / 1000
    frame.vel = this.vel

    // pointer -> uv + per-frame movement
    const fluid = !frame.reduced && !frame.coarse
    if (this.pointer.x >= 0) {
      this.uv.set(this.pointer.x / w, 1 - this.pointer.y / h)
      if (!this.pointer.seen) {
        this.prevUv.copy(this.uv)
        this.pointer.seen = true
      }
      this.delta.subVectors(this.uv, this.prevUv)
      this.prevUv.copy(this.uv)
      frame.mouse.set(this.uv.x * 2 - 1, this.uv.y * 2 - 1)
    }
    if (fluid) this.flow.update(renderer, this.uv, this.delta)

    // wipe the shared buffer
    const t = this.target
    t.scissorTest = false
    t.viewport.set(0, 0, t.width, t.height)
    renderer.setRenderTarget(t)
    renderer.setClearColor(this.clear, 1)
    renderer.clear()

    let navDark = false
    for (const s of this.sections) {
      const rect = s.panel.getBoundingClientRect()
      // the nav sits over this section: use dark text on the light one
      if (s.light && rect.top <= 30 && rect.bottom > 30) navDark = true
      const top = Math.max(0, rect.top)
      const bottom = Math.min(h, rect.bottom)
      if (bottom - top < 1) {
        s.idle?.()
        continue
      }
      let progress: number
      if (s.outer === s.panel) {
        progress = clamp(-rect.top / rect.height)
      } else {
        const outer = s.outer.getBoundingClientRect()
        const range = outer.height - rect.height
        progress = range > 1 ? clamp(-outer.top / range) : 0
      }
      s.update(frame, rect, progress)

      if (s.fullViewport) t.viewport.set(0, 0, t.width, t.height)
      else t.viewport.set(Math.floor(rect.left * dpr), Math.floor((h - rect.bottom) * dpr), Math.ceil(rect.width * dpr), Math.ceil(rect.height * dpr))
      t.scissor.set(0, Math.floor((h - bottom) * dpr), t.width, Math.ceil((bottom - top) * dpr))
      t.scissorTest = true
      renderer.setRenderTarget(t)
      renderer.setClearColor(s.bg, 1)
      renderer.clear()
      renderer.render(s.scene, s.camera)
    }

    if (navDark !== this.navDark) {
      this.navDark = navDark
      this.nav?.classList.toggle('is-dark', navDark)
    }

    // to screen, through the fluid
    const u = this.post.uniforms
    u.tFlow.value = this.flow.texture
    u.uTime.value = frame.time
    u.uStrength.value = fluid ? 0.1 * (1 - (this.corridor?.arrival ?? 0) * 0.6) : 0
    renderer.setRenderTarget(null)
    renderer.render(this.postScene, this.postCamera)
  }

  destroy() {
    this.dead = true
    document.documentElement.classList.remove('is-ready')
    cancelAnimationFrame(this.raf)
    this.cleanup.forEach((fn) => fn())
    this.lenis?.destroy()
    this.sections.forEach((s) => s.dispose())
    this.textures.forEach((t) => t.dispose())
    this.flow?.dispose()
    this.target?.dispose()
    this.post?.dispose()
    this.renderer?.dispose()
  }
}

async function loadFonts(): Promise<Fonts> {
  const css = getComputedStyle(document.documentElement)
  const display = css.getPropertyValue('--font-display').trim() || 'sans-serif'
  const mono = css.getPropertyValue('--font-mono').trim() || 'monospace'
  const wait = Promise.all([
    document.fonts.load(`800 64px ${display}`),
    document.fonts.load(`500 22px ${mono}`),
  ]).catch(() => undefined)
  // never let a slow font hold the page hostage
  await Promise.race([wait, new Promise((r) => setTimeout(r, 2500))])
  return { display, mono }
}
