import * as THREE from 'three';
import { ArenaTableThemeId, MoveId } from '../../types/game';
import { isMobileTouchDevice } from '../../utils/haptics';

const textureCache = new Map<string, THREE.CanvasTexture>();
const imageTextureCache = new Map<string, THREE.Texture>();
let sharedLoader: THREE.TextureLoader | null = null;

function isMobileTexProfile(): boolean {
  return isMobileTouchDevice();
}

/**
 * Loads and caches card artwork textures globally so switching tabs or starting
 * new matches does not re-decode PNG/JPG files or re-upload them to the GPU.
 */
export function getCachedImageTexture(url: string): THREE.Texture {
  const existing = imageTextureCache.get(url);
  if (existing) return existing;
  if (!sharedLoader) {
    sharedLoader = new THREE.TextureLoader();
  }
  const tex = sharedLoader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.userData.cached = true;
  imageTextureCache.set(url, tex);
  return tex;
}

/**
 * Generates a high-detail mahogany wood grain + carved ring texture for the saloon table.
 * Uses adaptive resolution (512px on mobile, 1024px on desktop) to cut mobile VRAM by 75%.
 */
export function getMahoganyWoodTexture(): THREE.CanvasTexture {
  const mobile = isMobileTexProfile();
  const key = `mahogany_wood_${mobile ? 'm' : 'd'}_v3`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  const size = mobile ? 512 : 1024;
  const scale = size / 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.55
  );
  grad.addColorStop(0, '#5a2312');
  grad.addColorStop(0.65, '#3b150a');
  grad.addColorStop(1, '#210b05');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const plankCount = 10;
  const plankW = size / plankCount;
  const grainLines = mobile ? 20 : 38;
  const stepY = mobile ? 24 : 16;

  for (let p = 0; p < plankCount; p++) {
    const x0 = p * plankW;
    ctx.fillStyle = p % 2 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,160,90,0.04)';
    ctx.fillRect(x0, 0, plankW, size);

    ctx.fillStyle = 'rgba(10, 4, 2, 0.65)';
    ctx.fillRect(x0, 0, Math.max(1.5, 3 * scale), size);

    for (let g = 0; g < grainLines; g++) {
      const gx = x0 + (g / grainLines) * plankW;
      ctx.beginPath();
      ctx.strokeStyle =
        g % 3 === 0
          ? 'rgba(20, 7, 3, 0.28)'
          : 'rgba(180, 85, 40, 0.12)';
      ctx.lineWidth = Math.max(1, (1 + (g % 2)) * scale);
      for (let y = 0; y <= size; y += stepY) {
        const wave = Math.sin(y * 0.015 + p * 1.7 + g * 0.3) * 6 * scale;
        if (y === 0) ctx.moveTo(gx + wave, y);
        else ctx.lineTo(gx + wave, y);
      }
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(12, 4, 2, 0.75)';
  ctx.lineWidth = Math.max(4, 10 * scale);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.cached = true;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Generates a grayscale bump/roughness map matching the wood & leather grain.
 */
export function getSaloonBumpTexture(): THREE.CanvasTexture {
  const mobile = isMobileTexProfile();
  const key = `saloon_bump_${mobile ? 'm' : 'd'}_v3`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  const size = mobile ? 256 : 512;
  const count = mobile ? 900 : 2400;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < count; i++) {
    const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * size;
    const y = (Math.cos(i * 78.233) * 0.5 + 0.5) * size;
    const len = (8 + (i % 24)) * (mobile ? 0.6 : 1);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * 0.2, y + len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.userData.cached = true;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Generates a Mecha-Chameleon hexagonal carbon/scale bump & roughness texture.
 */
export function getMechaHexScaleTexture(): THREE.CanvasTexture {
  const mobile = isMobileTexProfile();
  const key = `mecha_hex_scale_${mobile ? 'm' : 'd'}_v3`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  const size = mobile ? 256 : 512;
  const r = mobile ? 10 : 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, size, size);

  const dx = r * 1.732;
  const dy = r * 1.5;

  for (let row = -1; row < size / dy + 2; row++) {
    for (let col = -1; col < size / dx + 2; col++) {
      const cx = col * dx + (row % 2 === 0 ? 0 : dx / 2);
      const cy = row * dy;

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = cx + Math.cos(angle) * (r - 1.2);
        const py = cy + Math.sin(angle) * (r - 1.2);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = (row + col) % 3 === 0 ? '#d8d8d8' : '#ababab';
      ctx.fill();
      ctx.lineWidth = mobile ? 1.5 : 2;
      ctx.strokeStyle = '#141414';
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.userData.cached = true;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Generates an ornate Saloon Playing Card Back texture with gold filigree.
 */
export function getOrnateCardBackTexture(accentHex = '#F59E0B'): THREE.CanvasTexture {
  const mobile = isMobileTexProfile();
  const key = `card_back_${mobile ? 'm' : 'd'}_${accentHex}`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  const w = mobile ? 256 : 512;
  const h = mobile ? 512 : 1024;
  const s = w / 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e7dcc6';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#17110e';
  ctx.fillRect(24 * s, 24 * s, w - 48 * s, h - 48 * s);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 6 * s;
  ctx.strokeRect(38 * s, 38 * s, w - 76 * s, h - 76 * s);

  ctx.lineWidth = 2 * s;
  ctx.strokeRect(50 * s, 50 * s, w - 100 * s, h - 100 * s);

  ctx.save();
  ctx.beginPath();
  ctx.rect(54 * s, 54 * s, w - 108 * s, h - 108 * s);
  ctx.clip();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
  ctx.lineWidth = 2 * s;
  const step = 28 * s;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i + h, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  ctx.restore();

  const cx = w / 2;
  const cy = h / 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * 110 * s;
    const py = cy + Math.sin(a) * 110 * s;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#24150e';
  ctx.fill();
  ctx.lineWidth = 5 * s;
  ctx.strokeStyle = accentHex;
  ctx.stroke();

  ctx.fillStyle = accentHex;
  ctx.font = `900 ${Math.round(44 * s)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('J2', cx, cy);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.cached = true;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Generates a realistic Liar's Bar / Saloon Playing Card Front Frame Texture.
 */
export function getCardFrontFrameTexture(
  moveName: string,
  shortCode: string,
  accentHex: string
): THREE.CanvasTexture {
  const mobile = isMobileTexProfile();
  const key = `card_front_v4_${mobile ? 'm' : 'd'}_${moveName}_${accentHex}`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  const w = mobile ? 256 : 512;
  const h = mobile ? 512 : 1024;
  const s = w / 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#cbb793');
  grad.addColorStop(0.5, '#b89f74');
  grad.addColorStop(1, '#9b8158');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#2d190d';
  ctx.lineWidth = 6 * s;
  ctx.strokeRect(18 * s, 18 * s, w - 36 * s, h - 36 * s);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 3 * s;
  ctx.strokeRect(28 * s, 28 * s, w - 56 * s, h - 56 * s);

  ctx.fillStyle = '#1e1008';
  ctx.font = `900 ${Math.round(46 * s)}px serif`;
  ctx.textAlign = 'center';
  ctx.fillText(shortCode, 64 * s, 78 * s);

  ctx.font = `800 ${Math.round(18 * s)}px sans-serif`;
  ctx.fillStyle = '#3d2210';
  ctx.fillText(moveName.toUpperCase(), w / 2, 68 * s);

  ctx.save();
  ctx.translate(w - 64 * s, h - 78 * s);
  ctx.rotate(Math.PI);
  ctx.fillStyle = '#23120b';
  ctx.font = `900 ${Math.round(46 * s)}px serif`;
  ctx.fillText(shortCode, 0, 0);
  ctx.restore();

  ctx.fillStyle = '#23120b';
  ctx.font = `900 ${Math.round(26 * s)}px serif`;
  ctx.fillText(moveName.toUpperCase(), w / 2, h - 46 * s);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.cached = true;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Generates a themed 3D Arena Table Surface Texture with an engraved 6-point
 * Jokenpo Hexagon Tactical Matrix, concentric rune rings, and theme-matched finish.
 */
export function getThemedTableSurfaceTexture(
  themeId: ArenaTableThemeId = 'saloon_mogno'
): THREE.CanvasTexture {
  const mobile = isMobileTexProfile();
  const key = `themed_table_surface_${themeId}_${mobile ? 'm' : 'd'}_v3`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  const size = mobile ? 512 : 1024;
  const s = size / 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const palettes: Record<
    ArenaTableThemeId,
    { c0: string; c1: string; c2: string; line: string; glow: string }
  > = {
    saloon_mogno: {
      c0: '#5a2312',
      c1: '#381409',
      c2: '#1d0904',
      line: 'rgba(245, 158, 11, 0.45)',
      glow: 'rgba(16, 185, 129, 0.38)',
    },
    cyber_neon: {
      c0: '#0f2342',
      c1: '#09152b',
      c2: '#050b16',
      line: 'rgba(34, 211, 238, 0.55)',
      glow: 'rgba(56, 189, 248, 0.42)',
    },
    obsidiana_imperial: {
      c0: '#2a1230',
      c1: '#17091f',
      c2: '#0b0410',
      line: 'rgba(251, 113, 133, 0.52)',
      glow: 'rgba(192, 132, 252, 0.38)',
    },
    esmeralda_etm: {
      c0: '#0a4f3c',
      c1: '#063326',
      c2: '#031c15',
      line: 'rgba(251, 191, 36, 0.52)',
      glow: 'rgba(16, 185, 129, 0.42)',
    },
    saloon_rustico: {
      c0: '#5c3318',
      c1: '#3b1e0c',
      c2: '#1f0e05',
      line: 'rgba(217, 119, 6, 0.48)',
      glow: 'rgba(245, 158, 11, 0.36)',
    },
    cyber_neon_vip: {
      c0: '#161b48',
      c1: '#0c102e',
      c2: '#06081a',
      line: 'rgba(232, 121, 249, 0.56)',
      glow: 'rgba(34, 211, 238, 0.44)',
    },
    ouro_cassino: {
      c0: '#4a3508',
      c1: '#2e2004',
      c2: '#171002',
      line: 'rgba(251, 191, 36, 0.62)',
      glow: 'rgba(245, 158, 11, 0.44)',
    },
    templo_cosmico: {
      c0: '#1f1645',
      c1: '#120b2c',
      c2: '#080416',
      line: 'rgba(167, 139, 250, 0.56)',
      glow: 'rgba(56, 189, 248, 0.4)',
    },
  };
  const palette = palettes[themeId] ?? palettes.saloon_mogno;

  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.52);
  grad.addColorStop(0, palette.c0);
  grad.addColorStop(0.65, palette.c1);
  grad.addColorStop(1, palette.c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  if (themeId === 'cyber_neon') {
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.09)';
    ctx.lineWidth = Math.max(1, 1.5 * s);
    const step = 48 * s;
    for (let i = 0; i <= size; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
  } else if (themeId === 'obsidiana_imperial') {
    // Imperial Obsidian dark marble organic veins
    const veinCount = mobile ? 8 : 16;
    for (let v = 0; v < veinCount; v++) {
      ctx.strokeStyle =
        v % 2 === 0
          ? 'rgba(245, 158, 11, 0.28)'
          : 'rgba(251, 113, 133, 0.26)';
      ctx.lineWidth = Math.max(1, (1.2 + (v % 3) * 0.8) * s);
      ctx.beginPath();
      let vx = ((v * 73) % 100) * 0.01 * size;
      let vy = 0;
      ctx.moveTo(vx, vy);
      for (let st = 1; st <= 10; st++) {
        vy = (st / 10) * size;
        vx +=
          (Math.sin(st * 0.9 + v * 1.5) * 40 +
            Math.cos(st * 2.2) * 16) *
          s;
        ctx.lineTo(vx, vy);
      }
      ctx.stroke();
    }
  } else {
    const plankCount = 12;
    const plankW = size / plankCount;
    for (let p = 0; p < plankCount; p++) {
      const x0 = p * plankW;
      ctx.fillStyle = p % 2 === 0 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.02)';
      ctx.fillRect(x0, 0, plankW, size);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(x0, 0, Math.max(1, 2 * s), size);
    }
  }

  ctx.strokeStyle = palette.line;
  ctx.lineWidth = Math.max(2, 4 * s);
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = Math.max(1.5, 3 * s);
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
  ctx.stroke();

  const hexR = size * 0.23;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * hexR;
    const py = cy + Math.sin(a) * hexR;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = Math.max(2, 3.5 * s);
  ctx.stroke();

  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = Math.max(1, 2 * s);
  for (let i = 0; i < 6; i++) {
    const a1 = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 2) / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a1) * hexR, cy + Math.sin(a1) * hexR);
    ctx.lineTo(cx + Math.cos(a2) * hexR, cy + Math.sin(a2) * hexR);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.cached = true;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Generates an ultra-detailed Imperial Obsidian / Dark Marble texture with
 * organic gold and crimson veins, specular gloss variation, and micro-cracks.
 */
export function getDarkMarbleTexture(
  themeId: ArenaTableThemeId = 'obsidiana_imperial'
): THREE.CanvasTexture {
  const mobile = isMobileTexProfile();
  const key = `dark_marble_${themeId}_${mobile ? 'm' : 'd'}_v2`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  const size = mobile ? 512 : 1024;
  const s = size / 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Deep obsidian base with subtle radial sheen
  const baseGrad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.1,
    size / 2,
    size / 2,
    size * 0.55
  );
  baseGrad.addColorStop(0, '#160820');
  baseGrad.addColorStop(0.65, '#0b0412');
  baseGrad.addColorStop(1, '#050208');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // Large swirling magma/mineral clouds
  const cloudCount = mobile ? 4 : 7;
  for (let c = 0; c < cloudCount; c++) {
    const cx = (0.2 + ((c * 0.17) % 0.6)) * size;
    const cy = (0.15 + ((c * 0.23) % 0.7)) * size;
    const r = (0.25 + (c % 3) * 0.12) * size;
    const cloudGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    cloudGrad.addColorStop(
      0,
      c % 2 === 0 ? 'rgba(251, 113, 133, 0.18)' : 'rgba(245, 158, 11, 0.14)'
    );
    cloudGrad.addColorStop(
      0.5,
      c % 2 === 0 ? 'rgba(192, 132, 252, 0.08)' : 'rgba(180, 83, 9, 0.06)'
    );
    cloudGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Organic Breccia / Marble Veins (Bézier + sinusoidal noise)
  const veinCount = mobile ? 12 : 22;
  for (let v = 0; v < veinCount; v++) {
    const isGold = v % 3 === 0;
    const isCrimson = v % 3 === 1;
    const strokeCol = isGold
      ? 'rgba(245, 158, 11, 0.42)'
      : isCrimson
      ? 'rgba(251, 113, 133, 0.38)'
      : 'rgba(216, 180, 254, 0.25)';
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = Math.max(1, (1.2 + (v % 4) * 0.8) * s);
    ctx.lineCap = 'round';

    ctx.beginPath();
    let vx = ((v * 67) % 100) * 0.01 * size;
    let vy = 0;
    ctx.moveTo(vx, vy);

    const steps = mobile ? 8 : 14;
    for (let st = 1; st <= steps; st++) {
      vy = (st / steps) * size;
      const angle = st * 0.85 + v * 1.7;
      vx += (Math.sin(angle) * 38 + Math.cos(angle * 2.1) * 18) * s;
      ctx.lineTo(vx, vy);

      // Branching sub-veins
      if (st % 3 === 0) {
        ctx.save();
        ctx.strokeStyle = isGold
          ? 'rgba(245, 158, 11, 0.22)'
          : 'rgba(251, 113, 133, 0.18)';
        ctx.lineWidth = Math.max(0.8, 1.2 * s);
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        const subX = vx + Math.sin(st + v) * 55 * s;
        const subY = vy + (28 + Math.cos(st) * 20) * s;
        ctx.lineTo(subX, subY);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.cached = true;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Generates an ultra-soft radial Gaussian particle sprite for golden saloon dust motes & embers.
 * Eliminates harsh square WebGL point artifacts.
 */
export function getSoftParticleTexture(): THREE.CanvasTexture {
  const key = 'soft_particle_sprite_v2';
  if (textureCache.has(key)) return textureCache.get(key)!;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.18, 'rgba(255, 235, 175, 0.92)');
  grad.addColorStop(0.42, 'rgba(245, 158, 11, 0.55)');
  grad.addColorStop(0.72, 'rgba(217, 119, 6, 0.16)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.cached = true;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Generates dedicated procedural PBR Bump (Relief) and Metalness Maps for each
 * of the 6 Move Archetypes (Papel, Parafal, Pedra, Gelo Invertido, Tesoura, Jegue).
 * Provides AAA tactile physical micro-details and reflections on 3D cards.
 */
export function getRunesBumpAndMetalTexture(moveId: MoveId): {
  bumpMap: THREE.CanvasTexture;
  metalnessMap: THREE.CanvasTexture;
} {
  const mobile = isMobileTexProfile();
  const bumpKey = `runes_bump_${moveId}_${mobile ? 'm' : 'd'}_v2`;
  const metalKey = `runes_metal_${moveId}_${mobile ? 'm' : 'd'}_v2`;

  if (textureCache.has(bumpKey) && textureCache.has(metalKey)) {
    return {
      bumpMap: textureCache.get(bumpKey)!,
      metalnessMap: textureCache.get(metalKey)!,
    };
  }

  const w = mobile ? 256 : 512;
  const h = mobile ? 512 : 1024;
  const s = w / 512;

  // Bump Canvas (grayscale: 128 = neutral, >128 = raised relief, <128 = recessed grooves)
  const bCanvas = document.createElement('canvas');
  bCanvas.width = w;
  bCanvas.height = h;
  const bCtx = bCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, w, h);

  // Metalness Canvas (0 = non-metal/matte, 255 = pure mirror metal)
  const mCanvas = document.createElement('canvas');
  mCanvas.width = w;
  mCanvas.height = h;
  const mCtx = mCanvas.getContext('2d')!;
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  // Outer card frame bevel
  bCtx.strokeStyle = '#c0c0c0';
  bCtx.lineWidth = 14 * s;
  bCtx.strokeRect(18 * s, 18 * s, w - 36 * s, h - 36 * s);

  bCtx.strokeStyle = '#404040';
  bCtx.lineWidth = 4 * s;
  bCtx.strokeRect(26 * s, 26 * s, w - 52 * s, h - 52 * s);

  mCtx.strokeStyle = '#e0e0e0';
  mCtx.lineWidth = 14 * s;
  mCtx.strokeRect(18 * s, 18 * s, w - 36 * s, h - 36 * s);

  switch (moveId) {
    case 'papel': {
      // Papel: Arcane parchment glyphs + concentric mystic circles + gold seal
      // Fiber bump background
      for (let i = 0; i < (mobile ? 40 : 120); i++) {
        const fy = Math.random() * h;
        bCtx.strokeStyle = Math.random() > 0.5 ? '#989898' : '#686868';
        bCtx.lineWidth = 1;
        bCtx.beginPath();
        bCtx.moveTo(30 * s, fy);
        bCtx.lineTo(w - 30 * s, fy + (Math.random() - 0.5) * 8 * s);
        bCtx.stroke();
      }
      // Concentric mystic rings
      for (const r of [50 * s, 90 * s, 130 * s]) {
        bCtx.strokeStyle = '#e0e0e0';
        bCtx.lineWidth = 3 * s;
        bCtx.beginPath();
        bCtx.arc(cx, cy, r, 0, Math.PI * 2);
        bCtx.stroke();

        mCtx.strokeStyle = '#d0d0d0';
        mCtx.lineWidth = 3 * s;
        mCtx.beginPath();
        mCtx.arc(cx, cy, r, 0, Math.PI * 2);
        mCtx.stroke();
      }
      // 8 Arcane rays
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        bCtx.strokeStyle = '#ffffff';
        bCtx.lineWidth = 2.5 * s;
        bCtx.beginPath();
        bCtx.moveTo(cx + Math.cos(a) * 45 * s, cy + Math.sin(a) * 45 * s);
        bCtx.lineTo(cx + Math.cos(a) * 125 * s, cy + Math.sin(a) * 125 * s);
        bCtx.stroke();

        mCtx.strokeStyle = '#f0f0f0';
        mCtx.lineWidth = 2.5 * s;
        mCtx.beginPath();
        mCtx.moveTo(cx + Math.cos(a) * 45 * s, cy + Math.sin(a) * 45 * s);
        mCtx.lineTo(cx + Math.cos(a) * 125 * s, cy + Math.sin(a) * 125 * s);
        mCtx.stroke();
      }
      // Central mystic embossed gold seal
      bCtx.fillStyle = '#f8f8f8';
      bCtx.beginPath();
      bCtx.arc(cx, cy, 38 * s, 0, Math.PI * 2);
      bCtx.fill();
      mCtx.fillStyle = '#ffffff';
      mCtx.beginPath();
      mCtx.arc(cx, cy, 38 * s, 0, Math.PI * 2);
      mCtx.fill();
      break;
    }
    case 'parafal': {
      // Parafal: Tactical machined steel rifling + crossed rifle bullets + vents
      // Spiral rifling grooves
      bCtx.lineWidth = 3.5 * s;
      for (let r = 20 * s; r < 140 * s; r += 16 * s) {
        bCtx.strokeStyle = r % 32 === 0 ? '#404040' : '#d0d0d0';
        bCtx.beginPath();
        bCtx.arc(cx, cy, r, 0.2, Math.PI * 1.8);
        bCtx.stroke();
      }
      // Crossed tactical rifle bullets in relief
      for (const dir of [-1, 1]) {
        bCtx.save();
        mCtx.save();
        bCtx.translate(cx, cy);
        mCtx.translate(cx, cy);
        bCtx.rotate(dir * 0.68);
        mCtx.rotate(dir * 0.68);

        // Bullet body (high relief + high metalness)
        bCtx.fillStyle = '#f0f0f0';
        bCtx.fillRect(-12 * s, -90 * s, 24 * s, 140 * s);
        mCtx.fillStyle = '#ffffff';
        mCtx.fillRect(-12 * s, -90 * s, 24 * s, 140 * s);

        // Bullet tip
        bCtx.beginPath();
        bCtx.moveTo(-12 * s, -90 * s);
        bCtx.lineTo(0, -125 * s);
        bCtx.lineTo(12 * s, -90 * s);
        bCtx.closePath();
        bCtx.fill();

        mCtx.beginPath();
        mCtx.moveTo(-12 * s, -90 * s);
        mCtx.lineTo(0, -125 * s);
        mCtx.lineTo(12 * s, -90 * s);
        mCtx.closePath();
        mCtx.fill();

        bCtx.restore();
        mCtx.restore();
      }
      // Lateral machined cooling vents
      for (let v = -3; v <= 3; v++) {
        const vy = cy + v * 32 * s;
        bCtx.fillStyle = '#303030';
        bCtx.fillRect(40 * s, vy, 35 * s, 10 * s);
        bCtx.fillRect(w - 75 * s, vy, 35 * s, 10 * s);
        mCtx.fillStyle = '#101010';
        mCtx.fillRect(40 * s, vy, 35 * s, 10 * s);
        mCtx.fillRect(w - 75 * s, vy, 35 * s, 10 * s);
      }
      break;
    }
    case 'pedra': {
      // Pedra: Basalt geological fissures + embedded crystal facets
      // Deep tectonic fissures (recessed black grooves)
      bCtx.lineWidth = 4 * s;
      bCtx.strokeStyle = '#202020';
      for (let f = 0; f < 6; f++) {
        bCtx.beginPath();
        bCtx.moveTo(cx, cy);
        const fa = (f / 6) * Math.PI * 2 + 0.2;
        const x1 = cx + Math.cos(fa) * 70 * s;
        const y1 = cy + Math.sin(fa) * 70 * s;
        const x2 = cx + Math.cos(fa + 0.3) * 140 * s;
        const y2 = cy + Math.sin(fa + 0.3) * 140 * s;
        bCtx.lineTo(x1, y1);
        bCtx.lineTo(x2, y2);
        bCtx.stroke();
      }
      // Octahedral crystalline clusters (raised sharp facets + metallic shine)
      for (let k = 0; k < 5; k++) {
        const ka = (k / 5) * Math.PI * 2;
        const kx = cx + Math.cos(ka) * 65 * s;
        const ky = cy + Math.sin(ka) * 65 * s;
        bCtx.fillStyle = '#f5f5f5';
        mCtx.fillStyle = '#e8e8e8';
        bCtx.beginPath();
        bCtx.moveTo(kx, ky - 30 * s);
        bCtx.lineTo(kx + 22 * s, ky);
        bCtx.lineTo(kx, ky + 30 * s);
        bCtx.lineTo(kx - 22 * s, ky);
        bCtx.closePath();
        bCtx.fill();
        mCtx.fill();
      }
      break;
    }
    case 'gelo_invertido': {
      // Gelo Invertido: Razor cryogenic prisms + hexagonal frost facets
      bCtx.lineWidth = 3 * s;
      for (let hex = 35 * s; hex <= 125 * s; hex += 30 * s) {
        bCtx.strokeStyle = '#ffffff';
        mCtx.strokeStyle = '#c0c0c0';
        bCtx.beginPath();
        mCtx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = cx + Math.cos(a) * hex;
          const py = cy + Math.sin(a) * hex;
          if (i === 0) {
            bCtx.moveTo(px, py);
            mCtx.moveTo(px, py);
          } else {
            bCtx.lineTo(px, py);
            mCtx.lineTo(px, py);
          }
        }
        bCtx.closePath();
        mCtx.closePath();
        bCtx.stroke();
        mCtx.stroke();
      }
      // Ice needle spikes
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        bCtx.strokeStyle = '#f8f8f8';
        bCtx.lineWidth = 2.5 * s;
        bCtx.beginPath();
        bCtx.moveTo(cx, cy);
        bCtx.lineTo(cx + Math.cos(a) * 140 * s, cy + Math.sin(a) * 140 * s);
        bCtx.stroke();
      }
      break;
    }
    case 'tesoura': {
      // Tesoura: Twin crossed razor katanas with blood groove & mirror edge
      for (const dir of [-1, 1]) {
        bCtx.save();
        mCtx.save();
        bCtx.translate(cx, cy);
        mCtx.translate(cx, cy);
        bCtx.rotate(dir * 0.785); // 45 degrees
        mCtx.rotate(dir * 0.785);

        // Blade back (raised bevel)
        bCtx.fillStyle = '#c0c0c0';
        bCtx.fillRect(-8 * s, -145 * s, 16 * s, 260 * s);

        // Razor cutting edge (pure white highlight + 100% metal)
        bCtx.fillStyle = '#ffffff';
        bCtx.fillRect(4 * s, -145 * s, 6 * s, 260 * s);
        mCtx.fillStyle = '#ffffff';
        mCtx.fillRect(-8 * s, -145 * s, 18 * s, 260 * s);

        // Blood fuller groove (dark recessed line)
        bCtx.fillStyle = '#202020';
        bCtx.fillRect(-2 * s, -120 * s, 4 * s, 210 * s);

        bCtx.restore();
        mCtx.restore();
      }
      // Central brass pivot rivet
      bCtx.fillStyle = '#ffffff';
      bCtx.beginPath();
      bCtx.arc(cx, cy, 18 * s, 0, Math.PI * 2);
      bCtx.fill();
      mCtx.fillStyle = '#ffffff';
      mCtx.beginPath();
      mCtx.arc(cx, cy, 18 * s, 0, Math.PI * 2);
      mCtx.fill();
      break;
    }
    case 'jegue': {
      // Jegue: Heavy rustic iron horseshoe + 7 square nail holes + crowned donkey
      // Horseshoe outer curve
      bCtx.strokeStyle = '#e8e8e8';
      bCtx.lineWidth = 26 * s;
      bCtx.beginPath();
      bCtx.arc(cx, cy, 75 * s, 0.45, Math.PI - 0.45, true);
      bCtx.stroke();

      mCtx.strokeStyle = '#d8d8d8';
      mCtx.lineWidth = 26 * s;
      mCtx.beginPath();
      mCtx.arc(cx, cy, 75 * s, 0.45, Math.PI - 0.45, true);
      mCtx.stroke();

      // 7 square nail holes (recessed dark squares)
      for (let k = 0; k < 7; k++) {
        const a = Math.PI * 0.22 + (k / 6) * Math.PI * 0.56;
        const hx = cx + Math.cos(a) * 75 * s;
        const hy = cy - Math.sin(a) * 75 * s;
        bCtx.fillStyle = '#202020';
        bCtx.fillRect(hx - 4 * s, hy - 4 * s, 8 * s, 8 * s);
        mCtx.fillStyle = '#101010';
        mCtx.fillRect(hx - 4 * s, hy - 4 * s, 8 * s, 8 * s);
      }
      // Central donkey emblem relief
      bCtx.fillStyle = '#ffffff';
      bCtx.beginPath();
      bCtx.arc(cx, cy + 15 * s, 32 * s, 0, Math.PI * 2);
      bCtx.fill();
      mCtx.fillStyle = '#f0f0f0';
      mCtx.beginPath();
      mCtx.arc(cx, cy + 15 * s, 32 * s, 0, Math.PI * 2);
      mCtx.fill();
      break;
    }
  }

  const bumpTex = new THREE.CanvasTexture(bCanvas);
  bumpTex.colorSpace = THREE.NoColorSpace;
  bumpTex.wrapS = THREE.ClampToEdgeWrapping;
  bumpTex.wrapT = THREE.ClampToEdgeWrapping;
  bumpTex.userData.cached = true;
  bumpTex.needsUpdate = true;
  textureCache.set(bumpKey, bumpTex);

  const metalTex = new THREE.CanvasTexture(mCanvas);
  metalTex.colorSpace = THREE.NoColorSpace;
  metalTex.wrapS = THREE.ClampToEdgeWrapping;
  metalTex.wrapT = THREE.ClampToEdgeWrapping;
  metalTex.userData.cached = true;
  metalTex.needsUpdate = true;
  textureCache.set(metalKey, metalTex);

  return { bumpMap: bumpTex, metalnessMap: metalTex };
}

/**
 * Generates an ultra-detailed directional Animal Fur bump & micro-roughness texture
 * (Liar's Bar style) with thousands of microscopic overlapping hair strands.
 */
export function getAnimalFurBumpTexture(): THREE.CanvasTexture {
  const mobile = isMobileTexProfile();
  const key = `animal_fur_bump_${mobile ? 'm' : 'd'}_v2`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  const size = mobile ? 256 : 512;
  const count = mobile ? 2500 : 7500;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Neutral mid-gray base
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  // Micro-fur strands angled downward with slight turbulence
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = (4 + (i % 12)) * (mobile ? 0.65 : 1.0);
    const angle = Math.PI * 0.5 + (Math.sin(i * 17.1) * 0.22); // Angled down

    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.userData.cached = true;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}
