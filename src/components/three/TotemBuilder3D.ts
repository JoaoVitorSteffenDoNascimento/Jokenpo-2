import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  CHARACTER_ARCHETYPES,
  CHARACTER_GUN_SKINS,
  CHARACTER_OUTFITS,
  resolveCharacterCustomization,
} from '../../constants/gameData';
import {
  CharacterArchetypeId,
  CharacterCustomization,
  CharacterGunSkinId,
  MoveId,
  SkinDefinition,
} from '../../types/game';
import {
  getAnimalFurBumpTexture,
  getMechaHexScaleTexture,
  getOrnateCardBackTexture,
  getSaloonBumpTexture,
} from './ProceduralPBR';

// ============================================================================
// RIG INTERFACES & PROCEDURAL ANIMATION CONTROLLERS
// ============================================================================
export interface EyeController {
  eyeGroup: THREE.Group;
  scleraMesh: THREE.Mesh;
  irisMesh: THREE.Mesh;
  pupilMesh: THREE.Mesh;
  upperLidMesh: THREE.Mesh;
  lowerLidMesh: THREE.Mesh;
  blinkState: {
    nextBlinkTime: number;
    blinkProgress: number;
    isBlinking: boolean;
    isDoubleBlink?: boolean;
  };
  lookOffset: THREE.Vector2;
}

export type CharacterReactionState = 'idle' | 'throwing' | 'victory' | 'defeat';

export interface SeatedCharacterRig {
  root: THREE.Group;
  chairGroup: THREE.Group;
  spineBaseGroup: THREE.Group;
  chestGroup: THREE.Group;
  neckGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArmGroup: THREE.Group;
  rightArmGroup: THREE.Group;
  leftHandGroup: THREE.Group;
  handGroup: THREE.Group;
  cardsInHand: THREE.Mesh[];
  leftEye: EyeController;
  rightEye: EyeController;
  currentState: CharacterReactionState;
  stateTimer: number;
  updateAnimation: (
    elapsed: number,
    dtFactor: number,
    desiredState: CharacterReactionState,
    targetLookWorldPos?: THREE.Vector3 | null
  ) => void;
}

export interface FingerBones {
  root: THREE.Group;
  proximalPhalanx: THREE.Mesh;
  medialJoint: THREE.Group;
  medialPhalanx: THREE.Mesh;
  distalJoint: THREE.Group;
  distalPhalanx: THREE.Mesh;
  clawTip: THREE.Mesh;
}

export interface ThumbBones {
  carpometacarpalJoint: THREE.Group;
  proximalPhalanx: THREE.Mesh;
  interphalangealJoint: THREE.Group;
  distalPhalanx: THREE.Mesh;
  clawTip: THREE.Mesh;
}

export interface ArticulatedHandRig {
  group: THREE.Group;
  wristGroup: THREE.Group;
  palmMesh: THREE.Mesh;
  gloveMesh: THREE.Mesh;
  forearmMesh: THREE.Mesh;
  cuffMesh: THREE.Mesh;
  fingers: FingerBones[];
  thumb: ThumbBones;
}

export interface TableCandleController {
  group: THREE.Group;
  flameMeshes: THREE.Mesh[];
  flameLights: THREE.PointLight[];
  updateFlames: (elapsed: number, dtFactor: number) => void;
}

// ============================================================================
// GPU GEOMETRY CACHE (Prevents main-thread stutter when switching skins/rounds)
// ============================================================================
export type DetailTier3D = 'studio' | 'match';
const GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>();

function getCachedGeometry(
  key: string,
  factory: () => THREE.BufferGeometry
): THREE.BufferGeometry {
  const existing = GEOMETRY_CACHE.get(key);
  if (existing) return existing;
  const created = factory();
  created.userData.cached = true;
  created.computeBoundingBox();
  created.computeBoundingSphere();
  GEOMETRY_CACHE.set(key, created);
  return created;
}

export function detectSoftwareGl(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !mesh.geometry.userData?.cached) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const m of mats) {
        if (m && !m.userData?.cached) {
          m.dispose();
        }
      }
    }
  });
}

/**
 * Recursively computes bounding spheres/boxes and enables frustum culling
 * on all Mesh and InstancedMesh nodes to prevent off-screen GPU draw overhead.
 */
export function optimizeHierarchyForCulling(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      if (!mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }
      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }
      mesh.frustumCulled = true;
    }
    const inst = obj as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      inst.computeBoundingSphere();
      inst.computeBoundingBox();
      inst.frustumCulled = true;
    }
  });
}

/**
 * Counts total rendered triangles across both standard Mesh and InstancedMesh nodes.
 */
export function countTriangles3D(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const idx = m.geometry.index;
      const posAttr = m.geometry.attributes.position;
      const baseTris = idx
        ? Math.round(idx.count / 3)
        : posAttr
        ? Math.round(posAttr.count / 3)
        : 0;
      const inst = obj as THREE.InstancedMesh;
      const instanceCount = inst.isInstancedMesh ? inst.count : 1;
      triangles += baseTris * instanceCount;
    }
  });
  return triangles;
}

// ============================================================================
// HIGH-POLY ORGANIC & ROCK SCULPTING FUNCTIONS
// ============================================================================

/**
 * Applies multi-octave 3D fractal displacement to a high-subdivision BufferGeometry
 * and recomputes vertex normals for organic high-poly rock/crystal/sculpted surfaces.
 */
function displaceHighPolyRock(
  geometry: THREE.BufferGeometry,
  amplitude = 0.14,
  frequency = 3.2
): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();

    const noise1 =
      Math.sin(v.x * frequency + 1.2) *
      Math.cos(v.y * frequency - 0.7) *
      Math.sin(v.z * frequency + 2.1);
    const noise2 =
      Math.sin(v.x * frequency * 2.3 - 0.4) *
      Math.cos(v.z * frequency * 2.3 + 1.5) *
      0.45;
    const facet = Math.abs(noise1 + noise2) - 0.25;

    v.addScaledVector(n, facet * amplitude);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds an organically sculpted anatomical torso with broad deltoid shoulders,
 * contoured chest pectorals, tailored waist taper, and flared coat hem (~6,144 tris).
 */
function getSculptedTorsoGeometry(
  detail: DetailTier3D = 'studio'
): THREE.BufferGeometry {
  const segW = detail === 'match' ? 28 : 64;
  const segH = detail === 'match' ? 20 : 48;
  return getCachedGeometry(`sculpted_torso_${detail}_v2`, () => {
    const geo = new THREE.SphereGeometry(0.75, segW, segH);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // Normalized height t from -1 (hips) to +1 (shoulders/neck)
      const ny = v.y / 0.75;

      // Anatomical width profile: broad at chest/shoulders, tapered at waist, flared at coat base
      const shoulderFlare =
        ny > 0.15 ? 1.0 + Math.sin((ny - 0.15) * 2.2) * 0.26 : 1.0;
      const waistTaper =
        ny < 0.15 && ny > -0.55 ? 0.86 + Math.abs(ny + 0.2) * 0.22 : 1.0;
      const coatHem = ny <= -0.55 ? 0.92 + (-0.55 - ny) * 0.25 : 1.0;

      // Pectoral & back muscle contour
      const chestDef =
        v.z > 0 && ny > -0.1 && ny < 0.55
          ? Math.cos(v.x * 3.8) * 0.045 + 0.04
          : 0;
      // Flatten bottom so character sits flush on saloon chair/table base
      const flatBottom = ny < -0.82 ? -0.82 * 0.75 : v.y * 1.06;

      const rx = v.x * 1.05 * shoulderFlare * waistTaper * coatHem;
      const rz = v.z * 0.66 * waistTaper + chestDef;

      pos.setXYZ(i, rx, flatBottom, rz);
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  });
}

/**
 * Builds an organically sculpted high-poly character cranium with brow ridges,
 * cheekbones, eye socket recesses, and temporal contours (~6,144 tris).
 */
function getSculptedHeadGeometry(
  archetypeId: CharacterArchetypeId,
  detail: DetailTier3D = 'studio'
): THREE.BufferGeometry {
  const segW = detail === 'match' ? 28 : 64;
  const segH = detail === 'match' ? 20 : 48;
  return getCachedGeometry(`sculpted_head_${archetypeId}_${detail}_v2`, () => {
    const geo = new THREE.SphereGeometry(0.46, segW, segH);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    const isHeavy =
      archetypeId === 'minotauro_chef' || archetypeId === 'urso_pardo';
    const isSleek =
      archetypeId === 'raposa_dama' || archetypeId === 'lobo_cyber';
    const isMecha = archetypeId === 'mecha_camaleao';

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const nx = v.x / 0.46;
      const ny = v.y / 0.46;
      const nz = v.z / 0.46;

      // Cheekbone flare
      const cheekFlare =
        ny > -0.35 && ny < 0.15 && nz > 0.1
          ? 1.0 +
            Math.exp(-Math.pow(ny + 0.1, 2) * 14) *
              (isHeavy ? 0.24 : isSleek ? 0.18 : 0.15)
          : 1.0;

      // Supraorbital brow ridge protrusion
      const browBoost =
        ny > 0.12 && ny < 0.42 && nz > 0.35
          ? Math.exp(-Math.pow(ny - 0.26, 2) * 28) * (isHeavy ? 0.085 : 0.055)
          : 0;

      // Eye socket subtle anatomical recess
      const eyeDistL = Math.hypot(nx + 0.42, ny - 0.12);
      const eyeDistR = Math.hypot(nx - 0.42, ny - 0.12);
      const eyeRecess =
        nz > 0.45 && (eyeDistL < 0.28 || eyeDistR < 0.28) ? -0.032 : 0;

      // Mecha Chameleon angular casque shaping
      const mechaCrest =
        isMecha && ny > 0.2 && nz < 0.1
          ? (ny - 0.2) * 0.22 * (1 - Math.abs(nx) * 0.5)
          : 0;

      const sx = v.x * (isHeavy ? 1.12 : isSleek ? 0.96 : 1.02) * cheekFlare;
      const sy = v.y * (isHeavy ? 1.04 : 1.06) + mechaCrest * 0.6;
      const sz =
        v.z * (isHeavy ? 1.08 : 1.02) + browBoost + eyeRecess - mechaCrest * 0.5;

      pos.setXYZ(i, sx, sy, sz);
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  });
}

/**
 * Builds an organically sculpted high-poly snout/muzzle with dorsal nasal bridge,
 * carved nostril cavities, upper lip philtrum, and jawline contour (~3,072 tris).
 */
function getSculptedMuzzleGeometry(
  archetypeId: CharacterArchetypeId,
  detail: DetailTier3D = 'studio'
): THREE.BufferGeometry {
  const segW = detail === 'match' ? 22 : 48;
  const segH = detail === 'match' ? 16 : 32;
  return getCachedGeometry(`sculpted_muzzle_${archetypeId}_${detail}_v2`, () => {
    const geo = new THREE.SphereGeometry(0.28, segW, segH);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    const isEquine = archetypeId === 'dom_jegue';
    const isBovine = archetypeId === 'minotauro_chef';
    const isUrsine = archetypeId === 'urso_pardo';
    const isCanine =
      archetypeId === 'raposa_dama' || archetypeId === 'lobo_cyber';

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const nx = v.x / 0.28;
      const ny = v.y / 0.28;
      const nz = v.z / 0.28;

      // Taper towards front tip for fox/wolf, flare for bull/donkey/bear
      const forwardT = (nz + 1) * 0.5; // 0 at back, 1 at tip
      const widthScale = isCanine
        ? 1.0 - forwardT * 0.42
        : isBovine
        ? 1.18 + Math.sin(forwardT * Math.PI) * 0.16
        : isEquine
        ? 0.95 + Math.pow(forwardT, 2) * 0.18
        : isUrsine
        ? 1.08 - forwardT * 0.14
        : 0.92;

      // Nostril cavities carved near front tip
      const nostrilL = Math.hypot(nx + 0.42, ny - 0.18);
      const nostrilR = Math.hypot(nx - 0.42, ny - 0.18);
      const nostrilCarve =
        nz > 0.55 && (nostrilL < 0.26 || nostrilR < 0.26) ? -0.028 : 0;

      // Mouth cleft / jawline groove underneath
      const mouthGroove =
        ny < -0.15 && ny > -0.45 && nz > 0.2
          ? -Math.exp(-Math.pow(ny + 0.28, 2) * 40) * 0.025
          : 0;

      const sx = v.x * widthScale;
      const sy = v.y * (isBovine ? 0.92 : 0.84);
      const sz =
        v.z * (isEquine || isCanine ? 1.42 : 1.24) +
        nostrilCarve +
        mouthGroove;

      pos.setXYZ(i, sx, sy, sz);
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  });
}

// ============================================================================
// INSTANCED MESH BUILDERS FOR REPETITIVE SALOON & CARD GEOMETRY
// ============================================================================

/**
 * Renders all saloon coin stacks across the table using a single THREE.InstancedMesh
 * with milled edge geometry, per-instance gold tinting, and frustum culling.
 */
export function buildInstancedSaloonCoins(
  stacks: { x: number; y: number; z: number; count: number }[]
): THREE.InstancedMesh {
  const totalCoins = stacks.reduce((sum, s) => sum + s.count, 0);
  const coinGeo = getCachedGeometry('instanced_saloon_coin_v2', () => {
    const pts = [
      new THREE.Vector2(0, -0.016),
      new THREE.Vector2(0.142, -0.016),
      new THREE.Vector2(0.148, -0.008),
      new THREE.Vector2(0.148, 0.008),
      new THREE.Vector2(0.142, 0.016),
      new THREE.Vector2(0.115, 0.016),
      new THREE.Vector2(0.115, 0.012),
      new THREE.Vector2(0, 0.012),
    ];
    return new THREE.LatheGeometry(pts, 32);
  });

  const goldMat = new THREE.MeshPhysicalMaterial({
    color: 0xf59e0b,
    metalness: 0.92,
    roughness: 0.2,
    clearcoat: 0.65,
  });

  const instanced = new THREE.InstancedMesh(coinGeo, goldMat, totalCoins);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  let idx = 0;
  for (let s = 0; s < stacks.length; s++) {
    const st = stacks[s];
    for (let i = 0; i < st.count; i++) {
      dummy.position.set(
        st.x + Math.sin(i * 1.7 + s) * 0.022,
        st.y + i * 0.033 + 0.016,
        st.z + Math.cos(i * 1.3 + s) * 0.022
      );
      dummy.rotation.set(0, (i * 0.65) % (Math.PI * 2), 0);
      dummy.updateMatrix();
      instanced.setMatrixAt(idx, dummy.matrix);

      // Subtle gold/brass luster variation per coin
      color.setHSL(0.1 + (idx % 3) * 0.008, 0.9, 0.52 + (i % 2) * 0.04);
      instanced.setColorAt(idx, color);
      idx++;
    }
  }

  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  instanced.computeBoundingSphere();
  instanced.computeBoundingBox();
  instanced.frustumCulled = true;
  return instanced;
}

/**
 * Legacy helper for single coin stack prop (uses InstancedMesh internally).
 */
export function buildCoinStackProp(count = 7): THREE.Group {
  const group = new THREE.Group();
  group.add(buildInstancedSaloonCoins([{ x: 0, y: 0, z: 0, count }]));
  return group;
}

/**
 * Renders 36 decorative brass saloon rivets around the mahogany table rim in 1 draw call.
 */
export function buildInstancedTableRivets(
  radius = 3.48,
  count = 36,
  y = 0.21
): THREE.InstancedMesh {
  const studGeo = getCachedGeometry(
    'table_brass_stud_v2',
    () => new THREE.SphereGeometry(0.036, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6)
  );
  const brassMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97706,
    metalness: 0.92,
    roughness: 0.22,
    clearcoat: 0.6,
  });

  const inst = new THREE.InstancedMesh(studGeo, brassMat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
    dummy.rotation.set(0, -a, 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.frustumCulled = true;
  return inst;
}

/**
 * Renders a 24-card dealer deck stack on the saloon table using a single InstancedMesh.
 */
export function buildInstancedCardDeck(
  count = 24,
  accentHex = '#F59E0B'
): THREE.Group {
  const deckGroup = new THREE.Group();
  const cardGeo = getCachedGeometry(
    'deck_card_slice_v2',
    () => new RoundedBoxGeometry(0.58, 0.011, 0.84, 3, 0.004)
  );
  const backTex = getOrnateCardBackTexture(accentHex);
  const cardMat = new THREE.MeshStandardMaterial({
    map: backTex,
    roughness: 0.48,
    metalness: 0.18,
  });

  const inst = new THREE.InstancedMesh(cardGeo, cardMat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(
      Math.sin(i * 0.9) * 0.008,
      i * 0.0115 + 0.006,
      Math.cos(i * 1.1) * 0.008
    );
    dummy.rotation.set(0, Math.sin(i * 0.5) * 0.035, 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.frustumCulled = true;
  deckGroup.add(inst);

  // Brass card dealer shoe / weight on top
  const brassClip = new THREE.Mesh(
    getCachedGeometry(
      'deck_brass_clip_v2',
      () => new RoundedBoxGeometry(0.62, 0.04, 0.22, 3, 0.01)
    ),
    new THREE.MeshPhysicalMaterial({
      color: 0xd97706,
      metalness: 0.9,
      roughness: 0.22,
      clearcoat: 0.6,
    })
  );
  brassClip.position.y = count * 0.0115 * 0.5;
  deckGroup.add(brassClip);

  optimizeHierarchyForCulling(deckGroup);
  return deckGroup;
}

/**
 * Builds a high-poly 3D Collectible Saloon Card with beveled frame, curved card flex,
 * embossed metallic border rails, and 4 instanced corner filigree medallions.
 */
export function buildHighPolyCardMesh(options: {
  width?: number;
  height?: number;
  thickness?: number;
  frontTexture?: THREE.Texture;
  artTexture?: THREE.Texture;
  backTexture: THREE.Texture;
  accentHex?: string;
  bumpMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
}): THREE.Group {
  const w = options.width ?? 0.5;
  const h = options.height ?? 0.72;
  const t = options.thickness ?? 0.018;
  const accentColor = new THREE.Color(options.accentHex ?? '#F59E0B');

  const card = new THREE.Group();

  const coreGeo = getCachedGeometry(
    `card_core_${w.toFixed(2)}_${h.toFixed(2)}`,
    () => new RoundedBoxGeometry(w, h, t, 5, t * 0.38)
  );
  const goldTrimMat = new THREE.MeshPhysicalMaterial({
    color: accentColor,
    metalness: 0.92,
    roughness: 0.20,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
  });

  const coreMesh = new THREE.Mesh(
    coreGeo,
    new THREE.MeshStandardMaterial({
      color: 0x3b2818,
      metalness: 0.35,
      roughness: 0.45,
    })
  );
  card.add(coreMesh);

  // Back ornate plate
  const backGeo = getCachedGeometry(
    `card_face_${w.toFixed(2)}_${h.toFixed(2)}`,
    () => new THREE.PlaneGeometry(w * 0.94, h * 0.94, 12, 16)
  );
  const backMesh = new THREE.Mesh(
    backGeo,
    new THREE.MeshStandardMaterial({
      map: options.backTexture,
      roughness: 0.46,
      metalness: 0.22,
    })
  );
  backMesh.rotation.y = Math.PI;
  backMesh.position.z = -t * 0.52;
  card.add(backMesh);

  // Front parchment frame + art plane
  if (options.frontTexture) {
    const frontMesh = new THREE.Mesh(
      backGeo,
      new THREE.MeshStandardMaterial({
        map: options.frontTexture,
        bumpMap: options.bumpMap,
        bumpScale: options.bumpMap ? 0.018 : 0,
        metalnessMap: options.metalnessMap,
        roughness: 0.58,
        metalness: options.metalnessMap ? 0.55 : 0.08,
      })
    );
    frontMesh.position.z = t * 0.52;
    card.add(frontMesh);
  }

  if (options.artTexture) {
    const artGeo = getCachedGeometry(
      `card_art_${w.toFixed(2)}_${h.toFixed(2)}`,
      () => new THREE.PlaneGeometry(w * 0.74, h * 0.62, 8, 8)
    );
    const artMesh = new THREE.Mesh(
      artGeo,
      new THREE.MeshStandardMaterial({
        map: options.artTexture,
        bumpMap: options.bumpMap,
        bumpScale: options.bumpMap ? 0.012 : 0,
        metalnessMap: options.metalnessMap,
        roughness: 0.48,
        metalness: options.metalnessMap ? 0.45 : 0.06,
      })
    );
    artMesh.position.set(0, h * 0.02, t * 0.56);
    card.add(artMesh);
  }

  // 4 Instanced 3D Corner Filigree Studs
  const cornerGeo = getCachedGeometry(
    'card_corner_stud_v2',
    () => new THREE.OctahedronGeometry(w * 0.045, 1)
  );
  const cornersInst = new THREE.InstancedMesh(cornerGeo, goldTrimMat, 4);
  const dummy = new THREE.Object3D();
  const cx = w * 0.41;
  const cy = h * 0.42;
  const coords = [
    [-cx, cy],
    [cx, cy],
    [-cx, -cy],
    [cx, -cy],
  ];
  for (let i = 0; i < 4; i++) {
    dummy.position.set(coords[i][0], coords[i][1], t * 0.55);
    dummy.scale.set(1, 1, 0.35);
    dummy.updateMatrix();
    cornersInst.setMatrixAt(i, dummy.matrix);
  }
  cornersInst.instanceMatrix.needsUpdate = true;
  cornersInst.computeBoundingSphere();
  cornersInst.frustumCulled = true;
  card.add(cornersInst);

  optimizeHierarchyForCulling(card);
  return card;
}

/**
 * Builds a high-poly brass cartridge (casing + rim + neck + FMJ bullet tip) using LatheGeometry.
 */
function createHighPolyBulletCartridge(
  casingMat: THREE.Material,
  tipMat: THREE.Material
): THREE.Group {
  const cartridge = new THREE.Group();

  const casingGeo = getCachedGeometry('bullet_casing_lathe_v2', () => {
    const casingPoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.042, 0),
      new THREE.Vector2(0.042, 0.012),
      new THREE.Vector2(0.036, 0.014),
      new THREE.Vector2(0.039, 0.022),
      new THREE.Vector2(0.038, 0.14),
      new THREE.Vector2(0.029, 0.165),
      new THREE.Vector2(0.028, 0.195),
    ];
    return new THREE.LatheGeometry(casingPoints, 32);
  });
  const casingMesh = new THREE.Mesh(casingGeo, casingMat);
  casingMesh.position.y = -0.12;
  cartridge.add(casingMesh);

  const bulletGeo = getCachedGeometry('bullet_tip_lathe_v2', () => {
    const bulletPoints = [
      new THREE.Vector2(0.027, 0),
      new THREE.Vector2(0.026, 0.035),
      new THREE.Vector2(0.016, 0.075),
      new THREE.Vector2(0.001, 0.105),
    ];
    return new THREE.LatheGeometry(bulletPoints, 32);
  });
  const tipMesh = new THREE.Mesh(bulletGeo, tipMat);
  tipMesh.position.y = 0.075;
  cartridge.add(tipMesh);

  return cartridge;
}

// ============================================================================
// HIGH-POLY ~25,000-POLYGON MOVE TOTEMS (With InstancedMesh & Frustum Culling)
// ============================================================================
export function buildMoveTotem3D(
  moveId: MoveId,
  skin: SkinDefinition
): THREE.Group {
  const group = new THREE.Group();
  const mat3d = skin.material3d ?? {
    metalness: 0.55,
    roughness: 0.35,
    cardTintHex: skin.accentColor || '#F59E0B',
    finishLabel: 'Acabamento 3D',
  };

  const hexBump = getMechaHexScaleTexture();
  const woodBump = getSaloonBumpTexture();

  const primaryColor = new THREE.Color(mat3d.cardTintHex || skin.accentColor);
  const emissiveColor = new THREE.Color(
    mat3d.emissiveHex || mat3d.cardTintHex || '#111111'
  );
  const emissiveIntensity = mat3d.emissiveIntensity ?? 0.28;

  const mainMat = new THREE.MeshPhysicalMaterial({
    color: primaryColor,
    metalness: mat3d.metalness,
    roughness: mat3d.roughness,
    bumpMap: hexBump,
    bumpScale: 0.015,
    clearcoat: mat3d.clearcoat ?? 0.65,
    clearcoatRoughness: 0.12,
    iridescence:
      skin.rarity === 'Lendária' || skin.rarity === 'Épica' ? 0.55 : 0.15,
    iridescenceIOR: 1.4,
    emissive: emissiveColor,
    emissiveIntensity: emissiveIntensity * 0.65,
  });

  const gunmetalMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e2430,
    metalness: 0.88,
    roughness: 0.28,
    bumpMap: hexBump,
    bumpScale: 0.012,
    clearcoat: 0.4,
  });

  const chromeMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    metalness: 0.96,
    roughness: 0.12,
    clearcoat: 1.0,
  });

  const accentGlowMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    emissive: primaryColor,
    emissiveIntensity: 0.42,
    roughness: 0.22,
    metalness: 0.45,
  });

  const walnutMat = new THREE.MeshStandardMaterial({
    color: 0x4a2111,
    roughness: 0.62,
    metalness: 0.08,
    bumpMap: woodBump,
    bumpScale: 0.02,
  });

  const dummy = new THREE.Object3D();

  // =========================================================================
  // 1. PARAFAL — HIGH-POLY MECHA-TACTICAL FAL BATTLE RIFLE (~24,500 Triangles)
  // =========================================================================
  if (moveId === 'parafal') {
    const rifle = new THREE.Group();

    const upperReceiver = new THREE.Mesh(
      getCachedGeometry(
        'parafal_upper_v2',
        () => new RoundedBoxGeometry(1.42, 0.22, 0.21, 8, 0.032)
      ),
      mainMat
    );
    upperReceiver.position.set(-0.05, 0.08, 0);
    rifle.add(upperReceiver);

    const lowerReceiver = new THREE.Mesh(
      getCachedGeometry(
        'parafal_lower_v2',
        () => new RoundedBoxGeometry(0.95, 0.2, 0.19, 8, 0.025)
      ),
      gunmetalMat
    );
    lowerReceiver.position.set(-0.18, -0.08, 0);
    rifle.add(lowerReceiver);

    // Instanced Picatinny Top Rail (18 machined rail teeth in 1 draw call!)
    const toothGeo = getCachedGeometry(
      'parafal_rail_tooth_v2',
      () => new RoundedBoxGeometry(0.045, 0.045, 0.16, 4, 0.008)
    );
    const railInst = new THREE.InstancedMesh(toothGeo, gunmetalMat, 18);
    for (let i = 0; i < 18; i++) {
      dummy.position.set(-0.66 + i * 0.075, 0.21, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      railInst.setMatrixAt(i, dummy.matrix);
    }
    railInst.instanceMatrix.needsUpdate = true;
    rifle.add(railInst);

    const handguard = new THREE.Mesh(
      getCachedGeometry(
        'parafal_handguard_v2',
        () => new RoundedBoxGeometry(0.88, 0.21, 0.22, 8, 0.03)
      ),
      skin.cost > 0 ? mainMat : gunmetalMat
    );
    handguard.position.set(0.92, 0.06, 0);
    rifle.add(handguard);

    // Instanced Cooling Vents (6 vents in 1 draw call)
    const ventGeo = getCachedGeometry(
      'parafal_vent_v2',
      () => new RoundedBoxGeometry(0.095, 0.06, 0.235, 4, 0.01)
    );
    const ventInst = new THREE.InstancedMesh(ventGeo, accentGlowMat, 6);
    for (let v = 0; v < 6; v++) {
      dummy.position.set(0.56 + v * 0.135, 0.07, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      ventInst.setMatrixAt(v, dummy.matrix);
    }
    ventInst.instanceMatrix.needsUpdate = true;
    rifle.add(ventInst);

    // Turned High-Poly Fluted Barrel (LatheGeometry, 64 segments)
    const barrelGeo = getCachedGeometry('parafal_barrel_v2', () => {
      const barrelPts = [
        new THREE.Vector2(0.052, 0),
        new THREE.Vector2(0.046, 0.45),
        new THREE.Vector2(0.055, 0.48),
        new THREE.Vector2(0.042, 0.92),
        new THREE.Vector2(0.068, 0.95),
        new THREE.Vector2(0.068, 1.18),
        new THREE.Vector2(0.035, 1.18),
      ];
      return new THREE.LatheGeometry(barrelPts, 64);
    });
    const barrelMesh = new THREE.Mesh(barrelGeo, chromeMat);
    barrelMesh.rotation.z = -Math.PI / 2;
    barrelMesh.position.set(0.95, 0.08, 0);
    rifle.add(barrelMesh);

    const gasBlock = new THREE.Mesh(
      getCachedGeometry(
        'parafal_gasblock_v2',
        () => new RoundedBoxGeometry(0.16, 0.26, 0.12, 5, 0.02)
      ),
      gunmetalMat
    );
    gasBlock.position.set(1.42, 0.14, 0);
    rifle.add(gasBlock);

    // Curved 30-Round Tactical Magazine with Instanced Reinforcing Ribs
    const magGroup = new THREE.Group();
    magGroup.position.set(0.18, -0.44, 0);
    magGroup.rotation.z = 0.22;
    const magBody = new THREE.Mesh(
      getCachedGeometry(
        'parafal_mag_v2',
        () => new RoundedBoxGeometry(0.26, 0.68, 0.15, 6, 0.022)
      ),
      mainMat
    );
    magGroup.add(magBody);

    const ribGeo = getCachedGeometry(
      'parafal_mag_rib_v2',
      () => new RoundedBoxGeometry(0.28, 0.032, 0.165, 3, 0.008)
    );
    const ribInst = new THREE.InstancedMesh(ribGeo, gunmetalMat, 6);
    for (let r = 0; r < 6; r++) {
      dummy.position.set(0, -0.25 + r * 0.1, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      ribInst.setMatrixAt(r, dummy.matrix);
    }
    ribInst.instanceMatrix.needsUpdate = true;
    magGroup.add(ribInst);
    rifle.add(magGroup);

    // Ergonomic Sculpted Pistol Grip & Trigger Guard
    const grip = new THREE.Mesh(
      getCachedGeometry(
        'parafal_grip_v2',
        () => new RoundedBoxGeometry(0.21, 0.48, 0.15, 6, 0.035)
      ),
      walnutMat
    );
    grip.position.set(-0.42, -0.34, 0);
    grip.rotation.z = -0.32;
    rifle.add(grip);

    const triggerGuard = new THREE.Mesh(
      getCachedGeometry(
        'parafal_triggerguard_v2',
        () => new THREE.TorusGeometry(0.11, 0.02, 18, 36, Math.PI)
      ),
      gunmetalMat
    );
    triggerGuard.rotation.x = Math.PI;
    triggerGuard.position.set(-0.22, -0.18, 0);
    rifle.add(triggerGuard);

    // Precision Buttstock with Cheek Rest
    const stockBody = new THREE.Mesh(
      getCachedGeometry(
        'parafal_stock_v2',
        () => new RoundedBoxGeometry(0.84, 0.28, 0.17, 7, 0.038)
      ),
      skin.cost >= 300 ? mainMat : walnutMat
    );
    stockBody.position.set(-1.12, -0.02, 0);
    rifle.add(stockBody);

    const cheekRest = new THREE.Mesh(
      getCachedGeometry(
        'parafal_cheek_v2',
        () => new RoundedBoxGeometry(0.48, 0.09, 0.19, 5, 0.025)
      ),
      gunmetalMat
    );
    cheekRest.position.set(-1.08, 0.14, 0);
    rifle.add(cheekRest);

    // High-Poly Sniper Optic (64-segment Lathe)
    const scopeGroup = new THREE.Group();
    scopeGroup.position.set(-0.08, 0.36, 0);

    const scopeBodyGeo = getCachedGeometry('parafal_scope_lathe_v2', () => {
      const scopePts = [
        new THREE.Vector2(0.088, -0.42),
        new THREE.Vector2(0.085, -0.25),
        new THREE.Vector2(0.062, -0.18),
        new THREE.Vector2(0.062, 0.18),
        new THREE.Vector2(0.105, 0.28),
        new THREE.Vector2(0.108, 0.46),
      ];
      return new THREE.LatheGeometry(scopePts, 64);
    });
    const scopeBody = new THREE.Mesh(scopeBodyGeo, gunmetalMat);
    scopeBody.rotation.z = -Math.PI / 2;
    scopeGroup.add(scopeBody);

    const lensMat = new THREE.MeshPhysicalMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.78,
      clearcoat: 1.0,
      roughness: 0.08,
      metalness: 0.25,
    });
    const frontLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.02, 36),
      lensMat
    );
    frontLens.rotation.z = Math.PI / 2;
    frontLens.position.x = 0.45;
    scopeGroup.add(frontLens);

    for (const mountX of [-0.12, 0.12]) {
      const ringMount = new THREE.Mesh(
        new THREE.TorusGeometry(0.072, 0.022, 18, 36),
        mainMat
      );
      ringMount.rotation.y = Math.PI / 2;
      ringMount.position.x = mountX;
      scopeGroup.add(ringMount);
    }
    rifle.add(scopeGroup);

    // 8 High-Poly Orbiting 7.62mm Cartridges
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const cartridge = createHighPolyBulletCartridge(mainMat, chromeMat);
      cartridge.position.set(
        Math.cos(angle) * 0.98,
        0.52 + Math.sin(angle * 2) * 0.16,
        Math.sin(angle) * 0.58
      );
      cartridge.rotation.set(0.6 + i * 0.3, angle, 0.45);
      rifle.add(cartridge);
    }

    rifle.scale.setScalar(0.84);
    group.add(rifle);
    optimizeHierarchyForCulling(group);
    return group;
  }

  // =========================================================================
  // 2. PEDRA — HIGH-POLY VOLCANIC / COSMIC METEOR GEODE (~25,600 Triangles)
  // =========================================================================
  if (moveId === 'pedra') {
    const innerCoreGeo = getCachedGeometry(
      'pedra_inner_core_v2',
      () => new THREE.IcosahedronGeometry(0.56, 4)
    );
    group.add(new THREE.Mesh(innerCoreGeo, accentGlowMat));

    const rockGeo = getCachedGeometry('pedra_shell_v2', () =>
      displaceHighPolyRock(new THREE.IcosahedronGeometry(0.76, 5), 0.16, 3.4)
    );
    const rockMat = new THREE.MeshPhysicalMaterial({
      color: skin.cost > 0 ? primaryColor : new THREE.Color(0x3a3532),
      metalness: mat3d.metalness,
      roughness: Math.max(0.28, mat3d.roughness),
      bumpMap: woodBump,
      bumpScale: 0.04,
      clearcoat: mat3d.clearcoat ?? 0.5,
      iridescence: skin.cost > 0 ? 0.6 : 0.1,
    });

    for (const dir of [-1, 1]) {
      const rockHalf = new THREE.Mesh(rockGeo, rockMat);
      rockHalf.scale.set(0.92, 1.04, 0.78);
      rockHalf.position.set(dir * 0.14, dir * 0.04, 0);
      rockHalf.rotation.set(dir * 0.25, dir * 0.4, 0);
      group.add(rockHalf);
    }

    // Instanced Orbiting Asteroid Shards (14 high-poly shards in 1 draw call!)
    const shardGeo = getCachedGeometry('pedra_shard_v2', () =>
      displaceHighPolyRock(new THREE.DodecahedronGeometry(0.19, 2), 0.05, 4.5)
    );
    const shardInst = new THREE.InstancedMesh(shardGeo, mainMat, 14);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      dummy.position.set(
        Math.cos(a) * 1.25,
        Math.sin(a * 2) * 0.38,
        Math.sin(a) * 1.25
      );
      dummy.rotation.set(a, a * 0.7, i * 0.5);
      dummy.scale.setScalar(0.85 + (i % 3) * 0.18);
      dummy.updateMatrix();
      shardInst.setMatrixAt(i, dummy.matrix);
    }
    shardInst.instanceMatrix.needsUpdate = true;
    group.add(shardInst);

    const ring1 = new THREE.Mesh(
      getCachedGeometry(
        'pedra_ring1_v2',
        () => new THREE.TorusGeometry(1.18, 0.032, 28, 96)
      ),
      accentGlowMat
    );
    ring1.rotation.x = Math.PI / 2.3;
    group.add(ring1);

    const ring2 = new THREE.Mesh(
      getCachedGeometry(
        'pedra_ring2_v2',
        () => new THREE.TorusGeometry(1.34, 0.022, 24, 96)
      ),
      chromeMat
    );
    ring2.rotation.x = -Math.PI / 3.1;
    ring2.rotation.y = 0.5;
    group.add(ring2);

    optimizeHierarchyForCulling(group);
    return group;
  }

  // =========================================================================
  // 3. GELO INVERTIDO — HIGH-POLY CRYO-RUBY CRYSTAL CLUSTER (~24,200 Triangles)
  // =========================================================================
  if (moveId === 'gelo_invertido') {
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: primaryColor,
      metalness: 0.25,
      roughness: 0.1,
      transparent: true,
      opacity: 0.84,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      iridescence: 0.75,
      iridescenceIOR: 1.35,
      emissive: primaryColor,
      emissiveIntensity: 0.22,
    });

    const buildCrystalPrism = (radius: number, height: number, segs = 14) => {
      const pts: THREE.Vector2[] = [];
      const steps = 16;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const y = (t - 0.5) * height;
        const env =
          t < 0.2
            ? (t / 0.2) * radius * 0.85
            : t < 0.75
            ? radius * (0.85 + ((t - 0.2) / 0.55) * 0.15)
            : radius * (1 - (t - 0.75) / 0.25);
        pts.push(new THREE.Vector2(Math.max(0.002, env), y));
      }
      return new THREE.LatheGeometry(pts, segs);
    };

    const centerSpire = new THREE.Mesh(
      getCachedGeometry('gelo_center_spire_v2', () =>
        buildCrystalPrism(0.46, 2.15, 24)
      ),
      crystalMat
    );
    group.add(centerSpire);

    const innerRuneCore = new THREE.Mesh(
      getCachedGeometry(
        'gelo_inner_core_v2',
        () => new THREE.OctahedronGeometry(0.28, 4)
      ),
      accentGlowMat
    );
    group.add(innerRuneCore);

    // 16 Instanced Satellite Crystal Spires
    const satSpireGeo = getCachedGeometry('gelo_sat_spire_v2', () =>
      buildCrystalPrism(0.22, 1.35, 18)
    );
    const spireInst = new THREE.InstancedMesh(satSpireGeo, crystalMat, 16);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const ringRadius = i % 2 === 0 ? 0.56 : 0.76;
      dummy.position.set(
        Math.cos(a) * ringRadius,
        i % 2 === 0 ? -0.12 : 0.14,
        Math.sin(a) * ringRadius
      );
      dummy.rotation.set(Math.sin(a) * 0.52, a, Math.cos(a) * 0.52);
      dummy.scale.setScalar(0.75 + (i % 3) * 0.16);
      dummy.updateMatrix();
      spireInst.setMatrixAt(i, dummy.matrix);
    }
    spireInst.instanceMatrix.needsUpdate = true;
    group.add(spireInst);

    const emitterRing = new THREE.Mesh(
      getCachedGeometry(
        'gelo_emitter_ring_v2',
        () => new THREE.TorusGeometry(0.98, 0.055, 32, 96)
      ),
      gunmetalMat
    );
    emitterRing.rotation.x = Math.PI / 2;
    emitterRing.position.y = -0.35;
    group.add(emitterRing);

    const nodeGeo = getCachedGeometry(
      'gelo_emitter_node_v2',
      () => new RoundedBoxGeometry(0.16, 0.16, 0.16, 5, 0.025)
    );
    const nodeInst = new THREE.InstancedMesh(nodeGeo, accentGlowMat, 12);
    for (let n = 0; n < 12; n++) {
      const na = (n / 12) * Math.PI * 2;
      dummy.position.set(Math.cos(na) * 0.98, -0.35, Math.sin(na) * 0.98);
      dummy.rotation.set(0, -na, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      nodeInst.setMatrixAt(n, dummy.matrix);
    }
    nodeInst.instanceMatrix.needsUpdate = true;
    group.add(nodeInst);

    optimizeHierarchyForCulling(group);
    return group;
  }

  // =========================================================================
  // 4. TESOURA — HIGH-POLY MECHA-CHAMELEON CROSSED PLASMA KATANAS (~24,800 Tris)
  // =========================================================================
  if (moveId === 'tesoura') {
    const bladeExtrude = getCachedGeometry('tesoura_blade_v2', () => {
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(-0.07, -0.5);
      bladeShape.lineTo(0.06, -0.5);
      bladeShape.quadraticCurveTo(0.09, 0.45, 0.02, 1.38);
      bladeShape.lineTo(-0.05, 1.18);
      bladeShape.quadraticCurveTo(-0.08, 0.35, -0.07, -0.5);

      const ext = new THREE.ExtrudeGeometry(bladeShape, {
        depth: 0.028,
        bevelEnabled: true,
        bevelSegments: 8,
        steps: 4,
        bevelSize: 0.012,
        bevelThickness: 0.012,
        curveSegments: 48,
      });
      ext.center();
      return ext;
    });

    const wrapGeo = getCachedGeometry(
      'tesoura_wrap_v2',
      () => new THREE.TorusGeometry(0.075, 0.016, 16, 36)
    );

    for (const dir of [-1, 1]) {
      const swordGroup = new THREE.Group();

      const bladeMesh = new THREE.Mesh(bladeExtrude, mainMat);
      bladeMesh.position.y = 0.44;
      swordGroup.add(bladeMesh);

      const plasmaStrip = new THREE.Mesh(
        getCachedGeometry(
          'tesoura_plasma_v2',
          () => new RoundedBoxGeometry(0.032, 1.86, 0.048, 6, 0.01)
        ),
        accentGlowMat
      );
      plasmaStrip.position.set(dir * 0.068, 0.44, 0);
      swordGroup.add(plasmaStrip);

      const guard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.065, 48),
        gunmetalMat
      );
      guard.position.y = -0.52;
      swordGroup.add(guard);

      const guardRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.26, 0.024, 20, 48),
        accentGlowMat
      );
      guardRim.rotation.x = Math.PI / 2;
      guardRim.position.y = -0.52;
      swordGroup.add(guardRim);

      const hiltCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.078, 0.68, 36),
        walnutMat
      );
      hiltCore.position.y = -0.9;
      swordGroup.add(hiltCore);

      // Instanced Tsuka Hilt Diamond Wraps (9 rings in 1 draw call)
      const wrapInst = new THREE.InstancedMesh(wrapGeo, mainMat, 9);
      for (let w = 0; w < 9; w++) {
        dummy.position.set(0, -0.6 - w * 0.072, 0);
        dummy.rotation.set(Math.PI / 2 + 0.25, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        wrapInst.setMatrixAt(w, dummy.matrix);
      }
      wrapInst.instanceMatrix.needsUpdate = true;
      swordGroup.add(wrapInst);

      const pommel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.07, 0.12, 36),
        chromeMat
      );
      pommel.position.y = -1.26;
      swordGroup.add(pommel);

      swordGroup.rotation.z = dir * 0.54;
      swordGroup.position.z = dir * 0.065;
      group.add(swordGroup);
    }

    const gyroOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.22, 48),
      gunmetalMat
    );
    gyroOuter.rotation.x = Math.PI / 2;
    group.add(gyroOuter);

    const gyroCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 48, 36),
      accentGlowMat
    );
    group.add(gyroCore);

    optimizeHierarchyForCulling(group);
    return group;
  }

  // =========================================================================
  // 5. PAPEL — HIGH-POLY CURVED ARCANE GRIMOIRE SCROLL (~25,100 Triangles)
  // =========================================================================
  if (moveId === 'papel') {
    const sheetGeo = getCachedGeometry('papel_sheet_highpoly_v2', () => {
      const g = new THREE.PlaneGeometry(1.24, 1.62, 80, 96);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const waveZ =
          Math.sin(y * 2.6) * 0.11 + Math.cos(x * 3.1) * 0.035;
        pos.setZ(i, waveZ);
      }
      g.computeVertexNormals();
      return g;
    });

    const parchmentMat = new THREE.MeshPhysicalMaterial({
      color: skin.cost > 0 ? primaryColor : new THREE.Color(0xefe2c8),
      roughness: 0.45,
      metalness: skin.cost > 0 ? 0.35 : 0.08,
      clearcoat: 0.4,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(sheetGeo, parchmentMat));

    const finialGeo = getCachedGeometry('papel_finial_lathe_v2', () => {
      const finialPts = [
        new THREE.Vector2(0.11, 0),
        new THREE.Vector2(0.15, 0.05),
        new THREE.Vector2(0.08, 0.12),
        new THREE.Vector2(0.13, 0.18),
        new THREE.Vector2(0.01, 0.26),
      ];
      return new THREE.LatheGeometry(finialPts, 48);
    });

    for (const ySign of [-1, 1]) {
      const rollerGroup = new THREE.Group();
      rollerGroup.position.set(
        0,
        ySign * 0.81,
        Math.sin(ySign * 0.81 * 2.6) * 0.11
      );

      const rollerBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 1.48, 48),
        walnutMat
      );
      rollerBar.rotation.z = Math.PI / 2;
      rollerGroup.add(rollerBar);

      for (const xSign of [-1, 1]) {
        const finial = new THREE.Mesh(finialGeo, mainMat);
        finial.rotation.z = xSign > 0 ? -Math.PI / 2 : Math.PI / 2;
        finial.position.x = xSign * 0.74;
        rollerGroup.add(finial);
      }
      group.add(rollerGroup);
    }

    for (let s = -1; s <= 1; s++) {
      const seal = new THREE.Group();
      seal.position.set(s * 0.32, s * -0.28, 0.12);
      const waxDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.21, 0.05, 36),
        accentGlowMat
      );
      waxDisc.rotation.x = Math.PI / 2;
      seal.add(waxDisc);

      const waxRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.19, 0.025, 18, 36),
        mainMat
      );
      seal.add(waxRim);
      group.add(seal);
    }

    for (let c = 0; c < 4; c++) {
      const crane = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.14, 2),
        accentGlowMat
      );
      crane.add(body);
      for (const wDir of [-1, 1]) {
        const wing = new THREE.Mesh(
          new THREE.ConeGeometry(0.18, 0.42, 16),
          mainMat
        );
        wing.rotation.z = wDir * 1.25;
        wing.position.x = wDir * 0.18;
        crane.add(wing);
      }
      const angle = (c / 4) * Math.PI * 2 + 0.5;
      crane.position.set(
        Math.cos(angle) * 0.98,
        Math.sin(angle * 2) * 0.42,
        0.38
      );
      crane.rotation.set(0.3, angle * 0.5, 0.4);
      group.add(crane);
    }

    optimizeHierarchyForCulling(group);
    return group;
  }

  // =========================================================================
  // 6. JEGUE — HIGH-POLY SCULPTED "DOM JEGUE" SALOON BOSS BUST (~25,400 Tris)
  // =========================================================================
  const bust = new THREE.Group();

  const shoulders = new THREE.Mesh(getSculptedTorsoGeometry(), gunmetalMat);
  shoulders.scale.set(0.95, 0.52, 0.85);
  shoulders.position.set(0, -0.68, -0.05);
  bust.add(shoulders);

  const goldenTie = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.48, 28),
    accentGlowMat
  );
  goldenTie.rotation.x = Math.PI;
  goldenTie.position.set(0, -0.52, 0.38);
  bust.add(goldenTie);

  const cranium = new THREE.Mesh(
    getSculptedHeadGeometry('dom_jegue'),
    mainMat
  );
  cranium.position.set(0, 0.08, -0.04);
  bust.add(cranium);

  const snoutBridge = new THREE.Mesh(
    getSculptedMuzzleGeometry('dom_jegue'),
    mainMat
  );
  snoutBridge.position.set(0, -0.06, 0.42);
  snoutBridge.rotation.x = 0.08;
  bust.add(snoutBridge);

  // Saloon Boss Cigar with Glowing Red Ember
  const cigarGroup = new THREE.Group();
  cigarGroup.position.set(0.18, -0.18, 0.72);
  cigarGroup.rotation.set(0.15, 0.35, 0);
  const cigarBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.045, 0.38, 28),
    walnutMat
  );
  cigarBody.rotation.x = Math.PI / 2;
  cigarGroup.add(cigarBody);

  const cigarEmber = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0xff3b00,
      emissive: 0xff2200,
      emissiveIntensity: 0.65,
    })
  );
  cigarEmber.position.z = 0.19;
  cigarGroup.add(cigarEmber);
  bust.add(cigarGroup);

  // Glowing Eyes & Sculpted Curved Donkey Ears
  for (const dir of [-1, 1]) {
    const eyeSocket = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 28, 24),
      gunmetalMat
    );
    eyeSocket.position.set(dir * 0.21, 0.12, 0.36);
    bust.add(eyeSocket);

    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.076, 28, 24),
      accentGlowMat
    );
    pupil.position.set(dir * 0.22, 0.12, 0.4);
    bust.add(pupil);

    const earCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dir * 0.24, 0.38, -0.05),
      new THREE.Vector3(dir * 0.38, 0.76, -0.08),
      new THREE.Vector3(dir * 0.44, 1.12, 0.02),
    ]);
    const earGeo = new THREE.TubeGeometry(earCurve, 32, 0.11, 24, false);
    const earOuter = new THREE.Mesh(earGeo, mainMat);
    earOuter.scale.set(1, 1, 0.58);
    bust.add(earOuter);
  }

  // 8-Peak Royal Saloon Crown with Instanced Spikes & Faceted Gemstones
  const crownGroup = new THREE.Group();
  crownGroup.position.set(0, 0.52, 0);
  const crownBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.32, 0.22, 48),
    accentGlowMat
  );
  crownGroup.add(crownBand);

  const spikeGeo = getCachedGeometry(
    'jegue_crown_spike_v2',
    () => new THREE.ConeGeometry(0.075, 0.24, 18)
  );
  const gemGeo = getCachedGeometry(
    'jegue_crown_gem_v2',
    () => new THREE.OctahedronGeometry(0.052, 1)
  );
  const spikeInst = new THREE.InstancedMesh(spikeGeo, accentGlowMat, 8);
  const gemInst = new THREE.InstancedMesh(gemGeo, chromeMat, 8);

  for (let p = 0; p < 8; p++) {
    const pa = (p / 8) * Math.PI * 2;
    dummy.position.set(Math.cos(pa) * 0.33, 0.2, Math.sin(pa) * 0.33);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    spikeInst.setMatrixAt(p, dummy.matrix);

    dummy.position.set(Math.cos(pa) * 0.35, 0.02, Math.sin(pa) * 0.35);
    dummy.updateMatrix();
    gemInst.setMatrixAt(p, dummy.matrix);
  }
  spikeInst.instanceMatrix.needsUpdate = true;
  gemInst.instanceMatrix.needsUpdate = true;
  crownGroup.add(spikeInst);
  crownGroup.add(gemInst);
  bust.add(crownGroup);

  const horseshoeHalo = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.11, 36, 96, Math.PI * 1.48),
    accentGlowMat
  );
  horseshoeHalo.rotation.z = Math.PI * 0.76;
  horseshoeHalo.position.set(0, 0.02, -0.32);
  bust.add(horseshoeHalo);

  group.add(bust);
  optimizeHierarchyForCulling(group);
  return group;
}

// ============================================================================
// HIGH-POLY 6-SHOT SALOON REVOLVER PROP (~6,400 Triangles + Instanced Chambers)
// ============================================================================
export function buildSaloonGunProp(
  gunSkinId: CharacterGunSkinId = 'aco_azulado',
  detail: DetailTier3D = 'studio'
): THREE.Group {
  const gun = new THREE.Group();
  const woodBump = getSaloonBumpTexture();
  const hexBump = getMechaHexScaleTexture();
  const gunTheme =
    CHARACTER_GUN_SKINS.find((g) => g.id === gunSkinId) ??
    CHARACTER_GUN_SKINS[0];
  const isPlasma = gunSkinId === 'cyber_plasma';
  const useStd = detail === 'match';

  const bluedSteelMat = useStd
    ? new THREE.MeshStandardMaterial({
        color: gunTheme.steelHex,
        metalness: 0.85,
        roughness: 0.25,
      })
    : new THREE.MeshPhysicalMaterial({
        color: gunTheme.steelHex,
        metalness: 0.9,
        roughness: 0.22,
        bumpMap: isPlasma ? hexBump : undefined,
        bumpScale: 0.01,
        clearcoat: 0.65,
      });

  const brassGoldMat = useStd
    ? new THREE.MeshStandardMaterial({
        color: gunTheme.cylHex,
        metalness: 0.9,
        roughness: 0.22,
        emissive: isPlasma ? new THREE.Color(0x06b6d4) : new THREE.Color(0x000000),
        emissiveIntensity: isPlasma ? 0.35 : 0,
      })
    : new THREE.MeshPhysicalMaterial({
        color: gunTheme.cylHex,
        metalness: 0.94,
        roughness: 0.18,
        clearcoat: 0.85,
        emissive: isPlasma ? new THREE.Color(0x06b6d4) : new THREE.Color(0x000000),
        emissiveIntensity: isPlasma ? 0.35 : 0,
      });

  const darkHoleMat = new THREE.MeshBasicMaterial({ color: 0x050507 });

  const walnutGripMat = useStd
    ? new THREE.MeshStandardMaterial({
        color: gunTheme.gripHex,
        roughness: isPlasma ? 0.3 : 0.54,
        metalness: isPlasma ? 0.6 : 0.1,
      })
    : new THREE.MeshPhysicalMaterial({
        color: gunTheme.gripHex,
        roughness: isPlasma ? 0.28 : 0.52,
        metalness: isPlasma ? 0.65 : 0.1,
        bumpMap: isPlasma ? hexBump : woodBump,
        bumpScale: 0.024,
        clearcoat: 0.35,
      });

  // High-Poly Turned Barrel with Muzzle Crown (48-segment LatheGeometry)
  const barrelGeo = getCachedGeometry('revolver_barrel_lathe_v2', () => {
    const barrelPts = [
      new THREE.Vector2(0.072, 0),
      new THREE.Vector2(0.068, 0.25),
      new THREE.Vector2(0.064, 0.86),
      new THREE.Vector2(0.07, 0.9),
      new THREE.Vector2(0.068, 0.94),
      new THREE.Vector2(0.038, 0.94),
      new THREE.Vector2(0.036, 0.78),
    ];
    return new THREE.LatheGeometry(barrelPts, 48);
  });
  const barrel = new THREE.Mesh(barrelGeo, bluedSteelMat);
  barrel.rotation.z = -Math.PI / 2;
  barrel.position.set(0.08, 0.09, 0);
  gun.add(barrel);

  // Ventilated Top Rib & Instanced Cooling Slots
  const topRib = new THREE.Mesh(
    getCachedGeometry(
      'revolver_top_rib_v2',
      () => new RoundedBoxGeometry(0.9, 0.036, 0.054, 4, 0.008)
    ),
    bluedSteelMat
  );
  topRib.position.set(0.52, 0.16, 0);
  gun.add(topRib);

  const dummy = new THREE.Object3D();
  const slotGeo = getCachedGeometry(
    'revolver_rib_slot_v2',
    () => new RoundedBoxGeometry(0.07, 0.02, 0.06, 2, 0.004)
  );
  const slotInst = new THREE.InstancedMesh(slotGeo, brassGoldMat, 6);
  for (let s = 0; s < 6; s++) {
    dummy.position.set(0.2 + s * 0.125, 0.16, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    slotInst.setMatrixAt(s, dummy.matrix);
  }
  slotInst.instanceMatrix.needsUpdate = true;
  gun.add(slotInst);

  const frontSight = new THREE.Mesh(
    getCachedGeometry(
      'revolver_front_sight_v2',
      () => new RoundedBoxGeometry(0.085, 0.07, 0.022, 3, 0.006)
    ),
    brassGoldMat
  );
  frontSight.position.set(0.92, 0.19, 0);
  gun.add(frontSight);

  // Under-barrel Full-Length Ejector Shroud
  const ejectorRod = new THREE.Mesh(
    getCachedGeometry(
      'revolver_ejector_v2',
      () => new THREE.CylinderGeometry(0.038, 0.034, 0.82, 32)
    ),
    bluedSteelMat
  );
  ejectorRod.rotation.z = Math.PI / 2;
  ejectorRod.position.set(0.48, 0.018, 0);
  gun.add(ejectorRod);

  // Sculpted Revolver Frame & Recoil Shield
  const frame = new THREE.Mesh(
    getCachedGeometry(
      'revolver_frame_v2',
      () => new RoundedBoxGeometry(0.54, 0.25, 0.16, 6, 0.034)
    ),
    bluedSteelMat
  );
  frame.position.set(-0.12, 0.04, 0);
  gun.add(frame);

  const recoilSphere = new THREE.Mesh(
    getCachedGeometry(
      'revolver_recoil_v2',
      () => new THREE.SphereGeometry(0.115, 28, 24)
    ),
    bluedSteelMat
  );
  recoilSphere.position.set(-0.26, 0.09, 0);
  gun.add(recoilSphere);

  // Fluted 6-Chamber Cylinder with Instanced Chambers & Brass Cartridge Primers
  const cylGroup = new THREE.Group();
  cylGroup.position.set(-0.06, 0.06, 0);
  const mainCyl = new THREE.Mesh(
    getCachedGeometry(
      'revolver_main_cyl_v2',
      () => new THREE.CylinderGeometry(0.142, 0.142, 0.29, 48)
    ),
    brassGoldMat
  );
  mainCyl.rotation.z = Math.PI / 2;
  cylGroup.add(mainCyl);

  const chamberGeo = getCachedGeometry(
    'revolver_chamber_hole_v2',
    () => new THREE.CylinderGeometry(0.034, 0.034, 0.3, 20)
  );
  const fluteGeo = getCachedGeometry(
    'revolver_flute_v2',
    () => new THREE.CylinderGeometry(0.022, 0.022, 0.22, 16)
  );
  const chamberInst = new THREE.InstancedMesh(chamberGeo, darkHoleMat, 6);
  const fluteInst = new THREE.InstancedMesh(fluteGeo, bluedSteelMat, 6);

  for (let c = 0; c < 6; c++) {
    const ca = (c / 6) * Math.PI * 2;
    dummy.position.set(0, Math.cos(ca) * 0.085, Math.sin(ca) * 0.085);
    dummy.rotation.set(0, 0, Math.PI / 2);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    chamberInst.setMatrixAt(c, dummy.matrix);

    const fa = ca + Math.PI / 6;
    dummy.position.set(0, Math.cos(fa) * 0.138, Math.sin(fa) * 0.138);
    dummy.updateMatrix();
    fluteInst.setMatrixAt(c, dummy.matrix);
  }
  chamberInst.instanceMatrix.needsUpdate = true;
  fluteInst.instanceMatrix.needsUpdate = true;
  cylGroup.add(chamberInst);
  cylGroup.add(fluteInst);
  gun.add(cylGroup);

  // Hammer Spur, Trigger & Trigger Guard
  const hammer = new THREE.Mesh(
    getCachedGeometry(
      'revolver_hammer_v2',
      () => new RoundedBoxGeometry(0.15, 0.17, 0.042, 4, 0.012)
    ),
    brassGoldMat
  );
  hammer.position.set(-0.36, 0.18, 0);
  hammer.rotation.z = 0.45;
  gun.add(hammer);

  const triggerGuard = new THREE.Mesh(
    getCachedGeometry(
      'revolver_triggerguard_v2',
      () => new THREE.TorusGeometry(0.11, 0.02, 16, 36, Math.PI * 1.18)
    ),
    brassGoldMat
  );
  triggerGuard.rotation.x = Math.PI;
  triggerGuard.position.set(-0.14, -0.09, 0);
  gun.add(triggerGuard);

  const trigger = new THREE.Mesh(
    getCachedGeometry(
      'revolver_trigger_v2',
      () => new THREE.ConeGeometry(0.024, 0.11, 16)
    ),
    bluedSteelMat
  );
  trigger.position.set(-0.14, -0.07, 0);
  trigger.rotation.z = -0.35;
  gun.add(trigger);

  // Sculpted Ergonomic Grip with Finger Grooves & Gold Medallions
  const grip = new THREE.Mesh(
    getCachedGeometry(
      'revolver_grip_v2',
      () => new RoundedBoxGeometry(0.24, 0.5, 0.155, 8, 0.055)
    ),
    walnutGripMat
  );
  grip.position.set(-0.43, -0.19, 0);
  grip.rotation.z = -0.48;
  gun.add(grip);

  const medallion = new THREE.Mesh(
    getCachedGeometry(
      'revolver_medallion_v2',
      () => new THREE.CylinderGeometry(0.048, 0.048, 0.165, 24)
    ),
    brassGoldMat
  );
  medallion.rotation.x = Math.PI / 2;
  medallion.position.set(-0.42, -0.17, 0);
  gun.add(medallion);

  optimizeHierarchyForCulling(gun);
  return gun;
}

/**
 * Builds a single-pass Saloon Whiskey Tumbler Glass with Amber Liquid & Ice Cubes.
 */
export function buildWhiskeyGlassProp(): THREE.Group {
  const glassGroup = new THREE.Group();

  const crystalGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    roughness: 0.08,
    metalness: 0.18,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });

  const whiskeyMat = new THREE.MeshPhysicalMaterial({
    color: 0xb45309,
    roughness: 0.14,
    metalness: 0.1,
    clearcoat: 0.8,
    transparent: true,
    opacity: 0.82,
  });

  const tumbler = new THREE.Mesh(
    getCachedGeometry(
      'whiskey_tumbler_v2',
      () => new THREE.CylinderGeometry(0.22, 0.18, 0.42, 32)
    ),
    crystalGlassMat
  );
  tumbler.position.y = 0.21;
  tumbler.renderOrder = 2;
  glassGroup.add(tumbler);

  const liquid = new THREE.Mesh(
    getCachedGeometry(
      'whiskey_liquid_v2',
      () => new THREE.CylinderGeometry(0.19, 0.165, 0.22, 32)
    ),
    whiskeyMat
  );
  liquid.position.y = 0.14;
  liquid.renderOrder = 1;
  glassGroup.add(liquid);

  const iceGeo = getCachedGeometry(
    'whiskey_ice_v2',
    () => new RoundedBoxGeometry(0.1, 0.1, 0.1, 3, 0.022)
  );
  for (let i = 0; i < 2; i++) {
    const ice = new THREE.Mesh(iceGeo, crystalGlassMat);
    ice.position.set(i === 0 ? -0.04 : 0.05, 0.22, i === 0 ? 0.03 : -0.03);
    ice.rotation.set(0.3 * i, 0.6, 0.25);
    glassGroup.add(ice);
  }

  optimizeHierarchyForCulling(glassGroup);
  return glassGroup;
}

// ============================================================================
// HIGH-POLY ~25,000-POLYGON SCULPTED SEATED CHARACTER 3D
// ============================================================================
export function buildSeatedCharacter3D(options: {
  accentHex: string;
  isAlly: boolean;
  variantIndex: number;
  customization?: Partial<CharacterCustomization> | null;
  detail?: DetailTier3D;
}): SeatedCharacterRig {
  const detail: DetailTier3D = options.detail ?? 'studio';
  const isMatchLod = detail === 'match';
  const root = new THREE.Group();
  const custom = resolveCharacterCustomization(
    options.customization,
    options.variantIndex
  );

  const archMeta =
    CHARACTER_ARCHETYPES.find((a) => a.id === custom.archetypeId) ??
    CHARACTER_ARCHETYPES[0];
  const outfitMeta =
    CHARACTER_OUTFITS.find((o) => o.id === custom.outfitId) ??
    CHARACTER_OUTFITS[0];

  const hexBump = getMechaHexScaleTexture();
  const furBump = getAnimalFurBumpTexture();
  const woodBump = getSaloonBumpTexture();
  const isCyber = Boolean(archMeta.isCyber);
  const isJegue = custom.archetypeId === 'dom_jegue';

  // Realistic Liar\\\'s Bar Fur / Skin PBR Shader with anisotropic directional fur sheen
  const skinMat = isMatchLod
    ? new THREE.MeshStandardMaterial({
        color: archMeta.skinColorHex,
        roughness: isCyber ? 0.28 : 0.65,
        metalness: isCyber ? 0.72 : 0.05,
        bumpMap: isCyber ? hexBump : furBump,
        bumpScale: isCyber ? 0.015 : 0.012,
      })
    : new THREE.MeshPhysicalMaterial({
        color: archMeta.skinColorHex,
        roughness: isCyber ? 0.26 : 0.64,
        metalness: isCyber ? 0.74 : 0.04,
        bumpMap: isCyber ? hexBump : furBump,
        bumpScale: isCyber ? 0.022 : 0.024,
        sheen: isCyber ? 0.0 : 0.85,
        sheenRoughness: 0.35,
        sheenColor: new THREE.Color(archMeta.skinColorHex).lerp(
          new THREE.Color('#ffffff'),
          0.25
        ),
        clearcoat: isCyber ? 0.72 : 0.12,
        clearcoatRoughness: 0.25,
      });

  // Authentic Muzzle Material (Bicolor mealy #d8cebc for dom_jegue)
  const muzzleColor = isJegue
    ? new THREE.Color('#d8cebc')
    : new THREE.Color(archMeta.skinColorHex).multiplyScalar(1.12);

  const muzzleMat = isMatchLod
    ? new THREE.MeshStandardMaterial({
        color: muzzleColor,
        roughness: isCyber ? 0.26 : 0.54,
        metalness: isCyber ? 0.72 : 0.05,
      })
    : new THREE.MeshPhysicalMaterial({
        color: muzzleColor,
        roughness: isCyber ? 0.24 : 0.52,
        metalness: isCyber ? 0.76 : 0.05,
        sheen: isCyber ? 0 : 0.6,
        sheenRoughness: 0.4,
        clearcoat: 0.22,
      });

  const vestMat = isMatchLod
    ? new THREE.MeshStandardMaterial({
        color: outfitMeta.vestHex,
        roughness: 0.48,
        metalness: 0.24,
      })
    : new THREE.MeshPhysicalMaterial({
        color: outfitMeta.vestHex,
        roughness: 0.44,
        metalness: 0.26,
        bumpMap: woodBump,
        bumpScale: 0.01,
        sheen: 0.55,
        sheenRoughness: 0.38,
        sheenColor: new THREE.Color(outfitMeta.vestHex).lerp(
          new THREE.Color('#ffffff'),
          0.2
        ),
        clearcoat: 0.32,
      });

  const coatLapelMat = isMatchLod
    ? new THREE.MeshStandardMaterial({
        color: new THREE.Color(outfitMeta.vestHex).multiplyScalar(0.75),
        roughness: 0.42,
        metalness: 0.28,
      })
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(outfitMeta.vestHex).multiplyScalar(0.75),
        roughness: 0.38,
        metalness: 0.32,
        sheen: 0.65,
        sheenRoughness: 0.35,
        clearcoat: 0.45,
      });

  const coatLiningMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(outfitMeta.vestHex).multiplyScalar(1.35),
    roughness: 0.35,
    metalness: 0.22,
    clearcoat: 0.4,
  });

  const shirtMat = new THREE.MeshStandardMaterial({
    color: outfitMeta.shirtHex,
    roughness: 0.65,
    metalness: 0.05,
  });

  const trimColor = new THREE.Color(outfitMeta.trimHex || options.accentHex);
  const goldTrimMat = isMatchLod
    ? new THREE.MeshStandardMaterial({
        color: trimColor,
        metalness: 0.85,
        roughness: 0.24,
        emissive: trimColor,
        emissiveIntensity: 0.12,
      })
    : new THREE.MeshPhysicalMaterial({
        color: trimColor,
        metalness: 0.92,
        roughness: 0.18,
        clearcoat: 0.85,
        emissive: trimColor,
        emissiveIntensity: 0.15,
      });

  const darkMetalMat = isMatchLod
    ? new THREE.MeshStandardMaterial({
        color: 0x18181b,
        metalness: 0.82,
        roughness: 0.28,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0x18181b,
        metalness: 0.88,
        roughness: 0.24,
        clearcoat: 0.6,
      });

  const teethMat = new THREE.MeshPhysicalMaterial({
    color: 0xfaf5eb,
    roughness: 0.25,
    metalness: 0.05,
    clearcoat: 0.8,
  });

  const dummy = new THREE.Object3D();

  // --- KINEMATIC HIERARCHY ROOT & CARVED SALOON CHAIR ---
  const chairGroup = new THREE.Group();
  chairGroup.position.set(0, 0.72, -0.46);
  const chairWoodMat = new THREE.MeshStandardMaterial({
    color: 0x2e1309,
    roughness: 0.52,
    metalness: 0.14,
  });
  const chairLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x1a0b07,
    roughness: 0.62,
    metalness: 0.08,
  });

  const backrestPad = new THREE.Mesh(
    getCachedGeometry(
      'saloon_chair_back_v2',
      () => new RoundedBoxGeometry(1.18, 1.48, 0.14, 4, 0.04)
    ),
    chairLeatherMat
  );
  backrestPad.position.set(0, 0.24, 0);
  chairGroup.add(backrestPad);

  const topCrestRail = new THREE.Mesh(
    getCachedGeometry(
      'saloon_chair_crest_v2',
      () => new RoundedBoxGeometry(1.32, 0.16, 0.18, 4, 0.04)
    ),
    chairWoodMat
  );
  topCrestRail.position.set(0, 1.0, 0.01);
  chairGroup.add(topCrestRail);

  const postGeo = getCachedGeometry(
    'saloon_chair_post_v2',
    () => new THREE.CylinderGeometry(0.068, 0.075, 1.78, 16)
  );
  const finialCapGeo = getCachedGeometry(
    'saloon_chair_finial_v2',
    () => new THREE.SphereGeometry(0.095, 16, 14)
  );

  for (const dir of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, chairWoodMat);
    post.position.set(dir * 0.62, 0.18, 0.02);
    chairGroup.add(post);

    const finial = new THREE.Mesh(finialCapGeo, goldTrimMat);
    finial.position.set(dir * 0.62, 1.12, 0.02);
    chairGroup.add(finial);
  }
  root.add(chairGroup);

  // --- ARTICULATED SPINE & CHEST HIERARCHY ---
  const spineBaseGroup = new THREE.Group();
  root.add(spineBaseGroup);

  const chestGroup = new THREE.Group();
  chestGroup.position.set(0, 0.74, -0.02);
  spineBaseGroup.add(chestGroup);

  // Sculpted Torso
  const torsoMesh = new THREE.Mesh(getSculptedTorsoGeometry(detail), vestMat);
  chestGroup.add(torsoMesh);

  // Stand-up noble collar with contrasting lining
  const standUpCollarOuter = new THREE.Mesh(
    getCachedGeometry('char_standup_collar_outer_v3', () =>
      new THREE.CylinderGeometry(0.32, 0.35, 0.26, 36, 1, true, 0, Math.PI * 1.6)
    ),
    coatLapelMat
  );
  standUpCollarOuter.rotation.y = -Math.PI * 0.8;
  standUpCollarOuter.position.set(0, 0.62, 0.02);
  chestGroup.add(standUpCollarOuter);

  const standUpCollarInner = new THREE.Mesh(
    getCachedGeometry('char_standup_collar_inner_v3', () =>
      new THREE.CylinderGeometry(0.31, 0.34, 0.25, 36, 1, true, 0, Math.PI * 1.6)
    ),
    coatLiningMat
  );
  standUpCollarInner.rotation.y = -Math.PI * 0.8;
  standUpCollarInner.position.set(0, 0.62, 0.02);
  chestGroup.add(standUpCollarInner);

  // Shirt Placket & Tailored Lapels with Gold Trim
  const shirtPlacket = new THREE.Mesh(
    getCachedGeometry(
      'char_shirt_placket_v2',
      () => new THREE.CylinderGeometry(0.26, 0.04, 0.68, 28)
    ),
    shirtMat
  );
  shirtPlacket.scale.set(1, 1, 0.35);
  shirtPlacket.position.set(0, 0.32, 0.42);
  chestGroup.add(shirtPlacket);

  const lapelGeo = getCachedGeometry(
    'char_lapel_v2',
    () => new RoundedBoxGeometry(0.14, 0.66, 0.08, 4, 0.025)
  );
  const lapelTrimGeo = getCachedGeometry(
    'char_lapel_trim_v3',
    () => new RoundedBoxGeometry(0.025, 0.68, 0.082, 3, 0.01)
  );
  for (const dir of [-1, 1]) {
    const lapel = new THREE.Mesh(lapelGeo, coatLapelMat);
    lapel.position.set(dir * 0.18, 0.30, 0.44);
    lapel.rotation.z = dir * 0.24;
    lapel.rotation.y = dir * 0.2;
    chestGroup.add(lapel);

    const lTrim = new THREE.Mesh(lapelTrimGeo, goldTrimMat);
    lTrim.position.set(dir * 0.24, 0.30, 0.45);
    lTrim.rotation.z = dir * 0.24;
    lTrim.rotation.y = dir * 0.2;
    chestGroup.add(lTrim);
  }

  // Sculpted Epaulets (Shoulder Pads with Gold Fringe)
  const epauletGeo = getCachedGeometry(
    'char_epaulet_v3',
    () => new RoundedBoxGeometry(0.34, 0.08, 0.28, 4, 0.03)
  );
  for (const dir of [-1, 1]) {
    const epaulet = new THREE.Mesh(epauletGeo, goldTrimMat);
    epaulet.position.set(dir * 0.62, 0.44, 0.02);
    epaulet.rotation.z = -dir * 0.16;
    chestGroup.add(epaulet);
  }

  // Silk Tie with Sculpted Knot
  const tieKnot = new THREE.Mesh(
    getCachedGeometry('char_tie_knot_v2', () => new THREE.OctahedronGeometry(0.068, 2)),
    goldTrimMat
  );
  tieKnot.position.set(0, 0.50, 0.48);
  chestGroup.add(tieKnot);

  const tieBlade = new THREE.Mesh(
    getCachedGeometry(
      'char_tie_blade_v2',
      () => new RoundedBoxGeometry(0.11, 0.52, 0.045, 4, 0.015)
    ),
    goldTrimMat
  );
  tieBlade.position.set(0, 0.22, 0.49);
  chestGroup.add(tieBlade);

  // Instanced Brass Buttons (8 buttons in 1 draw call)
  const btnGeo = getCachedGeometry(
    'char_waistcoat_btn_v2',
    () => new THREE.SphereGeometry(0.032, 18, 14)
  );
  const btnInst = new THREE.InstancedMesh(btnGeo, goldTrimMat, 8);
  for (let b = 0; b < 4; b++) {
    for (let col = 0; col < 2; col++) {
      const idx = b * 2 + col;
      const side = col === 0 ? -1 : 1;
      dummy.position.set(side * 0.13, -0.08 - b * 0.14, 0.49 - b * 0.015);
      dummy.scale.set(1, 1, 0.6);
      dummy.updateMatrix();
      btnInst.setMatrixAt(idx, dummy.matrix);
    }
  }
  btnInst.instanceMatrix.needsUpdate = true;
  chestGroup.add(btnInst);

  // Catenary Pocket Watch Chain
  const chainGeo = getCachedGeometry('char_pocket_chain_v3', () => {
    const pts: THREE.Vector3[] = [];
    for (let p = 0; p <= 16; p++) {
      const t = p / 16;
      const px = -0.16 + t * 0.32;
      const py = -0.22 - Math.sin(t * Math.PI) * 0.12;
      const pz = 0.50 - Math.sin(t * Math.PI) * 0.03;
      pts.push(new THREE.Vector3(px, py, pz));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 18, 0.012, 10, false);
  });
  const pocketChain = new THREE.Mesh(chainGeo, goldTrimMat);
  chestGroup.add(pocketChain);

  // --- NECK & HEAD GROUP ---
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0.66, 0.04);
  chestGroup.add(neckGroup);

  const neckMesh = new THREE.Mesh(
    getCachedGeometry(
      'char_neck_v2',
      () => new THREE.CylinderGeometry(0.24, 0.29, 0.42, 36)
    ),
    skinMat
  );
  neckMesh.position.set(0, 0.06, 0);
  neckGroup.add(neckMesh);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.34, 0.04);
  neckGroup.add(headGroup);

  // Cranium
  const cranium = new THREE.Mesh(
    getSculptedHeadGeometry(custom.archetypeId, detail),
    skinMat
  );
  headGroup.add(cranium);

  // Supraorbital brow ridge sculpted in high relief
  const browGeo = getCachedGeometry(
    'char_brow_ridge_v3',
    () => new RoundedBoxGeometry(0.56, 0.11, 0.22, 5, 0.04)
  );
  const browMesh = new THREE.Mesh(browGeo, skinMat);
  browMesh.position.set(0, 0.16, 0.38);
  browMesh.scale.set(1, 0.75, 1);
  headGroup.add(browMesh);

  // Expressive 3D Eyebrows
  const eyebrowGeo = getCachedGeometry(
    'char_eyebrow_v3',
    () => new RoundedBoxGeometry(0.20, 0.042, 0.06, 4, 0.018)
  );
  for (const dir of [-1, 1]) {
    const eb = new THREE.Mesh(eyebrowGeo, darkMetalMat);
    eb.position.set(dir * 0.19, 0.19, 0.46);
    eb.rotation.z = dir * (isJegue ? -0.15 : 0.08);
    headGroup.add(eb);
  }

  // Volumetric Cheek Tufts (furry Liar\\\'s Bar jowls)
  const cheekTuftGeo = getCachedGeometry(
    'char_cheek_tuft_v3',
    () => new THREE.ConeGeometry(0.12, 0.28, 14)
  );
  for (const dir of [-1, 1]) {
    const tuft = new THREE.Mesh(cheekTuftGeo, skinMat);
    tuft.position.set(dir * 0.42, -0.06, 0.16);
    tuft.rotation.z = dir * 1.35;
    tuft.rotation.y = dir * 0.4;
    headGroup.add(tuft);
  }

  // Muzzle
  const muzzle = new THREE.Mesh(
    getSculptedMuzzleGeometry(custom.archetypeId, detail),
    muzzleMat
  );
  muzzle.position.set(0, -0.11, 0.38);
  muzzle.rotation.x = 0.06;
  headGroup.add(muzzle);

  // Dilated Nostrils & Nose Tip
  const noseTip = new THREE.Mesh(
    getCachedGeometry(
      'char_nose_tip_v2',
      () => new THREE.SphereGeometry(0.078, 24, 20)
    ),
    darkMetalMat
  );
  noseTip.scale.set(1.25, 0.82, 0.75);
  noseTip.position.set(0, -0.02, 0.68);
  headGroup.add(noseTip);

  const nostrilGeo = getCachedGeometry(
    'char_nostril_v3',
    () => new THREE.SphereGeometry(0.028, 14, 12)
  );
  for (const dir of [-1, 1]) {
    const nostril = new THREE.Mesh(nostrilGeo, darkMetalMat);
    nostril.position.set(dir * 0.065, -0.04, 0.67);
    nostril.scale.set(1, 0.6, 1.2);
    headGroup.add(nostril);
  }

  // Lower Jaw with Sculpted Chin
  const lowerJaw = new THREE.Mesh(
    getCachedGeometry(
      'char_lower_jaw_v2',
      () => new THREE.SphereGeometry(0.21, 32, 24)
    ),
    skinMat
  );
  lowerJaw.scale.set(0.95, 0.55, 1.32);
  lowerJaw.position.set(0, -0.25, 0.32);
  headGroup.add(lowerJaw);

  // Visible Teeth / Fangs (Bluffing grimace authentic to Liar\\\'s Bar)
  const toothGeo = getCachedGeometry(
    'char_tooth_v3',
    () => new THREE.ConeGeometry(0.022, 0.075, 12)
  );
  for (const dir of [-1, 1]) {
    const t = new THREE.Mesh(toothGeo, teethMat);
    t.position.set(dir * (isJegue ? 0.055 : 0.095), -0.18, 0.58);
    t.rotation.x = Math.PI - 0.2;
    headGroup.add(t);
  }

  // Realistic Eyes with Iris Ring, Specular Sclera & Eyelid Blink
  const eyeBallGeo = getCachedGeometry(
    'char_eyeball_v2',
    () => new THREE.SphereGeometry(0.078, 28, 24)
  );
  const irisGeo = getCachedGeometry(
    'char_iris_v3',
    () => new THREE.CylinderGeometry(0.048, 0.048, 0.015, 24)
  );
  const pupilGeo = getCachedGeometry(
    'char_pupil_v2',
    () => new THREE.SphereGeometry(0.032, 20, 16)
  );
  const eyelidGeo = getCachedGeometry(
    'char_eyelid_v2',
    () => new THREE.SphereGeometry(0.086, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52)
  );

  const isFlameEyes = custom.eyewearId === 'olhos_chama';
  const irisColor = isFlameEyes
    ? new THREE.Color(0xef4444)
    : isCyber
    ? new THREE.Color(0x06b6d4)
    : isJegue
    ? new THREE.Color(0xd97706)
    : new THREE.Color(archMeta.accentHex);

  const scleraMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.08,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });

  const irisMat = new THREE.MeshPhysicalMaterial({
    color: irisColor,
    emissive: irisColor,
    emissiveIntensity: 0.28,
    roughness: 0.2,
    metalness: 0.1,
    clearcoat: 0.8,
  });

  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

  const createEyeController = (dir: number): EyeController => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(dir * 0.19, 0.08, 0.37);

    const scleraMesh = new THREE.Mesh(eyeBallGeo, scleraMat);
    eyeGroup.add(scleraMesh);

    const irisMesh = new THREE.Mesh(irisGeo, irisMat);
    irisMesh.rotation.x = Math.PI / 2;
    irisMesh.position.z = 0.065;
    eyeGroup.add(irisMesh);

    const pupilMesh = new THREE.Mesh(pupilGeo, pupilMat);
    pupilMesh.position.z = 0.072;
    if (isJegue) pupilMesh.scale.set(1.3, 0.75, 1);
    eyeGroup.add(pupilMesh);

    const upperLidMesh = new THREE.Mesh(eyelidGeo, skinMat);
    upperLidMesh.rotation.x = -0.25;
    upperLidMesh.rotation.z = -dir * 0.15;
    eyeGroup.add(upperLidMesh);

    const lowerLidMesh = new THREE.Mesh(eyelidGeo, skinMat);
    lowerLidMesh.rotation.x = Math.PI - 0.15;
    lowerLidMesh.rotation.z = dir * 0.15;
    eyeGroup.add(lowerLidMesh);

    headGroup.add(eyeGroup);

    return {
      eyeGroup,
      scleraMesh,
      irisMesh,
      pupilMesh,
      upperLidMesh,
      lowerLidMesh,
      blinkState: {
        nextBlinkTime: 2.5 + Math.random() * 2.5,
        blinkProgress: 0,
        isBlinking: false,
        isDoubleBlink: false,
      },
      lookOffset: new THREE.Vector2(0, 0),
    };
  };

  const leftEye = createEyeController(-1);
  const rightEye = createEyeController(1);

  // --- ARCHETYPE ANATOMY: Authentic Dom Jegue, Minotaur, Wolf, Fox, Bear ---
  if (isJegue) {
    // Dom Jegue Mane (dark sculpted hair running along crest)
    const maneGeo = getCachedGeometry(
      'jegue_mane_v3',
      () => new RoundedBoxGeometry(0.12, 0.54, 0.42, 4, 0.03)
    );
    const maneMat = new THREE.MeshPhysicalMaterial({
      color: 0x1f1712,
      roughness: 0.72,
      sheen: 0.7,
      sheenRoughness: 0.4,
    });
    const mane = new THREE.Mesh(maneGeo, maneMat);
    mane.position.set(0, 0.44, -0.06);
    mane.rotation.x = -0.28;
    headGroup.add(mane);

    // Authentic Long Donkey Ears angled laterally (~28° / Math.PI * 0.15) with furry inner cavity
    // NOT RABBIT EARS! Curved leaf shape tapering at tip, open sideways
    for (const dir of [-1, 1]) {
      const earGroup = new THREE.Group();
      earGroup.position.set(dir * 0.22, 0.38, -0.05);
      earGroup.rotation.z = -dir * 0.48;
      earGroup.rotation.x = -0.18;

      const earOuterGeo = getCachedGeometry(`jegue_ear_outer_${dir}_v3`, () => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(dir * 0.08, 0.38, -0.04),
          new THREE.Vector3(dir * 0.14, 0.82, 0.02),
        ]);
        return new THREE.TubeGeometry(curve, 28, 0.098, 20, false);
      });
      const earOuter = new THREE.Mesh(earOuterGeo, skinMat);
      earOuter.scale.set(1, 1, 0.48);
      earGroup.add(earOuter);

      const innerEarGeo = getCachedGeometry(`jegue_ear_inner_${dir}_v3`, () => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.08, 0.02),
          new THREE.Vector3(dir * 0.06, 0.36, -0.02),
          new THREE.Vector3(dir * 0.10, 0.74, 0.02),
        ]);
        return new THREE.TubeGeometry(curve, 24, 0.065, 16, false);
      });
      const innerEar = new THREE.Mesh(innerEarGeo, muzzleMat);
      innerEar.scale.set(0.9, 0.9, 0.35);
      earGroup.add(innerEar);

      headGroup.add(earGroup);
    }
  } else if (custom.archetypeId === 'minotauro_chef') {
    const hornMat = new THREE.MeshPhysicalMaterial({
      color: 0xd6d3d1,
      roughness: 0.36,
      metalness: 0.18,
      clearcoat: 0.45,
    });
    for (const dir of [-1, 1]) {
      const hornGeo = getCachedGeometry(`minotaur_horn_${dir}_v2`, () => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(dir * 0.32, 0.24, 0),
          new THREE.Vector3(dir * 0.68, 0.32, 0.08),
          new THREE.Vector3(dir * 0.86, 0.62, 0.22),
          new THREE.Vector3(dir * 0.68, 0.9, 0.32),
        ]);
        return new THREE.TubeGeometry(curve, 40, 0.088, 24, false);
      });
      headGroup.add(new THREE.Mesh(hornGeo, hornMat));
    }
    const noseRing = new THREE.Mesh(
      getCachedGeometry(
        'minotaur_nosering_v2',
        () => new THREE.TorusGeometry(0.11, 0.024, 18, 36)
      ),
      goldTrimMat
    );
    noseRing.rotation.x = 0.35;
    noseRing.position.set(0, -0.18, 0.69);
    headGroup.add(noseRing);
  } else if (custom.archetypeId === 'raposa_dama') {
    for (const dir of [-1, 1]) {
      const earGeo = getCachedGeometry(`fox_ear_${dir}_v2`, () => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(dir * 0.22, 0.34, -0.02),
          new THREE.Vector3(dir * 0.34, 0.62, -0.02),
          new THREE.Vector3(dir * 0.42, 0.88, 0.04),
        ]);
        return new THREE.TubeGeometry(curve, 28, 0.095, 20, false);
      });
      const ear = new THREE.Mesh(earGeo, skinMat);
      ear.scale.set(1, 1, 0.52);
      headGroup.add(ear);

      const earring = new THREE.Mesh(
        new THREE.TorusGeometry(0.065, 0.015, 14, 28),
        goldTrimMat
      );
      earring.position.set(dir * 0.38, 0.42, 0.05);
      headGroup.add(earring);
    }
  } else if (custom.archetypeId === 'lobo_cyber') {
    for (const dir of [-1, 1]) {
      const earGeo = getCachedGeometry(`wolf_ear_${dir}_v2`, () => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(dir * 0.22, 0.34, -0.04),
          new THREE.Vector3(dir * 0.31, 0.58, -0.06),
          new THREE.Vector3(dir * 0.35, 0.78, -0.02),
        ]);
        return new THREE.TubeGeometry(curve, 24, 0.088, 20, false);
      });
      const ear = new THREE.Mesh(earGeo, skinMat);
      ear.scale.set(1, 1, 0.55);
      headGroup.add(ear);
    }
  } else if (custom.archetypeId === 'urso_pardo') {
    const outerEarGeo = getCachedGeometry(
      'bear_outer_ear_v2',
      () => new THREE.SphereGeometry(0.165, 28, 24)
    );
    const innerEarGeo = getCachedGeometry(
      'bear_inner_ear_v2',
      () => new THREE.SphereGeometry(0.1, 20, 16)
    );
    for (const dir of [-1, 1]) {
      const earGroup = new THREE.Group();
      earGroup.position.set(dir * 0.34, 0.38, -0.04);
      earGroup.rotation.z = -dir * 0.25;

      const outerEar = new THREE.Mesh(outerEarGeo, skinMat);
      outerEar.scale.set(1, 1.05, 0.52);
      earGroup.add(outerEar);

      const innerEar = new THREE.Mesh(innerEarGeo, darkMetalMat);
      innerEar.scale.set(1, 1, 0.35);
      innerEar.position.z = 0.055;
      earGroup.add(innerEar);

      headGroup.add(earGroup);
    }
  } else if (custom.archetypeId === 'mecha_camaleao') {
    const crestGeo = getCachedGeometry('mecha_crest_v2', () => {
      const crestShape = new THREE.Shape();
      crestShape.moveTo(0, 0);
      crestShape.quadraticCurveTo(0.45, 0.35, 0.15, 0.78);
      crestShape.quadraticCurveTo(-0.25, 0.55, -0.35, 0);
      const g = new THREE.ExtrudeGeometry(crestShape, {
        depth: 0.22,
        bevelEnabled: true,
        bevelSegments: 5,
        bevelSize: 0.035,
        bevelThickness: 0.035,
        curveSegments: 32,
      });
      g.center();
      return g;
    });
    const crestMesh = new THREE.Mesh(crestGeo, skinMat);
    crestMesh.rotation.y = Math.PI / 2;
    crestMesh.position.set(0, 0.42, -0.15);
    headGroup.add(crestMesh);
  }

  // --- ACCESSORIES: EYEWEAR, HATS, PROPS ---
  if (custom.eyewearId === 'visor_mecha') {
    const visor = new THREE.Mesh(
      getCachedGeometry(
        'eyewear_visor_v2',
        () => new RoundedBoxGeometry(0.68, 0.16, 0.18, 5, 0.045)
      ),
      new THREE.MeshPhysicalMaterial({
        color: 0x06b6d4,
        emissive: 0x0891b2,
        emissiveIntensity: 0.45,
        roughness: 0.1,
        metalness: 0.4,
        clearcoat: 1.0,
      })
    );
    visor.position.set(0, 0.09, 0.39);
    headGroup.add(visor);
  } else if (custom.eyewearId === 'monoculo_ouro') {
    const monocleRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.018, 16, 32),
      goldTrimMat
    );
    monocleRim.position.set(0.19, 0.09, 0.45);
    headGroup.add(monocleRim);
  } else if (custom.eyewearId === 'oculos_escuros') {
    for (const dir of [-1, 1]) {
      const lens = new THREE.Mesh(
        new RoundedBoxGeometry(0.24, 0.14, 0.06, 4, 0.022),
        darkMetalMat
      );
      lens.position.set(dir * 0.19, 0.09, 0.44);
      headGroup.add(lens);
    }
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.025, 0.04),
      goldTrimMat
    );
    bridge.position.set(0, 0.11, 0.45);
    headGroup.add(bridge);
  } else if (custom.eyewearId === 'tapa_olho') {
    const patch = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 20, 20),
      darkMetalMat
    );
    patch.scale.set(1.1, 1.0, 0.5);
    patch.position.set(-0.19, 0.09, 0.43);
    headGroup.add(patch);

    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.018, 12, 36),
      darkMetalMat
    );
    strap.rotation.y = 0.35;
    strap.rotation.x = 1.25;
    strap.position.set(0, 0.12, 0.02);
    headGroup.add(strap);
  }

  if (custom.hatId === 'fedora_saloon') {
    const fedoraGeo = getCachedGeometry('hat_fedora_lathe_v2', () => {
      const pts = [
        new THREE.Vector2(0.72, 0),
        new THREE.Vector2(0.72, 0.028),
        new THREE.Vector2(0.42, 0.042),
        new THREE.Vector2(0.39, 0.28),
        new THREE.Vector2(0.32, 0.34),
        new THREE.Vector2(0.14, 0.29),
        new THREE.Vector2(0, 0.28),
      ];
      return new THREE.LatheGeometry(pts, 48);
    });
    const fedora = new THREE.Mesh(fedoraGeo, coatLapelMat);
    fedora.scale.set(0.95, 1, 1.08);
    fedora.position.set(0, 0.36, 0);
    headGroup.add(fedora);

    const hatBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.415, 0.425, 0.068, 40),
      goldTrimMat
    );
    hatBand.scale.set(0.95, 1, 1.08);
    hatBand.position.set(0, 0.42, 0);
    headGroup.add(hatBand);
  } else if (custom.hatId === 'coroa_imperial') {
    const crownGroup = new THREE.Group();
    crownGroup.position.set(0, 0.42, 0);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.31, 0.18, 40),
      goldTrimMat
    );
    crownGroup.add(band);

    const spikeGeo = getCachedGeometry(
      'hat_crown_spike_v2',
      () => new THREE.ConeGeometry(0.065, 0.22, 16)
    );
    const spikeInst = new THREE.InstancedMesh(spikeGeo, goldTrimMat, 8);
    for (let p = 0; p < 8; p++) {
      const pa = (p / 8) * Math.PI * 2;
      dummy.position.set(Math.cos(pa) * 0.32, 0.17, Math.sin(pa) * 0.32);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      spikeInst.setMatrixAt(p, dummy.matrix);
    }
    spikeInst.instanceMatrix.needsUpdate = true;
    crownGroup.add(spikeInst);
    headGroup.add(crownGroup);
  } else if (custom.hatId === 'cartola_magnata') {
    const topHatGeo = getCachedGeometry('hat_tophat_lathe_v2', () => {
      const pts = [
        new THREE.Vector2(0.62, 0),
        new THREE.Vector2(0.62, 0.03),
        new THREE.Vector2(0.38, 0.035),
        new THREE.Vector2(0.36, 0.32),
        new THREE.Vector2(0.41, 0.62),
        new THREE.Vector2(0, 0.62),
      ];
      return new THREE.LatheGeometry(pts, 48);
    });
    const topHat = new THREE.Mesh(topHatGeo, darkMetalMat);
    topHat.position.set(0, 0.36, 0);
    headGroup.add(topHat);

    const ribbon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.385, 0.385, 0.075, 40),
      goldTrimMat
    );
    ribbon.position.set(0, 0.43, 0);
    headGroup.add(ribbon);
  } else if (custom.hatId === 'halo_cyber') {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.035, 24, 64),
      goldTrimMat
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 0.62, 0);
    headGroup.add(halo);
  } else if (custom.hatId === 'capacete_tatico') {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.49,
        40,
        28,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.56
      ),
      darkMetalMat
    );
    dome.position.set(0, 0.06, -0.02);
    headGroup.add(dome);

    const nvgMount = new THREE.Mesh(
      new RoundedBoxGeometry(0.18, 0.14, 0.12, 3, 0.02),
      goldTrimMat
    );
    nvgMount.position.set(0, 0.36, 0.44);
    headGroup.add(nvgMount);
  } else if (custom.hatId === 'chapeu_cauboi') {
    const cowboyBrimGeo = getCachedGeometry('hat_cowboy_brim_v2', () => {
      const g = new THREE.CylinderGeometry(0.82, 0.82, 0.038, 48, 4);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        pos.setY(i, y + Math.pow(Math.abs(x), 2.1) * 0.24);
      }
      g.computeVertexNormals();
      return g;
    });
    const wideBrim = new THREE.Mesh(cowboyBrimGeo, coatLapelMat);
    wideBrim.position.set(0, 0.36, 0);
    headGroup.add(wideBrim);

    const sheriffCrown = new THREE.Mesh(
      new RoundedBoxGeometry(0.52, 0.34, 0.58, 6, 0.14),
      coatLapelMat
    );
    sheriffCrown.position.set(0, 0.52, 0);
    headGroup.add(sheriffCrown);

    const starBadge = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.08, 1),
      goldTrimMat
    );
    starBadge.position.set(0, 0.48, 0.31);
    headGroup.add(starBadge);
  }

  if (custom.propId === 'charuto_chefe') {
    const cigarGroup = new THREE.Group();
    cigarGroup.position.set(0.16, -0.2, 0.64);
    cigarGroup.rotation.set(0.15, 0.32, 0);
    const cigarBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.038, 0.34, 24),
      new THREE.MeshStandardMaterial({ color: 0x4a2111, roughness: 0.65 })
    );
    cigarBody.rotation.x = Math.PI / 2;
    cigarGroup.add(cigarBody);

    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.042, 20, 20),
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 0.6,
      })
    );
    ember.position.z = 0.17;
    cigarGroup.add(ember);
    headGroup.add(cigarGroup);
  } else if (custom.propId === 'rosa_dourada') {
    const rose = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.09, 2),
      new THREE.MeshPhysicalMaterial({
        color: 0xe11d48,
        metalness: 0.45,
        roughness: 0.22,
        clearcoat: 0.85,
      })
    );
    rose.position.set(-0.18, -0.18, 0.64);
    headGroup.add(rose);
  } else if (custom.propId === 'mascara_oni') {
    const mask = new THREE.Mesh(
      new RoundedBoxGeometry(0.54, 0.34, 0.38, 6, 0.09),
      darkMetalMat
    );
    mask.position.set(0, -0.12, 0.46);
    headGroup.add(mask);
  } else if (custom.propId === 'bigode_barao') {
    for (const dir of [-1, 1]) {
      const stacheGeo = getCachedGeometry(`prop_mustache_${dir}_v2`, () => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(dir * 0.02, -0.14, 0.66),
          new THREE.Vector3(dir * 0.18, -0.16, 0.64),
          new THREE.Vector3(dir * 0.31, -0.09, 0.58),
        ]);
        return new THREE.TubeGeometry(curve, 24, 0.042, 16, false);
      });
      headGroup.add(new THREE.Mesh(stacheGeo, darkMetalMat));
    }
  }

  // --- CONNECTED ARMS ANCHORED TO CHESTGROUP ---
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.62, 0.40, 0.04);
  chestGroup.add(leftArmGroup);

  const armTubSeg = isMatchLod ? 22 : 48;
  const armRadSeg = isMatchLod ? 14 : 28;

  const leftArmGeo = getCachedGeometry(
    `char_left_arm_connected_${detail}_v3`,
    () => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.22, -0.36, 0.22),
        new THREE.Vector3(-0.14, -0.68, 0.60),
        new THREE.Vector3(0.16, -0.78, 1.02),
      ]);
      return new THREE.TubeGeometry(curve, armTubSeg, 0.165, armRadSeg, false);
    }
  );
  const leftArmMesh = new THREE.Mesh(leftArmGeo, vestMat);
  leftArmGroup.add(leftArmMesh);

  const leftCuff = new THREE.Mesh(
    getCachedGeometry(
      'char_wrist_cuff_v2',
      () => new THREE.TorusGeometry(0.165, 0.032, 16, 32)
    ),
    goldTrimMat
  );
  leftCuff.position.set(0.14, -0.77, 0.96);
  leftCuff.rotation.y = 0.45;
  leftArmGroup.add(leftCuff);

  // Left Hand Resting securely on table (y >= 0.012 - NO SINKING!)
  const leftHandGroup = new THREE.Group();
  leftHandGroup.position.set(0.24, -0.80, 1.14);
  leftHandGroup.rotation.y = 0.38;
  leftArmGroup.add(leftHandGroup);

  const palmGeo = getCachedGeometry(
    'char_sculpted_palm_v2',
    () => new THREE.SphereGeometry(0.18, 28, 24)
  );
  const leftPalm = new THREE.Mesh(palmGeo, skinMat);
  leftPalm.scale.set(1.05, 0.52, 1.22);
  leftPalm.position.y = 0.04;
  leftHandGroup.add(leftPalm);

  const fingerGeo = getCachedGeometry(
    'char_finger_phalanx_v2',
    () => new THREE.CapsuleGeometry(0.032, 0.14, 10, 16)
  );
  const clawGeo = getCachedGeometry(
    'char_finger_claw_v2',
    () => new THREE.ConeGeometry(0.024, 0.08, 12)
  );
  for (let f = 0; f < 4; f++) {
    const fg = new THREE.Group();
    fg.position.set((f - 1.5) * 0.072, 0.035, 0.18);
    fg.rotation.x = Math.PI / 2 + 0.15;
    fg.add(new THREE.Mesh(fingerGeo, skinMat));
    const claw = new THREE.Mesh(clawGeo, darkMetalMat);
    claw.position.y = 0.11;
    fg.add(claw);
    leftHandGroup.add(fg);
  }

  // --- RIGHT ARM & HAND HOLDING CARDS WITH ZERO CLIPPING ---
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.62, 0.40, 0.04);
  chestGroup.add(rightArmGroup);

  const rightArmGeo = getCachedGeometry(
    `char_right_arm_connected_${detail}_v3`,
    () => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.24, -0.38, 0.24),
        new THREE.Vector3(0.10, -0.66, 0.66),
        new THREE.Vector3(-0.26, -0.58, 1.02),
      ]);
      return new THREE.TubeGeometry(curve, armTubSeg, 0.165, armRadSeg, false);
    }
  );
  const rightArmMesh = new THREE.Mesh(rightArmGeo, vestMat);
  rightArmGroup.add(rightArmMesh);

  const rightCuff = new THREE.Mesh(
    getCachedGeometry(
      'char_wrist_cuff_v2',
      () => new THREE.TorusGeometry(0.165, 0.032, 16, 32)
    ),
    goldTrimMat
  );
  rightCuff.position.set(-0.21, -0.59, 0.96);
  rightCuff.rotation.y = -0.45;
  rightArmGroup.add(rightCuff);

  const handGroup = new THREE.Group();
  handGroup.position.set(-0.30, -0.56, 1.12);
  rightArmGroup.add(handGroup);

  // Palm positioned safely BEHIND AND BELOW cards
  const rightPalm = new THREE.Mesh(palmGeo, skinMat);
  rightPalm.scale.set(1.05, 0.62, 1.15);
  rightPalm.position.set(0, -0.04, -0.06);
  handGroup.add(rightPalm);

  // Thumb supporting from behind
  const thumbGroup = new THREE.Group();
  thumbGroup.position.set(-0.12, 0.02, -0.04);
  thumbGroup.rotation.set(0.35, 0.45, -0.2);
  thumbGroup.add(new THREE.Mesh(fingerGeo, skinMat));
  handGroup.add(thumbGroup);

  // Fingers gently pinching the lower front edge ONLY - NO CLIPPING THROUGH FACE!
  const fingersGroup = new THREE.Group();
  fingersGroup.position.set(0, 0.08, 0.14);
  for (let f = 0; f < 4; f++) {
    const fg = new THREE.Group();
    fg.position.set(-0.11 + f * 0.072, 0, 0);
    fg.rotation.x = -0.55;
    fg.add(new THREE.Mesh(fingerGeo, skinMat));
    const claw = new THREE.Mesh(clawGeo, darkMetalMat);
    claw.position.y = 0.11;
    fg.add(claw);
    fingersGroup.add(fg);
  }
  handGroup.add(fingersGroup);

  // Fanned 3D Cards placed cleanly in front of palm, above lower fingers
  const cardsHolderGroup = new THREE.Group();
  cardsHolderGroup.position.set(0, 0.30, 0.08);
  handGroup.add(cardsHolderGroup);

  const cardBackTex = getOrnateCardBackTexture(options.accentHex);
  const cardBackMat = isMatchLod
    ? new THREE.MeshStandardMaterial({
        map: cardBackTex,
        roughness: 0.48,
        metalness: 0.15,
      })
    : new THREE.MeshPhysicalMaterial({
        map: cardBackTex,
        roughness: 0.45,
        metalness: 0.18,
        clearcoat: 0.3,
      });

  const cardEdgeMat = isMatchLod
    ? new THREE.MeshStandardMaterial({
        color: trimColor,
        metalness: 0.72,
        roughness: 0.32,
      })
    : new THREE.MeshPhysicalMaterial({
        color: trimColor,
        metalness: 0.78,
        roughness: 0.28,
      });

  const cardsInHand: THREE.Mesh[] = [];
  const cardGeo = getCachedGeometry(
    'hand_fanned_card_v2',
    () => new THREE.BoxGeometry(0.38, 0.56, 0.018, 4, 6, 1)
  );

  for (let c = 0; c < 5; c++) {
    const spread = (c - 2) * 0.19;
    const cardMesh = new THREE.Mesh(cardGeo, [
      cardEdgeMat,
      cardEdgeMat,
      cardEdgeMat,
      cardEdgeMat,
      cardBackMat,
      cardBackMat,
    ]);
    cardMesh.position.set(
      spread * 0.68,
      Math.abs(c - 2) * -0.028,
      c * 0.014
    );
    cardMesh.rotation.z = -spread * 0.78;
    cardMesh.rotation.x = -0.22;
    cardsHolderGroup.add(cardMesh);
    cardsInHand.push(cardMesh);
  }

  // --- PROCEDURAL ANIMATION & 4-STATE MACHINE ---
  let currentState: CharacterReactionState = 'idle';
  let stateTimer = 0;

  const updateEyeBlink = (eye: EyeController, elapsed: number) => {
    const bs = eye.blinkState;
    if (!bs.isBlinking) {
      if (elapsed >= bs.nextBlinkTime) {
        bs.isBlinking = true;
        bs.blinkProgress = 0;
        bs.isDoubleBlink = Math.random() < 0.28;
      }
    } else {
      bs.blinkProgress += 0.085;
      const blinkCycle = Math.sin(Math.min(1, bs.blinkProgress) * Math.PI);
      const closeScaleY = 1.0 - blinkCycle * 0.92;
      eye.upperLidMesh.scale.y = closeScaleY;
      eye.lowerLidMesh.scale.y = closeScaleY;

      if (bs.blinkProgress >= 1) {
        if (bs.isDoubleBlink) {
          bs.isDoubleBlink = false;
          bs.blinkProgress = 0;
        } else {
          bs.isBlinking = false;
          bs.nextBlinkTime = elapsed + 3.0 + Math.random() * 2.5;
          eye.upperLidMesh.scale.y = 1;
          eye.lowerLidMesh.scale.y = 1;
        }
      }
    }
  };

  const updateAnimation = (
    elapsed: number,
    dtFactor: number,
    desiredState: CharacterReactionState,
    targetLookWorldPos?: THREE.Vector3 | null
  ) => {
    if (desiredState !== currentState) {
      currentState = desiredState;
      stateTimer = 0;
    }
    stateTimer += 0.016 * dtFactor;

    // 1. Natural Breathing on chest & spine
    const breath = Math.sin(elapsed * 1.85);
    chestGroup.scale.set(
      1.0 + breath * 0.012,
      1.0 + breath * 0.018,
      1.0 + breath * 0.015
    );
    neckGroup.rotation.x = breath * 0.018;

    // 2. Stochastic eye blinks
    updateEyeBlink(leftEye, elapsed);
    updateEyeBlink(rightEye, elapsed);

    // 3. Eye tracking convergence toward target
    if (targetLookWorldPos) {
      const charWorldPos = root.position;
      const dx = targetLookWorldPos.x - charWorldPos.x;
      const dz = targetLookWorldPos.z - charWorldPos.z;
      const targetAngleY = Math.atan2(dx, dz);
      headGroup.rotation.y = THREE.MathUtils.lerp(
        headGroup.rotation.y,
        targetAngleY * 0.35,
        0.08 * dtFactor
      );
    } else {
      headGroup.rotation.y = THREE.MathUtils.lerp(
        headGroup.rotation.y,
        Math.sin(elapsed * 0.8) * 0.05,
        0.05 * dtFactor
      );
    }

    // 4. 4-State Machine: idle | throwing | victory | defeat
    switch (currentState) {
      case 'throwing': {
        const throwT = Math.min(1, stateTimer * 3.5);
        const lurch = Math.sin(throwT * Math.PI);
        spineBaseGroup.rotation.x = -lurch * 0.16;
        chestGroup.rotation.x = -lurch * 0.12;
        rightArmGroup.position.z = 0.04 + lurch * 0.18;
        rightArmGroup.rotation.x = lurch * 0.14;
        break;
      }
      case 'victory': {
        spineBaseGroup.rotation.x = THREE.MathUtils.lerp(
          spineBaseGroup.rotation.x,
          -0.06,
          0.08 * dtFactor
        );
        chestGroup.rotation.x = THREE.MathUtils.lerp(
          chestGroup.rotation.x,
          -0.08,
          0.08 * dtFactor
        );
        headGroup.rotation.x = THREE.MathUtils.lerp(
          headGroup.rotation.x,
          -0.14,
          0.08 * dtFactor
        );
        headGroup.rotation.z = Math.sin(elapsed * 4.2) * 0.05;
        rightArmGroup.rotation.z = Math.sin(elapsed * 3.6) * 0.08;
        break;
      }
      case 'defeat': {
        spineBaseGroup.rotation.x = THREE.MathUtils.lerp(
          spineBaseGroup.rotation.x,
          0.12,
          0.08 * dtFactor
        );
        chestGroup.rotation.x = THREE.MathUtils.lerp(
          chestGroup.rotation.x,
          0.16,
          0.08 * dtFactor
        );
        headGroup.rotation.x = THREE.MathUtils.lerp(
          headGroup.rotation.x,
          0.24,
          0.08 * dtFactor
        );
        headGroup.rotation.z = Math.sin(elapsed * 1.5) * 0.02;
        break;
      }
      case 'idle':
      default: {
        spineBaseGroup.rotation.x = THREE.MathUtils.lerp(
          spineBaseGroup.rotation.x,
          0,
          0.08 * dtFactor
        );
        chestGroup.rotation.x = THREE.MathUtils.lerp(
          chestGroup.rotation.x,
          0,
          0.08 * dtFactor
        );
        headGroup.rotation.x = THREE.MathUtils.lerp(
          headGroup.rotation.x,
          0,
          0.08 * dtFactor
        );
        headGroup.rotation.z = THREE.MathUtils.lerp(
          headGroup.rotation.z,
          0,
          0.08 * dtFactor
        );
        rightArmGroup.position.z = THREE.MathUtils.lerp(
          rightArmGroup.position.z,
          0.04,
          0.08 * dtFactor
        );
        rightArmGroup.rotation.x = THREE.MathUtils.lerp(
          rightArmGroup.rotation.x,
          0,
          0.08 * dtFactor
        );
        rightArmGroup.rotation.z = THREE.MathUtils.lerp(
          rightArmGroup.rotation.z,
          0,
          0.08 * dtFactor
        );
        break;
      }
    }
  };

  optimizeHierarchyForCulling(root);

  return {
    root,
    chairGroup,
    spineBaseGroup,
    chestGroup,
    neckGroup,
    headGroup,
    leftArmGroup,
    rightArmGroup,
    leftHandGroup,
    handGroup,
    cardsInHand,
    leftEye,
    rightEye,
    currentState,
    stateTimer,
    updateAnimation,
  };
}


// ============================================================================
// SCULPTED ARTICULATED FIRST-PERSON HANDS & GAUNTLETS
// ============================================================================
export function buildSculptedFirstPersonHands(
  customization?: Partial<CharacterCustomization> | null
): {
  leftHand: THREE.Group;
  rightHand: THREE.Group;
  leftRig: ArticulatedHandRig;
  rightRig: ArticulatedHandRig;
} {
  const custom = resolveCharacterCustomization(customization, 0);
  const archInfo =
    CHARACTER_ARCHETYPES.find((a) => a.id === custom.archetypeId) ??
    CHARACTER_ARCHETYPES[0];
  const outfitInfo =
    CHARACTER_OUTFITS.find((o) => o.id === custom.outfitId) ??
    CHARACTER_OUTFITS[0];
  const isCyber = Boolean(archInfo.isCyber);
  const hexBump = getMechaHexScaleTexture();
  const furBump = getAnimalFurBumpTexture();

  const skinPawMat = isCyber
    ? new THREE.MeshPhysicalMaterial({
        color: archInfo.skinColorHex,
        roughness: 0.26,
        metalness: 0.72,
        bumpMap: hexBump,
        bumpScale: 0.015,
        clearcoat: 0.7,
      })
    : new THREE.MeshPhysicalMaterial({
        color: archInfo.skinColorHex,
        roughness: 0.65,
        metalness: 0.06,
        bumpMap: furBump,
        bumpScale: 0.02,
        sheen: 0.8,
        sheenRoughness: 0.35,
        clearcoat: 0.15,
      });

  const gloveLeatherMat = new THREE.MeshPhysicalMaterial({
    color: outfitInfo.vestHex,
    roughness: 0.42,
    metalness: 0.28,
    clearcoat: 0.35,
  });

  const trimColor = new THREE.Color(outfitInfo.trimHex || archInfo.accentHex);
  const brassTrimMat = new THREE.MeshPhysicalMaterial({
    color: trimColor,
    metalness: 0.9,
    roughness: 0.2,
    emissive: trimColor,
    emissiveIntensity: 0.18,
    clearcoat: 0.7,
  });

  const clawDarkMat = new THREE.MeshPhysicalMaterial({
    color: 0x141418,
    roughness: 0.2,
    metalness: 0.65,
    clearcoat: 0.8,
  });

  const palmGeo = getCachedGeometry('fp_sculpted_palm_v3', () => {
    const g = new THREE.SphereGeometry(0.22, 28, 22);
    g.scale(1.12, 0.46, 1.32);
    return g;
  });
  const proxPhalanxGeo = getCachedGeometry(
    'fp_prox_phalanx_v3',
    () => new THREE.CapsuleGeometry(0.034, 0.11, 8, 14)
  );
  const medPhalanxGeo = getCachedGeometry(
    'fp_med_phalanx_v3',
    () => new THREE.CapsuleGeometry(0.029, 0.09, 8, 12)
  );
  const distPhalanxGeo = getCachedGeometry(
    'fp_dist_phalanx_v3',
    () => new THREE.CapsuleGeometry(0.025, 0.07, 8, 12)
  );
  const clawTipGeo = getCachedGeometry(
    'fp_claw_tip_v3',
    () => new THREE.ConeGeometry(0.024, 0.08, 10)
  );
  const knuckleStudGeo = getCachedGeometry(
    'fp_knuckle_stud_v3',
    () => new THREE.OctahedronGeometry(0.028, 1)
  );

  const buildHand = (isRight: boolean): ArticulatedHandRig => {
    const hand = new THREE.Group();
    const wristGroup = new THREE.Group();
    hand.add(wristGroup);
    const mirror = isRight ? 1 : -1;

    // Sculpted palm with dorsal fingerless glove plate
    const palmMesh = new THREE.Mesh(palmGeo, skinPawMat);
    wristGroup.add(palmMesh);

    const gloveMesh = new THREE.Mesh(
      getCachedGeometry(
        'fp_dorsal_glove_v3',
        () => new RoundedBoxGeometry(0.42, 0.08, 0.36, 4, 0.028)
      ),
      gloveLeatherMat
    );
    gloveMesh.position.set(0, 0.065, 0.04);
    wristGroup.add(gloveMesh);

    // Forearm sleeve & ornate metallic cuff
    const forearmMesh = new THREE.Mesh(
      getCachedGeometry(
        'fp_forearm_sleeve_v3',
        () => new THREE.CylinderGeometry(0.2, 0.24, 0.58, 24)
      ),
      gloveLeatherMat
    );
    forearmMesh.rotation.x = Math.PI / 2 - 0.12;
    forearmMesh.position.set(0, -0.04, 0.46);
    wristGroup.add(forearmMesh);

    const cuffMesh = new THREE.Mesh(
      getCachedGeometry(
        'fp_wrist_cuff_ring_v3',
        () => new THREE.TorusGeometry(0.195, 0.028, 14, 28)
      ),
      brassTrimMat
    );
    cuffMesh.position.set(0, -0.01, 0.24);
    wristGroup.add(cuffMesh);

    // Left wrist Saloon Chrono-Watch
    if (!isRight) {
      const watchDial = new THREE.Mesh(
        getCachedGeometry(
          'fp_watch_dial_v3',
          () => new THREE.CylinderGeometry(0.095, 0.095, 0.04, 24)
        ),
        brassTrimMat
      );
      watchDial.position.set(0.02, 0.11, 0.24);
      wristGroup.add(watchDial);
    }

    // 4 Articulated Multi-Jointed Fingers with 3 Phalanges Each
    const fingers: FingerBones[] = [];
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.092;
      const archY = -Math.abs(f - 1.5) * 0.014;

      const knuckle = new THREE.Mesh(knuckleStudGeo, brassTrimMat);
      knuckle.position.set(fx, 0.095 + archY, -0.11);
      knuckle.scale.set(1, 0.55, 1);
      wristGroup.add(knuckle);

      const fingerRoot = new THREE.Group();
      fingerRoot.position.set(fx, 0.02 + archY, -0.22);
      fingerRoot.rotation.x = isRight ? -0.32 : 0.26;
      fingerRoot.rotation.z = (f - 1.5) * -0.04;

      const proximalPhalanx = new THREE.Mesh(proxPhalanxGeo, skinPawMat);
      proximalPhalanx.rotation.x = Math.PI / 2;
      proximalPhalanx.position.z = -0.06;
      fingerRoot.add(proximalPhalanx);

      const medialJoint = new THREE.Group();
      medialJoint.position.set(0, 0, -0.12);
      medialJoint.rotation.x = isRight ? 0.25 : 0.35;

      const medialPhalanx = new THREE.Mesh(medPhalanxGeo, skinPawMat);
      medialPhalanx.rotation.x = Math.PI / 2;
      medialPhalanx.position.z = -0.05;
      medialJoint.add(medialPhalanx);

      const distalJoint = new THREE.Group();
      distalJoint.position.set(0, 0, -0.10);
      distalJoint.rotation.x = isRight ? 0.22 : 0.32;

      const distalPhalanx = new THREE.Mesh(distPhalanxGeo, skinPawMat);
      distalPhalanx.rotation.x = Math.PI / 2;
      distalPhalanx.position.z = -0.04;
      distalJoint.add(distalPhalanx);

      const clawTip = new THREE.Mesh(clawTipGeo, clawDarkMat);
      clawTip.rotation.x = -Math.PI / 2.1;
      clawTip.position.z = -0.09;
      distalJoint.add(clawTip);

      medialJoint.add(distalJoint);
      fingerRoot.add(medialJoint);
      wristGroup.add(fingerRoot);

      fingers.push({
        root: fingerRoot,
        proximalPhalanx,
        medialJoint,
        medialPhalanx,
        distalJoint,
        distalPhalanx,
        clawTip,
      });
    }

    // Opposable Articulated Thumb
    const carpometacarpalJoint = new THREE.Group();
    carpometacarpalJoint.position.set(-mirror * 0.22, 0.04, -0.06);
    carpometacarpalJoint.rotation.set(0.28, mirror * 0.42, mirror * 0.45);

    const thumbProximal = new THREE.Mesh(proxPhalanxGeo, skinPawMat);
    thumbProximal.rotation.x = Math.PI / 2;
    thumbProximal.position.z = -0.07;
    carpometacarpalJoint.add(thumbProximal);

    const interphalangealJoint = new THREE.Group();
    interphalangealJoint.position.set(0, 0, -0.13);
    interphalangealJoint.rotation.x = 0.38;

    const thumbDistal = new THREE.Mesh(distPhalanxGeo, skinPawMat);
    thumbDistal.rotation.x = Math.PI / 2;
    thumbDistal.position.z = -0.05;
    interphalangealJoint.add(thumbDistal);

    const thumbClaw = new THREE.Mesh(clawTipGeo, clawDarkMat);
    thumbClaw.rotation.x = -Math.PI / 2.1;
    thumbClaw.position.z = -0.11;
    interphalangealJoint.add(thumbClaw);

    carpometacarpalJoint.add(interphalangealJoint);
    wristGroup.add(carpometacarpalJoint);

    const thumb: ThumbBones = {
      carpometacarpalJoint,
      proximalPhalanx: thumbProximal,
      interphalangealJoint,
      distalPhalanx: thumbDistal,
      clawTip: thumbClaw,
    };

    return {
      group: hand,
      wristGroup,
      palmMesh,
      gloveMesh,
      forearmMesh,
      cuffMesh,
      fingers,
      thumb,
    };
  };

  const leftRig = buildHand(false);
  const rightRig = buildHand(true);

  return {
    leftHand: leftRig.group,
    rightHand: rightRig.group,
    leftRig,
    rightRig,
  };
}

// ============================================================================
// RICH 3D SALOON & CYBER-ARENA ARCHITECTURE (Pillars, Lanterns, Bar & Chandelier)
// ============================================================================
export function buildSaloonEnvironmentProps(accentHex = '#F59E0B'): THREE.Group {
  const envGroup = new THREE.Group();
  const accentColor = new THREE.Color(accentHex);

  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x241008,
    roughness: 0.65,
    metalness: 0.12,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.88,
    roughness: 0.24,
  });

  const lanternGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfde68a,
    emissive: accentColor,
    emissiveIntensity: 0.85,
    roughness: 0.15,
  });

  // 1. 6 Architectural Columns & Glowing Wall Lantern Sconces around the Arena
  const pillarGeo = getCachedGeometry(
    'env_saloon_pillar_v2',
    () => new THREE.CylinderGeometry(0.32, 0.38, 8.8, 16)
  );
  const ringBandGeo = getCachedGeometry(
    'env_pillar_band_v2',
    () => new THREE.TorusGeometry(0.35, 0.045, 12, 24)
  );
  const lanternCageGeo = getCachedGeometry(
    'env_lantern_cage_v2',
    () => new THREE.OctahedronGeometry(0.22, 1)
  );

  const pillarAngles = [-2.35, -1.75, -1.18, -0.62, -2.75, -0.38];
  for (let i = 0; i < pillarAngles.length; i++) {
    const a = pillarAngles[i];
    const r = 9.8;
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;

    const colGroup = new THREE.Group();
    colGroup.position.set(px, 1.8, pz);
    colGroup.lookAt(0, 1.8, 0);

    colGroup.add(new THREE.Mesh(pillarGeo, darkWoodMat));

    const band = new THREE.Mesh(ringBandGeo, brassMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.6;
    colGroup.add(band);

    const lantern = new THREE.Mesh(lanternCageGeo, lanternGlowMat);
    lantern.position.set(0, 0.65, 0.52);
    colGroup.add(lantern);

    envGroup.add(colGroup);
  }

  // 2. Back Saloon Trophy & Elixir Bar Shelf + Glowing Hexagon Emblem
  const backShelfGroup = new THREE.Group();
  backShelfGroup.position.set(0, 1.45, -8.8);

  const counterBar = new THREE.Mesh(
    getCachedGeometry(
      'env_back_counter_v2',
      () => new RoundedBoxGeometry(6.8, 1.6, 0.8, 4, 0.06)
    ),
    darkWoodMat
  );
  counterBar.position.y = -1.2;
  backShelfGroup.add(counterBar);

  // Glowing Hexagonal Arena Crest on the Back Wall
  const hexCrest = new THREE.Mesh(
    getCachedGeometry(
      'env_hex_crest_v2',
      () => new THREE.TorusGeometry(1.15, 0.065, 16, 6)
    ),
    lanternGlowMat
  );
  hexCrest.position.set(0, 1.35, 0.15);
  backShelfGroup.add(hexCrest);

  // Illuminated Elixir Bottles on the Back Bar Shelf (Instanced)
  const bottleGeo = getCachedGeometry(
    'env_elixir_bottle_v2',
    () => new THREE.CylinderGeometry(0.08, 0.12, 0.46, 14)
  );
  const bottleInst = new THREE.InstancedMesh(bottleGeo, lanternGlowMat, 10);
  const dummy = new THREE.Object3D();
  const bottleColor = new THREE.Color();
  const bottleHues = [0.08, 0.38, 0.52, 0.82, 0.12];
  for (let b = 0; b < 10; b++) {
    const bx = (b - 4.5) * 0.56;
    dummy.position.set(bx, -0.15, 0.18);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bottleInst.setMatrixAt(b, dummy.matrix);
    bottleColor.setHSL(bottleHues[b % bottleHues.length], 0.9, 0.55);
    bottleInst.setColorAt(b, bottleColor);
  }
  bottleInst.instanceMatrix.needsUpdate = true;
  if (bottleInst.instanceColor) bottleInst.instanceColor.needsUpdate = true;
  backShelfGroup.add(bottleInst);
  envGroup.add(backShelfGroup);

  // 3. Wrought-Iron & Brass Chandelier Wheel + Volumetric Light Cone
  const chandelier = new THREE.Group();
  chandelier.position.set(0, 3.85, -0.2);

  const wheel = new THREE.Mesh(
    getCachedGeometry(
      'env_chandelier_wheel_v2',
      () => new THREE.TorusGeometry(1.25, 0.055, 16, 48)
    ),
    brassMat
  );
  wheel.rotation.x = Math.PI / 2;
  chandelier.add(wheel);

  const bulbGeo = getCachedGeometry(
    'env_chandelier_bulb_v2',
    () => new THREE.SphereGeometry(0.095, 14, 14)
  );
  const bulbInst = new THREE.InstancedMesh(bulbGeo, lanternGlowMat, 6);
  for (let k = 0; k < 6; k++) {
    const ka = (k / 6) * Math.PI * 2;
    dummy.position.set(Math.cos(ka) * 1.25, -0.08, Math.sin(ka) * 1.25);
    dummy.updateMatrix();
    bulbInst.setMatrixAt(k, dummy.matrix);
  }
  bulbInst.instanceMatrix.needsUpdate = true;
  chandelier.add(bulbInst);

  // 4 Forged Iron Suspension Chains connecting chandelier wheel to ceiling mounting bracket
  const chainLinkGeo = getCachedGeometry(
    'env_chandelier_chain_link_v2',
    () => new THREE.TorusGeometry(0.045, 0.014, 12, 20)
  );
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1c1917,
    roughness: 0.75,
    metalness: 0.85,
  });

  const linksPerChain = 12;
  const chainInst = new THREE.InstancedMesh(
    chainLinkGeo,
    ironMat,
    linksPerChain * 4
  );

  for (let c = 0; c < 4; c++) {
    const angle = (c / 4) * Math.PI * 2 + Math.PI / 4;
    const startX = Math.cos(angle) * 1.15;
    const startZ = Math.sin(angle) * 1.15;
    for (let link = 0; link < linksPerChain; link++) {
      const t = link / (linksPerChain - 1);
      const lx = startX * (1 - t * 0.85);
      const ly = t * 1.35;
      const lz = startZ * (1 - t * 0.85);
      dummy.position.set(lx, ly, lz);
      dummy.rotation.set(0.35, angle, link % 2 === 0 ? 0 : Math.PI / 2);
      dummy.scale.set(1, 1.4, 1);
      dummy.updateMatrix();
      chainInst.setMatrixAt(c * linksPerChain + link, dummy.matrix);
    }
  }
  chainInst.instanceMatrix.needsUpdate = true;
  chandelier.add(chainInst);

  // Ceiling mounting bracket
  const ceilingMount = new THREE.Mesh(
    getCachedGeometry(
      'env_chandelier_ceiling_mount_v2',
      () => new THREE.CylinderGeometry(0.24, 0.28, 0.12, 24)
    ),
    brassMat
  );
  ceilingMount.position.set(0, 1.4, 0);
  chandelier.add(ceilingMount);

  // Subtle volumetric light cone casting down onto the saloon table
  const lightConeMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.045,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lightCone = new THREE.Mesh(
    getCachedGeometry(
      'env_volumetric_cone_v2',
      () => new THREE.ConeGeometry(3.6, 3.9, 32, 1, true)
    ),
    lightConeMat
  );
  lightCone.position.set(0, -1.9, 0);
  chandelier.add(lightCone);

  envGroup.add(chandelier);
  optimizeHierarchyForCulling(envGroup);
  return envGroup;
}

/**
 * Builds an authentic Saloon / VIP Tavern Brass Candelabra Set with sculpted ivory candles,
 * blackened wicks, teardrop flame meshes, and procedural triple-harmonic flame flickering.
 */
export function buildTableCandleSet(
  positions: [number, number, number][] = [
    [-1.75, 0.02, -0.85],
    [1.75, 0.02, -0.85],
  ],
  accentHex = '#F59E0B'
): TableCandleController {
  const group = new THREE.Group();
  const flameMeshes: THREE.Mesh[] = [];
  const flameLights: THREE.PointLight[] = [];

  const brassMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97706,
    metalness: 0.92,
    roughness: 0.22,
    clearcoat: 0.6,
  });

  const candleWaxMat = new THREE.MeshStandardMaterial({
    color: 0xfdfaf2,
    roughness: 0.72,
    metalness: 0.04,
    emissive: 0xffe8ba,
    emissiveIntensity: 0.08,
  });

  const wickMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.9,
  });

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffa834,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const baseGeo = getCachedGeometry(
    'candelabra_base_v2',
    () => new THREE.CylinderGeometry(0.12, 0.16, 0.06, 20)
  );
  const stemGeo = getCachedGeometry(
    'candelabra_stem_v2',
    () => new THREE.CylinderGeometry(0.042, 0.055, 0.28, 16)
  );
  const cupGeo = getCachedGeometry(
    'candelabra_cup_v2',
    () => new THREE.CylinderGeometry(0.085, 0.048, 0.06, 18)
  );
  const waxGeo = getCachedGeometry(
    'candelabra_wax_v2',
    () => new THREE.CylinderGeometry(0.065, 0.068, 0.26, 18)
  );
  const wickGeo = getCachedGeometry(
    'candelabra_wick_v2',
    () => new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8)
  );
  const flameGeo = getCachedGeometry(
    'candelabra_flame_v2',
    () => new THREE.ConeGeometry(0.042, 0.14, 16)
  );

  positions.forEach((pos) => {
    const candelabra = new THREE.Group();
    candelabra.position.set(...pos);

    const base = new THREE.Mesh(baseGeo, brassMat);
    base.position.y = 0.03;
    candelabra.add(base);

    const stem = new THREE.Mesh(stemGeo, brassMat);
    stem.position.y = 0.18;
    candelabra.add(stem);

    const cup = new THREE.Mesh(cupGeo, brassMat);
    cup.position.y = 0.33;
    candelabra.add(cup);

    const wax = new THREE.Mesh(waxGeo, candleWaxMat);
    wax.position.y = 0.48;
    candelabra.add(wax);

    const wick = new THREE.Mesh(wickGeo, wickMat);
    wick.position.y = 0.63;
    candelabra.add(wick);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 0.70;
    candelabra.add(flame);
    flameMeshes.push(flame);

    const candleLight = new THREE.PointLight(0xff9933, 0.95, 2.6, 2.0);
    candleLight.position.set(pos[0], pos[1] + 0.72, pos[2]);
    group.add(candleLight);
    flameLights.push(candleLight);

    group.add(candelabra);
  });

  const updateFlames = (elapsed: number, dtFactor: number) => {
    flameMeshes.forEach((flame, i) => {
      const phi = i * 2.4;
      const flicker =
        1.0 +
        Math.sin(elapsed * 18.2 + phi) * 0.14 +
        Math.cos(elapsed * 31.4 + phi) * 0.08 +
        Math.sin(elapsed * 52.8) * 0.04;

      flame.scale.set(
        1.0 + Math.sin(elapsed * 14.5 + phi) * 0.08,
        flicker,
        1.0 + Math.cos(elapsed * 16.2 + phi) * 0.08
      );
      flame.rotation.z = Math.sin(elapsed * 12.0 + phi) * 0.06;

      if (flameLights[i]) {
        flameLights[i].intensity = 0.85 * flicker;
      }
    });
  };

  return {
    group,
    flameMeshes,
    flameLights,
    updateFlames,
  };
}
