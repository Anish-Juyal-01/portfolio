import * as THREE from 'three'

/**
 * Cursor-driven flow field. A small ping-pong buffer stores a velocity vector per texel;
 * each frame it fades, drifts along itself and gets stamped with the pointer's motion.
 * The final pass reads it to push the rendered frame around like liquid.
 */

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform vec2 uMouse;
  uniform vec2 uVelocity;
  uniform float uAspect;
  uniform float uFalloff;
  uniform float uDissipation;
  varying vec2 vUv;

  void main() {
    // drift the field along itself so trails curl instead of just fading in place
    vec2 prev = texture2D(tMap, vUv).rg;
    vec2 adv = vUv - prev * vec2(1.0 / uAspect, 1.0) * 0.006;
    vec3 color = texture2D(tMap, adv).rgb * uDissipation;

    vec2 cursor = vUv - uMouse;
    cursor.x *= uAspect;
    float speed = min(1.0, length(uVelocity));
    vec3 stamp = vec3(uVelocity, 1.0 - pow(1.0 - speed, 3.0));
    float falloff = smoothstep(uFalloff, 0.0, length(cursor)) * speed;
    color = mix(color, stamp, vec3(falloff));

    gl_FragColor = vec4(color, 1.0);
  }
`

export function fullscreenTriangle() {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2))
  return g
}

export class Flow {
  private read: THREE.WebGLRenderTarget
  private write: THREE.WebGLRenderTarget
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private velocity = new THREE.Vector2()
  private target = new THREE.Vector2()

  constructor() {
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    this.read = new THREE.WebGLRenderTarget(256, 256, opts)
    this.write = new THREE.WebGLRenderTarget(256, 256, opts)
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tMap: { value: null },
        uMouse: { value: new THREE.Vector2(-1, -1) },
        uVelocity: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uFalloff: { value: 0.22 },
        uDissipation: { value: 0.965 },
      },
    })
    this.mesh = new THREE.Mesh(fullscreenTriangle(), this.material)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
  }

  get texture() {
    return this.read.texture
  }

  resize(w: number, h: number) {
    const aspect = w / h
    const rw = aspect >= 1 ? 256 : Math.round(256 * aspect)
    const rh = aspect >= 1 ? Math.round(256 / aspect) : 256
    this.read.setSize(rw, rh)
    this.write.setSize(rw, rh)
    this.material.uniforms.uAspect.value = aspect
  }

  /** @param uv pointer position (0..1, y up)  @param delta pointer movement this frame in uv units */
  update(renderer: THREE.WebGLRenderer, uv: THREE.Vector2, delta: THREE.Vector2) {
    this.target.set(delta.x * 14, delta.y * 14)
    if (this.target.length() > 1) this.target.normalize()
    this.velocity.lerp(this.target, this.target.lengthSq() > 0 ? 0.5 : 0.12)

    const u = this.material.uniforms
    u.tMap.value = this.read.texture
    u.uMouse.value.copy(uv)
    u.uVelocity.value.copy(this.velocity)

    renderer.setRenderTarget(this.write)
    renderer.render(this.scene, this.camera)
    const t = this.read
    this.read = this.write
    this.write = t
  }

  dispose() {
    this.read.dispose()
    this.write.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
  }
}
