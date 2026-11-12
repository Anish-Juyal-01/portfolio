import * as THREE from 'three'
import { clamp, damp, disposeScene, type Frame, type SectionView } from '../types'

/**
 * Selected work. Each card is a subdivided plane pinned to an empty DOM frame.
 * The whole page behaves like a sheet wrapped round a drum: vertices fall away from the
 * camera towards the top and bottom of the screen, and scroll speed tightens the curve.
 */

const vertex = /* glsl */ `
  uniform float uBend;
  uniform float uVel;
  uniform vec2 uViewport;
  varying vec2 vUv;
  varying float vEdge;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float ny = wp.y / (uViewport.y * 0.5);
    float nx = wp.x / (uViewport.x * 0.5);
    wp.z -= ny * ny * uBend * uViewport.y * 0.5;
    wp.z += nx * ny * uVel * uViewport.y * 0.12;   // a little twist in the scroll direction
    vEdge = ny;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform float uBend;
  varying vec2 vUv;
  varying float vEdge;

  void main() {
    vec3 col = texture2D(tMap, vUv).rgb;
    col *= 1.0 - vEdge * vEdge * uBend * 0.7;
    gl_FragColor = vec4(col, 1.0);
  }
`

interface Card {
  el: HTMLElement
  /** the card's DOM wrapper, slid sideways so the caption travels with the artwork */
  article: HTMLElement
  mesh: THREE.Mesh
  top: number
  left: number
  w: number
  h: number
}

export class WorkSection implements SectionView {
  panel: HTMLElement
  outer: HTMLElement
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(50, 1, 10, 10000)
  bg = new THREE.Color('#ecebe6')
  fullViewport = true
  light = true
  private cards: Card[] = []
  private items: HTMLElement[]
  private active = -1
  private bend = 0
  private twist = 0
  private shared = {
    uBend: { value: 0 },
    uVel: { value: 0 },
    uViewport: { value: new THREE.Vector2(1, 1) },
  }

  constructor(el: HTMLElement, textures: THREE.Texture[]) {
    this.panel = this.outer = el
    this.items = Array.from(el.querySelectorAll<HTMLElement>('[data-work-item]'))
    const geo = new THREE.PlaneGeometry(1, 1, 24, 24)
    el.querySelectorAll<HTMLElement>('[data-work-card]').forEach((frame, i) => {
      const material = new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { ...this.shared, tMap: { value: textures[i % textures.length] } },
      })
      const mesh = new THREE.Mesh(geo, material)
      mesh.frustumCulled = false
      this.scene.add(mesh)
      this.cards.push({ el: frame, article: (frame.closest('.work-card') as HTMLElement) ?? frame, mesh, top: 0, left: 0, w: 1, h: 1 })
    })
  }

  resize(w: number, h: number) {
    // camera distance chosen so one world unit is one CSS pixel at z = 0
    const dist = h
    this.camera.position.set(0, 0, dist)
    this.camera.fov = (2 * Math.atan(h / 2 / dist) * 180) / Math.PI
    this.camera.aspect = w / h
    this.camera.far = dist * 4
    this.camera.updateProjectionMatrix()
    this.shared.uViewport.value.set(w, h)

    // measure the untransformed layout
    for (const c of this.cards) c.article.style.transform = ''
    const base = this.panel.getBoundingClientRect()
    for (const c of this.cards) {
      const r = c.el.getBoundingClientRect()
      c.top = r.top - base.top
      c.left = r.left - base.left
      c.w = r.width
      c.h = r.height
      c.mesh.scale.set(c.w, c.h, 1)
    }
  }

  update(f: Frame, rect: DOMRect) {
    const speed = f.reduced ? 0 : clamp(Math.abs(f.vel) / 90)
    this.bend = damp(this.bend, 0.07 + speed * 0.42, 6, f.dt)
    this.twist = damp(this.twist, f.reduced ? 0 : clamp(f.vel / 90, -1, 1), 6, f.dt)
    this.shared.uBend.value = f.reduced ? 0 : this.bend
    this.shared.uVel.value = this.twist

    const slope = f.reduced ? 0 : ((f.w < 760 ? 0.2 : 0.42) * f.w) / f.h
    let nearest = -1
    let best = Infinity
    this.cards.forEach((c, i) => {
      const cy = rect.top + c.top + c.h / 2
      // diagonal travel: a card enters bottom-right, crosses the centre, leaves top-left
      const dx = (cy - f.h / 2) * slope
      c.mesh.position.set(rect.left + c.left + c.w / 2 - f.w / 2 + dx, f.h / 2 - cy, 0)
      c.mesh.visible = cy > -f.h && cy < f.h * 2
      if (c.mesh.visible) c.article.style.transform = `translate3d(${dx.toFixed(1)}px,0,0)`
      const d = Math.abs(cy - f.h / 2)
      if (d < best) {
        best = d
        nearest = i
      }
    })

    if (nearest !== this.active) {
      this.active = nearest
      this.items.forEach((el, i) => el.classList.toggle('is-active', i === nearest))
    }
  }

  dispose() {
    disposeScene(this.scene)
  }
}
