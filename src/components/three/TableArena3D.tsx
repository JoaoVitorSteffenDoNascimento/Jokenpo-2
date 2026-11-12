import React from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Camera, CheckCircle2, Eye, Sparkles, Swords, Zap } from 'lucide-react';
import {
  CHARACTER_ARCHETYPES,
  CHARACTER_OUTFITS,
  getEloInfo,
  getSkinById,
  MOVE_ORDER,
  MOVES,
  resolveCharacterCustomization,
  ROUND_DURATION_SECONDS,
} from '../../constants/gameData';
import {
  MatchParticipant,
  MatchRoom,
  MoveId,
  PlayerProfile,
  RoundSummary,
} from '../../types/game';
import { isMobileTouchDevice, vibrateTap, vibrateThrow } from '../../utils/haptics';
import {
  getCachedImageTexture,
  getCardFrontFrameTexture,
  getMahoganyWoodTexture,
  getMechaHexScaleTexture,
  getOrnateCardBackTexture,
  getSaloonBumpTexture,
} from './ProceduralPBR';
import {
  buildHighPolyCardMesh,
  buildInstancedCardDeck,
  buildInstancedSaloonCoins,
  buildInstancedTableRivets,
  buildMoveTotem3D,
  buildSaloonGunProp,
  buildSeatedCharacter3D,
  buildWhiskeyGlassProp,
  detectSoftwareGl,
  disposeObject3D,
  optimizeHierarchyForCulling,
} from './TotemBuilder3D';

// Pre-allocated math objects for zero-GC Frustum Culling & Card Raycasting
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _actorSphere = new THREE.Sphere();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();

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
}) => {
  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const [cameraView, setCameraView] = React.useState<'fp' | 'tp'>('fp');
  const [turboFps, setTurboFps] = React.useState(true);
  const [contextLost, setContextLost] = React.useState(false);

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
    stagedMove,
    myPick,
    revealRound,
    seats,
    activePairUids,
    cameraView,
    turboFps,
    isMyTurnToPick,
    onStageMove,
    onThrowStagedMove,
  });
  React.useEffect(() => {
    liveStateRef.current = {
      room,
      player,
      stagedMove,
      myPick,
      revealRound,
      seats,
      activePairUids,
      cameraView,
      turboFps,
      isMyTurnToPick,
      onStageMove,
      onThrowStagedMove,
    };
  }, [
    room,
    player,
    stagedMove,
    myPick,
    revealRound,
    seats,
    activePairUids,
    cameraView,
    turboFps,
    isMyTurnToPick,
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
          ? 0.9
          : 1
        : Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.5);
    renderer.setPixelRatio(targetPr);
    renderer.setSize(
      Math.max(container.clientWidth, 280),
      Math.max(container.clientHeight, 300),
      false
    );
  }, [turboFps]);

  // Toggle camera view with [C] key and Turbo FPS with [F] key
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
        setCameraView((v) => (v === 'fp' ? 'tp' : 'fp'));
      } else if (e.key === 'f' || e.key === 'F') {
        setTurboFps((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Initialize Optimized Single-Pass Three.js Saloon Scene with Mobile LOD, DRS & Touch Raycasting
  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isMobile = isMobileTouchDevice();
    const width = Math.max(container.clientWidth, 280);
    const height = Math.max(container.clientHeight, 300);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120806);
    scene.fog = new THREE.FogExp2(0x120806, 0.048);

    const camera = new THREE.PerspectiveCamera(
      isMobile ? 52 : 47,
      width / height,
      0.1,
      50
    );
    const fpCamPos = new THREE.Vector3(0, 2.36, 3.66);
    const fpLookAt = new THREE.Vector3(0, 0.14, -0.68);
    const tpCamPos = new THREE.Vector3(0, 3.65, 6.25);
    const tpLookAt = new THREE.Vector3(0, 0.55, -0.45);
    camera.position.copy(fpCamPos);
    camera.lookAt(fpLookAt);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isMobile,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch {
      return;
    }

    const isSoftwareGl = detectSoftwareGl(renderer);
    rendererRef.current = renderer;
    setContextLost(false);

    const initialPr =
      isSoftwareGl || liveStateRef.current.turboFps
        ? isMobile
          ? 0.9
          : 1
        : Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.5);
    renderer.setPixelRatio(initialPr);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;

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
    scene.environmentIntensity = 0.42;

    // --- BALANCED WARM SALOON LIGHTING (Zero Blown-Out Lights, Zero PointLight Shadow Cubemaps) ---
    const hemiLight = new THREE.HemisphereLight(0xffd2a6, 0x1a0c06, 0.58);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffb86c, 1.35);
    keyLight.position.set(1.2, 4.5, 1.6);
    scene.add(keyLight);

    const backRimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    backRimLight.position.set(-2.2, 3.5, -5.5);
    scene.add(backRimLight);

    // --- SALOON BACKGROUND ARCHITECTURE (WALLS & HANGING LAMP) ---
    const woodTex = getMahoganyWoodTexture();
    const bumpTex = getSaloonBumpTexture();
    const hexBump = getMechaHexScaleTexture();
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    woodTex.anisotropy = maxAniso;

    const roomGroup = new THREE.Group();
    scene.add(roomGroup);

    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x220c07,
      roughness: 0.82,
      bumpMap: bumpTex,
      bumpScale: 0.02,
    });
    const backWall = new THREE.Mesh(
      new THREE.CylinderGeometry(
        11.5,
        11.5,
        9.5,
        isMobile ? 20 : 32,
        1,
        true,
        Math.PI * 0.65,
        Math.PI * 0.7
      ),
      backWallMat
    );
    backWall.material.side = THREE.BackSide;
    backWall.position.y = 2.2;
    roomGroup.add(backWall);

    const lampShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.65, 0.35, 18, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x92400e,
        metalness: 0.82,
        roughness: 0.3,
        side: THREE.DoubleSide,
      })
    );
    lampShade.position.set(0, 3.95, -0.2);
    roomGroup.add(lampShade);

    const lampBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xfde68a,
        emissive: 0xd97706,
        emissiveIntensity: 0.65,
      })
    );
    lampBulb.position.set(0, 3.82, -0.2);
    roomGroup.add(lampBulb);

    // --- ROUND MAHOGANY SALOON TABLE ---
    const tableGroup = new THREE.Group();
    scene.add(tableGroup);

    const mahoganyRimMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      bumpMap: bumpTex,
      bumpScale: 0.02,
      roughness: 0.48,
      metalness: 0.12,
    });

    const wornLeatherSurfaceMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      bumpMap: bumpTex,
      bumpScale: 0.025,
      roughness: 0.65,
      metalness: 0.06,
    });

    const tableSeg = isMobile ? 32 : 48;
    const tableBase = new THREE.Mesh(
      new THREE.CylinderGeometry(3.72, 3.48, 0.32, tableSeg),
      mahoganyRimMat
    );
    tableBase.position.y = -0.17;
    tableGroup.add(tableBase);

    const outerRim = new THREE.Mesh(
      new THREE.TorusGeometry(3.48, 0.24, 14, tableSeg),
      mahoganyRimMat
    );
    outerRim.rotation.x = Math.PI / 2;
    outerRim.position.y = -0.01;
    tableGroup.add(outerRim);

    const brassInlay = new THREE.Mesh(
      new THREE.TorusGeometry(3.22, 0.024, 10, tableSeg),
      new THREE.MeshStandardMaterial({
        color: 0xb45309,
        metalness: 0.85,
        roughness: 0.28,
      })
    );
    brassInlay.rotation.x = Math.PI / 2;
    brassInlay.position.y = 0.012;
    tableGroup.add(brassInlay);

    const innerSurface = new THREE.Mesh(
      new THREE.CylinderGeometry(3.24, 3.24, 0.04, tableSeg),
      wornLeatherSurfaceMat
    );
    innerSurface.position.y = -0.01;
    tableGroup.add(innerSurface);

    const centerRingMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.38,
      roughness: 0.35,
    });
    const centerTargetRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.38, 0.034, 12, tableSeg),
      centerRingMat
    );
    centerTargetRing.rotation.x = Math.PI / 2;
    centerTargetRing.position.y = 0.016;
    tableGroup.add(centerTargetRing);

    // --- 3D SALOON TABLE PROPS (Match LOD for Fast Mobile Shaders) ---
    const currentCustom = resolveCharacterCustomization(
      liveStateRef.current.player.characterCustomization,
      0
    );

    const playerGun = buildSaloonGunProp(currentCustom.gunSkinId, 'match');
    playerGun.position.set(1.22, 0.08, 1.68);
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
      { x: -1.85, y: 0.01, z: 1.42, count: 7 },
      { x: -1.52, y: 0.01, z: 1.56, count: 4 },
      { x: 1.98, y: 0.01, z: 0.98, count: 6 },
      { x: 1.65, y: 0.01, z: -1.45, count: 5 },
    ]);
    tableGroup.add(instancedCoins);

    tableGroup.add(buildInstancedTableRivets(3.48, 36, 0.21));

    const dealerDeck = buildInstancedCardDeck(24, '#F59E0B');
    dealerDeck.position.set(-1.58, 0.015, -1.12);
    dealerDeck.rotation.y = 0.42;
    tableGroup.add(dealerDeck);

    // --- PLAYER'S OWN 3D CHARACTER (Match LOD) ---
    const playerThirdPersonChar = buildSeatedCharacter3D({
      accentHex: '#F59E0B',
      isAlly: true,
      variantIndex: 0,
      customization: currentCustom,
      detail: 'match',
    });
    playerThirdPersonChar.root.position.set(0, -0.58, 3.95);
    playerThirdPersonChar.root.rotation.y = Math.PI;
    playerThirdPersonChar.root.visible = false;
    scene.add(playerThirdPersonChar.root);

    // --- FIRST-PERSON FOREGROUND HANDS & FANNED 6 CARDS (Tappable via Raycasting!) ---
    const fpGroup = new THREE.Group();
    scene.add(fpGroup);

    const archInfo =
      CHARACTER_ARCHETYPES.find((a) => a.id === currentCustom.archetypeId) ??
      CHARACTER_ARCHETYPES[0];
    const outfitInfo =
      CHARACTER_OUTFITS.find((o) => o.id === currentCustom.outfitId) ??
      CHARACTER_OUTFITS[0];
    const isCyberHand = Boolean(archInfo.isCyber);

    const furPawMat = new THREE.MeshStandardMaterial({
      color: archInfo.skinColorHex,
      roughness: isCyberHand ? 0.3 : 0.72,
      metalness: isCyberHand ? 0.7 : 0.06,
      bumpMap: isCyberHand ? hexBump : undefined,
      bumpScale: isCyberHand ? 0.015 : 0,
    });

    const sleeveCuffMat = new THREE.MeshStandardMaterial({
      color: outfitInfo.vestHex,
      roughness: 0.55,
      metalness: 0.2,
    });

    const clawMat = new THREE.MeshStandardMaterial({
      color: 0x171412,
      roughness: 0.3,
      metalness: 0.35,
    });

    const buildForegroundPaw = (isRight: boolean) => {
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(
        new RoundedBoxGeometry(0.46, 0.2, 0.68, 3, 0.06),
        furPawMat
      );
      hand.add(palm);

      const sleeveCuff = new THREE.Mesh(
        new RoundedBoxGeometry(0.5, 0.24, 0.34, 2, 0.04),
        sleeveCuffMat
      );
      sleeveCuff.position.set(0, 0, 0.38);
      hand.add(sleeveCuff);

      for (let f = 0; f < 4; f++) {
        const fingerGroup = new THREE.Group();
        const fx = (f - 1.5) * 0.1;
        fingerGroup.position.set(fx, 0.03, -0.34);
        fingerGroup.rotation.x = isRight ? -0.25 : 0.32;

        const phalanx = new THREE.Mesh(
          new THREE.CylinderGeometry(0.042, 0.048, 0.28, 10),
          furPawMat
        );
        phalanx.rotation.x = Math.PI / 2;
        phalanx.position.z = -0.12;
        fingerGroup.add(phalanx);

        const claw = new THREE.Mesh(
          new THREE.ConeGeometry(0.03, 0.11, 8),
          clawMat
        );
        claw.rotation.x = -Math.PI / 2.2;
        claw.position.z = -0.28;
        fingerGroup.add(claw);

        hand.add(fingerGroup);
      }

      const thumb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.052, 0.28, 10),
        furPawMat
      );
      thumb.position.set(isRight ? -0.24 : 0.24, 0.06, -0.12);
      thumb.rotation.set(0.4, 0, isRight ? 0.55 : -0.55);
      hand.add(thumb);

      return hand;
    };

    const leftPawGroup = buildForegroundPaw(false);
    leftPawGroup.position.set(-0.34, 0.84, 2.22);
    leftPawGroup.rotation.set(0.36, -0.18, -0.12);
    fpGroup.add(leftPawGroup);

    const rightPawGroup = buildForegroundPaw(true);
    rightPawGroup.position.set(0.78, 0.54, 2.32);
    rightPawGroup.rotation.set(0.28, 0.26, 0.1);
    fpGroup.add(rightPawGroup);

    // Cached card artwork textures (Zero re-decode across rounds/rematches)
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

    const fpBackTex = getOrnateCardBackTexture('#F59E0B');

    MOVE_ORDER.forEach((mId, idx) => {
      const spread = (idx - 2.5) * 0.21;
      const basePos = new THREE.Vector3(
        -0.18 + spread * 1.06,
        1.13 - Math.abs(idx - 2.5) * 0.045,
        1.88 + idx * 0.025
      );
      const baseRot = new THREE.Euler(-0.48, 0.04, -spread * 0.68);

      const skin = getSkinById(liveStateRef.current.player.equippedSkins[mId]);
      const frameTex = getCardFrontFrameTexture(
        MOVES[mId].shortName,
        String(idx + 1),
        skin.accentColor
      );

      const cardHolder = buildHighPolyCardMesh({
        width: 0.48,
        height: 0.68,
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

    // Player's Thrown Card on the center table
    const playerThrownCard = new THREE.Group();
    const playerBackTex = getOrnateCardBackTexture('#F59E0B');
    const thrownBody = new THREE.Mesh(
      new RoundedBoxGeometry(0.64, 0.9, 0.022, 2, 0.008),
      new THREE.MeshStandardMaterial({
        map: playerBackTex,
        metalness: 0.25,
        roughness: 0.48,
      })
    );
    thrownBody.rotation.x = Math.PI / 2;
    playerThrownCard.add(thrownBody);
    playerThrownCard.position.set(0, 0.035, 0.55);
    playerThrownCard.visible = false;
    scene.add(playerThrownCard);

    // --- SEATED 3D OPPONENTS & TEAMMATES (Using Optimized Match LOD!) ---
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
          metalness: 0.25,
          roughness: 0.48,
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
      };
    });

    // --- CENTER 3D TOTEM FOR ROUND REVEAL ---
    const centerTotemAnchor = new THREE.Group();
    centerTotemAnchor.position.set(0, 0.88, -0.05);
    scene.add(centerTotemAnchor);
    let currentRevealRoundNum = -1;

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
      targetCamOffsetX = nx * 0.2;
      targetCamOffsetY = -ny * 0.09;
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
        // Gently spring back touch look offset after drag
        if (movedDist > 12) {
          targetCamOffsetX *= 0.35;
          targetCamOffsetY *= 0.35;
          return;
        }
      }

      // Clean tap/click (< 10px movement): raycast ONLY against the 6 fanned 3D cards!
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
      const w = Math.max(container.clientWidth, 280);
      const h = Math.max(container.clientHeight, 300);
      camera.aspect = w / h;
      camera.fov = w < 520 ? 53 : 47;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', onResize);

    // --- LIFECYCLE PAUSE (visibilitychange + IntersectionObserver) & ADAPTIVE RESOLUTION (DRS) ---
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

      // Adaptive Resolution Scaling (DRS) on hardware GPUs to keep mobile frame rates silky
      if (!isSoftwareGl) {
        drsAccumMs += dtMs;
        drsFrames += 1;
        if (drsFrames >= 30) {
          const avgMs = drsAccumMs / drsFrames;
          drsAccumMs = 0;
          drsFrames = 0;
          const minPr = isMobile ? 0.72 : 0.8;
          const maxPr = state.turboFps
            ? isMobile
              ? 0.95
              : 1.0
            : Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.5);

          if (avgMs > 26 && currentDynamicPr > minPr) {
            currentDynamicPr = Math.max(minPr, currentDynamicPr - 0.12);
            renderer.setPixelRatio(currentDynamicPr);
            renderer.setSize(
              Math.max(container.clientWidth, 280),
              Math.max(container.clientHeight, 300),
              false
            );
          } else if (avgMs < 17.8 && currentDynamicPr < maxPr) {
            currentDynamicPr = Math.min(maxPr, currentDynamicPr + 0.08);
            renderer.setPixelRatio(currentDynamicPr);
            renderer.setSize(
              Math.max(container.clientWidth, 280),
              Math.max(container.clientHeight, 300),
              false
            );
          }
        }
      }

      const isThirdPerson = state.cameraView === 'tp';
      const activeBaseCam = isThirdPerson ? tpCamPos : fpCamPos;
      const activeBaseLook = isThirdPerson ? tpLookAt : fpLookAt;

      playerThirdPersonChar.root.visible = isThirdPerson;
      fpGroup.visible = !isThirdPerson;

      const camLerp = Math.min(0.35, 0.1 * dtFactor);
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

      // Update foreground fanned cards: highlight stagedMove or hide thrown card
      const pickedMove = state.myPick;
      const cardLerp = Math.min(0.45, 0.18 * dtFactor);
      fpCards.forEach((c) => {
        if (pickedMove && c.moveId === pickedMove) {
          c.mesh.visible = false;
        } else {
          c.mesh.visible = true;
          const isStaged = !pickedMove && state.stagedMove === c.moveId;
          const targetY = c.basePos.y + (isStaged ? 0.22 : 0);
          const targetZ = c.basePos.z + (isStaged ? 0.16 : 0);
          c.mesh.position.y += (targetY - c.mesh.position.y) * cardLerp;
          c.mesh.position.z += (targetZ - c.mesh.position.z) * cardLerp;
        }
      });

      if (isThirdPerson) {
        playerThirdPersonChar.headGroup.rotation.y =
          Math.sin(elapsed * 1.4) * 0.12;
        playerThirdPersonChar.handGroup.position.y =
          0.58 + Math.sin(elapsed * 2.2) * 0.03;
      }

      if (pickedMove || state.revealRound) {
        playerThrownCard.visible = true;
        playerThrownCard.position.y =
          0.035 +
          (state.revealRound ? Math.abs(Math.sin(elapsed * 4)) * 0.08 : 0);
      } else {
        playerThrownCard.visible = false;
      }

      // Zero-GC Camera Frustum Culling for seated actors
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
        actor.rivalCard.visible = hasPicked;

        _actorSphere.center.set(
          actor.seat.position[0],
          actor.seat.position[1] + 1.1,
          actor.seat.position[2]
        );
        _actorSphere.radius = 1.85;

        if (!_frustum.intersectsSphere(_actorSphere)) {
          return;
        }

        const phaseOffset = elapsed * 2.1 + idx * 1.4;

        if (!hasPicked) {
          actor.char.headGroup.rotation.y = Math.sin(phaseOffset * 0.8) * 0.18;
          actor.char.headGroup.rotation.x =
            0.12 + Math.sin(phaseOffset * 1.3) * 0.06;
          actor.char.handGroup.position.y =
            0.58 + Math.sin(phaseOffset * 2.2) * 0.045;
          actor.char.handGroup.rotation.z =
            Math.sin(phaseOffset * 1.8) * 0.08;
        } else {
          actor.char.headGroup.rotation.y *= 0.9;
          actor.char.headGroup.rotation.x = 0.05;
          actor.char.handGroup.position.y = 0.5;
          actor.rivalCard.rotation.z = Math.sin(idx * 2.1) * 0.25;
        }
      });

      // Spawn/spin 3D Winning Move Totem above center ring during round reveal
      if (state.revealRound) {
        if (currentRevealRoundNum !== state.revealRound.roundNumber) {
          currentRevealRoundNum = state.revealRound.roundNumber;
          disposeObject3D(centerTotemAnchor);
          centerTotemAnchor.clear();

          const firstClash = state.revealRound.clashes[0];
          if (firstClash) {
            const winMove =
              firstClash.outcomeForA === 'loss'
                ? firstClash.moveB
                : firstClash.moveA;
            const winSkinId =
              firstClash.outcomeForA === 'loss'
                ? firstClash.skinB
                : firstClash.skinA;
            const totem = buildMoveTotem3D(winMove, getSkinById(winSkinId));
            totem.scale.setScalar(0.84);
            centerTotemAnchor.add(totem);
          }
        }
        centerTotemAnchor.visible = true;
        centerTotemAnchor.rotation.y = elapsed * 1.8;
        centerTotemAnchor.position.y = 0.86 + Math.sin(elapsed * 3) * 0.08;
        centerRingMat.emissive.setHex(0xd97706);
      } else {
        if (currentRevealRoundNum !== -1) {
          currentRevealRoundNum = -1;
          disposeObject3D(centerTotemAnchor);
          centerTotemAnchor.clear();
        }
        centerTotemAnchor.visible = false;
        centerRingMat.emissive.setHex(0x059669);
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
      canvasElem.removeEventListener('pointerdown', onCanvasPointerDown);
      canvasElem.removeEventListener('pointerup', onCanvasPointerUp);
      canvasElem.removeEventListener('webglcontextlost', handleContextLost);
      canvasElem.removeEventListener(
        'webglcontextrestored',
        handleContextRestored
      );
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
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
      className="relative h-[320px] sm:h-[520px] w-full overflow-hidden rounded-2xl border border-amber-500/30 bg-[#120907] shadow-2xl select-none"
    >
      {/* Isolated Three.js WebGL Mount with touch-action: none */}
      <div ref={mountRef} className="touch-3d-canvas absolute inset-0" />

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

      {/* --- TOP-LEFT HUD: TABLE TITLE & ACTIVE STATUS (Compact on Mobile) --- */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-10 max-w-[140px] sm:max-w-[260px] space-y-1.5 sm:space-y-2">
        <div className="border-b-2 border-amber-400/80 pb-0.5 sm:pb-1">
          <div className="font-display text-sm sm:text-2xl font-black uppercase tracking-wider text-amber-400 drop-shadow truncate">
            MESA {elo.tier.name.toUpperCase()}
          </div>
          <div className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-300 truncate">
            {room.mode} · {room.format} · R{room.currentRound}
          </div>
        </div>

        <div className="rounded-lg sm:rounded-xl border border-amber-500/30 bg-[#140B08]/95 p-2 sm:p-3 shadow-lg">
          <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-300 truncate">
            {oppTeamList.map((p) => p.nickname).join(' & ')}
          </div>
          <div className="hidden sm:block mt-0.5 text-[10px] uppercase tracking-wider text-slate-400 truncate">
            SEU PERSONAGEM: {playerArchMeta.name.toUpperCase()}
          </div>
          <div className="font-display mt-0.5 text-[11px] sm:text-sm font-extrabold text-white">
            {revealRound
              ? revealRound.winnerTeam === 'DRAW'
                ? 'EMPATE!'
                : revealRound.winnerTeam === playerTeam
                ? 'VITÓRIA!'
                : 'PONTO RIVAL!'
              : room.roundPhase === 'pairing'
              ? 'PAREANDO...'
              : `${Object.keys(room.roundPicks).length}/${room.participantUids.length} NA MESA`}
          </div>
        </div>
      </div>

      {/* --- TOP-CENTER CIRCULAR STOPWATCH TIMER (24s) --- */}
      <div className="pointer-events-none absolute top-2.5 sm:top-3.5 left-1/2 z-10 -translate-x-1/2 flex flex-col items-center">
        <div className="relative flex h-11 w-11 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-[#140B08]/95 shadow-xl">
          <svg className="h-11 w-11 sm:h-14 sm:w-14 -rotate-90" viewBox="0 0 52 52">
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
            className={`font-mono-num absolute text-base sm:text-xl font-black ${
              secondsLeft <= 5 ? 'text-red-400' : 'text-white'
            }`}
          >
            {secondsLeft}
          </span>
        </div>
      </div>

      {/* --- TOP-RIGHT HUD: TURN STATUS + MOBILE QUICK BUTTONS / DESKTOP KEYBINDS --- */}
      <div className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 z-10 flex flex-col items-end space-y-1.5 sm:space-y-2.5">
        <div className="border-b-2 border-amber-400/80 pb-0.5 sm:pb-1 text-right">
          <div className="font-display text-sm sm:text-2xl font-black uppercase tracking-wider text-white drop-shadow">
            {myPick
              ? 'NA MESA!'
              : isMyTurnToPick
              ? 'SEU TURNO!'
              : 'AGUARDE'}
          </div>
        </div>

        {/* Mobile Quick Touch Controls (44px accessible targets, zero clutter) */}
        <div className="flex sm:hidden items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              vibrateTap();
              setCameraView((v) => (v === 'fp' ? 'tp' : 'fp'));
            }}
            aria-label="Alternar câmera 3D"
            className="flex h-10 min-w-[40px] items-center justify-center gap-1 rounded-lg border border-amber-400/40 bg-[#140B08]/95 px-2.5 text-[11px] font-bold text-amber-300 cursor-pointer"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>{cameraView === 'fp' ? '3ª' : '1ª'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              vibrateTap();
              setTurboFps((v) => !v);
            }}
            aria-label="Alternar modo FPS"
            className={`flex h-10 min-w-[40px] items-center justify-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold cursor-pointer ${
              turboFps
                ? 'border-emerald-400/50 bg-emerald-950/90 text-emerald-300'
                : 'border-white/20 bg-[#140B08]/95 text-slate-300'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>{turboFps ? '60fps' : 'HD'}</span>
          </button>
        </div>

        {/* Desktop Full Revolver Drum & Keybinds */}
        <div className="hidden sm:flex items-center gap-3 rounded-xl border border-amber-500/30 bg-[#140B08]/95 p-3 shadow-lg">
          <div
            className="relative h-16 w-16 shrink-0 rounded-full border-2 border-amber-400/60 bg-[#1F120D]"
            title="Tambor das 6 Jogadas"
          >
            <div className="absolute inset-0 m-auto h-3 w-3 rounded-full bg-amber-400/70" />
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

          <div className="space-y-1.5 text-right text-xs">
            <div className="flex items-center justify-end gap-2">
              <span className="font-bold text-amber-200">Selecionar Carta</span>
              <kbd className="font-mono-num rounded border border-emerald-400/60 bg-emerald-950/80 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                1-6
              </kbd>
            </div>
            <div className="flex items-center justify-end gap-2">
              <span className="font-bold text-amber-200">Jogar na Mesa</span>
              <kbd className="font-mono-num rounded border border-emerald-400/60 bg-emerald-950/80 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                ESPAÇO / E
              </kbd>
            </div>
            <button
              type="button"
              onClick={() => setCameraView((v) => (v === 'fp' ? 'tp' : 'fp'))}
              className="flex w-full items-center justify-end gap-1.5 text-amber-300 hover:text-white cursor-pointer"
            >
              <Camera className="h-3 w-3" />
              <span className="font-semibold">
                {cameraView === 'fp' ? 'Ver Meu Personagem' : 'Visão 1ª Pessoa'}
              </span>
              <kbd className="font-mono-num rounded border border-amber-400/40 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                C
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setTurboFps((v) => !v)}
              className="flex w-full items-center justify-end gap-1.5 text-emerald-300 hover:text-white cursor-pointer"
            >
              <Zap className="h-3 w-3" />
              <span className="font-semibold">
                {turboFps ? 'FPS Turbo: Ativo' : 'Qualidade: Ultra'}
              </span>
              <kbd className="font-mono-num rounded border border-emerald-400/40 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                F
              </kbd>
            </button>
            <button
              type="button"
              onClick={onToggleHud}
              className="flex w-full items-center justify-end gap-2 text-slate-300 hover:text-white cursor-pointer"
            >
              <span className="font-semibold">
                {hudCollapsed ? 'Mostrar Cartas' : 'Ocultar HUD'}
              </span>
              <kbd className="font-mono-num rounded border border-white/25 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
                H
              </kbd>
            </button>
          </div>
        </div>
      </div>

      {/* --- OPPONENT & ALLY SEAT STATUS TAGS AROUND THE TABLE --- */}
      <div className="pointer-events-none absolute inset-x-0 top-16 sm:top-20 z-10 flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4">
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
              className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs shadow-md ${
                isCurrentlyPicking
                  ? 'border-amber-400 bg-[#1B100C]/95'
                  : 'border-white/15 bg-[#120A07]/95'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-bold ${
                      s.isAlly ? 'text-amber-300' : 'text-white'
                    }`}
                  >
                    {p.nickname}
                  </span>
                  <span className="text-[10px] text-slate-400">{p.turma}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] sm:text-[11px]">
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
                  className="ml-1 inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-extrabold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  <Swords className="h-3 w-3" />
                  <span>Enfrentar</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* --- PAIRING PHASE BANNER (FOR 2v2 / 3v3) --- */}
      {room.roundPhase === 'pairing' && !revealRound && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 sm:bottom-20 z-10 mx-auto max-w-lg px-3 sm:px-4">
          <div className="rounded-xl border border-amber-400/50 bg-[#140B08]/95 p-2.5 sm:p-3.5 text-center shadow-xl">
            <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-400">
              Pareamento ({myTeamSum} vs {oppTeamSum} troféus)
            </div>
            <p className="mt-0.5 text-[11px] sm:text-xs text-slate-200">
              {isMyTeamChoosing
                ? amIPaired
                  ? 'Confronto definido! Aguardando parceiros.'
                  : 'Toque em "Enfrentar" em um adversário acima.'
                : 'Adversário escolhendo os confrontos...'}
            </p>
          </div>
        </div>
      )}

      {/* --- ROUND REVEAL OVERLAY BANNER --- */}
      {revealRound && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 sm:bottom-20 z-20 mx-auto max-w-xl px-3 sm:px-4">
          <div className="rounded-2xl border border-amber-400/60 bg-[#140B08]/95 p-3 sm:p-4 text-center shadow-2xl space-y-1.5 sm:space-y-2">
            <div className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-amber-400">
              Cartas Reveladas · Rodada {revealRound.roundNumber}
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
                  <span className="text-slate-300">{c.reason}</span>
                  <span className="font-bold text-sky-300">
                    {c.playerBName}: {MOVES[c.moveB].shortName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- FOREGROUND ACTION BAR (Hidden on < sm when hand dock handles throw cleanly, visible sm+ or when locked) --- */}
      {room.roundPhase === 'picking' && !revealRound && (
        <div className="hidden sm:flex absolute inset-x-0 bottom-3.5 z-10 flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
          <div className="rounded-xl border border-white/15 bg-[#140B08]/95 px-3.5 py-2 text-xs">
            <span className="text-slate-400">Carta em destaque na mão: </span>
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
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs sm:text-sm font-black uppercase tracking-wide text-slate-950 shadow-lg shadow-amber-500/25 hover:bg-amber-400 transition-transform active:scale-95 cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>Jogar {stagedMoveMeta.name} na Mesa [ESPAÇO]</span>
            </button>
          ) : (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 text-xs font-bold text-emerald-300">
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
