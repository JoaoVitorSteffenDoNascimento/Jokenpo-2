import * as THREE from 'three';
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
  const h = mobile ? 360 : 720;
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
  const h = mobile ? 360 : 720;
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
