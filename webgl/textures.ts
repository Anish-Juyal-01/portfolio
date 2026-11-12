import * as THREE from 'three'
import type { Project } from '@/content/site'
import { mulberry32, type Fonts } from './types'

type Ctx2D = CanvasRenderingContext2D

/** Card textures holding a screenshot use this size (16:10). */
const IMG_W = 1680
const IMG_H = 1050

function setFont(ctx: Ctx2D, weight: number, px: number, family: string, stretch?: string) {
  ctx.font = `${weight} ${px}px ${family}`
  // variable-width axis; ignored where unsupported
  ;(ctx as unknown as { fontStretch: string }).fontStretch = stretch ?? 'normal'
}

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx2D] {
  const c = document.createElement('canvas')
  c.width = Math.max(2, Math.round(w))
  c.height = Math.max(2, Math.round(h))
  return [c, c.getContext('2d')!]
}

function finish(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 16
  t.needsUpdate = true
  return t
}

/**
 * Project card. Starts as generated artwork (gradient, one motif, big title) so there is
 * something to show at once, then swaps to the project's screenshot when it has loaded.
 */
export function cardTexture(p: Project, index: number, fonts: Fonts) {
  const W = 1280
  const H = 800
  const [c, ctx] = canvas(W, H)
  const [a, b, shape, ink] = p.palette
  const rnd = mulberry32(index * 97 + 13)

  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, a)
  g.addColorStop(1, b)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  if (p.motif === 'orb') {
    const x = W * (0.55 + rnd() * 0.25)
    const y = H * (0.3 + rnd() * 0.2)
    const r = H * 0.42
    const rg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.05, x, y, r)
    rg.addColorStop(0, shape)
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  } else if (p.motif === 'stripes') {
    ctx.translate(W * 0.7, H * 0.3)
    ctx.rotate(-0.5)
    ctx.fillStyle = shape
    ctx.globalAlpha = 0.85
    for (let i = -6; i < 7; i++) ctx.fillRect(i * 90, -H, 38, H * 2)
  } else if (p.motif === 'dots') {
    ctx.fillStyle = shape
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++) {
        const r = 4 + ((x + y) % 5) * 5
        ctx.beginPath()
        ctx.arc(W * 0.48 + x * 66, 70 + y * 62, r, 0, Math.PI * 2)
        ctx.fill()
      }
  } else {
    ctx.strokeStyle = shape
    ctx.lineWidth = 14
    for (let i = 1; i < 7; i++) {
      ctx.globalAlpha = 1 - i * 0.12
      ctx.beginPath()
      ctx.arc(W * 0.72, H * 0.38, i * 70, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()

  // title, fitted to the card width
  const title = p.title.toUpperCase()
  ctx.fillStyle = ink
  ctx.textBaseline = 'alphabetic'
  setFont(ctx, 800, 100, fonts.display, 'extra-expanded')
  const size = Math.min(260, (W * 0.86) / (ctx.measureText(title).width / 100))
  setFont(ctx, 800, size, fonts.display, 'extra-expanded')
  ctx.fillText(title, 56, H - 60)

  setFont(ctx, 500, 22, fonts.mono)
  ctx.fillText(`${String(index + 1).padStart(2, '0')} — ${p.kind.toUpperCase()}`, 58, 78)
  ctx.textAlign = 'right'
  ctx.fillText(p.year, W - 58, 78)

  const texture = finish(c)
  if (p.image) {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      // cover-fit, anchored to the top where a page's headline is
      // redraw at the screenshot's own resolution so its text stays crisp
      texture.dispose()
      c.width = IMG_W
      c.height = IMG_H
      const scale = Math.max(IMG_W / img.naturalWidth, IMG_H / img.naturalHeight)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, (IMG_W - w) / 2, 0, w, h)
      texture.needsUpdate = true
    }
    img.src = p.image
  }
  return texture
}

/** White-on-black mask of the name, laid out bottom-left, sized to the viewport. */
export function heroTexture(name: string, w: number, h: number, fonts: Fonts) {
  const scale = Math.min(2, window.devicePixelRatio || 1)
  const W = w * scale
  const H = h * scale
  const [c, ctx] = canvas(W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const lines = name.toUpperCase().trim().split(/\s+/)
  const padX = Math.max(16, W * 0.026)
  setFont(ctx, 800, 100, fonts.display, 'extra-expanded')
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width / 100))
  const lineH = 0.8
  const size = Math.min((W - padX * 2) / widest, (H * 0.62) / (lines.length * lineH))
  setFont(ctx, 800, size, fonts.display, 'extra-expanded')
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'
  const bottom = H - Math.max(padX, H * 0.06)
  lines.forEach((l, i) => {
    // pull back the font's left side bearing so the glyph edge sits on the margin
    ctx.fillText(l, padX - size * 0.04, bottom - (lines.length - 1 - i) * size * lineH)
  })

  const t = finish(c, false)
  t.generateMipmaps = false
  t.minFilter = THREE.LinearFilter
  return t
}

/** Centred white lines on a transparent canvas (the contact line at the end of the corridor). */
export function linesTexture(lines: string[], fonts: Fonts) {
  const W = 2048
  const H = 1024
  const [c, ctx] = canvas(W, H)
  setFont(ctx, 800, 100, fonts.display, 'extra-expanded')
  const up = lines.map((l) => l.toUpperCase())
  const widest = Math.max(...up.map((l) => ctx.measureText(l).width / 100))
  const lineH = 0.9
  const size = Math.min((W * 0.94) / widest, (H * 0.9) / (up.length * lineH))
  setFont(ctx, 800, size, fonts.display, 'extra-expanded')
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const top = H / 2 - ((up.length - 1) * size * lineH) / 2
  up.forEach((l, i) => ctx.fillText(l, W / 2, top + i * size * lineH))
  return finish(c)
}

/** A long strip of repeated text for the gallery's back wall. */
export function stripTexture(text: string, fonts: Fonts) {
  const W = 4096
  const H = 256
  const [c, ctx] = canvas(W, H)
  setFont(ctx, 800, 190, fonts.display, 'extra-expanded')
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  const unit = `${text.toUpperCase()}  ✦  `
  const uw = ctx.measureText(unit).width
  // stretch slightly so a whole number of repeats tiles seamlessly
  const n = Math.max(1, Math.round(W / uw))
  ctx.scale(W / (uw * n), 1)
  for (let i = 0; i < n; i++) ctx.fillText(unit, i * uw, H / 2 + 8)
  const t = finish(c)
  t.wrapS = THREE.RepeatWrapping
  return t
}

/**
 * A square tile of code in white on transparent, one source line per row, for the tunnel walls.
 * Returns the row count so the shader can tell lines apart.
 */
export function codeTexture(lines: string[], fonts: Fonts) {
  const SIZE = 2048
  const rows = lines.length
  const rowH = SIZE / rows
  const [c, ctx] = canvas(SIZE, SIZE)
  const px = Math.floor(rowH * 0.6)
  setFont(ctx, 500, px, fonts.mono)
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  lines.forEach((line, i) => {
    // long lines are squeezed a little rather than cut off
    ctx.fillText(line, 24, (i + 0.5) * rowH, SIZE - 48)
  })
  const t = finish(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return { texture: t, rows }
}

/** One line of white lettering on a transparent strip (the signs over the corridor gates). */
export function labelTexture(text: string, fonts: Fonts) {
  const W = 1536
  const H = 192
  const [c, ctx] = canvas(W, H)
  setFont(ctx, 800, 100, fonts.display, 'extra-expanded')
  const up = text.toUpperCase()
  const size = Math.min(150, (W * 0.94) / (ctx.measureText(up).width / 100))
  setFont(ctx, 800, size, fonts.display, 'extra-expanded')
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(up, W / 2, H / 2 + size * 0.04)
  return finish(c)
}

/** Soft radial glow. */
export function glowTexture() {
  const [c, ctx] = canvas(256, 256)
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return finish(c)
}
