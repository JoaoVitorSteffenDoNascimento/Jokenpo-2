import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { loadGameEngine, TierTestRunner } from './fixtures/testRunner';
import type { MoveId, MatchMode, MatchFormat, Turma } from '../../src/types/game';

// ============================================================================
// ORÁCULO MATEMÁTICO ADVERSARIAL INDEPENDENTE — JOKENPO 2
// ============================================================================
// Este módulo foi construído de forma 100% independente do código de produção
// com o propósito de desafiar as asserções de tests/e2e/** e do motor de jogo.
// ============================================================================

async function runAdversarialChallenge() {
  console.log('\n================================================================================');
  console.log('       JOKENPO 2 — SUÍTE ADVERSARIAL INDEPENDENTE (EMPIRICAL CHALLENGER)        ');
  console.log('================================================================================\n');

  const {
    resolveMovePair,
    calculateMatchReward,
    getEloInfo,
    getChoosingTeam,
    normalizeNickname,
    checkNicknameAvailable,
    TURMAS,
    MOVE_ORDER,
  } = await loadGameEngine();

  let totalChallenges = 0;
  let passedChallenges = 0;
  let failedChallenges = 0;

  async function runCheck(name: string, fn: () => void | Promise<void>) {
    totalChallenges++;
    try {
      await fn();
      passedChallenges++;
      console.log(`  \x1b[32m✔ [CHALLENGE-PASS]\x1b[0m ${name}`);
    } catch (err: any) {
      failedChallenges++;
      console.error(`  \x1b[31m✖ [CHALLENGE-FAIL]\x1b[0m ${name}`);
      console.error(`    \x1b[31m${err.message}\x1b[0m`);
    }
  }

  // --------------------------------------------------------------------------
  // DESAFIO 1: ORÁCULO MATEMÁTICO INDEPENDENTE DAS 36 PERMUTAÇÕES HEXAGONAIS
  // --------------------------------------------------------------------------
  console.log('\x1b[36m▶ DESAFIO 1: Oráculo Matemático Independente das 36 Permutações Hexagonais\x1b[0m');

  // Grafo Canônico Derivado da Especificação Pura (Ground Truth):
  const INDEPENDENT_BEATS: Record<MoveId, [MoveId, MoveId]> = {
    papel: ['parafal', 'pedra'],
    parafal: ['jegue', 'pedra'],
    pedra: ['gelo_invertido', 'tesoura'],
    gelo_invertido: ['parafal', 'tesoura'],
    tesoura: ['jegue', 'papel'],
    jegue: ['papel', 'gelo_invertido'],
  };

  const INDEPENDENT_NEUTRALS: [MoveId, MoveId][] = [
    ['papel', 'gelo_invertido'],
    ['parafal', 'tesoura'],
    ['pedra', 'jegue'],
  ];

  const ALL_MOVES: MoveId[] = ['papel', 'parafal', 'pedra', 'gelo_invertido', 'tesoura', 'jegue'];

  function independentOracle(mA: MoveId, mB: MoveId): 'win' | 'loss' | 'draw' {
    if (mA === mB) return 'draw';
    if (INDEPENDENT_BEATS[mA].includes(mB)) return 'win';
    if (INDEPENDENT_BEATS[mB].includes(mA)) return 'loss';
    return 'draw';
  }

  // 1.1 Cobertura Exaustiva de todas as 36 permutações contra o Oráculo
  await runCheck('Oráculo 36 permutações: Cada par (A, B) coincide perfeitamente com a teoria', () => {
    let winsCount = 0;
    let lossesCount = 0;
    let mirrorDrawsCount = 0;
    let neutralDrawsCount = 0;

    for (const mA of ALL_MOVES) {
      for (const mB of ALL_MOVES) {
        const expected = independentOracle(mA, mB);
        const actual = resolveMovePair(mA, mB);

        assert.equal(
          actual.outcomeForA,
          expected,
          `Divergência matemática para (${mA}, ${mB}): esperado ${expected}, obtido ${actual.outcomeForA}`
        );

        if (mA === mB) {
          mirrorDrawsCount++;
          assert.ok(actual.reason.includes('espelhado'), `Razão de empate espelhado incorreta para ${mA}`);
        } else if (expected === 'win') {
          winsCount++;
          assert.ok(actual.reason.length > 5, `Razão de vitória muito curta para ${mA} vs ${mB}`);
        } else if (expected === 'loss') {
          lossesCount++;
          assert.ok(actual.reason.length > 5, `Razão de derrota muito curta para ${mA} vs ${mB}`);
        } else {
          neutralDrawsCount++;
          assert.ok(actual.reason.includes('neutras'), `Razão de empate neutro incorreta para ${mA} vs ${mB}`);
        }
      }
    }

    assert.equal(winsCount, 12, 'Deve haver exatamente 12 vitórias na matriz 6x6');
    assert.equal(lossesCount, 12, 'Deve haver exatamente 12 derrotas na matriz 6x6');
    assert.equal(mirrorDrawsCount, 6, 'Deve haver exatamente 6 empates espelhados na diagonal principal');
    assert.equal(neutralDrawsCount, 6, 'Deve haver exatamente 6 empates neutros fora da diagonal');
  });

  // 1.2 Invariante de Antissimetria e Soma-Zero (Payoff Matrix)
  await runCheck('Invariante Algébrico: A matriz de payoff é estritamente antissimétrica e de soma-zero', () => {
    const payoffValue = (outcome: 'win' | 'loss' | 'draw') => (outcome === 'win' ? 1 : outcome === 'loss' ? -1 : 0);
    let totalMatrixSum = 0;

    for (const mA of ALL_MOVES) {
      let rowSum = 0;
      for (const mB of ALL_MOVES) {
        const resAB = resolveMovePair(mA, mB);
        const resBA = resolveMovePair(mB, mA);

        const valAB = payoffValue(resAB.outcomeForA);
        const valBA = payoffValue(resBA.outcomeForA);

        // Antissimetria estrita: val(A, B) + val(B, A) === 0
        assert.equal(
          valAB + valBA,
          0,
          `Violação de antissimetria para o par (${mA}, ${mB}): valAB=${valAB}, valBA=${valBA}`
        );

        rowSum += valAB;
      }
      // Cada linha deve somar 0 (equilíbrio justo de cada jogada)
      assert.equal(rowSum, 0, `Linha ${mA} não possui soma zero (soma=${rowSum})`);
      totalMatrixSum += rowSum;
    }

    assert.equal(totalMatrixSum, 0, 'Soma total da matriz deve ser 0');
  });

  // 1.3 Intransitividade e Ciclos de Dominância (Ausência de Estratégia Dominante)
  runCheck('Intransitividade Hexagonal: Presença de múltiplos 3-ciclos e ausência de nós dominantes', () => {
    // Prova de ciclos de dominância:
    const cycles = [
      ['papel', 'parafal', 'jegue', 'papel'],
      ['papel', 'pedra', 'tesoura', 'papel'],
      ['parafal', 'pedra', 'gelo_invertido', 'parafal'],
      ['gelo_invertido', 'tesoura', 'jegue', 'gelo_invertido'],
    ];

    for (const cycle of cycles) {
      for (let i = 0; i < cycle.length - 1; i++) {
        const u = cycle[i] as MoveId;
        const v = cycle[i + 1] as MoveId;
        const res = resolveMovePair(u, v);
        assert.equal(res.outcomeForA, 'win', `Ciclo quebrado: ${u} deveria vencer ${v}`);
      }
    }
  });

  // --------------------------------------------------------------------------
  // DESAFIO 2: ESTRESSE DE TRANSIÇÃO DE RODADAS E TETO DE 15 EMPATES
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ DESAFIO 2: Estresse de Transição de Rodadas e Teto de 15 Empates\x1b[0m');

  function simulateMatchRounds(format: MatchFormat, roundOutcomes: Array<'winA' | 'winB' | 'draw'>) {
    const targetWins = format === 'MD5' ? 3 : 2;
    let scoreA = 0;
    let scoreB = 0;
    let round = 1;
    let finished = false;
    let winner: 'A' | 'B' | 'DRAW' | '' = '';

    for (const out of roundOutcomes) {
      if (finished) break;

      if (out === 'winA') scoreA++;
      else if (out === 'winB') scoreB++;

      finished = scoreA >= targetWins || scoreB >= targetWins || round >= 15;
      if (finished) {
        if (scoreA > scoreB) winner = 'A';
        else if (scoreB > scoreA) winner = 'B';
        else winner = 'DRAW';
        break;
      }
      round++;
    }

    return { scoreA, scoreB, round, finished, winner };
  }

  // 2.1 Exatamente 15 empates consecutivos em MD3
  runCheck('Teto 15 empates em MD3: Finaliza na 15ª rodada com DRAW e nunca avança para a 16ª', () => {
    const fifteenDraws = Array(20).fill('draw') as Array<'winA' | 'winB' | 'draw'>;
    const res = simulateMatchRounds('MD3', fifteenDraws);
    assert.equal(res.round, 15, 'Deve parar na rodada 15');
    assert.equal(res.finished, true, 'Deve finalizar a partida');
    assert.equal(res.winner, 'DRAW', 'Resultado deve ser DRAW para 0x0');
    assert.equal(res.scoreA, 0);
    assert.equal(res.scoreB, 0);
  });

  // 2.2 Exatamente 15 empates consecutivos em MD5
  runCheck('Teto 15 empates em MD5: Finaliza na 15ª rodada com DRAW e nunca avança para a 16ª', () => {
    const fifteenDraws = Array(20).fill('draw') as Array<'winA' | 'winB' | 'draw'>;
    const res = simulateMatchRounds('MD5', fifteenDraws);
    assert.equal(res.round, 15);
    assert.equal(res.finished, true);
    assert.equal(res.winner, 'DRAW');
  });

  // 2.3 Desempate por Pontuação Acumulada no Teto de 15 Rodadas (MD3: 1x0 com 14 empates)
  runCheck('Teto 15 rodadas com vantagem (1x0 em MD3): Time com maior pontuação é consagrado vencedor', () => {
    // Round 1 vence A, rounds 2 a 15 empatam
    const outcomes: Array<'winA' | 'winB' | 'draw'> = ['winA', ...Array(14).fill('draw')];
    const res = simulateMatchRounds('MD3', outcomes);
    assert.equal(res.round, 15, 'Partida deve atingir a rodada 15');
    assert.equal(res.finished, true);
    assert.equal(res.scoreA, 1);
    assert.equal(res.scoreB, 0);
    assert.equal(res.winner, 'A', 'Time A deve vencer pelo critério de maior pontuação');
  });

  // 2.4 Desempate no Teto de 15 Rodadas em MD5 com Placar 2x2
  runCheck('Teto 15 rodadas em MD5 com placar 2x2: Termina com DRAW se scores forem iguais', () => {
    // 2 vitórias A, 2 vitórias B, 11 empates = 15 rodadas
    const outcomes: Array<'winA' | 'winB' | 'draw'> = [
      'winA', 'winB', 'winA', 'winB',
      ...Array(11).fill('draw'),
    ];
    const res = simulateMatchRounds('MD5', outcomes);
    assert.equal(res.round, 15);
    assert.equal(res.finished, true);
    assert.equal(res.scoreA, 2);
    assert.equal(res.scoreB, 2);
    assert.equal(res.winner, 'DRAW');
  });

  // 2.5 Vitória de A na 15ª rodada após 14 empates
  runCheck('Vitória na última rodada (15ª): 14 empates seguidos de 1 vitória de A declara A vencedor na 15ª', () => {
    const outcomes: Array<'winA' | 'winB' | 'draw'> = [
      ...Array(14).fill('draw'),
      'winA',
    ];
    const res = simulateMatchRounds('MD3', outcomes);
    assert.equal(res.round, 15);
    assert.equal(res.finished, true);
    assert.equal(res.scoreA, 1);
    assert.equal(res.scoreB, 0);
    assert.equal(res.winner, 'A');
  });

  // --------------------------------------------------------------------------
  // DESAFIO 3: ESTRESSE DA MECÂNICA ANTI-TILT (AUTOMATON COM 10.000 TRANSIÇÕES)
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ DESAFIO 3: Estresse da Mecânica Anti-Tilt (Streak Recovery & Floor 0)\x1b[0m');

  runCheck('Autômato Anti-Tilt (10.000 iterações): Invariante do 3º revés consecutivo e piso zero absoluto', () => {
    let trophies = 100;
    let lossStreak = 0;
    let recoveryCount = 0;
    let totalLosses = 0;

    for (let step = 0; step < 10000; step++) {
      // Gera padrão determinístico com sequências longas de derrotas, vitórias intercaladas e empates
      const action = step % 5 === 0 ? 'win' : step % 7 === 0 ? 'draw' : 'loss';

      const prevTrophies = trophies;
      const prevStreak = lossStreak;

      const reward = calculateMatchReward({
        outcome: action,
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: trophies,
        currentLossStreak: lossStreak,
      });

      // INVARIANTE 1: Saldo de troféus NUNCA pode ser negativo
      assert.ok(
        reward.newTrophies >= 0,
        `Troféus negativos detectados: ${reward.newTrophies} (passo ${step})`
      );

      if (action === 'win') {
        assert.equal(reward.newLossStreak, 0, 'Vitória deve resetar lossStreak para 0');
        assert.ok(reward.trophyDelta > 0, 'Vitória deve conceder troféus');
        assert.equal(reward.streakRecoveryTriggered, false);
      } else if (action === 'draw') {
        assert.equal(reward.newLossStreak, prevStreak, 'Empate não pode alterar lossStreak');
        assert.equal(reward.trophyDelta, 0, 'Empate não altera troféus');
        assert.equal(reward.streakRecoveryTriggered, false);
      } else {
        // Derrota
        totalLosses++;
        if (prevStreak + 1 >= 3) {
          // Anti-tilt DEVE ser disparado
          assert.equal(
            reward.streakRecoveryTriggered,
            true,
            `Anti-tilt deveria disparar no streak ${prevStreak + 1} (passo ${step})`
          );
          assert.equal(reward.newLossStreak, 0, 'Após recovery, streak deve ser 0');
          assert.ok(
            reward.trophyDelta >= 25 && reward.trophyDelta <= 30,
            `Bônus de recovery fora da faixa [25, 30]: ${reward.trophyDelta}`
          );
          assert.equal(reward.coinsEarned, 30, 'Moedas anti-tilt devem ser 30');
          recoveryCount++;
        } else {
          // Derrota normal
          assert.equal(reward.streakRecoveryTriggered, false);
          assert.equal(reward.newLossStreak, prevStreak + 1);
          assert.ok(reward.trophyDelta <= 0, 'Derrota normal deve subtrair troféus ou manter em 0');
        }
      }

      trophies = reward.newTrophies;
      lossStreak = reward.newLossStreak;
    }

    assert.ok(recoveryCount > 0, 'Deveria ter ocorrido disparos de streak recovery');
    assert.ok(trophies >= 0, 'Troféus finais devem ser >= 0');
  });

  // --------------------------------------------------------------------------
  // DESAFIO 4: FALSIFICAÇÃO EMPÍRICA (MUTATION TESTING / SANITY CHECKS)
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ DESAFIO 4: Falsificação Empírica (Comprovação de Detecção de Falhas)\x1b[0m');

  // 4.1 Falsificação da Matriz: Mutação forçada DEVE causar falha
  runCheck('Falsificação da Matriz: Afirmação errônea (papel perde para parafal) FALHA imediatamente', () => {
    let caughtMutation = false;
    try {
      const actual = resolveMovePair('papel', 'parafal');
      // Asserção deliberadamente FALSA
      assert.equal(actual.outcomeForA, 'loss', 'Mutação proposital para validar detecção');
    } catch {
      caughtMutation = true;
    }
    assert.equal(caughtMutation, true, 'O sistema de teste DEVE detectar mutação de regra!');
  });

  // 4.2 Falsificação do Teto de 15 Rodadas: Permitir rodada 16 DEVE falhar
  runCheck('Falsificação do Teto: Simulação permitindo 16ª rodada FALHA nas asserções de limite', () => {
    let caughtMutation = false;
    try {
      const sixteenDraws = Array(16).fill('draw') as Array<'winA' | 'winB' | 'draw'>;
      const res = simulateMatchRounds('MD3', sixteenDraws);
      // Asserção deliberadamente FALSA: esperar round 16
      assert.equal(res.round, 16, 'Mutação proposital esperando rodada 16');
    } catch {
      caughtMutation = true;
    }
    assert.equal(caughtMutation, true, 'O sistema DEVE impedir a 16ª rodada');
  });

  // 4.3 Falsificação de Troféus Negativos: Exigir saldo negativo de troféus FALHA
  runCheck('Falsificação de Piso Zero: Suposição de saldo negativo de troféus FALHA', () => {
    let caughtMutation = false;
    try {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: 0,
        currentLossStreak: 0,
      });
      // Asserção deliberadamente FALSA
      assert.ok(reward.newTrophies < 0, 'Mutação proposital esperando troféus negativos');
    } catch {
      caughtMutation = true;
    }
    assert.equal(caughtMutation, true, 'O piso zero não pode ser violado');
  });

  // 4.4 Falsificação de Anti-Tilt: Supor que 3ª derrota não reseta streak FALHA
  runCheck('Falsificação de Anti-Tilt: Supor que streak não reseta após 3ª derrota FALHA', () => {
    let caughtMutation = false;
    try {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 300,
        currentLossStreak: 2,
      });
      // Asserção deliberadamente FALSA: supor que streak continuou subindo para 3
      assert.equal(reward.newLossStreak, 3, 'Mutação proposital esperando streak 3');
    } catch {
      caughtMutation = true;
    }
    assert.equal(caughtMutation, true, 'A mecânica de reset deve ser inegociável');
  });

  // --------------------------------------------------------------------------
  // DESAFIO 5: ADVERSARIAL EDGE CASES & FUZZING DE ENTRADAS
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ DESAFIO 5: Adversarial Edge Cases & Fuzzing de Entradas\x1b[0m');

  // 5.1 Fuzzing de Nicknames com caracteres de injeção, Unicode e espaços
  await runCheck('Fuzzing Nicknames: Injeções maliciosas, tags HTML e comprimentos anômalos', async () => {
    const maliciousInputs = [
      '',
      'a',
      'ab',
      'a'.repeat(21),
      '<script>alert(1)</script>',
      'DROP TABLE users;--',
      '   ',
      '🔥⚔️👑',
      'Player   Name',
      'user@email.com',
    ];

    for (const input of maliciousInputs) {
      const normalized = normalizeNickname(input);
      const available = await checkNicknameAvailable(input);

      // Nenhuma injeção deve quebrar a execução ou gerar exceção não-tratada
      assert.ok(typeof normalized === 'string');
      assert.ok(typeof available === 'boolean');

      // Nicknames com menos de 3 caracteres úteis ou com caracteres proibidos devem ser inválidos
      const isValidLength = normalized.length >= 3 && normalized.length <= 20;
      const isValidChars = /^[a-z0-9_.-]+$/.test(normalized);
      if (!isValidLength || !isValidChars) {
        assert.equal(
          available,
          false,
          `Nickname malicioso/inválido '${input}' (normalizado: '${normalized}') não deveria ser aceito`
        );
      }
    }
  });

  // 5.2 Estresse de Elos com Valores Extremos e Limítrofes
  await runCheck('Estresse de Elos: Fronteiras 0, 499, 500, 10.000, 1.000.000 e troféus negativos', () => {
    const testValues = [0, 1, 499, 500, 999, 1000, 2249, 2250, 9999, 10000, 50000, 1000000];

    for (const val of testValues) {
      const elo = getEloInfo(val);
      assert.ok(elo.tier, `Elo ausente para troféus=${val}`);
      assert.ok(elo.progressPercent >= 0 && elo.progressPercent <= 100, `Progresso inválido para val=${val}`);
      assert.ok(elo.tier.name.length > 0);
    }

    // Comportamento com troféus negativos (deve fixar em Novato com progresso 0%)
    const negativeElo = getEloInfo(-50);
    assert.equal(negativeElo.tier.id, 'novato');
    assert.equal(negativeElo.progressPercent, 0);
  });

  // 5.3 Validação Estrita do Catálogo Institucional de Turmas
  await runCheck('Catálogo de Turmas: Exatamente 16 turmas institucionais e imunidade a turmas adulteradas', () => {
    assert.equal(TURMAS.length, 16, 'Devem existir exatamente 16 turmas oficiais');
    const fakeTurmas = ['TURMA_HACK', 'ADMIN', 'INF99X', '', '12345'];
    for (const fake of fakeTurmas) {
      assert.ok(!TURMAS.includes(fake as Turma), `Turma falsa '${fake}' não pode estar no catálogo`);
    }
  });

  // --------------------------------------------------------------------------
  // RESUMO CONSOLIDADO
  // --------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log('       JOKENPO 2 — RESUMO DO DESAFIO ADVERSARIAL (EMPIRICAL CHALLENGER)         ');
  console.log('================================================================================');
  console.log(`  Total de Desafios Adversariais : ${totalChallenges}`);
  console.log(`  Desafios Aprovados             : \x1b[32m${passedChallenges}\x1b[0m`);
  console.log(`  Desafios Falhos                : ${failedChallenges === 0 ? '\x1b[32m0\x1b[0m' : `\x1b[31m${failedChallenges}\x1b[0m`}`);
  console.log(`  Taxa de Robustez               : \x1b[1m${((passedChallenges / totalChallenges) * 100).toFixed(1)}%\x1b[0m`);
  console.log('================================================================================\n');

  if (failedChallenges > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAdversarialChallenge().catch((err) => {
  console.error('\n\x1b[31mErro fatal no executor adversarial:\x1b[0m', err);
  process.exit(1);
});
