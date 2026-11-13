import assert from 'node:assert/strict';
import module from 'node:module';
import { performance } from 'node:perf_hooks';

// ============================================================================
// 1. ASSET LOADER HOOK (para resolver imports .jpg/.png/.svg em Node ESM)
// ============================================================================
if ('registerHooks' in module && typeof (module as any).registerHooks === 'function') {
  (module as any).registerHooks({
    load(url: string, context: unknown, nextLoad: (url: string, context: unknown) => any) {
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

// ============================================================================
// 2. POLYFILLS MÍNIMOS DE BROWSER EM MEMÓRIA (DOM + Canvas para Three.js & React SSR)
// ============================================================================
const mockCtx: any = {
  createRadialGradient: () => ({
    addColorStop: () => {},
  }),
  createLinearGradient: () => ({
    addColorStop: () => {},
  }),
  fillRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  arc: () => {},
  stroke: () => {},
  fill: () => {},
  closePath: () => {},
  save: () => {},
  restore: () => {},
  set strokeStyle(_v: any) {},
  set fillStyle(_v: any) {},
  set lineWidth(_v: any) {},
};

const mockCanvas: any = {
  width: 512,
  height: 512,
  getContext: () => mockCtx,
};

if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') return mockCanvas;
      return {};
    },
  };
} else if (!(globalThis as any).document.createElement) {
  (globalThis as any).document.createElement = (tag: string) => {
    if (tag === 'canvas') return mockCanvas;
    return {};
  };
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    innerWidth: 1024,
    innerHeight: 768,
    matchMedia: () => ({ matches: false }),
    location: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
}

if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = {
    userAgent: 'Node.js/Challenger-2-Test-Runner',
    vibrate: () => true,
  };
}

// ============================================================================
// 3. EXECUÇÃO DO HARNESS DE ESTRESSE ADVERSARIAL DA MILRESTONE M3
// ============================================================================
async function runClashAndCustomizationAdversarialSuite() {
  console.log('\n' + '='.repeat(85));
  console.log('   JOKENPO 2 — MILRESTONE M3: CLASH & CUSTOMIZATION ADVERSARIAL HARNESS (CHALLENGER 2)');
  console.log('='.repeat(85) + '\n');

  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const THREE = await import('three');

  const {
    resolveMovePair,
    resolveCharacterCustomization,
    MOVES,
    MOVE_ORDER,
    ARENA_TABLE_THEMES,
    CARD_AURAS,
    VICTORY_EMOTES,
    getSkinById,
  } = await import('../../src/constants/gameData');

  const { CinematicClashOverlay } = await import('../../src/components/CinematicClashOverlay');
  const { MoveCard } = await import('../../src/components/MoveCard');
  const { getThemedTableSurfaceTexture } = await import('../../src/components/three/ProceduralPBR');

  let passed = 0;
  let failed = 0;
  const startTime = performance.now();

  function testCheck(title: string, fn: () => void | Promise<void>) {
    try {
      fn();
      passed++;
      console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${title}`);
    } catch (err: any) {
      failed++;
      console.error(`  \x1b[31m✖ [FAIL]\x1b[0m ${title}`);
      console.error(`    \x1b[31mErro: ${err?.message || err}\x1b[0m`);
    }
  }

  // --------------------------------------------------------------------------
  // PARTE 1: TODAS AS 36 PERMUTAÇÕES HEXAGONAIS NO CINEMATIC CLASH (1v1)
  // --------------------------------------------------------------------------
  console.log('\x1b[36m▶ BLOCO 1: Validação Exaustiva das 36 Combinações Hexagonais no CinematicClashOverlay (1v1)\x1b[0m');

  const moves = MOVE_ORDER; // ['papel', 'parafal', 'pedra', 'gelo_invertido', 'tesoura', 'jegue']
  assert.equal(moves.length, 6, 'Devem existir exatamente 6 jogadas no hexágono');

  let winsCount = 0;
  let lossesCount = 0;
  let drawsCount = 0;

  for (const moveA of moves) {
    for (const moveB of moves) {
      const res = resolveMovePair(moveA, moveB);
      if (res.outcomeForA === 'win') winsCount++;
      else if (res.outcomeForA === 'loss') lossesCount++;
      else drawsCount++;

      testCheck(`1v1 Clash [${moveA} vs ${moveB}] -> ${res.outcomeForA.toUpperCase()}`, () => {
        // Valida texto de justificativa não vazio e livre de undefined
        assert.ok(res.reason && typeof res.reason === 'string' && res.reason.trim().length > 0,
          `Justificativa de '${moveA}' vs '${moveB}' não pode ser vazia`);
        assert.ok(!res.reason.includes('undefined'),
          `Justificativa não pode conter 'undefined': "${res.reason}"`);
        assert.ok(!res.reason.includes('null'),
          `Justificativa não pode conter 'null': "${res.reason}"`);

        // Cria RoundSummary 1v1
        const roundSummary = {
          roundNumber: 1,
          scoreA: res.outcomeForA === 'win' ? 1 : 0,
          scoreB: res.outcomeForA === 'loss' ? 1 : 0,
          winnerTeam: (res.outcomeForA === 'win' ? 'A' : res.outcomeForA === 'loss' ? 'B' : 'DRAW') as 'A' | 'B' | 'DRAW',
          clashes: [
            {
              playerAId: 'pA_1',
              playerAName: 'Cavaleiro_Alpha',
              playerBId: 'pB_1',
              playerBName: 'Pistoleiro_Beta',
              moveA,
              moveB,
              outcomeForA: res.outcomeForA,
              reason: res.reason,
            },
          ],
        };

        const mockRoom: any = {
          id: 'room-1v1-test',
          mode: '1v1',
          format: 'md3',
          teamA: [{ id: 'pA_1', name: 'Cavaleiro_Alpha', isHost: true, isReady: true, custom: null }],
          teamB: [{ id: 'pB_1', name: 'Pistoleiro_Beta', isHost: false, isReady: true, custom: null }],
        };

        // Renderiza pelo ponto de vista do Time A
        const htmlA = renderToStaticMarkup(
          React.createElement(CinematicClashOverlay, {
            revealRound: roundSummary,
            playerTeam: 'A',
            room: mockRoom,
          })
        );

        assert.ok(htmlA.length > 200, 'HTML do overlay não pode ser vazio');
        assert.ok(htmlA.includes('Cavaleiro_Alpha'), 'Deve renderizar o nome do jogador A');
        assert.ok(htmlA.includes('Pistoleiro_Beta'), 'Deve renderizar o nome do jogador B');
        assert.ok(htmlA.includes('Confronto Hexagonal · Rodada 1'), 'Deve renderizar o título da rodada');
        assert.ok(!htmlA.includes('undefined'), 'HTML não deve conter "undefined"');
        assert.ok(!htmlA.includes('NaN'), 'HTML não deve conter "NaN"');

        // Renderiza pelo ponto de vista do Time B
        const htmlB = renderToStaticMarkup(
          React.createElement(CinematicClashOverlay, {
            revealRound: roundSummary,
            playerTeam: 'B',
            room: mockRoom,
          })
        );
        assert.ok(htmlB.length > 200, 'HTML do overlay Time B não pode ser vazio');
        assert.ok(!htmlB.includes('undefined'), 'HTML Time B não deve conter "undefined"');
      });
    }
  }

  testCheck('Distribuição Canônica Hexagonal: 12 vitórias, 12 derrotas e 12 empates (6 espelho + 6 neutro)', () => {
    assert.equal(winsCount, 12, `Esperado 12 vitórias, obtido ${winsCount}`);
    assert.equal(lossesCount, 12, `Esperado 12 derrotas, obtido ${lossesCount}`);
    assert.equal(drawsCount, 12, `Esperado 12 empates, obtido ${drawsCount}`);
  });

  // --------------------------------------------------------------------------
  // PARTE 2: MODOS 2v2 E 3v3 NO CINEMATIC CLASH OVERLAY
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ BLOCO 2: Modos Multiplayer 2v2 (Duplas) e 3v3 (Trios) no CinematicClashOverlay\x1b[0m');

  const testPermutations2v2 = [
    { name: '2x0 Vitória Time A (win, win)', outcome1: 'win' as const, outcome2: 'win' as const, winnerTeam: 'A' as const },
    { name: '1x0 Vitória Time A (win, draw)', outcome1: 'win' as const, outcome2: 'draw' as const, winnerTeam: 'A' as const },
    { name: '1x1 Empate Recíproco (win, loss)', outcome1: 'win' as const, outcome2: 'loss' as const, winnerTeam: 'DRAW' as const },
    { name: '0x0 Empate Neutro (draw, draw)', outcome1: 'draw' as const, outcome2: 'draw' as const, winnerTeam: 'DRAW' as const },
    { name: '0x1 Vitória Time B (loss, draw)', outcome1: 'loss' as const, outcome2: 'draw' as const, winnerTeam: 'B' as const },
    { name: '0x2 Vitória Time B (loss, loss)', outcome1: 'loss' as const, outcome2: 'loss' as const, winnerTeam: 'B' as const },
  ];

  for (const tc of testPermutations2v2) {
    testCheck(`2v2 Clash: ${tc.name}`, () => {
      const clashes2v2 = [
        {
          playerAId: 'pA_1',
          playerAName: 'Alpha_1',
          playerBId: 'pB_1',
          playerBName: 'Beta_1',
          moveA: 'parafal' as const,
          moveB: tc.outcome1 === 'win' ? ('pedra' as const) : tc.outcome1 === 'loss' ? ('gelo_invertido' as const) : ('tesoura' as const),
          outcomeForA: tc.outcome1,
          reason: resolveMovePair('parafal', tc.outcome1 === 'win' ? 'pedra' : tc.outcome1 === 'loss' ? 'gelo_invertido' : 'tesoura').reason,
        },
        {
          playerAId: 'pA_2',
          playerAName: 'Alpha_2',
          playerBId: 'pB_2',
          playerBName: 'Beta_2',
          moveA: 'jegue' as const,
          moveB: tc.outcome2 === 'win' ? ('papel' as const) : tc.outcome2 === 'loss' ? ('tesoura' as const) : ('pedra' as const),
          outcomeForA: tc.outcome2,
          reason: resolveMovePair('jegue', tc.outcome2 === 'win' ? 'papel' : tc.outcome2 === 'loss' ? 'tesoura' : 'pedra').reason,
        },
      ];

      const round2v2 = {
        roundNumber: 2,
        scoreA: tc.winnerTeam === 'A' ? 1 : 0,
        scoreB: tc.winnerTeam === 'B' ? 1 : 0,
        winnerTeam: tc.winnerTeam,
        clashes: clashes2v2,
      };

      const mockRoom2v2: any = { id: 'room-2v2', mode: '2v2', format: 'md3' };
      const html = renderToStaticMarkup(
        React.createElement(CinematicClashOverlay, {
          revealRound: round2v2,
          playerTeam: 'A',
          room: mockRoom2v2,
        })
      );

      assert.ok(html.includes('Alpha_1') && html.includes('Alpha_2'), 'Deve conter ambos jogadores do Time A');
      assert.ok(html.includes('Beta_1') && html.includes('Beta_2'), 'Deve conter ambos jogadores do Time B');
      assert.ok(html.includes('grid-cols-1 sm:grid-cols-2'), 'Layout 2v2 deve usar grid de 2 colunas');
      assert.ok(!html.includes('undefined'), 'Não deve conter undefined');
    });
  }

  const testPermutations3v3 = [
    { name: '3x0 Vitória Time A (win, win, win)', winnerTeam: 'A' as const },
    { name: '2x1 Vitória Time A (win, win, loss)', winnerTeam: 'A' as const },
    { name: '2x0x1 Vitória Time A (win, win, draw)', winnerTeam: 'A' as const },
    { name: '1x1x1 Empate em Trios (win, loss, draw)', winnerTeam: 'DRAW' as const },
    { name: '0x0x3 Empate Triplo Neutro (draw, draw, draw)', winnerTeam: 'DRAW' as const },
    { name: '1x2 Vitória Time B (win, loss, loss)', winnerTeam: 'B' as const },
    { name: '0x3 Vitória Time B (loss, loss, loss)', winnerTeam: 'B' as const },
  ];

  for (const tc of testPermutations3v3) {
    testCheck(`3v3 Clash: ${tc.name}`, () => {
      const clashes3v3 = [
        {
          playerAId: 'pA_1',
          playerAName: 'Trio_A1',
          playerBId: 'pB_1',
          playerBName: 'Trio_B1',
          moveA: 'pedra' as const,
          moveB: 'tesoura' as const,
          outcomeForA: 'win' as const,
          reason: resolveMovePair('pedra', 'tesoura').reason,
        },
        {
          playerAId: 'pA_2',
          playerAName: 'Trio_A2',
          playerBId: 'pB_2',
          playerBName: 'Trio_B2',
          moveA: 'gelo_invertido' as const,
          moveB: 'papel' as const,
          outcomeForA: 'draw' as const,
          reason: resolveMovePair('gelo_invertido', 'papel').reason,
        },
        {
          playerAId: 'pA_3',
          playerAName: 'Trio_A3',
          playerBId: 'pB_3',
          playerBName: 'Trio_B3',
          moveA: 'jegue' as const,
          moveB: 'parafal' as const,
          outcomeForA: 'loss' as const,
          reason: resolveMovePair('jegue', 'parafal').reason,
        },
      ];

      const round3v3 = {
        roundNumber: 3,
        scoreA: tc.winnerTeam === 'A' ? 1 : 0,
        scoreB: tc.winnerTeam === 'B' ? 1 : 0,
        winnerTeam: tc.winnerTeam,
        clashes: clashes3v3,
      };

      const mockRoom3v3: any = { id: 'room-3v3', mode: '3v3', format: 'md5' };
      const html = renderToStaticMarkup(
        React.createElement(CinematicClashOverlay, {
          revealRound: round3v3,
          playerTeam: 'A',
          room: mockRoom3v3,
        })
      );

      assert.ok(html.includes('Trio_A1') && html.includes('Trio_A2') && html.includes('Trio_A3'), 'Deve conter jogadores Time A');
      assert.ok(html.includes('Trio_B1') && html.includes('Trio_B2') && html.includes('Trio_B3'), 'Deve conter jogadores Time B');
      assert.ok(html.includes('grid-cols-1 sm:grid-cols-3'), 'Layout 3v3 deve usar grid de 3 colunas');
      assert.ok(!html.includes('undefined'), 'Não deve conter undefined');
    });
  }

  // --------------------------------------------------------------------------
  // PARTE 3: RESILIÊNCIA A CASOS DE BORDA E DADOS CORROMPIDOS NO CLASH
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ BLOCO 3: Resiliência a Casos de Borda e Dados Corrompidos no CinematicClashOverlay\x1b[0m');

  testCheck('Resiliência: revealRound === null retorna vazio sem erro', () => {
    const html = renderToStaticMarkup(
      React.createElement(CinematicClashOverlay, {
        revealRound: null,
        playerTeam: 'A',
        room: { id: 'r1', mode: '1v1', format: 'md3' } as any,
      })
    );
    assert.equal(html, '', 'Quando revealRound é nulo, nada deve ser renderizado');
  });

  testCheck('Resiliência: clashes vazio [] renderiza sem lançar exceção', () => {
    const html = renderToStaticMarkup(
      React.createElement(CinematicClashOverlay, {
        revealRound: {
          roundNumber: 1,
          scoreA: 0,
          scoreB: 0,
          winnerTeam: 'DRAW',
          clashes: [],
        },
        playerTeam: 'A',
        room: { id: 'r1', mode: '1v1', format: 'md3' } as any,
      })
    );
    assert.ok(html.includes('Confronto Hexagonal · Rodada 1'), 'Deve renderizar o container mesmo sem duelos');
  });

  testCheck('Resiliência: nomes com caracteres Unicode, emojis e injeção de tags', () => {
    const html = renderToStaticMarkup(
      React.createElement(CinematicClashOverlay, {
        revealRound: {
          roundNumber: 4,
          scoreA: 1,
          scoreB: 0,
          winnerTeam: 'A',
          clashes: [
            {
              playerAId: 'pA_emoji',
              playerAName: '🤠_El_Matador_<script>alert(1)</script>',
              playerBId: 'pB_emoji',
              playerBName: '🤖_Cyber_B0t_&_King',
              moveA: 'parafal',
              moveB: 'jegue',
              outcomeForA: 'win',
              reason: 'Parafal supera Jegue',
            },
          ],
        },
        playerTeam: 'A',
        room: { id: 'r1', mode: '1v1', format: 'md3' } as any,
      })
    );
    // React escapa tags perigosas em text nodes
    assert.ok(!html.includes('<script>alert(1)</script>'), 'Tags perigosas devem ser sanitizadas/escapadas pelo React');
    assert.ok(html.includes('El_Matador'), 'Deve renderizar nome com emoji e texto');
  });

  testCheck('Resiliência: skin inválida / inexistente em DuelClash não quebra MoveCard', () => {
    const skinFallback = getSkinById('skin_fantasma_inexistente_999');
    assert.ok(skinFallback, 'getSkinById deve retornar skin fallback segura');

    const html = renderToStaticMarkup(
      React.createElement(CinematicClashOverlay, {
        revealRound: {
          roundNumber: 1,
          scoreA: 1,
          scoreB: 0,
          winnerTeam: 'A',
          clashes: [
            {
              playerAId: 'pA',
              playerAName: 'Player A',
              playerBId: 'pB',
              playerBName: 'Player B',
              moveA: 'tesoura',
              moveB: 'papel',
              skinA: 'skin_inexistente_xyz',
              skinB: 'skin_corrompida_abc',
              outcomeForA: 'win',
              reason: resolveMovePair('tesoura', 'papel').reason,
            },
          ],
        },
        playerTeam: 'A',
        room: { id: 'r1', mode: '1v1', format: 'md3' } as any,
      })
    );
    assert.ok(html.includes('Player A') && html.includes('Player B'), 'Deve renderizar com skins corrompidas');
  });

  // --------------------------------------------------------------------------
  // PARTE 4: DESAFIO ADVERSARIAL DE TEMAS DE MESA & PROCEDURAL PBR
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ BLOCO 4: Teste Adversarial dos 8 Temas de Mesa & Fallback Seguro em ProceduralPBR\x1b[0m');

  testCheck('Catálogo de Temas: ARENA_TABLE_THEMES possui exatamente 8 temas completos', () => {
    assert.equal(ARENA_TABLE_THEMES.length, 8, `Esperado 8 temas, encontrado ${ARENA_TABLE_THEMES.length}`);
    for (const theme of ARENA_TABLE_THEMES) {
      assert.ok(theme.id && typeof theme.id === 'string', `Tema deve possuir id: ${JSON.stringify(theme)}`);
      assert.ok(theme.name && typeof theme.name === 'string', `Tema deve possuir name: ${theme.id}`);
      assert.ok(theme.subtitle && typeof theme.subtitle === 'string', `Tema deve possuir subtitle: ${theme.id}`);
      assert.ok(typeof theme.rimHex === 'number', `rimHex deve ser numérico em ${theme.id}`);
      assert.ok(typeof theme.feltHex === 'number', `feltHex deve ser numérico em ${theme.id}`);
      assert.ok(typeof theme.ringHex === 'number', `ringHex deve ser numérico em ${theme.id}`);
      assert.ok(typeof theme.fogHex === 'number', `fogHex deve ser numérico em ${theme.id}`);
      assert.ok(theme.accentCss.startsWith('#'), `accentCss deve ser cor hexadecimal válida em ${theme.id}`);
    }
  });

  for (const theme of ARENA_TABLE_THEMES) {
    testCheck(`ProceduralPBR: getThemedTableSurfaceTexture('${theme.id}') gera CanvasTexture válida`, () => {
      const tex = getThemedTableSurfaceTexture(theme.id);
      assert.ok(tex instanceof THREE.CanvasTexture, `Deve ser instância de THREE.CanvasTexture para ${theme.id}`);
      assert.equal(tex.colorSpace, THREE.SRGBColorSpace, 'Texture deve usar SRGBColorSpace');
      assert.equal(tex.userData.cached, true, 'Texture deve registrar flag cached');
    });
  }

  const adversarialThemes = [
    { input: '', desc: 'string vazia' },
    { input: '   ', desc: 'string com espaços' },
    { input: 'tema_desconhecido_99', desc: 'ID inexistente' },
    { input: 'DROP TABLE ARENA_THEMES;', desc: 'tentativa de SQL injection' },
    { input: 'saloon_mogno_extra_long_theme_id_beyond_limits_0123456789', desc: 'ID super longo' },
    { input: '🔥_cyber_emoji_neon_👾', desc: 'ID com emojis e caracteres especiais' },
    { input: null as any, desc: 'valor null' },
    { input: undefined as any, desc: 'valor undefined' },
    { input: 42 as any, desc: 'valor numérico' },
    { input: { theme: 'saloon' } as any, desc: 'objeto arbitrário' },
  ];

  for (const adv of adversarialThemes) {
    testCheck(`ProceduralPBR Fallback Seguro: Entrada '${adv.desc}' (${String(adv.input)})`, () => {
      // NÃO pode lançar TypeError nem quebrar
      const tex = getThemedTableSurfaceTexture(adv.input);
      assert.ok(tex instanceof THREE.CanvasTexture, `Fallback deve retornar THREE.CanvasTexture para '${adv.desc}'`);
      assert.equal(tex.colorSpace, THREE.SRGBColorSpace);
    });
  }

  // --------------------------------------------------------------------------
  // PARTE 5: DESAFIO ADVERSARIAL DE AURAS DE CARTAS & MOVECARD
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ BLOCO 5: Teste Adversarial das 8 Auras de Cartas & Renderização em MoveCard\x1b[0m');

  testCheck('Catálogo de Auras: CARD_AURAS possui exatamente 8 auras completas', () => {
    assert.equal(CARD_AURAS.length, 8, `Esperado 8 auras, encontrado ${CARD_AURAS.length}`);
    for (const aura of CARD_AURAS) {
      assert.ok(aura.id && typeof aura.id === 'string', `Aura deve possuir id: ${JSON.stringify(aura)}`);
      assert.ok(aura.name && typeof aura.name === 'string', `Aura deve possuir name: ${aura.id}`);
      assert.ok(aura.badge && typeof aura.badge === 'string', `Aura deve possuir badge: ${aura.id}`);
      assert.ok(typeof aura.colorHex === 'number', `colorHex deve ser numérico em ${aura.id}`);
      assert.ok(aura.cssColor.startsWith('#'), `cssColor deve ser cor hexadecimal em ${aura.id}`);
    }
  });

  for (const aura of CARD_AURAS) {
    testCheck(`MoveCard: renderização com Aura válida '${aura.id}' (${aura.name})`, () => {
      const htmlSelected = renderToStaticMarkup(
        React.createElement(MoveCard, {
          moveId: 'papel',
          auraId: aura.id,
          selected: true,
          compact: false,
        })
      );
      assert.ok(htmlSelected.length > 100, `HTML do MoveCard com aura ${aura.id} deve ser gerado`);

      const htmlUnselected = renderToStaticMarkup(
        React.createElement(MoveCard, {
          moveId: 'gelo_invertido',
          auraId: aura.id,
          selected: false,
          compact: true,
        })
      );
      assert.ok(htmlUnselected.length > 100, `HTML do MoveCard compacto com aura ${aura.id} deve ser gerado`);
    });
  }

  const adversarialAuras = [
    { input: 'aura_fantasma_inexistente', desc: 'ID inexistente' },
    { input: '', desc: 'string vazia' },
    { input: null as any, desc: 'valor null' },
    { input: undefined as any, desc: 'valor undefined' },
    { input: 'DROP_AURA;' as any, desc: 'string perigosa' },
  ];

  for (const adv of adversarialAuras) {
    testCheck(`MoveCard Fallback Seguro: Aura adversarial '${adv.desc}'`, () => {
      const html = renderToStaticMarkup(
        React.createElement(MoveCard, {
          moveId: 'pedra',
          auraId: adv.input,
          selected: true,
        })
      );
      assert.ok(html.length > 100, `MoveCard deve renderizar normalmente com fallback para aura '${adv.desc}'`);
      assert.ok(!html.includes('undefined'), 'MoveCard não deve conter "undefined" no HTML');
    });
  }

  // --------------------------------------------------------------------------
  // PARTE 6: DESAFIO ADVERSARIAL DE VICTORY EMOTES & CUSTOMIZAÇÃO
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ BLOCO 6: Teste Adversarial dos 10 Victory Emotes & Fallback de Customização\x1b[0m');

  testCheck('Catálogo de Emotes: VICTORY_EMOTES possui exatamente 10 emotes expressivos', () => {
    assert.equal(VICTORY_EMOTES.length, 10, `Esperado 10 emotes, encontrado ${VICTORY_EMOTES.length}`);
    for (const emote of VICTORY_EMOTES) {
      assert.ok(emote.id && typeof emote.id === 'string', `Emote deve possuir id: ${JSON.stringify(emote)}`);
      assert.ok(emote.name && typeof emote.name === 'string', `Emote deve possuir name: ${emote.id}`);
      assert.ok(emote.icon && typeof emote.icon === 'string' && emote.icon.trim().length > 0, `Emote deve possuir icon: ${emote.id}`);
      assert.ok(emote.phrase && typeof emote.phrase === 'string' && emote.phrase.trim().length > 0, `Emote deve possuir phrase: ${emote.id}`);
    }
  });

  testCheck('resolveCharacterCustomization: fallback seguro com inputs nulos ou parciais', () => {
    const resEmpty = resolveCharacterCustomization({});
    assert.ok(resEmpty.tableThemeId, 'Deve possuir tableThemeId por padrão');
    assert.ok(resEmpty.cardAuraId, 'Deve possuir cardAuraId por padrão');
    assert.ok(resEmpty.victoryEmoteId, 'Deve possuir victoryEmoteId por padrão');

    const resNull = resolveCharacterCustomization(null);
    assert.ok(resNull.tableThemeId, 'Deve possuir tableThemeId com null');

    const resUndefined = resolveCharacterCustomization(undefined);
    assert.ok(resUndefined.tableThemeId, 'Deve possuir tableThemeId com undefined');
  });

  testCheck('resolveCharacterCustomization: rotação determinística de fallbackIndex', () => {
    for (let i = 0; i < 20; i++) {
      const res = resolveCharacterCustomization(null, i);
      assert.ok(res.archetypeId && res.hatId && res.eyewearId && res.outfitId && res.propId && res.gunSkinId,
        `Fallback index ${i} deve gerar todas as propriedades de avatar`);
      assert.ok(res.tableThemeId, `Fallback index ${i} deve gerar tableThemeId`);
      assert.ok(res.cardAuraId, `Fallback index ${i} deve gerar cardAuraId`);
      assert.ok(res.victoryEmoteId, `Fallback index ${i} deve gerar victoryEmoteId`);
    }
  });

  // --------------------------------------------------------------------------
  // RELATÓRIO FINAL CONSOLIDADO
  // --------------------------------------------------------------------------
  const durationMs = (performance.now() - startTime).toFixed(2);
  console.log('\n' + '='.repeat(85));
  console.log('   RESUMO FINAL DO DESAFIO ADVERSARIAL DA MILRESTONE M3 (CHALLENGER 2)');
  console.log('='.repeat(85));
  console.log(`  Total de Testes Executados: ${passed + failed}`);
  console.log(`  Asserções Aprovadas:        \x1b[32m${passed}\x1b[0m`);
  console.log(`  Asserções Falhadas:         \x1b[${failed > 0 ? '31' : '32'}m${failed}\x1b[0m`);
  console.log(`  Tempo Total de Execução:    ${durationMs}ms`);
  console.log(`  Status Final:               \x1b[${failed === 0 ? '32mSUCESSO ABSOLUTO (100% PASS)' : '31mFALHAS ENCONTRADAS'}\x1b[0m`);
  console.log('='.repeat(85) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runClashAndCustomizationAdversarialSuite().catch((err) => {
  console.error('\n\x1b[31m[ERRO FATAL NA EXECUÇÃO DO HARNESS]\x1b[0m', err);
  process.exit(1);
});
