import React from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  Camera,
  CheckCircle2,
  Eye,
  Flame,
  Smile,
  Sparkles,
  Swords,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ARENA_TABLE_THEMES,
  CARD_AURAS,
  CHARACTER_ARCHETYPES,
  getEloInfo,
  getSkinById,
  MOVE_ORDER,
  MOVES,
  resolveCharacterCustomization,
  ROUND_DURATION_SECONDS,
  VICTORY_EMOTES,
} from '../../constants/gameData';
import {
  MatchParticipant,
  MatchRoom,
  MoveId,
  PlayerProfile,
  RoundSummary,
} from '../../types/game';
import { isMobileTouchDevice, vibrateTap, vibrateThrow } from '../../utils/haptics';
import { soundFx } from '../../utils/soundFx';
import {
  getCachedImageTexture,
  getCardFrontFrameTexture,
  getMahoganyWoodTexture,
  getOrnateCardBackTexture,
  getSaloonBumpTexture,
  getSoftParticleTexture,
  getThemedTableSurfaceTexture,
} from './ProceduralPBR';
import {
  ArticulatedHandRig,
  buildHighPolyCardMesh,
  buildInstancedCardDeck,
  buildInstancedSaloonCoins,
  buildInstancedTableRivets,
  buildMoveTotem3D,
  buildSaloonEnvironmentProps,
  buildSaloonGunProp,
  buildSculptedFirstPersonHands,
  buildSeatedCharacter3D,
  buildTableCandleSet,
  buildWhiskeyGlassProp,
  detectSoftwareGl,
  disposeObject3D,
  optimizeHierarchyForCulling,
  SeatedCharacterRig,
  TableCandleController,
} from './TotemBuilder3D';

// Pre-allocated math objects for zero-GC Frustum Culling & Card Raycasting
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _actorSphere = new THREE.Sphere();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _tableCenterLookPos = new THREE.Vector3(0, 0.72, 0);

interface TableArena3DProps {
  room: MatchRoom;
  player: PlayerProfile;
  playerTeam: 'A' | 'B';
  secondsLeft: number;
  stagedMove: MoveId;
  revealRound: RoundSummary | null;
  activePairIndex: number;
  activePairUids: string[];
  isMyTurnToPick: boolean;
  isMyTeamChoosing: boolean;
  amIPaired: boolean;
  myTeamSum: number;
  oppTeamSum: number;
  hudCollapsed: boolean;
  onToggleHud: () => void;
  onStageMove: (moveId: MoveId) => void;
  onThrowStagedMove: () => void;
  onChooseOpponent: (opponentUid: string) => void;
  onFallbackTo2D?: () => void;
}

interface SeatAssignment {
  participant: MatchParticipant;
  isAlly: boolean;
  seatKey: 'top' | 'left' | 'right' | 'topLeft' | 'topRight';
  position: [number, number, number];
  rotationY: number;
  cardTargetPos: [number, number, number];
}

export const TableArena3D: React.FC<TableArena3DProps> = ({
  room,
  player,
  playerTeam,
  secondsLeft,
  stagedMove,
  revealRound,
  activePairIndex,
  activePairUids,
  isMyTurnToPick,
  isMyTeamChoosing,
  amIPaired,
  myTeamSum,
  oppTeamSum,
  hudCollapsed,
  onToggleHud,
  onStageMove,
  onThrowStagedMove,
  onChooseOpponent,
  onFallbackTo2D,
}) => {
  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const [cameraView, setCameraView] = React.useState<'fp' | 'tp' | 'cine'>('fp');
  const [turboFps, setTurboFps] = React.useState(false);
  const [contextLost, setContextLost] = React.useState(false);
  const [emoteMenuOpen, setEmoteMenuOpen] = React.useState(false);
  const [activeEmoteBubble, setActiveEmoteBubble] = React.useState<{
    sender: string;
    icon: string;
    phrase: string;
  } | null>(null);

  const myTeamList = playerTeam === 'A' ? room.teamA : room.teamB;
  const oppTeamList = playerTeam === 'A' ? room.teamB : room.teamA;
  const teammates = myTeamList.filter((p) => p.uid !== player.uid);

  const myPick = room.roundPicks[player.uid];
  const elo = getEloInfo(player.trophies);
  const playerCustom = resolveCharacterCustomization(
    player.characterCustomization,
    0
  );
  const playerArchMeta =
    CHARACTER_ARCHETYPES.find((a) => a.id === playerCustom.archetypeId) ??
    CHARACTER_ARCHETYPES[0];
  const tableTheme =
    ARENA_TABLE_THEMES.find((t) => t.id === playerCustom.tableThemeId) ??
    ARENA_TABLE_THEMES[0];
  const cardAura =
    CARD_AURAS.find((a) => a.id === playerCustom.cardAuraId) ?? CARD_AURAS[0];

  const triggerEmote = (icon: string, phrase: string, sender = player.nickname) => {
    soundFx.playSelect();
    vibrateTap();
    setActiveEmoteBubble({ sender, icon, phrase });
    setEmoteMenuOpen(false);
  };

  React.useEffect(() => {
    if (!activeEmoteBubble) return;
    const t = setTimeout(() => setActiveEmoteBubble(null), 2800);
    return () => clearTimeout(t);
  }, [activeEmoteBubble]);

  const seats = React.useMemo<SeatAssignment[]>(() => {
    const list: SeatAssignment[] = [];
    if (room.teamSize === 1) {
      if (oppTeamList[0]) {
        list.push({
          participant: oppTeamList[0],
          isAlly: false,
          seatKey: 'top',
          position: [0, -0.58, -4.15],
          rotationY: 0,
          cardTargetPos: [0, 0.04, -0.52],
        });
      }
    } else if (room.teamSize === 2) {
      if (oppTeamList[0]) {
        list.push({
          participant: oppTeamList[0],
          isAlly: false,
          seatKey: 'top',
          position: [-1.45, -0.58, -3.95],
          rotationY: 0.34,
          cardTargetPos: [-0.45, 0.04, -0.52],
        });
      }
      if (oppTeamList[1]) {
        list.push({
          participant: oppTeamList[1],
          isAlly: false,
          seatKey: 'right',
          position: [2.85, -0.58, -2.55],
          rotationY: -0.78,
          cardTargetPos: [0.55, 0.04, -0.35],
        });
      }
      if (teammates[0]) {
        list.push({
          participant: teammates[0],
          isAlly: true,
          seatKey: 'left',
          position: [-3.15, -0.58, -1.85],
          rotationY: 1.05,
          cardTargetPos: [-0.62, 0.04, 0.15],
        });
      }
    } else {
      if (oppTeamList[0]) {
        list.push({
          participant: oppTeamList[0],
          isAlly: false,
          seatKey: 'topLeft',
          position: [-2.15, -0.58, -3.65],
          rotationY: 0.48,
          cardTargetPos: [-0.65, 0.04, -0.52],
        });
      }
      if (oppTeamList[1]) {
        list.push({
          participant: oppTeamList[1],
          isAlly: false,
          seatKey: 'top',
          position: [0, -0.58, -4.18],
          rotationY: 0,
          cardTargetPos: [0, 0.04, -0.58],
        });
      }
      if (oppTeamList[2]) {
        list.push({
          participant: oppTeamList[2],
          isAlly: false,
          seatKey: 'topRight',
          position: [2.15, -0.58, -3.65],
          rotationY: -0.48,
          cardTargetPos: [0.65, 0.04, -0.52],
        });
      }
      if (teammates[0]) {
        list.push({
          participant: teammates[0],
          isAlly: true,
          seatKey: 'left',
          position: [-3.55, -0.58, -1.25],
          rotationY: 1.25,
          cardTargetPos: [-0.75, 0.04, 0.25],
        });
      }
      if (teammates[1]) {
        list.push({
          participant: teammates[1],
          isAlly: true,
          seatKey: 'right',
          position: [3.55, -0.58, -1.25],
          rotationY: -1.25,
          cardTargetPos: [0.75, 0.04, 0.25],
        });
      }
    }
    return list;
  }, [room.teamSize, oppTeamList, teammates]);

  const liveStateRef = React.useRef({
    room,
    player,
    playerTeam,
    stagedMove,
    myPick,
    revealRound,
    seats,
    activePairUids,
    cameraView,
    turboFps,
    isMyTurnToPick,
    activeEmoteBubble,
    onStageMove,
    onThrowStagedMove,
  });
  React.useEffect(() => {
    liveStateRef.current = {
      room,
      player,
      playerTeam,
      stagedMove,
      myPick,
      revealRound,
      seats,
      activePairUids,
      cameraView,
      turboFps,
      isMyTurnToPick,
      activeEmoteBubble,
      onStageMove,
      onThrowStagedMove,
    };
  }, [
    room,
    player,
    playerTeam,
    stagedMove,
    myPick,
    revealRound,
    seats,
    activePairUids,
    cameraView,
    turboFps,
    isMyTurnToPick,
    activeEmoteBubble,
    onStageMove,
    onThrowStagedMove,
  ]);

  // Dynamically update pixel ratio when toggling Turbo FPS without recreating WebGL context
  React.useEffect(() => {
    const renderer = rendererRef.current;
    const container = mountRef.current;
    if (!renderer || !container) return;
    const isSoft = detectSoftwareGl(renderer);
    const mobile = isMobileTouchDevice();
    const targetPr =
      isSoft || turboFps
        ? mobile
          ? 0.95
          : 1.0
        : Math.min(window.devicePixelRatio || 1, mobile ? 1.45 : 1.75);
    renderer.setPixelRatio(targetPr);
    renderer.setSize(
      Math.max(container.clientWidth, 240),
      Math.max(container.clientHeight, 160),
      false
    );
  }, [turboFps]);

  // Cycle camera view with [C] key and Turbo FPS with [F] key
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
        setCameraView((v) => (v === 'fp' ? 'tp' : v === 'tp' ? 'cine' : 'fp'));
      } else if (e.key === 'f' || e.key === 'F') {
        setTurboFps((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Initialize High-Craft Single-Pass Three.js Saloon Scene
  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isMobile = isMobileTouchDevice();
    const width = Math.max(container.clientWidth, 240);
    const height = Math.max(container.clientHeight, 160);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(tableTheme.fogHex);
    scene.fog = new THREE.FogExp2(tableTheme.fogHex, 0.036);

    const camera = new THREE.PerspectiveCamera(
      isMobile ? 52 : 48,
      width / height,
      0.1,
      55
    );
    const fpCamPos = new THREE.Vector3(0, 2.32, 3.82);
    const fpLookAt = new THREE.Vector3(0, 0.68, -1.05);
    const tpCamPos = new THREE.Vector3(0, 3.68, 6.28);
    const tpLookAt = new THREE.Vector3(0, 0.68, -0.55);
    camera.position.copy(fpCamPos);
    camera.lookAt(fpLookAt);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isMobileTouchDevice(),
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (err) {
      console.warn('[TableArena3D] WebGL renderer init error, falling back to 2D:', err);
      onFallbackTo2D?.();
      return;
    }

    const isSoftwareGl = detectSoftwareGl(renderer);
    if (isSoftwareGl && isMobileTouchDevice()) {
      console.warn('[TableArena3D] Software WebGL detected on mobile touch, recommending 2D fallback');
    }
    rendererRef.current = renderer;
    setContextLost(false);

    const initialPr =
      isSoftwareGl || liveStateRef.current.turboFps
        ? isMobile
          ? 0.95
          : 1.0
        : Math.min(window.devicePixelRatio || 1, isMobile ? 1.45 : 1.75);
    renderer.setPixelRatio(initialPr);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;

    // Enable PCF Soft Shadows for dramatic Chiaroscuro lighting
    const enableShadows = !isSoftwareGl;
    renderer.shadowMap.enabled = enableShadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener(
      'webglcontextrestored',
      handleContextRestored
    );

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.48;

    // --- BALANCED CINEMATIC SALOON & ARENA LIGHTING ---
    const hemiLight = new THREE.HemisphereLight(0xffe0b5, tableTheme.fogHex, 0.68);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffc078, 1.52);
    keyLight.position.set(1.4, 5.2, 2.2);
    scene.add(keyLight);

    const backRimLight = new THREE.DirectionalLight(tableTheme.ringHex, 0.85);
    backRimLight.position.set(-2.4, 3.8, -5.8);
    scene.add(backRimLight);

    const frontFillLight = new THREE.DirectionalLight(cardAura.colorHex, 0.42);
    frontFillLight.position.set(2.2, 2.5, 4.2);
    scene.add(frontFillLight);

    // Chandelier Amber SpotLight casting shadows down to the table
    const chandelierSpot = new THREE.SpotLight(0xfffae6, 3.2);
    chandelierSpot.position.set(0, 4.2, -0.2);
    chandelierSpot.target.position.set(0, 0, 0);
    scene.add(chandelierSpot.target);
    chandelierSpot.angle = Math.PI * 0.23; // ~41° cone
    chandelierSpot.penumbra = 0.65;
    chandelierSpot.decay = 2.0;
    chandelierSpot.distance = 16.0;
    if (enableShadows) {
      chandelierSpot.castShadow = true;
      const shadowRes = isMobile ? 512 : 1024;
      chandelierSpot.shadow.mapSize.width = shadowRes;
      chandelierSpot.shadow.mapSize.height = shadowRes;
      chandelierSpot.shadow.camera.near = 0.5;
      chandelierSpot.shadow.camera.far = 14.0;
      chandelierSpot.shadow.bias = -0.0006;
    }
    scene.add(chandelierSpot);
    frontFillLight.position.set(2.2, 2.5, 4.2);
    scene.add(frontFillLight);

    // --- SALOON & ARENA BACKGROUND ARCHITECTURE (PILLARS, LANTERNS, BAR & CHANDELIER) ---
    const woodTex = getMahoganyWoodTexture();
    const themedSurfaceTex = getThemedTableSurfaceTexture(playerCustom.tableThemeId);
    const bumpTex = getSaloonBumpTexture();
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    woodTex.anisotropy = maxAniso;
    themedSurfaceTex.anisotropy = maxAniso;

    const roomGroup = new THREE.Group();
    scene.add(roomGroup);

    const backWallMat = new THREE.MeshStandardMaterial({
      color: tableTheme.fogHex,
      roughness: 0.78,
      bumpMap: bumpTex,
      bumpScale: 0.02,
    });
    const backWall = new THREE.Mesh(
      new THREE.CylinderGeometry(
        11.8,
        11.8,
        9.8,
        isMobile ? 24 : 36,
        1,
        true,
        Math.PI * 0.55,
        Math.PI * 0.9
      ),
      backWallMat
    );
    backWall.material.side = THREE.BackSide;
    backWall.position.y = 2.2;
    roomGroup.add(backWall);

    roomGroup.add(buildSaloonEnvironmentProps(tableTheme.accentCss));

    // --- FLOATING 3D EMBER & SOFT ARCANE DUST (Gaussian Radial Sprite) ---
    const softParticleTex = getSoftParticleTexture();
    const particleCount = isMobile ? 55 : 110;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const r = 1.2 + Math.random() * 6.2;
      const theta = Math.random() * Math.PI * 2;
      particlePositions[i * 3] = Math.cos(theta) * r;
      particlePositions[i * 3 + 1] = Math.random() * 4.2;
      particlePositions[i * 3 + 2] = Math.sin(theta) * r - 0.8;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(particlePositions, 3)
    );
    const particleMat = new THREE.PointsMaterial({
      map: softParticleTex,
      color: 0xffd166,
      size: isMobile ? 0.095 : 0.082,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const emberParticles = new THREE.Points(particleGeo, particleMat);
    scene.add(emberParticles);

    // --- THEMED ROUND SALOON / ARENA TABLE ---
    const tableGroup = new THREE.Group();
    scene.add(tableGroup);

    const mahoganyRimMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: tableTheme.rimHex,
      bumpMap: bumpTex,
      bumpScale: 0.02,
      roughness: 0.38,
      metalness: 0.22,
    });

    const themedSurfaceMat = new THREE.MeshStandardMaterial({
      map: themedSurfaceTex,
      bumpMap: bumpTex,
      bumpScale: 0.018,
      roughness: 0.52,
      metalness: 0.14,
    });

    const tableSeg = isMobile ? 36 : 56;
    const tableBase = new THREE.Mesh(
      new THREE.CylinderGeometry(3.72, 3.48, 0.34, tableSeg),
      mahoganyRimMat
    );
    tableBase.position.y = -0.18;
    tableBase.receiveShadow = true;
    tableGroup.add(tableBase);

    // Sculpted central table pedestal column beneath table
    const tablePedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.65, 1.4, 24),
      mahoganyRimMat
    );
    tablePedestal.position.y = -0.95;
    tablePedestal.castShadow = true;
    tablePedestal.receiveShadow = true;
    tableGroup.add(tablePedestal);

    const outerRim = new THREE.Mesh(
      new THREE.TorusGeometry(3.48, 0.25, 16, tableSeg),
      mahoganyRimMat
    );
    outerRim.rotation.x = Math.PI / 2;
    outerRim.position.y = -0.01;
    tableGroup.add(outerRim);

    const brassInlay = new THREE.Mesh(
      new THREE.TorusGeometry(3.22, 0.028, 12, tableSeg),
      new THREE.MeshStandardMaterial({
        color: cardAura.colorHex,
        emissive: cardAura.colorHex,
        emissiveIntensity: 0.22,
        metalness: 0.88,
        roughness: 0.24,
      })
    );
    brassInlay.rotation.x = Math.PI / 2;
    brassInlay.position.y = 0.014;
    tableGroup.add(brassInlay);

    const innerSurface = new THREE.Mesh(
      new THREE.CylinderGeometry(3.24, 3.24, 0.04, tableSeg),
      themedSurfaceMat
    );
    innerSurface.position.y = -0.01;
    innerSurface.receiveShadow = true;
    tableGroup.add(innerSurface);

    const centerRingMat = new THREE.MeshStandardMaterial({
      color: tableTheme.ringHex,
      emissive: tableTheme.ringHex,
      emissiveIntensity: 0.48,
      roughness: 0.28,
    });
    const centerTargetRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.38, 0.038, 14, tableSeg),
      centerRingMat
    );
    centerTargetRing.rotation.x = Math.PI / 2;
    centerTargetRing.position.y = 0.018;
    tableGroup.add(centerTargetRing);

    // Twin Carved Brass Candelabras with Animated Triple-Flicker Flames
    const tableCandles = buildTableCandleSet(
      [
        [-1.22, 0.02, -0.42],
        [1.22, 0.02, -0.42],
      ],
      tableTheme.accentCss
    );
    tableGroup.add(tableCandles.group);

    // Dynamic Shockwave Pulse Ring on the Table Center
    const shockwaveMat = new THREE.MeshBasicMaterial({
      color: cardAura.colorHex,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shockwaveRing = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.46, 36),
      shockwaveMat
    );
    shockwaveRing.rotation.x = -Math.PI / 2;
    shockwaveRing.position.y = 0.024;
    scene.add(shockwaveRing);
    let shockwaveTimer = 0;

    // Ballistic Spark Particle System (48 sparks with elastic wood table bounce)
    const SPARK_COUNT = 48;
    const sparkPositions = new Float32Array(SPARK_COUNT * 3);
    const sparkVelocities = new Float32Array(SPARK_COUNT * 3);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(sparkPositions, 3)
    );
    const sparkMat = new THREE.PointsMaterial({
      map: softParticleTex,
      color: 0xffaa33,
      size: 0.09,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    scene.add(sparkPoints);
    let sparksActive = false;

    const triggerSparks = (originX = 0, originZ = 0) => {
      sparksActive = true;
      sparkMat.opacity = 0.95;
      for (let i = 0; i < SPARK_COUNT; i++) {
        sparkPositions[i * 3] = originX;
        sparkPositions[i * 3 + 1] = 0.12;
        sparkPositions[i * 3 + 2] = originZ;
        const phi = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 2.8;
        sparkVelocities[i * 3] = Math.cos(phi) * speed;
        sparkVelocities[i * 3 + 1] = 1.8 + Math.random() * 2.4;
        sparkVelocities[i * 3 + 2] = Math.sin(phi) * speed;
      }
      (sparkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    };

    // Quadratic Screen Trauma for Visceral Impact
    let cameraTrauma = 0;
    const addCameraTrauma = (amount: number) => {
      cameraTrauma = Math.min(1.0, cameraTrauma + amount);
    };

    // --- 3D SALOON TABLE PROPS ---
    const currentCustom = resolveCharacterCustomization(
      liveStateRef.current.player.characterCustomization,
      0
    );

    const playerGun = buildSaloonGunProp(currentCustom.gunSkinId, 'match');
    playerGun.position.set(1.32, 0.08, 1.65);
    playerGun.rotation.x = Math.PI / 2;
    playerGun.rotation.z = 2.38;
    playerGun.scale.setScalar(0.96);
    tableGroup.add(playerGun);

    const leftGun = buildSaloonGunProp('aco_azulado', 'match');
    leftGun.position.set(-1.68, 0.08, 0.48);
    leftGun.rotation.x = Math.PI / 2;
    leftGun.rotation.z = -0.35;
    leftGun.scale.setScalar(0.9);
    tableGroup.add(leftGun);

    const topGun = buildSaloonGunProp('ouro_imperial', 'match');
    topGun.position.set(1.28, 0.08, -1.68);
    topGun.rotation.x = Math.PI / 2;
    topGun.rotation.z = -2.65;
    topGun.scale.setScalar(0.88);
    tableGroup.add(topGun);

    const whiskeyLeft = buildWhiskeyGlassProp();
    whiskeyLeft.position.set(-2.18, 0.01, 1.15);
    tableGroup.add(whiskeyLeft);

    const whiskeyTop = buildWhiskeyGlassProp();
    whiskeyTop.position.set(-1.15, 0.01, -2.05);
    tableGroup.add(whiskeyTop);

    const instancedCoins = buildInstancedSaloonCoins([
      { x: -1.85, y: 0.01, z: 1.42, count: 8 },
      { x: -1.52, y: 0.01, z: 1.56, count: 5 },
      { x: 1.98, y: 0.01, z: 0.98, count: 7 },
      { x: 1.65, y: 0.01, z: -1.45, count: 6 },
    ]);
    tableGroup.add(instancedCoins);

    tableGroup.add(buildInstancedTableRivets(3.48, 36, 0.21));

    const dealerDeck = buildInstancedCardDeck(24, tableTheme.accentCss);
    dealerDeck.position.set(-1.58, 0.015, -1.12);
    dealerDeck.rotation.y = 0.42;
    tableGroup.add(dealerDeck);

    // --- PLAYER'S OWN 3D CHARACTER (Visible in 3rd Person & Cinematic Camera) ---
    const playerThirdPersonChar = buildSeatedCharacter3D({
      accentHex: tableTheme.accentCss,
      isAlly: true,
      variantIndex: 0,
      customization: currentCustom,
      detail: 'match',
    });
    playerThirdPersonChar.root.position.set(0, -0.58, 3.95);
    playerThirdPersonChar.root.rotation.y = Math.PI;
    playerThirdPersonChar.root.visible = false;
    scene.add(playerThirdPersonChar.root);

    // --- FIRST-PERSON SCULPTED ARTICULATED HANDS & FANNED 6 CARDS ---
    const fpGroup = new THREE.Group();
    scene.add(fpGroup);

    const {
      leftHand: leftPawGroup,
      rightHand: rightPawGroup,
      leftRig,
      rightRig,
    } = buildSculptedFirstPersonHands(currentCustom);

    leftPawGroup.position.set(-0.96, 0.66, 1.76);
    leftPawGroup.rotation.set(0.36, -0.32, -0.26);
    fpGroup.add(leftPawGroup);

    rightPawGroup.position.set(0.96, 0.66, 1.82);
    rightPawGroup.rotation.set(0.36, 0.32, 0.26);
    fpGroup.add(rightPawGroup);

    // Cached card artwork textures
    const moveTextures: Record<MoveId, THREE.Texture> = {
      papel: getCachedImageTexture(
        getSkinById(liveStateRef.current.player.equippedSkins.papel).customImage ??
          MOVES.papel.image
      ),
      parafal: getCachedImageTexture(
        getSkinById(liveStateRef.current.player.equippedSkins.parafal)
          .customImage ?? MOVES.parafal.image
      ),
      pedra: getCachedImageTexture(
        getSkinById(liveStateRef.current.player.equippedSkins.pedra).customImage ??
          MOVES.pedra.image
      ),
      gelo_invertido: getCachedImageTexture(
        getSkinById(liveStateRef.current.player.equippedSkins.gelo_invertido)
          .customImage ?? MOVES.gelo_invertido.image
      ),
      tesoura: getCachedImageTexture(
        getSkinById(liveStateRef.current.player.equippedSkins.tesoura)
          .customImage ?? MOVES.tesoura.image
      ),
      jegue: getCachedImageTexture(
        getSkinById(liveStateRef.current.player.equippedSkins.jegue).customImage ??
          MOVES.jegue.image
      ),
    };
    Object.values(moveTextures).forEach((t) => {
      t.anisotropy = maxAniso;
    });

    const fpCards: {
      moveId: MoveId;
      mesh: THREE.Group;
      basePos: THREE.Vector3;
      baseRot: THREE.Euler;
    }[] = [];
    const cardRayTargets: THREE.Mesh[] = [];

    const fpBackTex = getOrnateCardBackTexture(cardAura.cssColor);

    MOVE_ORDER.forEach((mId, idx) => {
      const spread = (idx - 2.5) * 0.22;
      const basePos = new THREE.Vector3(
        spread * 1.12,
        1.15 - Math.abs(idx - 2.5) * 0.042,
        1.86 + idx * 0.022
      );
      const baseRot = new THREE.Euler(-0.46, 0.02, -spread * 0.64);

      const skin = getSkinById(liveStateRef.current.player.equippedSkins[mId]);
      const frameTex = getCardFrontFrameTexture(
        MOVES[mId].shortName,
        String(idx + 1),
        skin.accentColor
      );

      const cardHolder = buildHighPolyCardMesh({
        width: 0.49,
        height: 0.7,
        thickness: 0.016,
        frontTexture: frameTex,
        artTexture: moveTextures[mId],
        backTexture: fpBackTex,
        accentHex: skin.accentColor,
      });
      cardHolder.position.copy(basePos);
      cardHolder.rotation.copy(baseRot);
      cardHolder.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          !(child instanceof THREE.InstancedMesh)
        ) {
          child.userData.moveId = mId;
          cardRayTargets.push(child);
        }
      });

      fpGroup.add(cardHolder);
      fpCards.push({ moveId: mId, mesh: cardHolder, basePos, baseRot });
    });

    // Player's Thrown Card on the center table (with Animated Parabolic Flight!)
    const playerThrownCard = new THREE.Group();
    const playerBackTex = getOrnateCardBackTexture(cardAura.cssColor);
    const thrownBody = new THREE.Mesh(
      new RoundedBoxGeometry(0.64, 0.9, 0.022, 2, 0.008),
      new THREE.MeshStandardMaterial({
        map: playerBackTex,
        metalness: 0.28,
        roughness: 0.42,
      })
    );
    thrownBody.rotation.x = Math.PI / 2;
    playerThrownCard.add(thrownBody);
    playerThrownCard.position.set(0, 0.035, 0.55);
    playerThrownCard.visible = false;
    scene.add(playerThrownCard);
    let playerThrowFlight = 0;

    // --- SEATED 3D OPPONENTS & TEAMMATES (With Throne Chairs & Animated Card Throws) ---
    const seatActors = liveStateRef.current.seats.map((seat, idx) => {
      const char = buildSeatedCharacter3D({
        accentHex: seat.isAlly ? '#F59E0B' : '#38BDF8',
        isAlly: seat.isAlly,
        variantIndex: idx + 1,
        customization: seat.participant.characterCustomization,
        detail: 'match',
      });
      char.root.position.set(...seat.position);
      char.root.rotation.y = seat.rotationY;
      scene.add(char.root);

      const rivalBackTex = getOrnateCardBackTexture(
        seat.isAlly ? '#F59E0B' : '#38BDF8'
      );
      const rivalCard = new THREE.Mesh(
        new RoundedBoxGeometry(0.6, 0.84, 0.022, 2, 0.008),
        new THREE.MeshStandardMaterial({
          map: rivalBackTex,
          metalness: 0.28,
          roughness: 0.42,
        })
      );
      rivalCard.rotation.x = Math.PI / 2;
      rivalCard.position.set(...seat.cardTargetPos);
      rivalCard.visible = false;
      scene.add(rivalCard);

      return {
        uid: seat.participant.uid,
        seat,
        char,
        rivalCard,
        flightProgress: 0,
      };
    });

    // --- DUAL 3D TOTEM CLASH ANCHORS FOR ROUND REVEAL ---
    const clashStageAnchor = new THREE.Group();
    clashStageAnchor.position.set(0, 0.72, 0);
    scene.add(clashStageAnchor);

    const myTotemSlot = new THREE.Group();
    const oppTotemSlot = new THREE.Group();
    clashStageAnchor.add(myTotemSlot);
    clashStageAnchor.add(oppTotemSlot);
    let currentRevealRoundNum = -1;
    let currentRevealWinner: 'MY' | 'OPP' | 'DRAW' = 'DRAW';

    optimizeHierarchyForCulling(scene);

    // Freeze static world matrices on non-moving Saloon Room & Table architecture
    roomGroup.updateMatrixWorld(true);
    roomGroup.traverse((obj) => {
      obj.matrixAutoUpdate = false;
    });
    tableGroup.updateMatrixWorld(true);
    tableGroup.traverse((obj) => {
      obj.matrixAutoUpdate = false;
    });

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // --- POINTER PARALLAX + TOUCH LOOK-AROUND + DIRECT 3D CARD TAP RAYCASTING ---
    let targetCamOffsetX = 0;
    let targetCamOffsetY = 0;
    let cachedRect = container.getBoundingClientRect();
    let pointerDownX = 0;
    let pointerDownY = 0;
    let isTouchDragging = false;
    let activePointerId: number | null = null;

    const canvasElem = renderer.domElement;

    const onCanvasPointerDown = (e: PointerEvent) => {
      activePointerId = e.pointerId;
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
      isTouchDragging = e.pointerType === 'touch';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (cachedRect.width <= 0 || cachedRect.height <= 0) return;
      if (e.pointerType === 'touch') {
        if (isTouchDragging && activePointerId === e.pointerId) {
          const dx = e.clientX - pointerDownX;
          const dy = e.clientY - pointerDownY;
          targetCamOffsetX = Math.max(
            -0.38,
            Math.min(0.38, (-dx / cachedRect.width) * 0.9)
          );
          targetCamOffsetY = Math.max(
            -0.16,
            Math.min(0.16, (dy / cachedRect.height) * 0.45)
          );
        }
        return;
      }
      const nx = ((e.clientX - cachedRect.left) / cachedRect.width) * 2 - 1;
      const ny = ((e.clientY - cachedRect.top) / cachedRect.height) * 2 - 1;
      targetCamOffsetX = nx * 0.22;
      targetCamOffsetY = -ny * 0.1;
    };

    const onCanvasPointerUp = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      activePointerId = null;
      const movedDist = Math.hypot(
        e.clientX - pointerDownX,
        e.clientY - pointerDownY
      );
      if (isTouchDragging) {
        isTouchDragging = false;
        if (movedDist > 12) {
          targetCamOffsetX *= 0.35;
          targetCamOffsetY *= 0.35;
          return;
        }
      }

      if (movedDist <= 10 && cachedRect.width > 0 && cachedRect.height > 0) {
        const state = liveStateRef.current;
        if (
          state.cameraView === 'fp' &&
          state.room.status === 'active' &&
          state.room.roundPhase === 'picking' &&
          state.isMyTurnToPick &&
          !state.myPick &&
          !state.revealRound
        ) {
          _pointerNdc.x =
            ((e.clientX - cachedRect.left) / cachedRect.width) * 2 - 1;
          _pointerNdc.y =
            -((e.clientY - cachedRect.top) / cachedRect.height) * 2 + 1;
          _raycaster.setFromCamera(_pointerNdc, camera);
          const hits = _raycaster.intersectObjects(cardRayTargets, false);
          if (hits.length > 0) {
            const hitMoveId = hits[0].object.userData.moveId as
              | MoveId
              | undefined;
            if (hitMoveId) {
              if (state.stagedMove !== hitMoveId) {
                vibrateTap();
                state.onStageMove(hitMoveId);
              } else {
                vibrateThrow();
                state.onThrowStagedMove();
              }
            }
          }
        }
      }
    };

    canvasElem.addEventListener('pointerdown', onCanvasPointerDown);
    canvasElem.addEventListener('pointerup', onCanvasPointerUp);
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const onResize = () => {
      if (!container) return;
      cachedRect = container.getBoundingClientRect();
      const w = Math.max(container.clientWidth, 240);
      const h = Math.max(container.clientHeight, 160);
      camera.aspect = w / h;
      camera.fov = w < 520 ? 53 : 48;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', onResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => onResize());
      resizeObserver.observe(container);
    }

    // --- LIFECYCLE PAUSE & ADAPTIVE RESOLUTION (DRS) ---
    let cancelled = false;
    let isPageHidden = document.hidden;
    let isInViewport = true;
    let rafId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const startTime = performance.now();
    let prevFrameMs = startTime;
    let drsAccumMs = 0;
    let drsFrames = 0;
    let currentDynamicPr = initialPr;

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

    const scheduleNextFrame = () => {
      if (cancelled || isPageHidden || !isInViewport) return;
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      if (cancelled || isPageHidden || !isInViewport) return;
      const now = performance.now();
      const dtMs = Math.min(100, Math.max(1, now - prevFrameMs));
      prevFrameMs = now;
      const dtFactor = Math.min(2.5, dtMs / 16.667);
      const elapsed = (now - startTime) * 0.001;
      const state = liveStateRef.current;

      // Adaptive Resolution Scaling (DRS)
      if (!isSoftwareGl) {
        drsAccumMs += dtMs;
        drsFrames += 1;
        if (drsFrames >= 30) {
          const avgMs = drsAccumMs / drsFrames;
          drsAccumMs = 0;
          drsFrames = 0;
          const minPr = isMobile ? 0.78 : 0.88;
          const maxPr = state.turboFps
            ? isMobile
              ? 0.95
              : 1.0
            : Math.min(window.devicePixelRatio || 1, isMobile ? 1.45 : 1.75);

          if (avgMs > 26 && currentDynamicPr > minPr) {
            currentDynamicPr = Math.max(minPr, currentDynamicPr - 0.12);
            renderer.setPixelRatio(currentDynamicPr);
            renderer.setSize(
              Math.max(container.clientWidth, 240),
              Math.max(container.clientHeight, 160),
              false
            );
          } else if (avgMs < 17.8 && currentDynamicPr < maxPr) {
            currentDynamicPr = Math.min(maxPr, currentDynamicPr + 0.08);
            renderer.setPixelRatio(currentDynamicPr);
            renderer.setSize(
              Math.max(container.clientWidth, 240),
              Math.max(container.clientHeight, 160),
              false
            );
          }
        }
      }

      // Animate floating ember particles
      const posAttr = particleGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        let py = posAttr.getY(i) + 0.0055 * dtFactor;
        if (py > 4.2) py = 0.05;
        posAttr.setY(i, py);
      }
      posAttr.needsUpdate = true;

      // Camera Mode Interpolation (1st Person, 3rd Person, or Cinematic Orbital)
      const camMode = state.cameraView;
      const showOwnChar = camMode === 'tp' || camMode === 'cine';
      playerThirdPersonChar.root.visible = showOwnChar;
      fpGroup.visible = camMode === 'fp';

      const camLerp = Math.min(0.35, 0.1 * dtFactor);
      if (camMode === 'cine') {
        const orbitAngle = Math.sin(elapsed * 0.42) * 0.72;
        const cineX = Math.sin(orbitAngle) * 5.9;
        const cineZ = Math.cos(orbitAngle) * 5.9;
        camera.position.x += (cineX - camera.position.x) * camLerp;
        camera.position.y += (3.85 + Math.sin(elapsed * 1.1) * 0.12 - camera.position.y) * camLerp;
        camera.position.z += (cineZ - camera.position.z) * camLerp;
        camera.lookAt(0, 0.55, -0.35);
      } else {
        const activeBaseCam = camMode === 'tp' ? tpCamPos : fpCamPos;
        const activeBaseLook = camMode === 'tp' ? tpLookAt : fpLookAt;

        camera.position.x +=
          (activeBaseCam.x + targetCamOffsetX - camera.position.x) * camLerp;
        camera.position.y +=
          (activeBaseCam.y +
            targetCamOffsetY +
            Math.sin(elapsed * 1.5) * 0.02 -
            camera.position.y) *
          camLerp;
        camera.position.z += (activeBaseCam.z - camera.position.z) * camLerp;

        camera.lookAt(
          activeBaseLook.x + targetCamOffsetX * 0.3,
          activeBaseLook.y + targetCamOffsetY * 0.2,
          activeBaseLook.z
        );
      }

      // First-Person Hands & Cards Animation
      const pickedMove = state.myPick;
      const cardLerp = Math.min(0.45, 0.18 * dtFactor);
      fpCards.forEach((c) => {
        if (pickedMove && c.moveId === pickedMove) {
          c.mesh.visible = false;
        } else {
          c.mesh.visible = true;
          const isStaged = !pickedMove && state.stagedMove === c.moveId;
          const targetY = c.basePos.y + (isStaged ? 0.24 : 0);
          const targetZ = c.basePos.z + (isStaged ? 0.18 : 0);
          c.mesh.position.y += (targetY - c.mesh.position.y) * cardLerp;
          c.mesh.position.z += (targetZ - c.mesh.position.z) * cardLerp;
        }
      });

      // Animate sculpted first-person hands (breathing + throw flick + articulated grip)
      leftPawGroup.position.y = 0.66 + Math.sin(elapsed * 1.8) * 0.012;
      if (pickedMove && playerThrowFlight < 0.85) {
        // Elastic snap & release throw posture
        rightPawGroup.position.z = 1.68;
        rightPawGroup.rotation.x = 0.12;
        rightRig.fingers.forEach((f) => {
          f.proximalPhalanx.rotation.x = -0.32;
          f.medialJoint.rotation.x = -0.22;
        });
      } else if (state.stagedMove) {
        // Staged card grip posture
        rightPawGroup.position.z += (1.82 - rightPawGroup.position.z) * 0.15;
        rightPawGroup.position.y = 0.66 + Math.cos(elapsed * 1.8) * 0.012;
        rightPawGroup.rotation.x += (0.36 - rightPawGroup.rotation.x) * 0.15;
        if (rightRig.fingers[0]) rightRig.fingers[0].medialJoint.rotation.x = 0.45;
        rightRig.thumb.carpometacarpalJoint.rotation.x = 0.42;
      } else {
        // Relaxed idle hand posture
        rightPawGroup.position.z += (1.82 - rightPawGroup.position.z) * 0.15;
        rightPawGroup.position.y = 0.66 + Math.cos(elapsed * 1.8) * 0.012;
        rightPawGroup.rotation.x += (0.36 - rightPawGroup.rotation.x) * 0.15;
        rightRig.fingers.forEach((f) => {
          f.proximalPhalanx.rotation.x = 0;
          f.medialJoint.rotation.x = 0;
        });
        rightRig.thumb.carpometacarpalJoint.rotation.x = 0;
      }

      // Update Candelabra Flames
      tableCandles.updateFlames(elapsed, dtFactor);

      if (showOwnChar) {
        let playerReaction: 'idle' | 'throwing' | 'victory' | 'defeat' = 'idle';
        if (state.revealRound) {
          if (state.revealRound.winnerTeam === 'DRAW') {
            playerReaction = 'idle';
          } else if (state.revealRound.winnerTeam === state.playerTeam) {
            playerReaction = 'victory';
          } else {
            playerReaction = 'defeat';
          }
        } else if (pickedMove) {
          playerReaction = 'throwing';
        }
        playerThirdPersonChar.updateAnimation(
          elapsed,
          dtFactor,
          playerReaction,
          _tableCenterLookPos
        );
      }

      // Animate Player's Thrown Card Parabolic Flight to the Table
      if (pickedMove || state.revealRound) {
        if (!playerThrownCard.visible) {
          playerThrownCard.visible = true;
          playerThrowFlight = 0;
          shockwaveTimer = 1.0;
          addCameraTrauma(0.38);
          triggerSparks(0, 0.55);
        }
        playerThrowFlight = Math.min(1, playerThrowFlight + 0.085 * dtFactor);
        const easeT = 1 - Math.pow(1 - playerThrowFlight, 3);
        playerThrownCard.position.set(
          0,
          (1 - easeT) * 0.95 +
            0.038 +
            Math.sin(easeT * Math.PI) * 0.45 +
            (state.revealRound ? Math.abs(Math.sin(elapsed * 4)) * 0.06 : 0),
          (1 - easeT) * 1.85 + easeT * 0.55
        );
        playerThrownCard.rotation.y = (1 - easeT) * Math.PI * 2;
      } else {
        playerThrownCard.visible = false;
        playerThrowFlight = 0;
      }

      // Animate Table Shockwave Ring
      if (shockwaveTimer > 0) {
        shockwaveTimer = Math.max(0, shockwaveTimer - 0.032 * dtFactor);
        const sScale = 1 + (1 - shockwaveTimer) * 3.8;
        shockwaveRing.scale.setScalar(sScale);
        shockwaveMat.opacity = shockwaveTimer * 0.55;
      } else {
        shockwaveMat.opacity = 0;
      }

      // Animate Ballistic Sparks with wood table bounce
      if (sparksActive) {
        const pos = sparkGeo.attributes.position as THREE.BufferAttribute;
        let anyAlive = false;
        for (let i = 0; i < SPARK_COUNT; i++) {
          sparkVelocities[i * 3 + 1] -= 9.8 * 0.016 * dtFactor;
          let px = pos.getX(i) + sparkVelocities[i * 3] * 0.016 * dtFactor;
          let py = pos.getY(i) + sparkVelocities[i * 3 + 1] * 0.016 * dtFactor;
          let pz = pos.getZ(i) + sparkVelocities[i * 3 + 2] * 0.016 * dtFactor;
          if (py <= 0.02) {
            py = 0.02;
            sparkVelocities[i * 3 + 1] = -sparkVelocities[i * 3 + 1] * 0.52;
            sparkVelocities[i * 3] *= 0.82;
            sparkVelocities[i * 3 + 2] *= 0.82;
          }
          pos.setXYZ(i, px, py, pz);
          if (sparkMat.opacity > 0.02) anyAlive = true;
        }
        pos.needsUpdate = true;
        sparkMat.opacity = Math.max(0, sparkMat.opacity - 0.025 * dtFactor);
        if (!anyAlive) sparksActive = false;
      }

      // Quadratic Camera Trauma screen shake
      if (cameraTrauma > 0) {
        cameraTrauma = Math.max(0, cameraTrauma - 0.028 * dtFactor);
        const shake = cameraTrauma * cameraTrauma;
        const shakeAngle = elapsed * 32.0;
        camera.position.x +=
          (Math.cos(shakeAngle) * 0.045 + Math.sin(shakeAngle * 1.7) * 0.02) *
          shake;
        camera.position.y += Math.sin(shakeAngle * 1.3) * 0.035 * shake;
        camera.rotation.z += Math.sin(shakeAngle * 0.9) * 0.012 * shake;
      }

      // Zero-GC Camera Frustum Culling & Animation for Seated Opponents/Allies
      camera.updateMatrixWorld();
      _projScreenMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      _frustum.setFromProjectionMatrix(_projScreenMatrix);

      seatActors.forEach((actor, idx) => {
        const hasPicked =
          Boolean(state.room.roundPicks[actor.uid]) ||
          Boolean(state.revealRound);

        if (hasPicked) {
          if (!actor.rivalCard.visible) {
            actor.rivalCard.visible = true;
            actor.flightProgress = 0;
            shockwaveTimer = 0.85;
            addCameraTrauma(0.32);
            triggerSparks(
              actor.seat.cardTargetPos[0],
              actor.seat.cardTargetPos[2]
            );
          }
          actor.flightProgress = Math.min(
            1,
            actor.flightProgress + 0.08 * dtFactor
          );
          const easeT = 1 - Math.pow(1 - actor.flightProgress, 3);
          const startX = actor.seat.position[0] * 0.65;
          const startZ = actor.seat.position[2] * 0.65;
          actor.rivalCard.position.set(
            startX + (actor.seat.cardTargetPos[0] - startX) * easeT,
            actor.seat.cardTargetPos[1] + Math.sin(easeT * Math.PI) * 0.42,
            startZ + (actor.seat.cardTargetPos[2] - startZ) * easeT
          );
          actor.rivalCard.rotation.z =
            (1 - easeT) * Math.PI + Math.sin(idx * 2.1) * 0.22;
        } else {
          actor.rivalCard.visible = false;
          actor.flightProgress = 0;
        }

        _actorSphere.center.set(
          actor.seat.position[0],
          actor.seat.position[1] + 1.1,
          actor.seat.position[2]
        );
        _actorSphere.radius = 2.0;

        if (!_frustum.intersectsSphere(_actorSphere)) {
          return;
        }

        // 4-state reaction based on match state
        let actorReaction: 'idle' | 'throwing' | 'victory' | 'defeat' = 'idle';
        if (state.revealRound) {
          if (state.revealRound.winnerTeam === 'DRAW') {
            actorReaction = 'idle';
          } else {
            const isWinner =
              (state.revealRound.winnerTeam === state.playerTeam &&
                actor.seat.isAlly) ||
              (state.revealRound.winnerTeam !== state.playerTeam &&
                !actor.seat.isAlly);
            actorReaction = isWinner ? 'victory' : 'defeat';
          }
        } else if (hasPicked && actor.flightProgress < 0.95) {
          actorReaction = 'throwing';
        }

        actor.char.updateAnimation(
          elapsed,
          dtFactor,
          actorReaction,
          _tableCenterLookPos
        );
      });

      // --- DUAL 3D TOTEM CLASH SHOWDOWN ON ROUND REVEAL ---
      if (state.revealRound) {
        if (currentRevealRoundNum !== state.revealRound.roundNumber) {
          currentRevealRoundNum = state.revealRound.roundNumber;
          shockwaveTimer = 1.0;
          addCameraTrauma(0.55);
          triggerSparks(0, 0);
          disposeObject3D(myTotemSlot);
          disposeObject3D(oppTotemSlot);
          myTotemSlot.clear();
          oppTotemSlot.clear();

          const firstClash = state.revealRound.clashes[0];
          if (firstClash) {
            const amITeamA = state.playerTeam === 'A';
            const myMove = amITeamA ? firstClash.moveA : firstClash.moveB;
            const oppMove = amITeamA ? firstClash.moveB : firstClash.moveA;
            const mySkinId = amITeamA ? firstClash.skinA : firstClash.skinB;
            const oppSkinId = amITeamA ? firstClash.skinB : firstClash.skinA;

            if (firstClash.outcomeForA === 'draw') {
              currentRevealWinner = 'DRAW';
            } else {
              const aWon = firstClash.outcomeForA === 'win';
              currentRevealWinner =
                (amITeamA && aWon) || (!amITeamA && !aWon) ? 'MY' : 'OPP';
            }

            const myTotem = buildMoveTotem3D(myMove, getSkinById(mySkinId));
            myTotem.scale.setScalar(0.68);
            myTotemSlot.add(myTotem);

            const oppTotem = buildMoveTotem3D(oppMove, getSkinById(oppSkinId));
            oppTotem.scale.setScalar(0.68);
            oppTotemSlot.add(oppTotem);
          }
        }
        clashStageAnchor.visible = true;
        const strikeWave = Math.sin(elapsed * 4.5) * 0.22;

        myTotemSlot.position.set(
          -0.48,
          Math.sin(elapsed * 3.2) * 0.06,
          0.42 + (currentRevealWinner === 'MY' ? - Math.abs(strikeWave) : 0)
        );
        myTotemSlot.rotation.y = elapsed * 1.6;
        myTotemSlot.scale.setScalar(currentRevealWinner === 'MY' ? 1.12 : 0.86);

        oppTotemSlot.position.set(
          0.48,
          Math.cos(elapsed * 3.2) * 0.06,
          -0.42 + (currentRevealWinner === 'OPP' ? Math.abs(strikeWave) : 0)
        );
        oppTotemSlot.rotation.y = -elapsed * 1.6;
        oppTotemSlot.scale.setScalar(
          currentRevealWinner === 'OPP' ? 1.12 : 0.86
        );

        centerRingMat.emissive.setHex(
          currentRevealWinner === 'MY'
            ? 0x10b981
            : currentRevealWinner === 'OPP'
            ? 0xef4444
            : 0xf59e0b
        );
      } else {
        if (currentRevealRoundNum !== -1) {
          currentRevealRoundNum = -1;
          disposeObject3D(myTotemSlot);
          disposeObject3D(oppTotemSlot);
          myTotemSlot.clear();
          oppTotemSlot.clear();
        }
        clashStageAnchor.visible = false;
        centerRingMat.emissive.setHex(tableTheme.ringHex);
      }

      renderer.render(scene, camera);
      scheduleNextFrame();
    };

    const onVisibilityChange = () => {
      isPageHidden = document.hidden;
      if (!isPageHidden && isInViewport && !cancelled) {
        prevFrameMs = performance.now();
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          const nowVisible = entry.isIntersecting;
          if (nowVisible !== isInViewport) {
            isInViewport = nowVisible;
            if (isInViewport && !isPageHidden && !cancelled) {
              prevFrameMs = performance.now();
              tick();
            }
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
      resizeObserver?.disconnect();
      canvasElem.removeEventListener('pointerdown', onCanvasPointerDown);
      canvasElem.removeEventListener('pointerup', onCanvasPointerUp);
      canvasElem.removeEventListener('webglcontextlost', handleContextLost);
      canvasElem.removeEventListener(
        'webglcontextrestored',
        handleContextRestored
      );
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      particleGeo.dispose();
      particleMat.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      envTexture.dispose();
      pmremGenerator.dispose();
      disposeObject3D(scene);
      renderer.dispose();
    };
  }, [
    seats.length,
    room.teamSize,
    playerCustom.archetypeId,
    playerCustom.hatId,
    playerCustom.eyewearId,
    playerCustom.outfitId,
    playerCustom.propId,
    playerCustom.gunSkinId,
    playerCustom.tableThemeId,
    playerCustom.cardAuraId,
    tableTheme.fogHex,
    tableTheme.rimHex,
    tableTheme.ringHex,
    tableTheme.accentCss,
    cardAura.colorHex,
    cardAura.cssColor,
  ]);

  const stagedMoveMeta = MOVES[stagedMove];
  const timerProgress = Math.max(
    0,
    Math.min(1, secondsLeft / ROUND_DURATION_SECONDS)
  );
  const circleCircumference = 2 * Math.PI * 22;

  const pairedB = new Set(
    (room.roundPairings || []).map((p) => p.split(':')[1])
  );
  const pairedA = new Set(
    (room.roundPairings || []).map((p) => p.split(':')[0])
  );

  return (
    <section
      ref={sectionRef}
      className="relative h-full w-full flex-1 min-h-[200px] overflow-hidden rounded-xl sm:rounded-2xl border border-amber-500/20 bg-[#0E0705] select-none shadow-2xl"
    >
      {/* Isolated Three.js WebGL Mount filling 100% of the stage */}
      <div ref={mountRef} className="touch-3d-canvas absolute inset-0" />

      {/* Subtle Cinematic Vignette Overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 58%, rgba(6, 4, 3, 0.65) 100%)',
        }}
      />

      {contextLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0B0F17]/90 p-4 text-center">
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-[#131A26] p-4">
            <p className="text-sm font-bold text-amber-300">
              Contexto 3D pausado pela memória do dispositivo
            </p>
            <p className="text-xs text-slate-400">
              Toque em qualquer carta abaixo ou alterne para Visão 2D se preferir.
            </p>
          </div>
        </div>
      )}

      {/* --- TOP-LEFT HUD: UNCLIPPED TABLE TITLE + OPPONENT/ALLY SEAT TAGS --- */}
      <div className="pointer-events-none absolute top-4 left-3 sm:top-5 sm:left-5 z-10 max-w-[148px] sm:max-w-[270px] space-y-2">
        <div className="rounded-xl border border-amber-500/35 bg-[#120A07]/90 backdrop-blur-md px-3 py-2 shadow-xl">
          <div className="flex items-center gap-1.5 border-b border-amber-400/40 pb-1">
            <Flame className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <div className="font-display text-xs sm:text-base font-black uppercase tracking-wider text-amber-400 truncate">
              MESA {elo.tier.name.toUpperCase()}
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-300">
            <span>
              {room.mode} · {room.format} · R{room.currentRound}
            </span>
            <span className="text-amber-300">
              {Object.keys(room.roundPicks).length}/{room.participantUids.length} NA MESA
            </span>
          </div>
          <div className="hidden sm:block mt-0.5 text-[10px] font-medium text-slate-400 truncate">
            {playerArchMeta.name} · {tableTheme.name}
          </div>
        </div>

        {/* Opponent & Ally Status Tags neatly stacked on the left so they NEVER cover the 3D opponent's face! */}
        <div className="flex flex-col gap-1.5">
          {seats.map((s) => {
            const p = s.participant;
            const hasPicked = Boolean(room.roundPicks[p.uid]);
            const isCurrentlyPicking = activePairUids.includes(p.uid);
            const isAlreadyPaired =
              playerTeam === 'A' ? pairedB.has(p.uid) : pairedA.has(p.uid);
            const canSelectForPairing =
              room.roundPhase === 'pairing' &&
              !s.isAlly &&
              isMyTeamChoosing &&
              !amIPaired &&
              !isAlreadyPaired;

            return (
              <div
                key={p.uid}
                className={`pointer-events-auto flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] sm:text-xs shadow-lg backdrop-blur-md transition-colors ${
                  isCurrentlyPicking
                    ? 'border-amber-400/80 bg-[#1B100C]/90'
                    : 'border-white/15 bg-[#120A07]/85'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-bold truncate ${
                        s.isAlly ? 'text-amber-300' : 'text-white'
                      }`}
                    >
                      {p.nickname}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                      {p.turma}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px]">
                    {hasPicked ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Jogou na mesa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <Eye className="h-3 w-3" />
                        Olhando cartas...
                      </span>
                    )}
                  </div>
                </div>

                {canSelectForPairing && (
                  <button
                    type="button"
                    onClick={() => {
                      vibrateTap();
                      onChooseOpponent(p.uid);
                    }}
                    className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-extrabold text-slate-950 hover:bg-amber-400 cursor-pointer"
                  >
                    <Swords className="h-3 w-3" />
                    <span>Enfrentar</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- TOP-CENTER LIVE EMOTE BUBBLE (Leaves 3D Opponent's Face 100% Unobstructed!) --- */}
      <div className="pointer-events-none absolute top-20 sm:top-5 left-1/2 z-10 -translate-x-1/2 flex flex-col items-center">
        <AnimatePresence>
          {activeEmoteBubble && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.9 }}
              className="flex items-center gap-2 rounded-full border border-amber-400/70 bg-[#140B08]/95 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-xl"
            >
              <span className="text-base">{activeEmoteBubble.icon}</span>
              <span className="text-amber-300">{activeEmoteBubble.sender}:</span>
              <span>{activeEmoteBubble.phrase}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- TOP-RIGHT HUD: CIRCULAR STOPWATCH TIMER + TURN STATUS + CAMERA / EMOTES / REVOLVER DRUM --- */}
      <div className="absolute top-4 right-3 sm:top-5 sm:right-5 z-10 flex flex-col items-end space-y-2">
        <div className="pointer-events-none flex items-center gap-2">
          <div
            className={`relative flex h-11 w-11 sm:h-13 sm:w-13 shrink-0 items-center justify-center rounded-full border bg-[#120A07]/92 shadow-2xl backdrop-blur-md ${
              secondsLeft <= 5
                ? 'border-red-500/80 ring-2 ring-red-500/40 animate-pulse'
                : 'border-amber-500/40'
            }`}
          >
            <svg className="h-11 w-11 sm:h-13 sm:w-13 -rotate-90" viewBox="0 0 52 52">
              <circle
                cx="26"
                cy="26"
                r="22"
                fill="none"
                stroke="rgba(251, 191, 36, 0.2)"
                strokeWidth="3.5"
              />
              <circle
                cx="26"
                cy="26"
                r="22"
                fill="none"
                stroke={secondsLeft <= 5 ? '#EF4444' : '#FBBF24'}
                strokeWidth="3.5"
                strokeDasharray={circleCircumference}
                strokeDashoffset={circleCircumference * (1 - timerProgress)}
                strokeLinecap="round"
              />
            </svg>
            <span
              className={`font-mono-num absolute text-sm sm:text-lg font-black ${
                secondsLeft <= 5 ? 'text-red-400' : 'text-white'
              }`}
            >
              {secondsLeft}
            </span>
          </div>

          <div className="rounded-xl border border-amber-500/35 bg-[#120A07]/90 backdrop-blur-md px-2 sm:px-3 py-1 sm:py-1.5 text-right shadow-xl">
            <div className="font-display text-xs sm:text-lg font-black uppercase tracking-wider text-white">
              {myPick
                ? 'NA MESA!'
                : isMyTurnToPick
                ? 'SEU TURNO!'
                : 'AGUARDE'}
            </div>
          </div>
        </div>

        {/* Quick Action Buttons (Camera, Emote, FPS) */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setEmoteMenuOpen((v) => !v)}
              aria-label="Enviar Reação na Mesa"
              className="flex h-9 items-center gap-1 rounded-lg border border-amber-400/40 bg-[#120A07]/92 px-2.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 cursor-pointer"
            >
              <Smile className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Provocar</span>
            </button>

            {emoteMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-amber-400/50 bg-[#120A07]/95 p-1.5 shadow-2xl backdrop-blur-md space-y-1 z-30">
                {VICTORY_EMOTES.map((em) => (
                  <button
                    key={em.id}
                    type="button"
                    onClick={() => triggerEmote(em.icon, em.phrase)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 cursor-pointer"
                  >
                    <span className="text-base">{em.icon}</span>
                    <span className="truncate">{em.phrase}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              vibrateTap();
              setCameraView((v) =>
                v === 'fp' ? 'tp' : v === 'tp' ? 'cine' : 'fp'
              );
            }}
            aria-label="Alternar câmera 3D"
            className="flex h-9 items-center justify-center gap-1 rounded-lg border border-amber-400/40 bg-[#120A07]/92 px-2.5 text-[11px] font-bold text-amber-300 hover:text-white cursor-pointer"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>
              {cameraView === 'fp'
                ? '1ª Pessoa'
                : cameraView === 'tp'
                ? '3ª Pessoa'
                : 'Cine 360°'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateTap();
              setTurboFps((v) => !v);
            }}
            aria-label="Alternar modo FPS"
            className={`flex h-9 items-center justify-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold cursor-pointer ${
              turboFps
                ? 'border-emerald-400/50 bg-emerald-950/90 text-emerald-300'
                : 'border-white/20 bg-[#120A07]/92 text-slate-300'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>{turboFps ? '60fps' : 'Ultra'}</span>
          </button>
        </div>

        {/* Desktop Revolver Drum & Keybinds */}
        <div className="hidden lg:flex items-center gap-3 rounded-xl border border-amber-500/30 bg-[#120A07]/90 backdrop-blur-md p-2.5 shadow-lg">
          <div
            className="relative h-14 w-14 shrink-0 rounded-full border-2 border-amber-400/60 bg-[#1F120D]"
            title="Tambor das 6 Jogadas"
          >
            <div className="absolute inset-0 m-auto h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            {MOVE_ORDER.map((mId, i) => {
              const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
              const cx = 50 + Math.cos(angle) * 33;
              const cy = 50 + Math.sin(angle) * 33;
              const isStaged = stagedMove === mId;
              const isBeaten = stagedMoveMeta.beats.includes(mId);
              return (
                <button
                  key={mId}
                  type="button"
                  onClick={() => onStageMove(mId)}
                  style={{ left: `${cx}%`, top: `${cy}%` }}
                  className={`-translate-x-1/2 -translate-y-1/2 absolute flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-black transition-transform cursor-pointer ${
                    isStaged
                      ? 'scale-125 border-white bg-amber-400 text-slate-950'
                      : isBeaten
                      ? 'border-emerald-400 bg-emerald-950 text-emerald-300'
                      : 'border-amber-500/40 bg-[#0B0F17] text-slate-300'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <div className="space-y-1 text-right text-[11px]">
            <div className="flex items-center justify-end gap-1.5">
              <span className="font-bold text-amber-200">Carta</span>
              <kbd className="font-mono-num rounded border border-emerald-400/60 bg-emerald-950/80 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                1-6
              </kbd>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <span className="font-bold text-amber-200">Lançar</span>
              <kbd className="font-mono-num rounded border border-emerald-400/60 bg-emerald-950/80 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                ESPAÇO
              </kbd>
            </div>
            <button
              type="button"
              onClick={onToggleHud}
              className="flex w-full items-center justify-end gap-1.5 text-slate-300 hover:text-white cursor-pointer"
            >
              <span className="font-semibold">
                {hudCollapsed ? 'Mostrar Dock' : 'Ocultar Dock'}
              </span>
              <kbd className="font-mono-num rounded border border-white/25 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
                H
              </kbd>
            </button>
          </div>
        </div>
      </div>

      {/* --- PAIRING PHASE BANNER (FOR 2v2 / 3v3) --- */}
      {room.roundPhase === 'pairing' && !revealRound && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 mx-auto max-w-lg px-3 sm:px-4">
          <div className="rounded-xl border border-amber-400/50 bg-[#140B08]/95 p-3 text-center shadow-xl backdrop-blur-md">
            <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-400">
              Pareamento ({myTeamSum} vs {oppTeamSum} troféus)
            </div>
            <p className="mt-0.5 text-[11px] sm:text-xs text-slate-200">
              {isMyTeamChoosing
                ? amIPaired
                  ? 'Confronto definido! Aguardando parceiros.'
                  : 'Toque em "Enfrentar" em um adversário no painel à esquerda.'
                : 'Adversário escolhendo os confrontos...'}
            </p>
          </div>
        </div>
      )}

      {/* --- ROUND REVEAL OVERLAY BANNER --- */}
      {revealRound && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 mx-auto max-w-xl px-3 sm:px-4">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="rounded-2xl border border-amber-400/70 bg-[#140B08]/95 p-3 sm:p-4 text-center shadow-2xl backdrop-blur-md space-y-1.5"
          >
            <div className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-amber-400">
              Confronto 3D Revelado · Rodada {revealRound.roundNumber}
            </div>
            <div className="space-y-1">
              {revealRound.clashes.map((c) => (
                <div
                  key={c.slotIndex}
                  className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 text-[11px] sm:text-xs"
                >
                  <span className="font-bold text-amber-300">
                    {c.playerAName}: {MOVES[c.moveA].shortName}
                  </span>
                  <span className="font-semibold text-white">{c.reason}</span>
                  <span className="font-bold text-sky-300">
                    {c.playerBName}: {MOVES[c.moveB].shortName}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* --- FOREGROUND ACTION BAR OVERLAID AT BOTTOM OF 3D VIEWPORT --- */}
      {room.roundPhase === 'picking' && !revealRound && (
        <div
          className={`${
            hudCollapsed ? 'flex' : 'hidden sm:flex'
          } absolute inset-x-0 bottom-3 z-10 flex-wrap items-center justify-between gap-3 px-4 sm:px-6 pointer-events-none`}
        >
          <div className="pointer-events-auto rounded-xl border border-white/15 bg-[#120A07]/90 backdrop-blur-md px-3.5 py-2 text-xs shadow-lg">
            <span className="text-slate-400">Carta em destaque na mão 3D: </span>
            <strong className="text-amber-300">{stagedMoveMeta.name}</strong>
            <span className="hidden md:inline text-slate-400">
              {' '}
              (Vence {MOVES[stagedMoveMeta.beats[0]].shortName} e{' '}
              {MOVES[stagedMoveMeta.beats[1]].shortName})
            </span>
          </div>

          {!myPick && isMyTurnToPick ? (
            <button
              type="button"
              onClick={() => {
                vibrateThrow();
                onThrowStagedMove();
              }}
              className="pointer-events-auto inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-2 text-xs sm:text-sm font-black uppercase tracking-wide text-slate-950 shadow-lg shadow-amber-500/30 hover:brightness-110 transition-transform active:scale-95 cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>Jogar {stagedMoveMeta.name} na Mesa [ESPAÇO]</span>
            </button>
          ) : (
            <div className="pointer-events-auto rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 text-xs font-bold text-emerald-300 shadow-lg">
              {myPick
                ? `Você lançou ${MOVES[myPick].name} no centro da mesa!`
                : activePairIndex >= 0
                ? `Duelo ${activePairIndex + 1} em andamento na mesa...`
                : 'Aguardando revelação...'}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
