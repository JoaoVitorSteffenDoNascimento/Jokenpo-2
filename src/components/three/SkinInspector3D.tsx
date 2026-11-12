import React from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Grid, Rotate3d } from 'lucide-react';
import { MOVES } from '../../constants/gameData';
import { SkinDefinition } from '../../types/game';
import { isMobileTouchDevice } from '../../utils/haptics';
import {
  getCachedImageTexture,
  getCardFrontFrameTexture,
  getMahoganyWoodTexture,
  getOrnateCardBackTexture,
  getSaloonBumpTexture,
} from './ProceduralPBR';
import {
  buildInstancedTableRivets,
  buildMoveTotem3D,
  countTriangles3D,
  detectSoftwareGl,
  disposeObject3D,
  optimizeHierarchyForCulling,
} from './TotemBuilder3D';

interface SkinInspector3DProps {
  skin: SkinDefinition;
}

export const SkinInspector3D: React.FC<SkinInspector3DProps> = ({ skin }) => {
  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = React.useState<'both' | 'totem' | 'card'>('both');
  const [wireframe, setWireframe] = React.useState(false);
  const [polyCount, setPolyCount] = React.useState(0);

  const move = MOVES[skin.moveId];
  const mat3d = skin.material3d ?? {
    metalness: 0.55,
    roughness: 0.35,
    cardTintHex: skin.accentColor,
    finishLabel: 'Acabamento 3D',
  };

  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = Math.max(container.clientWidth, 300);
    const height = Math.max(container.clientHeight, 280);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    camera.position.set(0, 0.42, 4.95);
    camera.lookAt(0, 0.05, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const isSoftwareGl = detectSoftwareGl(renderer);
    const isMobile = isMobileTouchDevice();
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.75)
    );
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.94;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.55;

    // Balanced Studio & Saloon Rim Lighting (No Bloom Glare)
    const ambient = new THREE.HemisphereLight(0xfff1e0, 0x0f172a, 0.65);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfff4d6, 1.55);
    keyLight.position.set(3.5, 5.5, 4.5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      new THREE.Color(skin.accentColor || '#F59E0B'),
      1.15
    );
    rimLight.position.set(-2.6, 2.0, -2.5);
    scene.add(rimLight);

    // High-Poly Turned Mahogany & Brass Pedestal Base
    const pedestalGroup = new THREE.Group();
    pedestalGroup.position.set(0, -1.48, 0);
    scene.add(pedestalGroup);

    const woodTex = getMahoganyWoodTexture();
    const bumpTex = getSaloonBumpTexture();

    const baseWood = new THREE.Mesh(
      new THREE.CylinderGeometry(2.15, 2.38, 0.28, 64),
      new THREE.MeshStandardMaterial({
        map: woodTex,
        bumpMap: bumpTex,
        bumpScale: 0.02,
        roughness: 0.48,
        metalness: 0.15,
      })
    );
    pedestalGroup.add(baseWood);
    pedestalGroup.add(buildInstancedTableRivets(1.88, 28, 0.14));

    const neonRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.98, 0.036, 20, 64),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(skin.accentColor),
        emissive: new THREE.Color(skin.accentColor),
        emissiveIntensity: 0.55,
        roughness: 0.18,
      })
    );
    neonRing.rotation.x = Math.PI / 2;
    neonRing.position.y = 0.15;
    pedestalGroup.add(neonRing);

    // Root stage that user can rotate
    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    // 1. High-Poly Beveled 3D PBR Trading Card Mesh
    const cardGroup = new THREE.Group();
    const frameColor = new THREE.Color(mat3d.cardTintHex || skin.accentColor);
    const frameMat = new THREE.MeshPhysicalMaterial({
      color: frameColor,
      metalness: mat3d.metalness,
      roughness: mat3d.roughness,
      clearcoat: mat3d.clearcoat ?? 0.75,
      clearcoatRoughness: 0.12,
      iridescence: skin.cost > 0 ? 0.45 : 0.1,
      emissive: new THREE.Color(mat3d.emissiveHex || '#000000'),
      emissiveIntensity: (mat3d.emissiveIntensity ?? 0.2) * 0.45,
    });

    const cardBody = new THREE.Mesh(
      new RoundedBoxGeometry(1.66, 2.34, 0.095, 8, 0.035),
      frameMat
    );
    cardGroup.add(cardBody);

    // Vintage Saloon Card Front Frame + Artwork
    const frontFrameTex = getCardFrontFrameTexture(
      skin.cost > 0 ? skin.name : move.name,
      move.name.slice(0, 1).toUpperCase(),
      skin.accentColor
    );
    const frontPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.52, 2.18, 12, 16),
      new THREE.MeshPhysicalMaterial({
        map: frontFrameTex,
        roughness: 0.55,
        metalness: 0.12,
        clearcoat: 0.35,
      })
    );
    frontPlate.position.set(0, 0, 0.05);
    cardGroup.add(frontPlate);

    const imgUrl = skin.customImage ?? move.image;
    const artTexture = getCachedImageTexture(imgUrl);
    artTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

    const artPlaneMat = new THREE.MeshPhysicalMaterial({
      map: artTexture,
      roughness: Math.max(0.18, mat3d.roughness * 0.6),
      metalness: Math.min(0.45, mat3d.metalness * 0.4),
      clearcoat: mat3d.clearcoat ?? 0.65,
    });
    const artPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.24, 1.38, 12, 12),
      artPlaneMat
    );
    artPlane.position.set(0, 0.06, 0.054);
    cardGroup.add(artPlane);

    // Ornate Saloon Card Back
    const cardBackTex = getOrnateCardBackTexture(skin.accentColor);
    const backPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.52, 2.18, 12, 16),
      new THREE.MeshPhysicalMaterial({
        map: cardBackTex,
        metalness: 0.4,
        roughness: 0.32,
        clearcoat: 0.6,
      })
    );
    backPlate.rotation.y = Math.PI;
    backPlate.position.set(0, 0, -0.05);
    cardGroup.add(backPlate);

    // 2. High-Poly Composite 3D Totem of the Move
    const totemGroup = buildMoveTotem3D(skin.moveId, skin);

    if (viewMode === 'both') {
      cardGroup.position.set(-1.08, 0.05, 0);
      cardGroup.rotation.y = 0.24;
      totemGroup.position.set(1.04, 0.06, 0.15);
      totemGroup.scale.setScalar(0.92);
      stageGroup.add(cardGroup);
      stageGroup.add(totemGroup);
    } else if (viewMode === 'totem') {
      totemGroup.position.set(0, 0.08, 0);
      totemGroup.scale.setScalar(1.22);
      stageGroup.add(totemGroup);
    } else {
      cardGroup.position.set(0, 0.06, 0);
      cardGroup.scale.setScalar(1.12);
      stageGroup.add(cardGroup);
    }

    // Apply frustum culling bounds, wireframe toggle & count total triangles (including InstancedMesh)
    optimizeHierarchyForCulling(scene);
    scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh && m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => {
          if ('wireframe' in mat) {
            (mat as THREE.MeshStandardMaterial).wireframe = wireframe;
          }
        });
      }
    });
    setPolyCount(countTriangles3D(scene));

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Pointer drag & zoom interaction
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let userYaw = 0;
    let userPitch = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;
      userYaw += dx * 0.012;
      userPitch = Math.max(-0.55, Math.min(0.55, userPitch + dy * 0.008));
    };
    const onPointerUp = () => {
      isDragging = false;
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 260);
      const h = Math.max(container.clientHeight, 240);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Paced render loop with mobile battery/lifecycle pause
    let cancelled = false;
    let isPageHidden = document.hidden;
    let isInViewport = true;
    let rafId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const startTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const pause = () => {
        timeoutId = setTimeout(cb, 80);
      };
      if (typeof gl.fenceSync !== 'function') {
        pause();
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      if (!sync) {
        pause();
        return;
      }
      const poll = () => {
        if (cancelled) {
          gl.deleteSync(sync);
          return;
        }
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) {
          timeoutId = setTimeout(poll, 16);
        } else {
          gl.deleteSync(sync);
          pause();
        }
      };
      timeoutId = setTimeout(poll, 16);
    };

    const tick = () => {
      if (cancelled || isPageHidden || !isInViewport) return;
      const elapsed = (performance.now() - startTime) * 0.001;

      if (!isDragging) {
        userYaw += isSoftwareGl ? 0.035 : 0.008;
      }

      stageGroup.rotation.y = userYaw;
      stageGroup.rotation.x = userPitch + Math.sin(elapsed * 1.5) * 0.04;
      totemGroup.position.y = 0.06 + Math.sin(elapsed * 2.2) * 0.06;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onVisibilityChange = () => {
      isPageHidden = document.hidden;
      if (!isPageHidden && isInViewport && !cancelled) tick();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          const vis = entry.isIntersecting;
          if (vis !== isInViewport) {
            isInViewport = vis;
            if (isInViewport && !isPageHidden && !cancelled) tick();
          }
        },
        { threshold: 0.05 }
      );
      observer.observe(container);
    }

    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      observer?.disconnect();
      domElem.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);

      envTexture.dispose();
      pmremGenerator.dispose();
      disposeObject3D(scene);
      renderer.dispose();
    };
  }, [
    skin,
    move.image,
    move.name,
    mat3d.cardTintHex,
    mat3d.clearcoat,
    mat3d.emissiveHex,
    mat3d.emissiveIntensity,
    mat3d.metalness,
    mat3d.roughness,
    viewMode,
    wireframe,
  ]);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-[#0E141F] shadow-2xl">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* 3D WebGL Viewport */}
        <div className="relative h-[300px] sm:h-[360px] lg:col-span-7 bg-[#0B0F17] cursor-grab active:cursor-grabbing">
          <div ref={mountRef} className="touch-3d-canvas absolute inset-0" />

          {/* Top-Left 3D Inspector Title + Polygon Count */}
          <div className="pointer-events-none absolute top-3.5 left-4 space-y-0.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Malha High-Poly Three.js · {polyCount.toLocaleString('pt-BR')} Polígonos
            </div>
            <div className="font-display text-lg font-extrabold text-white">
              {skin.name} ({move.name})
            </div>
          </div>

          {/* Top-Right Wireframe Toggle */}
          <div className="absolute top-3.5 right-4">
            <button
              type="button"
              onClick={() => setWireframe((w) => !w)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                wireframe
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-white/15 bg-[#0B0F17]/90 text-slate-300 hover:text-white'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              <span>{wireframe ? 'Malha Poligonal (ON)' : 'Ver Polígonos (Wireframe)'}</span>
            </button>
          </div>

          {/* Bottom View Mode Switcher */}
          <div className="absolute bottom-3 left-4 right-4 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0B0F17]/90 px-2.5 py-1 text-[11px] text-slate-300">
              <Rotate3d className="h-3.5 w-3.5 text-amber-400" />
              <span>Arraste em qualquer direção para girar o modelo 3D</span>
            </div>

            <div className="inline-flex rounded-lg border border-white/15 bg-[#0B0F17]/95 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('both')}
                className={`rounded-md px-2.5 py-1 font-bold cursor-pointer ${
                  viewMode === 'both'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Carta + Totem 3D
              </button>
              <button
                type="button"
                onClick={() => setViewMode('totem')}
                className={`rounded-md px-2.5 py-1 font-bold cursor-pointer ${
                  viewMode === 'totem'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Foco no Totem 3D
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`rounded-md px-2.5 py-1 font-bold cursor-pointer ${
                  viewMode === 'card'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Foco na Carta 3D
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Skin Material & Matchup Specs */}
        <div className="flex flex-col justify-between p-5 sm:p-6 lg:col-span-5 bg-[#131A26] border-t lg:border-t-0 lg:border-l border-white/10 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-extrabold uppercase tracking-wider"
                style={{ color: skin.accentColor }}
              >
                Raridade {skin.rarity} · {mat3d.finishLabel}
              </span>
              <span className="font-mono-num text-xs font-bold text-amber-300">
                {skin.cost === 0 ? 'Desbloqueada de Fábrica' : `${skin.cost} moedas`}
              </span>
            </div>

            <h2 className="font-display text-2xl font-extrabold text-white">
              {skin.name}
            </h2>
            <p className="text-xs leading-relaxed text-slate-300">
              {skin.description}
            </p>
          </div>

          {/* PBR Material Specs */}
          <div className="grid grid-cols-3 gap-2.5 rounded-xl border border-white/10 bg-[#0B0F17] p-3">
            <div>
              <div className="text-[10px] uppercase text-slate-400">Metalicidade</div>
              <div className="font-mono-num mt-0.5 text-sm font-bold text-white">
                {Math.round(mat3d.metalness * 100)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Reflexo PBR</div>
              <div className="font-mono-num mt-0.5 text-sm font-bold text-amber-300">
                {Math.round((1 - mat3d.roughness) * 100)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Geometria</div>
              <div className="font-mono-num mt-0.5 text-xs font-bold text-emerald-400 truncate">
                {polyCount.toLocaleString('pt-BR')} tris
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-3 text-xs text-slate-400 flex items-center justify-between">
            <span>
              Jogada: <strong className="text-white">{move.name}</strong>
            </span>
            <span>
              Vence:{' '}
              <strong className="text-emerald-400">
                {MOVES[move.beats[0]].shortName} e {MOVES[move.beats[1]].shortName}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
