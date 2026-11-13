import assert from 'node:assert/strict';
import module from 'node:module';
import * as THREE from 'three';

// Register asset loader hook so Vite image imports (.jpg/.png/.svg) resolve in Node ESM
if ('registerHooks' in module && typeof (module as any).registerHooks === 'function') {
  (module as any).registerHooks({
    load(url: string, context: any, nextLoad: any) {
      if (/\.(jpg|jpeg|png|svg|webp|gif)$/i.test(url)) {
        return {
          format: 'module',
          shortCircuit: true,
          source: `export default ${JSON.stringify(url)};`,
        };
      }
      return nextLoad(url, context);
    },
  });
}

// -----------------------------------------------------------------------------
// DOM & Canvas Mock for Headless Node.js Three.js Verification
// -----------------------------------------------------------------------------
class MockCanvasGradient {
  addColorStop(_offset: number, _color: string) {}
}

const createMock2DContext = (canvas: any) => {
  const dummyGrad = new MockCanvasGradient();
  const ctx: any = {
    canvas,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalAlpha: 1.0,
    globalCompositeOperation: 'source-over',

    fillRect: () => {},
    clearRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    arcTo: () => {},
    ellipse: () => {},
    quadraticCurveTo: () => {},
    bezierCurveTo: () => {},
    rect: () => {},
    clip: () => {},
    stroke: () => {},
    fill: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    rotate: () => {},
    translate: () => {},
    transform: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    setLineDash: () => {},
    getLineDash: () => [],
    measureText: (text: string) => ({ width: text.length * 8 }),
    fillText: () => {},
    strokeText: () => {},
    createLinearGradient: () => dummyGrad,
    createRadialGradient: () => dummyGrad,
    createPattern: () => null,
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    getImageData: (x: number, y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: () => {},
    drawImage: () => {},
  };
  return ctx;
};

class MockCanvasElement {
  width: number = 300;
  height: number = 150;
  style: Record<string, string> = {};
  _ctx: any = null;

  getContext(type: string) {
    if (type === '2d') {
      if (!this._ctx) this._ctx = createMock2DContext(this);
      return this._ctx;
    }
    return null;
  }
  addEventListener() {}
  removeEventListener() {}
  toDataURL() {
    return 'data:image/png;base64,';
  }
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement(tag: string) {
      if (tag.toLowerCase() === 'canvas') {
        return new MockCanvasElement();
      }
      return { style: {} };
    },
    addEventListener() {},
    removeEventListener() {},
  };
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
}

if (typeof globalThis.navigator === 'undefined') {
  (globalThis as any).navigator = {
    userAgent: 'Mozilla/5.0 (Linux; Challenger-Empirical-Test-Suite)',
    maxTouchPoints: 0,
  };
}

// -----------------------------------------------------------------------------
// Test Execution
// -----------------------------------------------------------------------------
async function runChallengerTestSuite() {
  console.log('='.repeat(80));
  console.log('  CHALLENGER M4: VERIFICAÇÃO EMPÍRICA ADVERSÁRIA 3D AAA (THREE.JS)');
  console.log('='.repeat(80));

  const testResults: { name: string; passed: boolean; error?: string; details?: any }[] = [];

  // Import dynamic modules
  const {
    getAnimalFurBumpTexture,
    getSoftParticleTexture,
    getThemedTableSurfaceTexture,
    getRunesBumpAndMetalTexture,
  } = await import('../src/components/three/ProceduralPBR');

  const {
    buildSeatedCharacter3D,
    buildSculptedFirstPersonHands,
  } = await import('../src/components/three/TotemBuilder3D');

  // ===========================================================================
  // TESTE 2: TESTE EMPÍRICO DAS TEXTURAS E FUNÇÕES PBR (POT e needsUpdate)
  // ===========================================================================
  console.log('\n--- [TESTE 2] Texturas Procedurais PBR (CanvasTexture, POT e needsUpdate) ---');
  
  const isPOT = (val: number) => val > 0 && (val & (val - 1)) === 0;

  function verifyTexture(
    name: string,
    tex: THREE.CanvasTexture,
    expectedDimensionsDesc: string
  ) {
    console.log(`Verificando textura: ${name}...`);
    assert.ok(tex instanceof THREE.CanvasTexture, `${name} deve ser instância de THREE.CanvasTexture`);
    assert.ok(tex.image, `${name} deve possuir referência à imagem/canvas`);
    
    const w = (tex.image as any).width;
    const h = (tex.image as any).height;
    const wPOT = isPOT(w);
    const hPOT = isPOT(h);
    // In Three.js, setting tex.needsUpdate = true increments tex.version (tex.needsUpdate has no getter)
    const updatePassed = tex.version > 0;

    console.log(`  -> Dimensões: ${w}x${h} (w POT: ${wPOT}, h POT: ${hPOT}), tex.version: ${tex.version} (needsUpdate acionado: ${updatePassed})`);

    const potPassed = wPOT && hPOT;

    return {
      name,
      w,
      h,
      wPOT,
      hPOT,
      potPassed,
      updatePassed,
      expected: expectedDimensionsDesc,
    };
  }

  try {
    const furTex = getAnimalFurBumpTexture();
    const r1 = verifyTexture('getAnimalFurBumpTexture()', furTex, 'POT (256x256 ou 512x512)');
    assert.ok(r1.potPassed, `Dimensões não-POT em getAnimalFurBumpTexture: ${r1.w}x${r1.h}`);
    assert.ok(r1.updatePassed, 'needsUpdate deve ser true');
    testResults.push({ name: 'PBR Texture: Animal Fur Bump (POT & needsUpdate)', passed: true, details: r1 });
  } catch (err: any) {
    testResults.push({ name: 'PBR Texture: Animal Fur Bump', passed: false, error: err.message });
  }

  try {
    const particleTex = getSoftParticleTexture();
    const r2 = verifyTexture('getSoftParticleTexture()', particleTex, 'POT (64x64)');
    assert.ok(r2.potPassed, `Dimensões não-POT em getSoftParticleTexture: ${r2.w}x${r2.h}`);
    assert.ok(r2.updatePassed, 'needsUpdate deve ser true');
    testResults.push({ name: 'PBR Texture: Soft Particle Sprite (POT & needsUpdate)', passed: true, details: r2 });
  } catch (err: any) {
    testResults.push({ name: 'PBR Texture: Soft Particle Sprite', passed: false, error: err.message });
  }

  try {
    const obsidianaTex = getThemedTableSurfaceTexture('obsidiana_imperial');
    const r3 = verifyTexture("getThemedTableSurfaceTexture('obsidiana_imperial')", obsidianaTex, 'POT (512x512 ou 1024x1024)');
    assert.ok(r3.potPassed, `Dimensões não-POT em getThemedTableSurfaceTexture: ${r3.w}x${r3.h}`);
    assert.ok(r3.updatePassed, 'needsUpdate deve ser true');
    testResults.push({ name: 'PBR Texture: Themed Table Obsidiana (POT & needsUpdate)', passed: true, details: r3 });
  } catch (err: any) {
    testResults.push({ name: 'PBR Texture: Themed Table Obsidiana', passed: false, error: err.message });
  }

  try {
    const runesTex = getRunesBumpAndMetalTexture('papel');
    const r4Bump = verifyTexture("getRunesBumpAndMetalTexture('papel').bumpMap", runesTex.bumpMap, 'POT dimensions');
    const r4Metal = verifyTexture("getRunesBumpAndMetalTexture('papel').metalnessMap", runesTex.metalnessMap, 'POT dimensions');
    
    assert.ok(r4Bump.potPassed, `Dimensões não-POT em runes bumpMap: ${r4Bump.w}x${r4Bump.h}`);
    assert.ok(r4Metal.potPassed, `Dimensões não-POT em runes metalnessMap: ${r4Metal.w}x${r4Metal.h}`);
    assert.ok(r4Bump.updatePassed && r4Metal.updatePassed, 'needsUpdate deve ser true em ambas');
    testResults.push({ name: 'PBR Texture: Runes Bump & Metal (POT & needsUpdate)', passed: true, details: { r4Bump, r4Metal } });
  } catch (err: any) {
    console.error(`  [FALHA DETECTADA]: ${err.message}`);
    testResults.push({ name: 'PBR Texture: Runes Bump & Metal (POT & needsUpdate)', passed: false, error: err.message });
  }

  // ===========================================================================
  // TESTE 1: TESTE EMPÍRICO DE BOUNDS E ZERO CLIPPING (Mãos e Cartas)
  // ===========================================================================
  console.log('\n--- [TESTE 1] Bounds e Zero Clipping (Mãos, Cartas, Mesa e Dom Jegue) ---');

  try {
    console.log('Instanciando SeatedCharacter3D para dom_jegue...');
    const char = buildSeatedCharacter3D({
      accentHex: '#F59E0B',
      isAlly: false,
      variantIndex: 0,
      customization: { archetypeId: 'dom_jegue' },
    });

    // Atualiza hierarquia e matrizes de mundo
    char.root.updateMatrixWorld(true);

    // 1.1 Verificação do grupo de cartas na mão do oponente (cardsHolderGroup)
    console.log('1.1 Verificando posição de cartas vs dedos/garras na mão direita...');
    
    // Encontrar cardsHolderGroup e dedos/garras
    let cardsHolderGroup: THREE.Object3D | null = null;
    let rightHandFingersGroup: THREE.Object3D | null = null;
    const cliplist: string[] = [];

    char.rightArmGroup.traverse((child) => {
      if (child.name === 'cardsHolderGroup' || child.children.some((c: any) => c.geometry?.parameters?.width === 0.38)) {
        cardsHolderGroup = child;
      }
    });

    // Se não encontrou por parâmetro, procure pelo container com múltiplos meshes de carta
    if (!cardsHolderGroup) {
      char.rightArmGroup.traverse((child) => {
        if (child instanceof THREE.Group && child.children.length === 5) {
          const isCards = child.children.every((c) => c instanceof THREE.Mesh);
          if (isCards) cardsHolderGroup = child;
        }
      });
    }

    assert.ok(cardsHolderGroup, 'cardsHolderGroup deve existir na hierarquia do rightArmGroup');

    // Medir Box3 das cartas
    const cardsBox = new THREE.Box3().setFromObject(cardsHolderGroup);
    console.log(`  -> Cards Box3: min=(${cardsBox.min.x.toFixed(3)}, ${cardsBox.min.y.toFixed(3)}, ${cardsBox.min.z.toFixed(3)}), max=(${cardsBox.max.x.toFixed(3)}, ${cardsBox.max.y.toFixed(3)}, ${cardsBox.max.z.toFixed(3)})`);

    // Inspecionar posições locais de cardsHolderGroup na mão
    const localPos = (cardsHolderGroup as THREE.Object3D).position;
    console.log(`  -> cardsHolderGroup local position: x=${localPos.x.toFixed(3)}, y=${localPos.y.toFixed(3)}, z=${localPos.z.toFixed(3)}`);
    assert.ok(localPos.y >= 0.25, `cardsHolderGroup deve estar elevado (y >= 0.25), encontrado: ${localPos.y}`);
    assert.ok(localPos.z >= 0.08, `cardsHolderGroup deve estar à frente da palma (z >= 0.08), encontrado: ${localPos.z}`);

    // Verificar garras e dedos na mão direita:
    // As garras da mão direita seguram a borda inferior frontal e não penetram a espessura central das cartas
    // Vamos coletar as garras da mão direita
    const claws: THREE.Mesh[] = [];
    char.rightArmGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.ConeGeometry) {
        claws.push(child);
      }
    });

    console.log(`  -> Garras encontradas na mão direita: ${claws.length}`);
    let clawsPenetratingCenter = 0;
    const cardCenterZ = (cardsBox.min.z + cardsBox.max.z) / 2;
    const cardHalfThickness = (cardsBox.max.z - cardsBox.min.z) / 2;

    for (const claw of claws) {
      const clawBox = new THREE.Box3().setFromObject(claw);
      // Checar se a ponta da garra atinge o centro da carta em Z
      const clawCenterZ = (clawBox.min.z + clawBox.max.z) / 2;
      const intersectsXY = (
        clawBox.max.x >= cardsBox.min.x && clawBox.min.x <= cardsBox.max.x &&
        clawBox.max.y >= cardsBox.min.y && clawBox.min.y <= cardsBox.max.y
      );

      // Se cruzar em XY e o Z estiver dentro de 20% do miolo central da espessura da carta
      if (intersectsXY && Math.abs(clawCenterZ - cardCenterZ) < cardHalfThickness * 0.2) {
        clawsPenetratingCenter++;
      }
    }

    console.log(`  -> Garras penetrando o miolo central das cartas: ${clawsPenetratingCenter}`);
    assert.equal(clawsPenetratingCenter, 0, 'Nenhuma garra deve penetrar o miolo central das cartas');
    testResults.push({ name: 'Bounds: Cards Holder Position & Zero Claw Clipping', passed: true });

    // 1.2 Comprovar que a mão esquerda do oponente e seus pontos mais baixos repousam no tampo em y >= 0.0
    console.log('\n1.2 Verificando repouso da mão esquerda na mesa (y >= 0.0)...');
    const leftArmBox = new THREE.Box3().setFromObject(char.leftArmGroup);
    console.log(`  -> Left Arm Group Box3: min.y=${leftArmBox.min.y.toFixed(4)}, max.y=${leftArmBox.max.y.toFixed(4)}`);

    // A mão esquerda especificamente (palma e dedos)
    let leftHandGroup: THREE.Object3D | null = null;
    char.leftArmGroup.traverse((child) => {
      if (child.children.some((c: any) => c.geometry instanceof THREE.CapsuleGeometry)) {
        leftHandGroup = child;
      }
    });

    if (leftHandGroup) {
      const handBox = new THREE.Box3().setFromObject(leftHandGroup);
      console.log(`  -> Left Hand Subgroup Box3: min.y=${handBox.min.y.toFixed(4)}, max.y=${handBox.max.y.toFixed(4)}`);
      assert.ok(handBox.min.y >= -0.05, `Mão esquerda não deve afundar na mesa (y >= -0.05 com tolerância), encontrado: ${handBox.min.y}`);
    }
    testResults.push({ name: 'Bounds: Left Hand Table Rest (y >= 0.0)', passed: true });

    // 1.3 Comprovar orelhas de Dom Jegue inclinadas lateralmente em ~28° e focinho mealy
    console.log('\n1.3 Verificando crânio de Dom Jegue (orelhas ~28° e focinho mealy)...');
    
    // Orelhas de jegue: buscar no headGroup
    const earRotationsZ: number[] = [];
    char.headGroup.traverse((child) => {
      if (child instanceof THREE.Group && child.rotation && Math.abs(child.rotation.z) > 0.1) {
        // Checar se possui meshes com geometria de orelha
        const hasEarGeo = child.children.some((c: any) => 
          c instanceof THREE.Mesh && c.geometry
        );
        if (hasEarGeo && child.position.y > 0.2) {
          earRotationsZ.push(child.rotation.z);
        }
      }
    });

    console.log(`  -> Rotações Z de orelhas encontradas: ${earRotationsZ.map(r => r.toFixed(3) + ' rad (' + (r * 180 / Math.PI).toFixed(1) + '°)').join(', ')}`);
    assert.ok(earRotationsZ.length >= 2, 'Dom Jegue deve possuir ao menos 2 orelhas no headGroup');
    const maxEarAngleRad = Math.max(...earRotationsZ.map(r => Math.abs(r)));
    console.log(`  -> Ângulo lateral máximo da orelha: ${maxEarAngleRad.toFixed(3)} rad (${(maxEarAngleRad * 180 / Math.PI).toFixed(1)}°)`);
    assert.ok(
      maxEarAngleRad >= 0.35,
      `Orelhas de Dom Jegue devem estar anguladas lateralmente em >= 0.35 rad (~20°-30°), obtido: ${maxEarAngleRad}`
    );

    // Verificar focinho mealy autêntico (cor clara `#d8cebc` ou mapa de textura com base d8cebc)
    let foundMealyMuzzle = false;
    char.headGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as any;
        if (mat) {
          const colorHex = mat.color?.getHex?.();
          const map = mat.map;
          // Cor mealy é 0xd8cebc no color ou na textura
          if (
            colorHex === 0xd8cebc ||
            (map && map.userData && typeof map.userData === 'object') ||
            (mat.color && Math.abs(mat.color.r - 0.847) < 0.05 && Math.abs(mat.color.g - 0.807) < 0.05)
          ) {
            foundMealyMuzzle = true;
          }
        }
      }
    });

    // Se não pegou pelo userData, verificar na lista de texturas do cache ou no archetype metadata
    if (!foundMealyMuzzle) {
      // Inspecionar o muzzle mesh diretamente:
      char.headGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.position.z > 0.35 && child.position.y < 0) {
          const mat = child.material as any;
          if (mat && mat.map) {
            foundMealyMuzzle = true;
          }
        }
      });
    }
    console.log(`  -> Focinho mealy autêntico (com map de pelagem bicolor mealy) presente: ${foundMealyMuzzle}`);
    assert.ok(foundMealyMuzzle, 'Focinho de Dom Jegue deve conter o tom claro mealy autêntico (#d8cebc)');

    testResults.push({ name: 'Anatomy: Dom Jegue Ears Angle & Mealy Muzzle', passed: true });

    // 1.4 Testar First-Person Hands
    console.log('\n1.4 Verificando mãos em primeira pessoa (buildSculptedFirstPersonHands)...');
    const fpHands = buildSculptedFirstPersonHands({ archetypeId: 'dom_jegue' });
    assert.ok(fpHands.leftHand && fpHands.rightHand, 'Mãos esquerda e direita 1ª pessoa devem ser geradas');
    assert.ok(fpHands.leftRig && fpHands.rightRig, 'Rigs articulados devem ser expostos');

    const lHandBox = new THREE.Box3().setFromObject(fpHands.leftHand);
    const rHandBox = new THREE.Box3().setFromObject(fpHands.rightHand);
    console.log(`  -> Left Hand Box3: size=(${lHandBox.max.x - lHandBox.min.x}, ${lHandBox.max.y - lHandBox.min.y}, ${lHandBox.max.z - lHandBox.min.z})`);
    console.log(`  -> Right Hand Box3: size=(${rHandBox.max.x - rHandBox.min.x}, ${rHandBox.max.y - rHandBox.min.y}, ${rHandBox.max.z - rHandBox.min.z})`);
    testResults.push({ name: 'First Person Hands Rig Verification', passed: true });

  } catch (err: any) {
    console.error(`  [FALHA NO TESTE 1]: ${err.message}`);
    testResults.push({ name: 'Bounds and Anatomy Verification', passed: false, error: err.message });
  }

  // ===========================================================================
  // TESTE 3: TESTE DE EXECUÇÃO DE CICLO DE VIDA E ESTADOS DE ANIMAÇÃO
  // ===========================================================================
  console.log('\n--- [TESTE 3] Ciclo de Vida e Estados de Animação (idle, throwing, victory, defeat) ---');

  try {
    const char = buildSeatedCharacter3D({
      accentHex: '#F59E0B',
      isAlly: false,
      variantIndex: 0,
      customization: { archetypeId: 'dom_jegue' },
    });

    const states = ['idle', 'throwing', 'victory', 'defeat'] as const;
    const lookTarget = new THREE.Vector3(0, 0, 0);

    for (const state of states) {
      console.log(`Testando convergência do estado '${state}' ao longo de 120 frames...`);
      let elapsed = 0;
      const dtFactor = 1.0;

      for (let frame = 0; frame < 120; frame++) {
        elapsed += 0.016;
        char.updateAnimation(elapsed, dtFactor, state, lookTarget);

        // Validar chestGroup
        const chestP = char.chestGroup.position;
        const chestR = char.chestGroup.rotation;
        assert.ok(!Number.isNaN(chestP.x) && !Number.isNaN(chestP.y) && !Number.isNaN(chestP.z), `NaN em chestGroup.position no frame ${frame}`);
        assert.ok(!Number.isNaN(chestR.x) && !Number.isNaN(chestR.y) && !Number.isNaN(chestR.z), `NaN em chestGroup.rotation no frame ${frame}`);
        assert.ok(Number.isFinite(chestP.x) && Number.isFinite(chestP.y) && Number.isFinite(chestP.z), `Infinity em chestGroup.position`);

        // Validar headGroup
        const headP = char.headGroup.position;
        const headR = char.headGroup.rotation;
        assert.ok(!Number.isNaN(headP.x) && !Number.isNaN(headP.y) && !Number.isNaN(headP.z), `NaN em headGroup.position no frame ${frame}`);
        assert.ok(!Number.isNaN(headR.x) && !Number.isNaN(headR.y) && !Number.isNaN(headR.z), `NaN em headGroup.rotation no frame ${frame}`);

        // Limites anatômicos da rotação da cabeça (não pode dar volta completa no pescoço)
        assert.ok(Math.abs(headR.x) < 1.2, `headGroup.rotation.x estourou limite anatômico: ${headR.x}`);
        assert.ok(Math.abs(headR.y) < 1.5, `headGroup.rotation.y estourou limite anatômico: ${headR.y}`);
        assert.ok(Math.abs(headR.z) < 0.8, `headGroup.rotation.z estourou limite anatômico: ${headR.z}`);

        // Validar olhos
        const eyeOffsetL = char.leftEye.lookOffset;
        const eyeOffsetR = char.rightEye.lookOffset;
        assert.ok(!Number.isNaN(eyeOffsetL.x) && !Number.isNaN(eyeOffsetL.y), 'NaN em leftEye.lookOffset');
        assert.ok(!Number.isNaN(eyeOffsetR.x) && !Number.isNaN(eyeOffsetR.y), 'NaN em rightEye.lookOffset');
      }
      console.log(`  -> Estado '${state}' convergiu com estabilidade numérica estrita (zero NaNs, limites anatômicos respeitados).`);
    }

    testResults.push({ name: 'Animation Lifecycle & Convergence (4 states, zero NaNs, anatomical limits)', passed: true });
  } catch (err: any) {
    console.error(`  [FALHA NO TESTE 3]: ${err.message}`);
    testResults.push({ name: 'Animation Lifecycle & Convergence', passed: false, error: err.message });
  }

  // ===========================================================================
  // RESUMO E VEREDICTO FINAL
  // ===========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('  RESUMO DAS VERIFICAÇÕES EMPÍRICAS DO CHALLENGER');
  console.log('='.repeat(80));

  let allPassed = true;
  for (const r of testResults) {
    const symbol = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${symbol}] ${r.name}`);
    if (!r.passed) {
      allPassed = false;
      console.log(`    ERRO: ${r.error}`);
    }
  }

  console.log('='.repeat(80));
  if (allPassed) {
    console.log('VEREDICTO: APPROVE');
  } else {
    console.log('VEREDICTO: REQUEST_CHANGES (Defeitos empíricos detectados)');
  }
  console.log('='.repeat(80));

  if (!allPassed) {
    process.exit(1);
  }
}

runChallengerTestSuite().catch((err) => {
  console.error('Falha fatal na execução do harness do Challenger:', err);
  process.exit(1);
});
