import React from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Check,
  Crown,
  Dices,
  Eye,
  Grid,
  Rotate3d,
  Shirt,
  Sparkles,
  User,
} from 'lucide-react';
import {
  CHARACTER_ARCHETYPES,
  CHARACTER_EYEWEAR,
  CHARACTER_GUN_SKINS,
  CHARACTER_HATS,
  CHARACTER_OUTFITS,
  CHARACTER_PROPS,
  resolveCharacterCustomization,
} from '../../constants/gameData';
import { CharacterCustomization, PlayerProfile } from '../../types/game';
import { soundFx } from '../../utils/soundFx';
import { isMobileTouchDevice } from '../../utils/haptics';
import {
  getMahoganyWoodTexture,
  getSaloonBumpTexture,
} from './ProceduralPBR';
import {
  buildInstancedSaloonCoins,
  buildInstancedTableRivets,
  buildSaloonGunProp,
  buildSeatedCharacter3D,
  countTriangles3D,
  detectSoftwareGl,
  disposeObject3D,
  optimizeHierarchyForCulling,
} from './TotemBuilder3D';

interface CharacterCustomizer3DProps {
  player: PlayerProfile;
  onSaveCustomization: (custom: CharacterCustomization) => Promise<void>;
}

type CustomCategory =
  | 'archetype'
  | 'hat'
  | 'eyewear'
  | 'outfit'
  | 'prop'
  | 'gun';

export const CharacterCustomizer3D: React.FC<CharacterCustomizer3DProps> = ({
  player,
  onSaveCustomization,
}) => {
  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = React.useState<CharacterCustomization>(() =>
    resolveCharacterCustomization(player.characterCustomization, 0)
  );
  const [activeCategory, setActiveCategory] =
    React.useState<CustomCategory>('archetype');
  const [wireframe, setWireframe] = React.useState(false);
  const [polyCount, setPolyCount] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [savedToast, setSavedToast] = React.useState(false);

  // Sync draft if player profile updates externally
  React.useEffect(() => {
    if (player.characterCustomization) {
      setDraft(resolveCharacterCustomization(player.characterCustomization, 0));
    }
  }, [player.characterCustomization]);

  const currentArch =
    CHARACTER_ARCHETYPES.find((a) => a.id === draft.archetypeId) ??
    CHARACTER_ARCHETYPES[0];

  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = Math.max(container.clientWidth, 300);
    const height = Math.max(container.clientHeight, 340);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17);

    // Framed so tallest hats/crowns/horns and foreground revolver fit with breathing room
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 45);
    camera.position.set(0, 1.52, 5.25);
    camera.lookAt(0, 1.06, 0);

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
    renderer.toneMappingExposure = 0.92;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.5;

    // Balanced 3-Point Saloon Studio Lighting
    const hemi = new THREE.HemisphereLight(0xffe4c4, 0x0f172a, 0.65);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffd8a8, 1.48);
    keyLight.position.set(2.8, 4.6, 4.2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      new THREE.Color(currentArch.accentHex),
      1.15
    );
    rimLight.position.set(-2.6, 2.6, -3.2);
    scene.add(rimLight);

    // Turntable Stage
    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const woodTex = getMahoganyWoodTexture();
    const bumpTex = getSaloonBumpTexture();

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.78, 1.96, 0.26, 64),
      new THREE.MeshStandardMaterial({
        map: woodTex,
        bumpMap: bumpTex,
        bumpScale: 0.02,
        roughness: 0.5,
        metalness: 0.14,
      })
    );
    pedestal.position.y = -0.13;
    stageGroup.add(pedestal);

    const trimRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.72, 0.032, 20, 64),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(currentArch.accentHex),
        emissive: new THREE.Color(currentArch.accentHex),
        emissiveIntensity: 0.35,
        roughness: 0.25,
      })
    );
    trimRing.rotation.x = Math.PI / 2;
    trimRing.position.y = 0.01;
    stageGroup.add(trimRing);

    // Instanced Brass Rivets around the Turntable Rim + Instanced Coin Stacks
    stageGroup.add(buildInstancedTableRivets(1.62, 24, 0.01));
    stageGroup.add(
      buildInstancedSaloonCoins([
        { x: 0.92, y: 0.01, z: 0.72, count: 6 },
        { x: 1.14, y: 0.01, z: 0.54, count: 4 },
      ])
    );

    // Build Customized High-Poly 3D Character (~25,000+ Polygons)
    const charActor = buildSeatedCharacter3D({
      accentHex: currentArch.accentHex,
      isAlly: true,
      variantIndex: 0,
      customization: draft,
    });
    charActor.root.position.set(0, 0, -0.18);
    stageGroup.add(charActor.root);

    // Build Customized High-Poly 3D Saloon Revolver on the Turntable Front
    const gunProp = buildSaloonGunProp(draft.gunSkinId);
    gunProp.position.set(-0.88, 0.15, 0.96);
    gunProp.rotation.set(0.28, 0.52, 0.16);
    gunProp.scale.setScalar(0.95);
    stageGroup.add(gunProp);

    // Apply frustum culling bounds & optional wireframe mode
    optimizeHierarchyForCulling(scene);
    if (wireframe) {
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh && m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => {
            if ('wireframe' in mat) {
              (mat as THREE.MeshStandardMaterial).wireframe = true;
            }
          });
        }
      });
    }
    setPolyCount(countTriangles3D(scene));

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Drag to rotate character 360 degrees
    let isDragging = false;
    let prevX = 0;
    let userYaw = -0.18;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      prevX = e.clientX;
      userYaw += dx * 0.012;
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
      const h = Math.max(container.clientHeight, 260);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

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
        userYaw += isSoftwareGl ? 0.022 : 0.0055;
      }

      stageGroup.rotation.y = userYaw;
      charActor.headGroup.rotation.y = Math.sin(elapsed * 1.4) * 0.14;
      charActor.headGroup.rotation.x = Math.sin(elapsed * 1.1) * 0.05;
      charActor.handGroup.position.y = 0.58 + Math.sin(elapsed * 2.2) * 0.032;

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
  }, [draft, currentArch.accentHex, wireframe]);

  const handleRandomize = () => {
    soundFx.playSelect();
    const randomItem = <T,>(arr: T[]): T =>
      arr[Math.floor(Math.random() * arr.length)];
    const next: CharacterCustomization = {
      archetypeId: randomItem(CHARACTER_ARCHETYPES).id,
      hatId: randomItem(CHARACTER_HATS).id,
      eyewearId: randomItem(CHARACTER_EYEWEAR).id,
      outfitId: randomItem(CHARACTER_OUTFITS).id,
      propId: randomItem(CHARACTER_PROPS).id,
      gunSkinId: randomItem(CHARACTER_GUN_SKINS).id,
    };
    setDraft(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveCustomization(draft);
      soundFx.playVictory();
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof CharacterCustomization>(
    key: K,
    val: CharacterCustomization[K]
  ) => {
    soundFx.playSelect();
    setDraft((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-500/30 bg-[#131A26] shadow-2xl">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left: 3D Character Studio Viewport */}
        <div className="relative h-[340px] sm:h-[460px] lg:col-span-5 bg-[#0B0F17] cursor-grab active:cursor-grabbing">
          <div ref={mountRef} className="touch-3d-canvas absolute inset-0" />

          {/* Top Left Character Badge + Polygon Count */}
          <div className="pointer-events-none absolute top-3.5 left-4 right-32 space-y-0.5 rounded-xl border border-white/10 bg-[#0B0F17]/85 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Malha 3D Esculpida · {polyCount.toLocaleString('pt-BR')} Polígonos
            </div>
            <div className="font-display text-lg font-extrabold text-white">
              {currentArch.name}
            </div>
            <p className="text-[11px] leading-snug text-slate-300">
              {currentArch.subtitle}
            </p>
          </div>

          {/* Top Right Wireframe Toggle */}
          <div className="absolute top-3.5 right-3.5">
            <button
              type="button"
              onClick={() => setWireframe((w) => !w)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                wireframe
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-white/15 bg-[#0B0F17]/90 text-slate-300 hover:text-white'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              <span>{wireframe ? 'Wireframe (ON)' : 'Ver Malha'}</span>
            </button>
          </div>

          {/* Bottom Controls */}
          <div className="absolute bottom-3.5 left-4 right-4 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0B0F17]/90 px-2.5 py-1 text-[11px] text-slate-300">
              <Rotate3d className="h-3.5 w-3.5 text-amber-400" />
              <span>Arraste para girar 360°</span>
            </div>

            <button
              type="button"
              onClick={handleRandomize}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-[#131A26]/95 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
            >
              <Dices className="h-3.5 w-3.5" />
              <span>Sortear Visual</span>
            </button>
          </div>
        </div>

        {/* Right: 6-Category Customization Selector */}
        <div className="flex flex-col justify-between p-5 sm:p-6 lg:col-span-7 border-t lg:border-t-0 lg:border-l border-white/10 space-y-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-extrabold text-white">
                  Personalizar Seu Personagem 3D
                </h2>
                <p className="text-xs text-slate-400">
                  Modelos orgânicos de alta densidade (~25 mil polígonos) com InstancedMesh e Frustum Culling.
                </p>
              </div>

              {savedToast && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-950/70 px-3 py-1 text-xs font-bold text-emerald-300">
                  <Check className="h-3.5 w-3.5" />
                  Visual equipado na mesa!
                </span>
              )}
            </div>

            {/* Category Tabs */}
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-[#0B0F17] p-1.5">
              {[
                { id: 'archetype', label: 'Personagem (6)', icon: User },
                { id: 'hat', label: 'Chapéu / Elmo (7)', icon: Crown },
                { id: 'eyewear', label: 'Óculos / Visor (6)', icon: Eye },
                { id: 'outfit', label: 'Traje & Cores (6)', icon: Shirt },
                { id: 'prop', label: 'Acessório (5)', icon: Sparkles },
                { id: 'gun', label: 'Revólver (4)', icon: Sparkles },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveCategory(tab.id as CustomCategory)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Options Grid for Active Category */}
            {activeCategory === 'archetype' && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {CHARACTER_ARCHETYPES.map((arch) => {
                  const selected = draft.archetypeId === arch.id;
                  return (
                    <button
                      key={arch.id}
                      type="button"
                      onClick={() => updateField('archetypeId', arch.id)}
                      className={`flex items-start justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400/50'
                          : 'border-white/10 bg-[#0B0F17] hover:border-white/25'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full border border-white/30"
                            style={{ backgroundColor: arch.accentHex }}
                          />
                          <span className="font-display text-sm font-bold text-white">
                            {arch.name}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-slate-400">
                          {arch.subtitle}
                        </p>
                      </div>
                      {selected && (
                        <Check className="h-4 w-4 shrink-0 text-amber-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {activeCategory === 'hat' && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {CHARACTER_HATS.map((hat) => {
                  const selected = draft.hatId === hat.id;
                  return (
                    <button
                      key={hat.id}
                      type="button"
                      onClick={() => updateField('hatId', hat.id)}
                      className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400/50'
                          : 'border-white/10 bg-[#0B0F17] hover:border-white/25'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                        {hat.badge}
                      </span>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-display text-xs font-bold text-white">
                          {hat.name}
                        </span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {activeCategory === 'eyewear' && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {CHARACTER_EYEWEAR.map((eye) => {
                  const selected = draft.eyewearId === eye.id;
                  return (
                    <button
                      key={eye.id}
                      type="button"
                      onClick={() => updateField('eyewearId', eye.id)}
                      className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400/50'
                          : 'border-white/10 bg-[#0B0F17] hover:border-white/25'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                        {eye.badge}
                      </span>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-display text-xs font-bold text-white">
                          {eye.name}
                        </span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {activeCategory === 'outfit' && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {CHARACTER_OUTFITS.map((out) => {
                  const selected = draft.outfitId === out.id;
                  return (
                    <button
                      key={out.id}
                      type="button"
                      onClick={() => updateField('outfitId', out.id)}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400/50'
                          : 'border-white/10 bg-[#0B0F17] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-5 w-5 rounded-md border border-white/25"
                          style={{
                            backgroundColor: `#${out.vestHex
                              .toString(16)
                              .padStart(6, '0')}`,
                          }}
                        />
                        <span className="font-display text-xs font-bold text-white">
                          {out.name}
                        </span>
                      </div>
                      {selected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {activeCategory === 'prop' && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {CHARACTER_PROPS.map((prop) => {
                  const selected = draft.propId === prop.id;
                  return (
                    <button
                      key={prop.id}
                      type="button"
                      onClick={() => updateField('propId', prop.id)}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400/50'
                          : 'border-white/10 bg-[#0B0F17] hover:border-white/25'
                      }`}
                    >
                      <span className="font-display text-xs font-bold text-white">
                        {prop.name}
                      </span>
                      {selected && (
                        <Check className="h-3.5 w-3.5 text-amber-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {activeCategory === 'gun' && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {CHARACTER_GUN_SKINS.map((gun) => {
                  const selected = draft.gunSkinId === gun.id;
                  return (
                    <button
                      key={gun.id}
                      type="button"
                      onClick={() => updateField('gunSkinId', gun.id)}
                      className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400/50'
                          : 'border-white/10 bg-[#0B0F17] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-5 w-5 rounded-full border border-white/30"
                          style={{
                            backgroundColor: `#${gun.cylHex
                              .toString(16)
                              .padStart(6, '0')}`,
                          }}
                        />
                        <span className="font-display text-sm font-bold text-white">
                          {gun.name}
                        </span>
                      </div>
                      {selected && (
                        <Check className="h-4 w-4 text-amber-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Save Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="text-xs text-slate-400">
              Dica: Na partida 3D, pressione <strong className="text-amber-300">[C]</strong> para alternar entre 1ª Pessoa e ver seu Personagem 3D sentado na mesa!
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs sm:text-sm font-black uppercase tracking-wide text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>
                {saving ? 'Salvando Visual...' : 'Equipar Visual no Personagem'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
