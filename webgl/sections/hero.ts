import * as THREE from 'three'
import { fullscreenTriangle } from '../flow'
import { heroTexture } from '../textures'
import { disposeScene, type Fonts, type Frame, type SectionView } from '../types'

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tText;
  uniform float uTime;
  uniform float uProgress;
  uniform float uAspect;
  uniform vec2 uMouse;
  uniform vec3 uInk;
  uniform vec3 uPaper;
  uniform vec3 uHot;
  uniform vec3 uCool;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

    // two slow glows behind the type, so the fluid has something to push around
    float n1 = fbm(p * 1.3 + vec2(uTime * 0.05, -uTime * 0.03));
    float n2 = fbm(p * 1.1 - vec2(uTime * 0.04, uTime * 0.05) + 9.0);
    vec3 col = uInk;
    col += uHot * smoothstep(0.35, 0.85, n1) * 0.55 * smoothstep(1.3, 0.0, length(p - vec2(0.55 * uAspect * 0.8, -0.35) - uMouse * 0.05));
    col += uCool * smoothstep(0.4, 0.9, n2) * 0.45 * smoothstep(1.2, 0.0, length(p - vec2(-0.5 * uAspect * 0.8, 0.4) + uMouse * 0.05));

    // the name stretches upward as you scroll away
    vec2 tuv = vUv;
    tuv.y /= 1.0 + uProgress * 0.9;
    tuv += uMouse * vec2(0.004, 0.003);
    float m = texture2D(tText, tuv).r;
    col = mix(col, uPaper, m);

    gl_FragColor = vec4(col, 1.0);
  }
`

export class HeroSection implements SectionView {
  panel: HTMLElement
  outer: HTMLElement
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  bg = new THREE.Color('#0a0a0b')
  fullViewport = false
  private material: THREE.ShaderMaterial
  private mouse = new THREE.Vector2()

  constructor(el: HTMLElement, private name: string, private fonts: Fonts) {
    this.panel = this.outer = el
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tText: { value: null },
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uAspect: { value: 1 },
        uMouse: { value: new THREE.Vector2() },
        uInk: { value: new THREE.Color('#0a0a0b') },
        uPaper: { value: new THREE.Color('#ecebe6') },
        uHot: { value: new THREE.Color('#ff4a1c') },
        uCool: { value: new THREE.Color('#2b4bff') },
      },
    })
    const mesh = new THREE.Mesh(fullscreenTriangle(), this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }

  resize() {
    const r = this.panel.getBoundingClientRect()
    const u = this.material.uniforms
    ;(u.tText.value as THREE.Texture | null)?.dispose()
    u.tText.value = heroTexture(this.name, r.width, r.height, this.fonts)
    u.uAspect.value = r.width / r.height
  }

  update(f: Frame, _rect: DOMRect, progress: number) {
    const u = this.material.uniforms
    this.mouse.lerp(f.mouse, 0.06)
    u.uTime.value = f.time
    u.uProgress.value = f.reduced ? 0 : progress
    u.uMouse.value.copy(this.mouse)
  }

  dispose() {
    ;(this.material.uniforms.tText.value as THREE.Texture | null)?.dispose()
    disposeScene(this.scene)
  }
}
