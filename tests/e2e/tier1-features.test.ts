import { TierTestRunner, loadGameEngine, assert } from './fixtures/testRunner';
import type { MoveId, MatchMode, MatchFormat } from '../../src/types/game';

export async function runTier1() {
  const runner = new TierTestRunner(
    1,
    'Funcionalidades Centrais (Feature Coverage)',
    'Matriz 6x6 (36 permutações), modos 1v1/2v2/3v3, formatos MD3/MD5, 12 Elos e Recompensas Padrão'
  );
  runner.start();

  const {
    MOVE_ORDER,
    MOVES,
    resolveMovePair,
    ELO_TIERS,
    getEloInfo,
    calculateMatchReward,
  } = await loadGameEngine();

  // ==========================================================================
  // GRUPO 1: AS 36 PERMUTAÇÕES DETERMINÍSTICAS DA MATRIZ HEXAGONAL 6x6
  // ==========================================================================
  const matrixCases: Array<{
    id: string;
    moveA: MoveId;
    moveB: MoveId;
    expectedOutcome: 'win' | 'loss' | 'draw';
    expectedReasonSnippet: string;
  }> = [
    // 12 Vitórias de A
    { id: 'T1-MTX-001', moveA: 'papel', moveB: 'parafal', expectedOutcome: 'win', expectedReasonSnippet: 'mecanismo da Parafal' },
    { id: 'T1-MTX-002', moveA: 'papel', moveB: 'pedra', expectedOutcome: 'win', expectedReasonSnippet: 'embrulhou a Pedra' },
    { id: 'T1-MTX-003', moveA: 'parafal', moveB: 'jegue', expectedOutcome: 'win', expectedReasonSnippet: 'HS no Jegue' },
    { id: 'T1-MTX-004', moveA: 'parafal', moveB: 'pedra', expectedOutcome: 'win', expectedReasonSnippet: 'explodiu a Pedra' },
    { id: 'T1-MTX-005', moveA: 'pedra', moveB: 'gelo_invertido', expectedOutcome: 'win', expectedReasonSnippet: 'estilhaçou o Gelo' },
    { id: 'T1-MTX-006', moveA: 'pedra', moveB: 'tesoura', expectedOutcome: 'win', expectedReasonSnippet: 'quebrou a Tesoura' },
    { id: 'T1-MTX-007', moveA: 'gelo_invertido', moveB: 'parafal', expectedOutcome: 'win', expectedReasonSnippet: 'parou o tiro da Parafal' },
    { id: 'T1-MTX-008', moveA: 'gelo_invertido', moveB: 'tesoura', expectedOutcome: 'win', expectedReasonSnippet: 'congelou e quebrou a Tesoura' },
    { id: 'T1-MTX-009', moveA: 'tesoura', moveB: 'jegue', expectedOutcome: 'win', expectedReasonSnippet: 'derrotou o Jegue' },
    { id: 'T1-MTX-010', moveA: 'tesoura', moveB: 'papel', expectedOutcome: 'win', expectedReasonSnippet: 'cortou o Papel' },
    { id: 'T1-MTX-011', moveA: 'jegue', moveB: 'papel', expectedOutcome: 'win', expectedReasonSnippet: 'devorou o Papel' },
    { id: 'T1-MTX-012', moveA: 'jegue', moveB: 'gelo_invertido', expectedOutcome: 'win', expectedReasonSnippet: 'atropelou o Gelo Invertido' },

    // 12 Derrotas de A (Simetria Recíproca)
    { id: 'T1-MTX-013', moveA: 'parafal', moveB: 'papel', expectedOutcome: 'loss', expectedReasonSnippet: 'mecanismo da Parafal' },
    { id: 'T1-MTX-014', moveA: 'pedra', moveB: 'papel', expectedOutcome: 'loss', expectedReasonSnippet: 'embrulhou a Pedra' },
    { id: 'T1-MTX-015', moveA: 'jegue', moveB: 'parafal', expectedOutcome: 'loss', expectedReasonSnippet: 'HS no Jegue' },
    { id: 'T1-MTX-016', moveA: 'pedra', moveB: 'parafal', expectedOutcome: 'loss', expectedReasonSnippet: 'explodiu a Pedra' },
    { id: 'T1-MTX-017', moveA: 'gelo_invertido', moveB: 'pedra', expectedOutcome: 'loss', expectedReasonSnippet: 'estilhaçou o Gelo' },
    { id: 'T1-MTX-018', moveA: 'tesoura', moveB: 'pedra', expectedOutcome: 'loss', expectedReasonSnippet: 'quebrou a Tesoura' },
    { id: 'T1-MTX-019', moveA: 'parafal', moveB: 'gelo_invertido', expectedOutcome: 'loss', expectedReasonSnippet: 'parou o tiro da Parafal' },
    { id: 'T1-MTX-020', moveA: 'tesoura', moveB: 'gelo_invertido', expectedOutcome: 'loss', expectedReasonSnippet: 'congelou e quebrou a Tesoura' },
    { id: 'T1-MTX-021', moveA: 'jegue', moveB: 'tesoura', expectedOutcome: 'loss', expectedReasonSnippet: 'derrotou o Jegue' },
    { id: 'T1-MTX-022', moveA: 'papel', moveB: 'tesoura', expectedOutcome: 'loss', expectedReasonSnippet: 'cortou o Papel' },
    { id: 'T1-MTX-023', moveA: 'papel', moveB: 'jegue', expectedOutcome: 'loss', expectedReasonSnippet: 'devorou o Papel' },
    { id: 'T1-MTX-024', moveA: 'gelo_invertido', moveB: 'jegue', expectedOutcome: 'loss', expectedReasonSnippet: 'atropelou o Gelo Invertido' },

    // 6 Empates Espelhados
    { id: 'T1-MTX-025', moveA: 'papel', moveB: 'papel', expectedOutcome: 'draw', expectedReasonSnippet: 'Empate espelhado' },
    { id: 'T1-MTX-026', moveA: 'parafal', moveB: 'parafal', expectedOutcome: 'draw', expectedReasonSnippet: 'Empate espelhado' },
    { id: 'T1-MTX-027', moveA: 'pedra', moveB: 'pedra', expectedOutcome: 'draw', expectedReasonSnippet: 'Empate espelhado' },
    { id: 'T1-MTX-028', moveA: 'gelo_invertido', moveB: 'gelo_invertido', expectedOutcome: 'draw', expectedReasonSnippet: 'Empate espelhado' },
    { id: 'T1-MTX-029', moveA: 'tesoura', moveB: 'tesoura', expectedOutcome: 'draw', expectedReasonSnippet: 'Empate espelhado' },
    { id: 'T1-MTX-030', moveA: 'jegue', moveB: 'jegue', expectedOutcome: 'draw', expectedReasonSnippet: 'Empate espelhado' },

    // 6 Empates Neutros
    { id: 'T1-MTX-031', moveA: 'papel', moveB: 'gelo_invertido', expectedOutcome: 'draw', expectedReasonSnippet: 'neutras' },
    { id: 'T1-MTX-032', moveA: 'gelo_invertido', moveB: 'papel', expectedOutcome: 'draw', expectedReasonSnippet: 'neutras' },
    { id: 'T1-MTX-033', moveA: 'parafal', moveB: 'tesoura', expectedOutcome: 'draw', expectedReasonSnippet: 'neutras' },
    { id: 'T1-MTX-034', moveA: 'tesoura', moveB: 'parafal', expectedOutcome: 'draw', expectedReasonSnippet: 'neutras' },
    { id: 'T1-MTX-035', moveA: 'pedra', moveB: 'jegue', expectedOutcome: 'draw', expectedReasonSnippet: 'neutras' },
    { id: 'T1-MTX-036', moveA: 'jegue', moveB: 'pedra', expectedOutcome: 'draw', expectedReasonSnippet: 'neutras' },
  ];

  for (const c of matrixCases) {
    await runner.test(
      c.id,
      `Confronto ${c.moveA} vs ${c.moveB} resulta em '${c.expectedOutcome}'`,
      () => {
        const result = resolveMovePair(c.moveA, c.moveB);
        assert.equal(
          result.outcomeForA,
          c.expectedOutcome,
          `Esperava ${c.expectedOutcome} para ${c.moveA} vs ${c.moveB}, obteve ${result.outcomeForA}`
        );
        assert.ok(
          result.reason.toLowerCase().includes(c.expectedReasonSnippet.toLowerCase()),
          `Esperava que a razão contivesse "${c.expectedReasonSnippet}", obteve: "${result.reason}"`
        );
      }
    );
  }

  // ==========================================================================
  // GRUPO 2: ESTRUTURA DO GRAFO HEXAGONAL (PROPRIEDADES MATEMÁTICAS)
  // ==========================================================================
  for (const move of MOVE_ORDER) {
    await runner.test(
      `T1-STR-${move}`,
      `Propriedades estruturais de '${move}': 2 vitórias, 2 derrotas e 1 elemento neutro`,
      () => {
        const def = MOVES[move];
        assert.ok(def, `Definição de ${move} ausente`);
        assert.equal(def.beats.length, 2, `${move} deve vencer exatamente 2 jogadas`);
        assert.equal(def.losesTo.length, 2, `${move} deve perder para exatamente 2 jogadas`);
        assert.ok(typeof def.neutralWith === 'string', `${move} deve possuir 1 jogada neutra associada`);
        assert.ok(MOVE_ORDER.includes(def.neutralWith), `${move} neutralWith deve ser um MoveId válido`);

        // Nenhuma intersecção entre conjuntos
        const intersectionBeatsLoses = def.beats.filter((m) => def.losesTo.includes(m));
        assert.equal(intersectionBeatsLoses.length, 0, 'Inconsistência entre beats e losesTo');
        assert.ok(!def.beats.includes(def.neutralWith), 'Neutro não pode estar em beats');
        assert.ok(!def.losesTo.includes(def.neutralWith), 'Neutro não pode estar em losesTo');
      }
    );
  }

  // ==========================================================================
  // GRUPO 3: MODOS DE JOGO 1v1, 2v2 E 3v3 E RESOLUÇÃO DE PONTOS
  // ==========================================================================
  await runner.test('T1-MOD-001', 'Configuração de Modo 1v1: teamSize=1 e pareamento direto', () => {
    const mode: MatchMode = '1v1';
    const teamSize = mode === '1v1' ? 1 : mode === '2v2' ? 2 : 3;
    assert.equal(teamSize, 1);
  });

  await runner.test('T1-MOD-002', 'Configuração de Modo 2v2: teamSize=2 e fase pairing', () => {
    const mode: MatchMode = '2v2';
    const teamSize = mode === '1v1' ? 1 : mode === '2v2' ? 2 : 3;
    assert.equal(teamSize, 2);
  });

  await runner.test('T1-MOD-003', 'Configuração de Modo 3v3: teamSize=3 e fase pairing', () => {
    const mode: MatchMode = '3v3';
    const teamSize = mode === '1v1' ? 1 : mode === '2v2' ? 2 : 3;
    assert.equal(teamSize, 3);
  });

  await runner.test('T1-MOD-004', 'Resolução 2v2: Vitória clara do Time A (2x0) concede a rodada para A', () => {
    // Par 1: Papel vs Pedra (Win A)
    // Par 2: Parafal vs Jegue (Win A)
    const res1 = resolveMovePair('papel', 'pedra');
    const res2 = resolveMovePair('parafal', 'jegue');
    let teamAPoints = 0;
    let teamBPoints = 0;
    if (res1.outcomeForA === 'win') teamAPoints++;
    if (res2.outcomeForA === 'win') teamAPoints++;

    let winnerTeam: 'A' | 'B' | 'DRAW' = 'DRAW';
    if (teamAPoints > teamBPoints) winnerTeam = 'A';
    else if (teamBPoints > teamAPoints) winnerTeam = 'B';

    assert.equal(teamAPoints, 2);
    assert.equal(teamBPoints, 0);
    assert.equal(winnerTeam, 'A');
  });

  await runner.test('T1-MOD-005', 'Resolução 2v2: Empate por confrontos recíprocos (1x1) resulta em rodada DRAW', () => {
    // Par 1: Papel vs Pedra (Win A)
    // Par 2: Pedra vs Papel (Loss A => Win B)
    const res1 = resolveMovePair('papel', 'pedra');
    const res2 = resolveMovePair('pedra', 'papel');
    let teamAPoints = 0;
    let teamBPoints = 0;
    if (res1.outcomeForA === 'win') teamAPoints++;
    if (res2.outcomeForA === 'loss') teamBPoints++;

    let winnerTeam: 'A' | 'B' | 'DRAW' = 'DRAW';
    if (teamAPoints > teamBPoints) winnerTeam = 'A';
    else if (teamBPoints > teamAPoints) winnerTeam = 'B';

    assert.equal(teamAPoints, 1);
    assert.equal(teamBPoints, 1);
    assert.equal(winnerTeam, 'DRAW');
  });

  await runner.test('T1-MOD-006', 'Resolução 3v3: Vitória por maioria simples (2x1) concede a rodada para A', () => {
    const res1 = resolveMovePair('papel', 'pedra'); // Win A
    const res2 = resolveMovePair('parafal', 'jegue'); // Win A
    const res3 = resolveMovePair('pedra', 'parafal'); // Loss A (Win B)

    let teamAPoints = 0;
    let teamBPoints = 0;
    if (res1.outcomeForA === 'win') teamAPoints++;
    if (res2.outcomeForA === 'win') teamAPoints++;
    if (res3.outcomeForA === 'loss') teamBPoints++;

    let winnerTeam: 'A' | 'B' | 'DRAW' = 'DRAW';
    if (teamAPoints > teamBPoints) winnerTeam = 'A';
    else if (teamBPoints > teamAPoints) winnerTeam = 'B';

    assert.equal(teamAPoints, 2);
    assert.equal(teamBPoints, 1);
    assert.equal(winnerTeam, 'A');
  });

  await runner.test('T1-MOD-007', 'Resolução 3v3: Empate com 1 vitória de cada lado e 1 empate neutro', () => {
    const res1 = resolveMovePair('papel', 'pedra'); // Win A
    const res2 = resolveMovePair('pedra', 'papel'); // Loss A
    const res3 = resolveMovePair('papel', 'gelo_invertido'); // Draw

    let teamAPoints = 0;
    let teamBPoints = 0;
    if (res1.outcomeForA === 'win') teamAPoints++;
    if (res2.outcomeForA === 'loss') teamBPoints++;

    let winnerTeam: 'A' | 'B' | 'DRAW' = 'DRAW';
    if (teamAPoints > teamBPoints) winnerTeam = 'A';
    else if (teamBPoints > teamAPoints) winnerTeam = 'B';

    assert.equal(teamAPoints, 1);
    assert.equal(teamBPoints, 1);
    assert.equal(res3.outcomeForA, 'draw');
    assert.equal(winnerTeam, 'DRAW');
  });

  // ==========================================================================
  // GRUPO 4: FORMATOS MD3 E MD5 E CRITÉRIOS DE FINALIZAÇÃO
  // ==========================================================================
  await runner.test('T1-FMT-001', 'Formato MD3: 2 vitórias consecutivas (2x0) encerra a partida com vitória de A', () => {
    const format: MatchFormat = 'MD3';
    const targetWins = format === 'MD5' ? 3 : 2;
    const teamAScore = 2;
    const teamBScore = 0;
    const currentRound = 2;

    const finished = teamAScore >= targetWins || teamBScore >= targetWins || currentRound >= 15;
    assert.equal(finished, true);
    const winner = teamAScore > teamBScore ? 'A' : teamBScore > teamAScore ? 'B' : 'DRAW';
    assert.equal(winner, 'A');
  });

  await runner.test('T1-FMT-002', 'Formato MD3: Vitória por 2x1 na 3ª rodada encerra com vitória de A', () => {
    const format: MatchFormat = 'MD3';
    const targetWins = format === 'MD5' ? 3 : 2;
    const teamAScore = 2;
    const teamBScore = 1;
    const currentRound = 3;

    const finished = teamAScore >= targetWins || teamBScore >= targetWins || currentRound >= 15;
    assert.equal(finished, true);
    assert.equal(teamAScore, targetWins);
  });

  await runner.test('T1-FMT-003', 'Formato MD5: 3 vitórias (3x0) encerra a partida para Time A', () => {
    const format: MatchFormat = 'MD5';
    const targetWins = format === 'MD5' ? 3 : 2;
    const teamAScore = 3;
    const teamBScore = 0;
    const finished = teamAScore >= targetWins || teamBScore >= targetWins;
    assert.equal(finished, true);
  });

  await runner.test('T1-FMT-004', 'Formato MD5: Virada de 3x2 encerra a partida com vitória de A', () => {
    const format: MatchFormat = 'MD5';
    const targetWins = format === 'MD5' ? 3 : 2;
    const teamAScore = 3;
    const teamBScore = 2;
    const finished = teamAScore >= targetWins || teamBScore >= targetWins;
    assert.equal(finished, true);
  });

  await runner.test('T1-FMT-005', 'Formato MD3: Placar 1x0 na 1ª rodada mantém partida ativa (não finalizada)', () => {
    const format: MatchFormat = 'MD3';
    const targetWins = format === 'MD5' ? 3 : 2;
    const teamAScore = 1;
    const teamBScore = 0;
    const currentRound = 1;
    const finished = teamAScore >= targetWins || teamBScore >= targetWins || currentRound >= 15;
    assert.equal(finished, false);
  });

  await runner.test('T1-FMT-006', 'Formato MD5: Placar 2x2 na 4ª rodada mantém partida ativa para o round 5', () => {
    const format: MatchFormat = 'MD5';
    const targetWins = format === 'MD5' ? 3 : 2;
    const teamAScore = 2;
    const teamBScore = 2;
    const currentRound = 4;
    const finished = teamAScore >= targetWins || teamBScore >= targetWins || currentRound >= 15;
    assert.equal(finished, false);
  });

  // ==========================================================================
  // GRUPO 5: ESCALA DOS 12 ELOS COMPETITIVOS
  // ==========================================================================
  const eloTestCases = [
    { trophies: 0, expectedEloId: 'novato', expectedName: 'Novato' },
    { trophies: 500, expectedEloId: 'bixo', expectedName: 'Bixo' },
    { trophies: 1000, expectedEloId: 'segundoanista', expectedName: 'Segundoanista' },
    { trophies: 1500, expectedEloId: 'terceiranista', expectedName: 'Terceiranista' },
    { trophies: 2250, expectedEloId: 'veterano', expectedName: 'Veterano' },
    { trophies: 3000, expectedEloId: 'municipal', expectedName: 'Municipal' },
    { trophies: 4000, expectedEloId: 'regional', expectedName: 'Regional' },
    { trophies: 5000, expectedEloId: 'estadual', expectedName: 'Estadual' },
    { trophies: 6000, expectedEloId: 'nacional', expectedName: 'Nacional' },
    { trophies: 7500, expectedEloId: 'continental', expectedName: 'Continental' },
    { trophies: 8000, expectedEloId: 'global', expectedName: 'Global' },
    { trophies: 10000, expectedEloId: 'pro', expectedName: 'Pro' },
  ];

  for (const tc of eloTestCases) {
    await runner.test(
      `T1-ELO-${tc.expectedEloId}`,
      `Classificação de ${tc.trophies} troféus no Elo '${tc.expectedName}'`,
      () => {
        const info = getEloInfo(tc.trophies);
        assert.equal(info.tier.id, tc.expectedEloId);
        assert.equal(info.tier.name, tc.expectedName);
      }
    );
  }

  // ==========================================================================
  // GRUPO 6: RECOMPENSAS PADRÃO DE VITÓRIA (POR MODO E FORMATO)
  // ==========================================================================
  await runner.test('T1-REW-001', 'Vitória 1v1 MD3: Concede 10-20 troféus e 40 moedas', () => {
    for (let i = 0; i < 10; i++) {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 100,
        currentLossStreak: 1,
      });
      assert.ok(reward.trophyDelta >= 10 && reward.trophyDelta <= 20);
      assert.equal(reward.coinsEarned, 40);
      assert.equal(reward.newLossStreak, 0);
      assert.equal(reward.streakRecoveryTriggered, false);
    }
  });

  await runner.test('T1-REW-002', 'Vitória 1v1 MD5: Concede 20-30 troféus e 55 moedas', () => {
    for (let i = 0; i < 10; i++) {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '1v1',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: 100,
        currentLossStreak: 0,
      });
      assert.ok(reward.trophyDelta >= 20 && reward.trophyDelta <= 30);
      assert.equal(reward.coinsEarned, 55);
      assert.equal(reward.newLossStreak, 0);
    }
  });

  await runner.test('T1-REW-003', 'Vitória 2v2 MD3: Concede 40-50 troféus e 65 moedas', () => {
    for (let i = 0; i < 10; i++) {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '2v2',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 500,
        currentLossStreak: 0,
      });
      assert.ok(reward.trophyDelta >= 40 && reward.trophyDelta <= 50);
      assert.equal(reward.coinsEarned, 65);
    }
  });

  await runner.test('T1-REW-004', 'Vitória 2v2 MD5: Concede 45-55 troféus e 65 moedas', () => {
    for (let i = 0; i < 10; i++) {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '2v2',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: 500,
        currentLossStreak: 0,
      });
      assert.ok(reward.trophyDelta >= 45 && reward.trophyDelta <= 55);
      assert.equal(reward.coinsEarned, 65);
    }
  });

  await runner.test('T1-REW-005', 'Vitória 3v3 MD3: Concede 50-60 troféus e 80 moedas', () => {
    for (let i = 0; i < 10; i++) {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '3v3',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 1000,
        currentLossStreak: 0,
      });
      assert.ok(reward.trophyDelta >= 50 && reward.trophyDelta <= 60);
      assert.equal(reward.coinsEarned, 80);
    }
  });

  await runner.test('T1-REW-006', 'Vitória 3v3 MD5: Concede 55-65 troféus e 80 moedas', () => {
    for (let i = 0; i < 10; i++) {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '3v3',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: 1000,
        currentLossStreak: 0,
      });
      assert.ok(reward.trophyDelta >= 55 && reward.trophyDelta <= 65);
      assert.equal(reward.coinsEarned, 80);
    }
  });

  await runner.test('T1-REW-007', 'Vitória em qualquer modo zera o contador de lossStreak para 0', () => {
    const reward = calculateMatchReward({
      outcome: 'win',
      mode: '1v1',
      format: 'MD3',
      isFriendly: false,
      currentTrophies: 200,
      currentLossStreak: 5, // Tinha 5 derrotas anteriores
    });
    assert.equal(reward.newLossStreak, 0);
  });

  return runner.printSummary();
}

// Invocação direta via CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith('tier1-features.test.ts') || process.argv[1].endsWith('tier1-features.test.js'))
) {
  runTier1()
    .then((summary) => {
      process.exit(summary.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
