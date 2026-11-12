import * as THREE from 'three'
import { codeLines } from '../codeLines'
import { codeTexture, glowTexture, labelTexture, linesTexture } from '../textures'
import { clamp, damp, disposeScene, mulberry32, smoothstep, type Fonts, type Frame, type SectionView } from '../types'

/**
 * About flythrough: "inside the machine". The camera flies down a tunnel whose four walls are
 * streaming source code, through streaks of light that stretch into warp lines the faster you
 * scroll. The light shifts from cold blue to hot red, a gate marks each chapter of text, and the
 * contact line hangs at the far end.
 */

const LENGTH = 230
const END_Z = -(LENGTH - 16)
const TEXT_GAP = 9
/** Scroll progress at which the first text block starts, and how much of the flight the blocks share. */
const BLOCKS_FROM = 0.04
const BLOCKS_SPAN = 0.74
/** Camera depth at a given scroll progress. */
const depthAt = (p: number) => 6 + (END_Z - 6) * p

// tunnel cross-section
const HALF_W = 5
const FLOOR_Y = -2.4
const CEIL_Y = 8.6
/** World size of one square tile of code. */
const TILE = 10
const FOG_DENSITY = 0.032

const COOL = { fog: new THREE.Color('#030a1c'), ink: new THREE.Color('#8ec5ff'), glow: new THREE.Color('#cfe6ff') }
const HOT = { fog: new THREE.Color('#1c0302'), ink: new THREE.Color('#ff7a2a'), glow: new THREE.Color('#ff7a2a') }

// The tunnel changes colour chapter by chapter. uPal holds one colour per chapter plus one for the
// contact stretch; uStops holds the depth at which each takes over. Shared by walls and streaks.
const paletteGLSL = /* glsl */ `
  uniform vec3 uPal[STOPS];
  uniform float uStops[STOPS];
  vec3 tintAt(float z) {
    vec3 c = uPal[0];
    for (int i = 1; i < STOPS; i++) {
      c = mix(c, uPal[i], 1.0 - smoothstep(uStops[i] - 4.0, uStops[i] + 18.0, z));
    }
    return c;
  }
`

const wallVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const wallFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tCode;
  uniform vec2 uRepeat;
  uniform vec2 uFlow;
  uniform float uRows;
  uniform float uTime;
  uniform float uLength;
  uniform float uDensity;
  uniform vec3 uFog;
  uniform vec3 uCool;
  uniform vec3 uHot;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vDepth;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  ${paletteGLSL}

  void main() {
    vec2 uv = vUv * uRepeat + uFlow * uTime;
    float ink = texture2D(tCode, uv).a;

    // each source line has its own brightness; a few are lit up, and pulses run down the tunnel
    float line = floor(uv.y * uRows);
    float seed = hash(vec2(line, floor(uv.x)));
    float level = 0.3 + 0.7 * step(0.7, seed);
    float pulse = smoothstep(0.9, 1.0, sin(vWorld.z * 0.11 + uTime * 2.2 + seed * 6.283) * 0.5 + 0.5);

    vec3 tint = tintAt(vWorld.z);
    // a soft wash of light around the tunnel where each chapter begins
    float band = 0.0;
    for (int i = 0; i < STOPS - 1; i++) {
      float d = (vWorld.z - uStops[i]) / 2.6;
      band += exp(-d * d);
    }
    vec3 col = tint * (ink * (level + pulse * 1.3 + band * 1.6) + 0.01 + band * 0.05);

    float fog = 1.0 - exp(-uDensity * uDensity * vDepth * vDepth);
    gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
  }
`

// Streaks: thin boxes that drift toward the camera and stretch along the tunnel with scroll speed.
const streakVertex = /* glsl */ `
  attribute vec3 aOffset;   // x, y, starting depth
  attribute vec2 aMotion;   // speed, base length
  uniform float uTime;
  uniform float uCamZ;
  uniform float uRange;
  uniform float uStretch;
  varying float vDepth;
  varying float vZ;
  void main() {
    float zAbs = aOffset.z + uTime * aMotion.x;
    // keep every streak inside a window that travels with the camera
    float z = uCamZ + 14.0 - mod(uCamZ + 14.0 - zAbs, uRange);
    float len = aMotion.y * (1.0 + uStretch);
    vec3 p = vec3(position.xy * 0.03, position.z * len) + vec3(aOffset.xy, z);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    vZ = z;
    gl_Position = projectionMatrix * mv;
  }
`

const streakFragment = /* glsl */ `
  precision highp float;
  uniform float uLength;
  uniform float uDensity;
  uniform vec3 uCool;
  uniform vec3 uHot;
  varying float vDepth;
  varying float vZ;
  ${paletteGLSL}
  void main() {
    float fade = exp(-uDensity * uDensity * vDepth * vDepth) * smoothstep(0.3, 2.5, vDepth);
    gl_FragColor = vec4(mix(tintAt(vZ), vec3(1.0), 0.55) * fade, 1.0);
  }
`

export class CorridorSection implements SectionView {
  panel: HTMLElement
  outer: HTMLElement
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400)
  bg = new THREE.Color('#030a1c')
  fullViewport = false

  private fog = new THREE.FogExp2('#030a1c', FOG_DENSITY)
  private glow: THREE.Mesh
  private rails = new THREE.MeshBasicMaterial({ color: 0x6f7c99 })
  private text: THREE.Mesh
  private shared = { uTime: { value: 0 } }
  private streaks = { uCamZ: { value: 0 }, uStretch: { value: 0 } }
  private maps: THREE.Texture[] = []
  private p = 0
  private warp = 0
  private aspect = 1
  private look = new THREE.Vector2()
  private blocks: { el: HTMLElement; body: HTMLElement; full: string; shown: number; key: string }[]
  private contact: HTMLElement | null
  private live = false
  private palette: THREE.Color[] = []
  private stops: number[] = []
  private tint = new THREE.Color()
  private gates: { z: number; sign: THREE.MeshBasicMaterial; frame: THREE.MeshBasicMaterial; base: THREE.Color }[] = []

  /** @param colors one per text block, plus a final one for the contact stretch */
  constructor(el: HTMLElement, lines: string[], fonts: Fonts, colors: string[]) {
    this.outer = el
    this.panel = el.querySelector<HTMLElement>('[data-panel]')!
    this.contact = el.querySelector<HTMLElement>('[data-contact]')
    this.blocks = Array.from(el.querySelectorAll<HTMLElement>('[data-about-block]')).map((b) => {
      const body = b.querySelector<HTMLElement>('[data-type]')!
      return { el: b, body, full: body.dataset.type ?? '', shown: -1, key: '' }
    })

    this.scene.fog = this.fog

    // colour stops: each chapter's colour takes over at its gate, the last one after the final chapter
    const n = this.blocks.length
    const gateZ = this.blocks.map((_, i) => depthAt(BLOCKS_FROM + (i * BLOCKS_SPAN) / n) - 5)
    this.palette = [...Array(n + 1)].map((_, i) => new THREE.Color(colors[i] ?? colors[colors.length - 1] ?? '#8ec5ff'))
    this.stops = [...gateZ, depthAt(BLOCKS_FROM + BLOCKS_SPAN) - 5]
    const paletteUniforms = { uPal: { value: this.palette }, uStops: { value: this.stops } }
    const defines = { STOPS: n + 1 }
    const long = LENGTH + 120
    const midZ = 20 - long / 2

    // ----- four walls of streaming code -----
    const code = codeTexture(codeLines, fonts)
    this.maps.push(code.texture)
    const wall = (w: number, h: number, repeat: [number, number], flow: [number, number]) =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.ShaderMaterial({
          vertexShader: wallVertex,
          fragmentShader: wallFragment,
          defines,
          uniforms: {
            ...paletteUniforms,
            tCode: { value: code.texture },
            uRepeat: { value: new THREE.Vector2(repeat[0], repeat[1]) },
            uFlow: { value: new THREE.Vector2(flow[0], flow[1]) },
            uRows: { value: code.rows },
            uTime: this.shared.uTime,
            uLength: { value: LENGTH },
            uDensity: { value: FOG_DENSITY },
            uFog: { value: this.fog.color },
            uCool: { value: COOL.ink },
            uHot: { value: HOT.ink },
          },
        }),
      )
    const height = CEIL_Y - FLOOR_Y
    // side walls: text runs along the tunnel and reads left to right from inside
    const left = wall(long, height, [long / TILE, height / TILE], [0.012, 0])
    left.rotation.y = Math.PI / 2
    left.position.set(-HALF_W, FLOOR_Y + height / 2, midZ)
    const right = wall(long, height, [long / TILE, height / TILE], [-0.012, 0])
    right.rotation.y = -Math.PI / 2
    right.position.set(HALF_W, FLOOR_Y + height / 2, midZ)
    // floor and ceiling: lines of code stream toward you
    const floor = wall(HALF_W * 2, long, [(HALF_W * 2) / TILE, long / TILE], [0, 0.02])
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, FLOOR_Y, midZ)
    const ceiling = wall(HALF_W * 2, long, [(HALF_W * 2) / TILE, long / TILE], [0, -0.02])
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.set(0, CEIL_Y, midZ)
    this.scene.add(left, right, floor, ceiling)

    // rails along the floor keep the vanishing point readable
    const railGeo = new THREE.BoxGeometry(0.05, 0.05, long)
    for (const x of [-2.6, -1.3, 1.3, 2.6]) {
      const rail = new THREE.Mesh(railGeo, this.rails)
      rail.position.set(x, FLOOR_Y + 0.04, midZ)
      this.scene.add(rail)
    }

    // ----- streaks of light: data in flight, and warp lines when you scroll fast -----
    const COUNT = 420
    const RANGE = 150
    const rnd = mulberry32(11)
    const offsets = new Float32Array(COUNT * 3)
    const motion = new Float32Array(COUNT * 2)
    for (let i = 0; i < COUNT; i++) {
      offsets[i * 3] = (rnd() * 2 - 1) * (HALF_W - 0.3)
      offsets[i * 3 + 1] = FLOOR_Y + 0.3 + rnd() * (height - 0.6)
      offsets[i * 3 + 2] = -rnd() * RANGE
      motion[i * 2] = 3 + rnd() * rnd() * 34
      motion[i * 2 + 1] = 0.25 + rnd() * 1.1
    }
    const box = new THREE.BoxGeometry(1, 1, 1)
    const streakGeo = new THREE.InstancedBufferGeometry()
    streakGeo.index = box.index
    streakGeo.setAttribute('position', box.getAttribute('position'))
    streakGeo.instanceCount = COUNT
    streakGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3))
    streakGeo.setAttribute('aMotion', new THREE.InstancedBufferAttribute(motion, 2))
    const streaks = new THREE.Mesh(
      streakGeo,
      new THREE.ShaderMaterial({
        vertexShader: streakVertex,
        fragmentShader: streakFragment,
        defines,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...paletteUniforms,
          uTime: this.shared.uTime,
          uCamZ: this.streaks.uCamZ,
          uStretch: this.streaks.uStretch,
          uRange: { value: RANGE },
          uLength: { value: LENGTH },
          uDensity: { value: FOG_DENSITY * 0.7 },
          uCool: { value: new THREE.Color('#dff0ff') },
          uHot: { value: new THREE.Color('#ffb070') },
        },
      }),
    )
    streaks.frustumCulled = false
    this.scene.add(streaks)

    // light at the end of the tunnel
    const glowMap = glowTexture()
    this.maps.push(glowMap)
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ map: glowMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    )
    this.glow.position.set(0, 3, -(LENGTH + 60))
    this.scene.add(this.glow)

    // ----- chapter gates: a thin frame hugging the tunnel walls where each chapter begins, in that
    // chapter's colour, with its title hanging inside. The walls also glow in a soft band at that
    // depth (done in the wall shader). -----
    const T = 0.07
    const inner = { x: HALF_W - 0.35, bottom: FLOOR_Y + 0.3, top: CEIL_Y - 0.45 }
    const sideGeo = new THREE.BoxGeometry(T, inner.top - inner.bottom, T)
    const spanGeo = new THREE.BoxGeometry(inner.x * 2 + T, T, T)
    this.blocks.forEach((b, i) => {
      const base = this.palette[i].clone().lerp(new THREE.Color('#ffffff'), 0.25)
      const frame = new THREE.MeshBasicMaterial({ color: base.clone() })
      const gate = new THREE.Group()
      const midY = (inner.top + inner.bottom) / 2
      for (const x of [-inner.x, inner.x]) {
        const side = new THREE.Mesh(sideGeo, frame)
        side.position.set(x, midY, 0)
        gate.add(side)
      }
      for (const y of [inner.bottom, inner.top]) {
        const bar = new THREE.Mesh(spanGeo, frame)
        bar.position.set(0, y, 0)
        gate.add(bar)
      }

      const title = (b.el.querySelector('.about-title')?.textContent ?? '').replace(/^>\s*/, '')
      const label = labelTexture(`0${i + 1} — ${title}`, fonts)
      this.maps.push(label)
      const sign = new THREE.MeshBasicMaterial({
        map: label,
        color: this.palette[i].clone().lerp(new THREE.Color('#ffffff'), 0.55),
        transparent: true,
        depthWrite: false,
        opacity: 0.6,
      })
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.6), sign)
      plate.position.set(0, inner.top - 0.75, 0)
      gate.add(plate)

      gate.position.z = gateZ[i]
      this.scene.add(gate)
      this.gates.push({ z: gateZ[i], sign, frame, base })
    })

    // the contact line
    const contactMap = linesTexture(lines, fonts)
    this.maps.push(contactMap)
    this.text = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1),
      new THREE.MeshBasicMaterial({ map: contactMap, transparent: true, depthWrite: false, fog: false, opacity: 0 }),
    )
    this.text.position.set(0, 2.1, END_Z - TEXT_GAP)
    this.scene.add(this.text)
  }

  resize() {
    const r = this.panel.getBoundingClientRect()
    this.aspect = r.width / Math.max(1, r.height)
    this.camera.aspect = this.aspect
    this.camera.updateProjectionMatrix()
    const visible = 2 * TEXT_GAP * Math.tan((62 * Math.PI) / 360) * this.aspect
    const w = Math.min(visible * 0.86, 8.2)
    this.text.scale.set(w / 2, w / 2, 1)
  }

  update(f: Frame, _rect: DOMRect, progress: number) {
    this.p = f.reduced ? progress : damp(this.p, progress, 6, f.dt)
    const p = this.p

    // flight path: weave and roll through the middle, settle dead centre at the end
    const settle = f.reduced ? 0 : 1 - smoothstep(0.72, 0.96, p)
    this.look.lerp(f.coarse || f.reduced ? new THREE.Vector2() : f.mouse, 0.05)
    this.camera.position.set(Math.sin(p * 7) * 1.5 * settle, 1.6 + Math.sin(p * 5 + 1) * 1.1 * settle, depthAt(p))
    this.camera.rotation.set(
      0.06 * settle + this.look.y * 0.06,
      -Math.cos(p * 7) * 0.1 * settle - this.look.x * 0.09,
      Math.sin(p * Math.PI * 2.5) * 0.3 * settle + (f.reduced ? 0 : clamp(f.vel / 90, -1, 1) * 0.04),
    )

    // warp: scroll speed stretches the streaks and widens the lens
    const speed = f.reduced ? 0 : clamp(Math.abs(f.vel) / 70)
    this.warp = damp(this.warp, speed, 5, f.dt)
    this.streaks.uStretch.value = this.warp * 15
    this.streaks.uCamZ.value = this.camera.position.z
    this.camera.fov = 62 + this.warp * 16
    this.camera.updateProjectionMatrix()
    this.shared.uTime.value = f.reduced ? 0 : f.time % 3600

    // the colour of wherever the camera is now (the same blend the shaders use)
    const z = this.camera.position.z
    this.tint.copy(this.palette[0])
    for (let i = 1; i < this.palette.length; i++) {
      this.tint.lerp(this.palette[i], 1 - smoothstep(this.stops[i] - 4, this.stops[i] + 18, z))
    }
    this.fog.color.copy(this.tint).multiplyScalar(0.07)
    this.bg.copy(this.fog.color)
    this.rails.color.copy(this.tint).multiplyScalar(0.55)
    ;(this.glow.material as THREE.MeshBasicMaterial).color.copy(this.tint)
    ;(this.text.material as THREE.MeshBasicMaterial).opacity = smoothstep(0.8, 0.95, p)

    // each gate and its title brighten as the camera comes up to it
    for (const g of this.gates) {
      const d = (this.camera.position.z - g.z) / 12
      const near = Math.exp(-d * d)
      g.sign.opacity = 0.45 + near * 0.55
      g.frame.color.copy(g.base).multiplyScalar(0.75 + near * 0.9)
    }

    this.overlay(f, p)
  }

  /** Terminal text types itself out block by block, then makes way for the contact links. */
  private overlay(f: Frame, p: number) {
    const n = this.blocks.length
    const span = BLOCKS_SPAN / n
    this.blocks.forEach((b, i) => {
      const start = BLOCKS_FROM + i * span
      const local = (p - start) / span
      // the body types itself once the two halves have slid into place
      const chars = f.reduced ? b.full.length : Math.round(clamp((local - 0.14) / 0.42) * b.full.length)
      if (chars !== b.shown) {
        b.shown = chars
        b.body.dataset.shown = b.full.slice(0, chars)
      }
      const enter = smoothstep(0, 0.16, local)
      const exit = smoothstep(0.86, 1, local)
      const shown = enter * (1 - exit)
      // 1 = both halves off screen, 0 = in place; they leave the way they came
      const slide = f.reduced ? 0 : 1 - enter + exit
      const list = f.reduced ? 1 : smoothstep(0.5, 0.62, local)
      const key = `${shown.toFixed(3)}|${slide.toFixed(3)}|${list.toFixed(2)}`
      if (key !== b.key) {
        b.key = key
        b.el.style.opacity = shown.toFixed(3)
        b.el.style.setProperty('--s', slide.toFixed(4))
        b.el.style.setProperty('--l', list.toFixed(2))
      }
    })

    if (this.contact) {
      const o = smoothstep(0.9, 0.98, p)
      this.contact.style.opacity = o.toFixed(3)
      const live = o > 0.5
      if (live !== this.live) {
        this.live = live
        this.contact.classList.toggle('is-live', live)
      }
    }
  }

  /** 0..1 — how close the camera is to the contact line (used to ease the fluid off there). */
  get arrival() {
    return smoothstep(0.75, 1, this.p)
  }

  dispose() {
    this.maps.forEach((m) => m.dispose())
    disposeScene(this.scene)
  }
}
