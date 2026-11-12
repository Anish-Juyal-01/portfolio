import * as THREE from 'three'
import type { Project } from '@/content/site'
import { glowTexture, stripTexture } from '../textures'
import { clamp, damp, disposeScene, lerp, type Fonts, type Frame, type SectionView } from '../types'

/**
 * Sideways gallery. The section is pinned; scroll progress slides the camera along a row of
 * cards hanging in a dark room. Columns, a floor grid and wall lettering at different depths
 * give the parallax that makes it read as a 3D space.
 */

const SPACING = 4.6
const CARD_W = 3.4
const CARD_H = CARD_W / 1.6
const CARD_Y = 1.55
const WALL_Z = -5

const roomVertex = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

// One shader for floor and wall: near-black surfaces lit only by a soft pool per card.
const roomFragment = /* glsl */ `
  precision highp float;
  uniform float uSpan;
  uniform float uSpacing;
  uniform float uFloor;
  uniform float uCamX;
  uniform vec3 uBg;
  varying vec3 vW;

  void main() {
    float lit = smoothstep(-uSpacing, -uSpacing * 0.4, vW.x) * (1.0 - smoothstep(uSpan + uSpacing * 0.4, uSpan + uSpacing, vW.x));
    float lx = mod(vW.x + uSpacing * 0.5, uSpacing) - uSpacing * 0.5;
    vec3 warm = vec3(1.0, 0.95, 0.88);
    vec3 col;
    if (uFloor > 0.5) {
      float dz = vW.z - 0.4;
      float pool = exp(-(lx * lx) / 2.4 - (dz * dz) / 5.0) * lit;
      float seam = smoothstep(0.47, 0.5, abs(fract(vW.z * 0.7) - 0.5));
      col = uBg * 1.5 + warm * pool * 0.03 + seam * 0.004;
    } else {
      float dy = vW.y - 1.8;
      float pool = exp(-(lx * lx) / 3.2 - (dy * dy) / 6.0) * lit;
      col = uBg * 1.8 + warm * pool * 0.02;
      col *= 1.0 - smoothstep(4.0, 9.0, vW.y) * 0.85;
    }
    // the room falls into darkness to either side of where you are standing
    col = mix(col, uBg, smoothstep(8.0, 20.0, abs(vW.x - uCamX)));
    gl_FragColor = vec4(col, 1.0);
  }
`

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform float uHover;
  uniform float uFocus;
  uniform float uReflect;
  varying vec2 vUv;

  void main() {
    vec2 uv = (vUv - 0.5) * (1.0 - uHover * 0.06) + 0.5;
    vec3 col = texture2D(tMap, uv).rgb * mix(0.35, 1.0, uFocus);
    float a = 1.0;
    if (uReflect > 0.5) {
      a = pow(1.0 - vUv.y, 2.2) * 0.3;
    }
    gl_FragColor = vec4(col, a);
  }
`

interface Card {
  group: THREE.Group
  face: THREE.Mesh
  uniforms: { uHover: { value: number }; uFocus: { value: number } }
  x: number
  hover: number
}

export class GallerySection implements SectionView {
  panel: HTMLElement
  outer: HTMLElement
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120)
  bg = new THREE.Color('#08080a')
  fullViewport = false

  private cards: Card[] = []
  private faces: THREE.Mesh[] = []
  private raycaster = new THREE.Raycaster()
  private hovered = -1
  private shown = -1
  private camX = 0
  private camUniform = { value: 0 }
  private dist = 6.5
  private sway = new THREE.Vector2()
  private fog: THREE.Fog
  private dom: { index: HTMLElement | null; title: HTMLElement | null; meta: HTMLElement | null; bar: HTMLElement | null; link: HTMLAnchorElement | null }
  /** clicking a hovered card opens its project */
  private onClick = (e: MouseEvent) => {
    if (this.hovered < 0 || (e.target as HTMLElement).closest('a')) return
    window.location.assign(`/work/${this.projects[this.hovered].slug}`)
  }

  constructor(el: HTMLElement, textures: THREE.Texture[], private projects: Project[], fonts: Fonts, wallText: string) {
    this.outer = el
    this.panel = el.querySelector<HTMLElement>('[data-panel]')!
    this.dom = {
      index: el.querySelector('[data-g-index]'),
      title: el.querySelector('[data-g-title]'),
      meta: el.querySelector('[data-g-meta]'),
      bar: el.querySelector('[data-g-bar]'),
      link: el.querySelector('[data-g-link]'),
    }
    this.panel.addEventListener('click', this.onClick)

    this.fog = new THREE.Fog(this.bg, 8, 30)
    this.scene.fog = this.fog
    const span = (projects.length - 1) * SPACING

    // cards + their floor reflections
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H)
    const boardMat = new THREE.MeshBasicMaterial({ color: 0x030304, fog: false })
    const wireGeo = new THREE.BoxGeometry(0.008, 8, 0.008)
    projects.forEach((_, i) => {
      const uniforms = { tMap: { value: textures[i] }, uHover: { value: 0 }, uFocus: { value: 1 } }
      const face = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: { ...uniforms, uReflect: { value: 0 } } }),
      )
      face.position.y = CARD_Y
      face.userData.index = i
      const mirror = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          vertexShader: vertex,
          fragmentShader: fragment,
          uniforms: { ...uniforms, uReflect: { value: 1 } },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      )
      mirror.position.y = -CARD_Y
      mirror.scale.y = -1
      const group = new THREE.Group()
      group.position.x = i * SPACING
      // a dark backing board gives the card thickness, and two wires hang it from the ceiling
      const board = new THREE.Mesh(new THREE.BoxGeometry(CARD_W + 0.07, CARD_H + 0.07, 0.07), boardMat)
      board.position.set(0, CARD_Y, -0.045)
      group.add(face, mirror, board)
      for (const sx of [-1, 1]) {
        const wire = new THREE.Mesh(wireGeo, boardMat)
        wire.position.set(sx * CARD_W * 0.38, CARD_Y + CARD_H / 2 + 4, -0.04)
        group.add(wire)
      }
      this.scene.add(group)
      this.cards.push({ group, face, uniforms, x: i * SPACING, hover: 0 })
      this.faces.push(face)
    })

    // floor: dark and glossy, with a pool of light under each card. It never writes depth,
    // so the mirrored cards below it still show through as reflections.
    const roomUniforms = (floor: number) => ({
      uSpan: { value: span },
      uSpacing: { value: SPACING },
      uFloor: { value: floor },
      uBg: { value: this.bg },
      uCamX: this.camUniform,
    })
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(span + 140, 24),
      new THREE.ShaderMaterial({ vertexShader: roomVertex, fragmentShader: roomFragment, uniforms: roomUniforms(1), depthWrite: false }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(span / 2, 0, WALL_Z + 12)
    floor.renderOrder = -2
    this.scene.add(floor)

    // back wall, washed by the same lights
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(span + 140, 14),
      new THREE.ShaderMaterial({ vertexShader: roomVertex, fragmentShader: roomFragment, uniforms: roomUniforms(0) }),
    )
    wall.position.set(span / 2, 7, WALL_Z)
    wall.renderOrder = -1
    this.scene.add(wall)

    // pilasters on the wall between the cards, and thin cables close to the camera:
    // two more depth layers that slide past at different speeds
    const m = new THREE.Matrix4()
    const bays = projects.length + 9
    const pilasters = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 14, 0.4), new THREE.MeshBasicMaterial({ color: 0x0c0c0f, fog: false }), bays)
    const cables = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 14, 0.012), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }), bays)
    for (let i = 0; i < bays; i++) {
      const x = (i - 4.5) * SPACING
      m.makeTranslation(x, 7, WALL_Z + 0.2)
      pilasters.setMatrixAt(i, m)
      m.makeTranslation(x, 7, 3.1)
      cables.setMatrixAt(i, m)
    }
    pilasters.frustumCulled = cables.frustumCulled = false
    this.scene.add(pilasters, cables)

    // a strip light above each card, with a soft halo
    const lightGeo = new THREE.BoxGeometry(CARD_W * 0.7, 0.018, 0.018)
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xf2f0ea, fog: false })
    const haloGeo = new THREE.PlaneGeometry(CARD_W * 1.5, 1.3)
    const haloMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: 0xfff1dc,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    projects.forEach((_, i) => {
      const y = CARD_Y + CARD_H / 2 + 0.55
      const l = new THREE.Mesh(lightGeo, lightMat)
      l.position.set(i * SPACING, y, 0.3)
      const halo = new THREE.Mesh(haloGeo, haloMat)
      halo.position.set(i * SPACING, y, 0.28)
      this.scene.add(l, halo)
    })

    // huge lettering on the back wall, drifting slower than the cards
    const strip = stripTexture(wallText, fonts)
    const wallW = span + 80
    strip.repeat.x = wallW / 64
    const lettering = new THREE.Mesh(
      new THREE.PlaneGeometry(wallW, 4),
      new THREE.MeshBasicMaterial({ map: strip, color: 0x1d1d22, transparent: true, depthWrite: false, fog: false }),
    )
    lettering.position.set(span / 2, 3.3, WALL_Z + 0.05)
    this.scene.add(lettering)
  }

  resize() {
    const r = this.panel.getBoundingClientRect()
    const aspect = r.width / Math.max(1, r.height)
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
    // pull back on narrow screens so a whole card always fits
    const t = Math.tan((this.camera.fov * Math.PI) / 360)
    this.dist = Math.max(6.5, (CARD_W * 1.18) / (2 * t * aspect))
    this.fog.near = this.dist + 1.5
    this.fog.far = this.dist + 24
  }

  update(f: Frame, rect: DOMRect, progress: number) {
    const span = (this.projects.length - 1) * SPACING
    const target = lerp(-SPACING * 0.45, span + SPACING * 0.25, progress)
    this.camX = f.reduced ? target : damp(this.camX, target, 8, f.dt)
    this.sway.lerp(f.coarse || f.reduced ? new THREE.Vector2() : f.mouse, 0.05)

    this.camera.position.set(this.camX + this.sway.x * 0.5, 1.5 + this.sway.y * 0.2, this.dist)
    this.camera.lookAt(this.camX + this.sway.x * 0.15, 1.4, 0)
    if (!f.reduced) this.camera.rotateZ(clamp(f.vel / 90, -1, 1) * -0.035)
    this.camera.updateMatrixWorld()
    this.camUniform.value = this.camX

    // hover: only while the panel is pinned and a mouse is in play
    let hit = -1
    const pinned = Math.abs(rect.top) < 2
    if (pinned && !f.coarse) {
      this.raycaster.setFromCamera(f.mouse, this.camera)
      const hits = this.raycaster.intersectObjects(this.faces, false)
      if (hits.length) hit = hits[0].object.userData.index as number
    }
    if (hit !== this.hovered) {
      this.hovered = hit
      document.body.style.cursor = hit >= 0 ? 'pointer' : ''
    }

    let nearest = 0
    let best = Infinity
    this.cards.forEach((c, i) => {
      const dx = c.x - this.camX
      const ad = Math.abs(dx)
      if (ad < best) {
        best = ad
        nearest = i
      }
      c.hover = damp(c.hover, i === hit ? 1 : 0, 9, f.dt)
      c.group.position.z = c.hover * 0.7
      c.group.rotation.y = clamp(-dx * 0.07, -0.55, 0.55) * (1 - c.hover * 0.6)
      c.uniforms.uHover.value = c.hover
      c.uniforms.uFocus.value = clamp(1.25 - ad / (SPACING * 1.6))
    })

    const show = hit >= 0 ? hit : nearest
    if (show !== this.shown) {
      this.shown = show
      const p = this.projects[show]
      if (this.dom.index) this.dom.index.textContent = String(show + 1).padStart(2, '0')
      if (this.dom.title) this.dom.title.textContent = p.title
      if (this.dom.meta) this.dom.meta.textContent = `${p.kind} · ${p.year}`
      if (this.dom.link) this.dom.link.href = `/work/${p.slug}`
    }
    if (this.dom.bar) this.dom.bar.style.transform = `scaleX(${progress.toFixed(4)})`
  }

  idle() {
    if (this.hovered >= 0) {
      this.hovered = -1
      document.body.style.cursor = ''
    }
  }

  dispose() {
    this.panel.removeEventListener('click', this.onClick)
    document.body.style.cursor = ''
    disposeScene(this.scene)
  }
}
