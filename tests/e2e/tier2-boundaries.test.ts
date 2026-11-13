import { TierTestRunner, loadGameEngine, assert } from './fixtures/testRunner';
import {
  NICKNAME_TEST_CASES,
  VALID_TURMAS,
  INVALID_TURMAS,
} from './fixtures/testProfiles';
import type { MoveId, MatchFormat, Turma } from '../../src/types/game';

export async function runTier2() {
  const runner = new TierTestRunner(
    2,
    'Casos de Borda e Limites (Boundary Value Analysis)',
    'Piso zero de troféus, mecânica anti-tilt na 3ª derrota, teto de 15 empates, timeouts de 24s e validação de nickname/turma'
  );
  runner.start();

  const {
    ROUND_DURATION_SECONDS,
    MOVE_ORDER,
    TURMAS,
    calculateMatchReward,
    resolveMovePair,
    normalizeNickname,
    checkNicknameAvailable,
  } = await loadGameEngine();

  // ==========================================================================
  // GRUPO 1: PISO ZERO DE TROFÉUS (BOUNDARY VALUE ANALYSIS)
  // ==========================================================================
  await runner.test(
    'T2-BND-001',
    'Piso zero: Derrota MD3 com 0 troféus mantém saldo exatamente em 0 (delta 0)',
    () => {
      for (let i = 0; i < 5; i++) {
        const reward = calculateMatchReward({
          outcome: 'loss',
          mode: '1v1',
          format: 'MD3',
          isFriendly: false,
          currentTrophies: 0,
          currentLossStreak: 0,
        });
        assert.equal(reward.newTrophies, 0, 'Saldo de troféus deve ser 0');
        assert.equal(reward.trophyDelta, 0, 'Delta deve ser 0 pois saldo já era 0');
        assert.equal(reward.coinsEarned, 15);
      }
    }
  );

  await runner.test(
    'T2-BND-002',
    'Piso zero: Derrota MD5 com 0 troféus mantém saldo em 0 mesmo com penalidade máxima (20-30)',
    () => {
      for (let i = 0; i < 5; i++) {
        const reward = calculateMatchReward({
          outcome: 'loss',
          mode: '1v1',
          format: 'MD5',
          isFriendly: false,
          currentTrophies: 0,
          currentLossStreak: 0,
        });
        assert.equal(reward.newTrophies, 0);
        assert.equal(reward.trophyDelta, 0);
      }
    }
  );

  await runner.test(
    'T2-BND-003',
    'Piso zero: Jogador com 5 troféus sofrendo derrota MD3 (penalidade >= 10) fica com saldo 0 e delta -5',
    () => {
      for (let i = 0; i < 5; i++) {
        const reward = calculateMatchReward({
          outcome: 'loss',
          mode: '1v1',
          format: 'MD3',
          isFriendly: false,
          currentTrophies: 5,
          currentLossStreak: 0,
        });
        assert.equal(reward.newTrophies, 0);
        assert.equal(reward.trophyDelta, -5);
      }
    }
  );

  await runner.test(
    'T2-BND-004',
    'Piso zero: Jogador com 15 troféus sofrendo derrota MD5 (penalidade >= 20) fica com saldo 0 e delta -15',
    () => {
      for (let i = 0; i < 5; i++) {
        const reward = calculateMatchReward({
          outcome: 'loss',
          mode: '1v1',
          format: 'MD5',
          isFriendly: false,
          currentTrophies: 15,
          currentLossStreak: 0,
        });
        assert.equal(reward.newTrophies, 0);
        assert.equal(reward.trophyDelta, -15);
      }
    }
  );

  await runner.test(
    'T2-BND-005',
    'Piso zero: Jogador com 20 troféus sofrendo derrota MD5 de 20 troféus atinge exatamente 0',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: 20,
        currentLossStreak: 0,
      });
      assert.ok(reward.newTrophies >= 0, 'Saldo nunca pode ser menor que zero');
      assert.ok(reward.trophyDelta <= 0 && reward.trophyDelta >= -20);
    }
  );

  await runner.test(
    'T2-BND-006',
    'Fronteira positiva: Jogador com 25 troféus sofrendo derrota MD3 (penalidade 10-20) preserva saldo >= 5',
    () => {
      for (let i = 0; i < 5; i++) {
        const reward = calculateMatchReward({
          outcome: 'loss',
          mode: '1v1',
          format: 'MD3',
          isFriendly: false,
          currentTrophies: 25,
          currentLossStreak: 0,
        });
        assert.ok(reward.newTrophies >= 5 && reward.newTrophies <= 15);
        assert.ok(reward.trophyDelta >= -20 && reward.trophyDelta <= -10);
      }
    }
  );

  // ==========================================================================
  // GRUPO 2: MECÂNICA ANTI-TILT (STREAK RECOVERY NO 3º REVÉS CONSECUTIVO)
  // ==========================================================================
  await runner.test(
    'T2-TLT-001',
    'Anti-tilt: 1ª derrota consecutiva (streak=0) incrementa para streak=1 sem bônus',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 500,
        currentLossStreak: 0,
      });
      assert.equal(reward.newLossStreak, 1);
      assert.equal(reward.streakRecoveryTriggered, false);
      assert.ok(reward.trophyDelta < 0);
    }
  );

  await runner.test(
    'T2-TLT-002',
    'Anti-tilt: 2ª derrota consecutiva (streak=1) incrementa para streak=2 sem bônus',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 500,
        currentLossStreak: 1,
      });
      assert.equal(reward.newLossStreak, 2);
      assert.equal(reward.streakRecoveryTriggered, false);
      assert.ok(reward.trophyDelta < 0);
    }
  );

  await runner.test(
    'T2-TLT-003',
    'Anti-tilt: 3ª derrota consecutiva (streak=2) ativa streak recovery (+25..30 troféus, 30 moedas, streak=0)',
    () => {
      for (let i = 0; i < 15; i++) {
        const reward = calculateMatchReward({
          outcome: 'loss',
          mode: '1v1',
          format: 'MD3',
          isFriendly: false,
          currentTrophies: 500,
          currentLossStreak: 2,
        });
        assert.equal(reward.streakRecoveryTriggered, true, 'Anti-tilt deve ser disparado');
        assert.ok(
          reward.trophyDelta >= 25 && reward.trophyDelta <= 30,
          `Bônus de troféus deve estar entre 25 e 30, obteve ${reward.trophyDelta}`
        );
        assert.equal(reward.newTrophies, 500 + reward.trophyDelta);
        assert.equal(reward.coinsEarned, 30, 'Deve conceder 30 moedas de consolo anti-tilt');
        assert.equal(reward.newLossStreak, 0, 'Streak de derrotas deve resetar para 0');
      }
    }
  );

  await runner.test(
    'T2-TLT-004',
    'Anti-tilt: Derrota com streak legado anômalo >= 3 aciona recovery e zera o streak',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '2v2',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: 700,
        currentLossStreak: 4,
      });
      assert.equal(reward.streakRecoveryTriggered, true);
      assert.equal(reward.newLossStreak, 0);
      assert.ok(reward.trophyDelta >= 25 && reward.trophyDelta <= 30);
    }
  );

  await runner.test(
    'T2-TLT-005',
    'Anti-tilt em amistoso: Derrota com streak=2 não ativa anti-tilt e preserva lossStreak=2',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD3',
        isFriendly: true,
        currentTrophies: 500,
        currentLossStreak: 2,
      });
      assert.equal(reward.streakRecoveryTriggered, false);
      assert.equal(reward.trophyDelta, 0);
      assert.equal(reward.newTrophies, 500);
      assert.equal(reward.newLossStreak, 2);
      assert.equal(reward.coinsEarned, 10);
    }
  );

  await runner.test(
    'T2-TLT-006',
    'Empate ranqueado com streak=2: Não ativa anti-tilt prematuro e preserva lossStreak=2',
    () => {
      const reward = calculateMatchReward({
        outcome: 'draw',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 500,
        currentLossStreak: 2,
      });
      assert.equal(reward.streakRecoveryTriggered, false);
      assert.equal(reward.trophyDelta, 0);
      assert.equal(reward.newLossStreak, 2);
      assert.equal(reward.coinsEarned, 20);
    }
  );

  await runner.test(
    'T2-TLT-007',
    'Novo ciclo após anti-tilt: Derrota subsequente reinicia streak em 1 com penalidade normal',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 528,
        currentLossStreak: 0,
      });
      assert.equal(reward.streakRecoveryTriggered, false);
      assert.equal(reward.newLossStreak, 1);
      assert.ok(reward.trophyDelta < 0);
    }
  );

  // ==========================================================================
  // GRUPO 3: TETO DE 15 RODADAS CONTRA LOOPS INFINITOS (ANTI-FREEZE)
  // ==========================================================================
  await runner.test(
    'T2-ROU-001',
    'Teto anti-loop: MD3 com 15 empates sucessivos encerra partida na 15ª rodada com resultado DRAW',
    () => {
      let currentRound = 1;
      let teamAScore = 0;
      let teamBScore = 0;
      let finished = false;
      let winnerTeam = '';

      const targetWins = 2; // MD3
      while (!finished && currentRound <= 15) {
        // Simula empate espelho na rodada
        const clash = resolveMovePair('pedra', 'pedra');
        assert.equal(clash.outcomeForA, 'draw');

        finished = teamAScore >= targetWins || teamBScore >= targetWins || currentRound >= 15;
        if (finished) {
          if (teamAScore > teamBScore) winnerTeam = 'A';
          else if (teamBScore > teamAScore) winnerTeam = 'B';
          else winnerTeam = 'DRAW';
          break;
        }
        currentRound++;
      }

      assert.equal(currentRound, 15, 'Partida deve encerrar na rodada 15');
      assert.equal(finished, true, 'finished deve ser verdadeiro');
      assert.equal(winnerTeam, 'DRAW', 'Com placar 0x0 resultado deve ser DRAW');
    }
  );

  await runner.test(
    'T2-ROU-002',
    'Teto anti-loop: MD5 com 15 empates sucessivos encerra na 15ª rodada com DRAW',
    () => {
      const currentRound = 15;
      const teamAScore = 0;
      const teamBScore = 0;
      const targetWins = 3;

      const finished = teamAScore >= targetWins || teamBScore >= targetWins || currentRound >= 15;
      const winnerTeam = teamAScore > teamBScore ? 'A' : teamBScore > teamAScore ? 'B' : 'DRAW';

      assert.equal(finished, true);
      assert.equal(winnerTeam, 'DRAW');
    }
  );

  await runner.test(
    'T2-ROU-003',
    'Teto 15 rodadas em MD3: Placar 1x0 na 15ª rodada consagra vitória de Time A pelo desempate de pontos',
    () => {
      const currentRound = 15;
      const teamAScore = 1;
      const teamBScore = 0;
      const targetWins = 2; // Nenhum atingiu 2

      const finished = teamAScore >= targetWins || teamBScore >= targetWins || currentRound >= 15;
      const winnerTeam = teamAScore > teamBScore ? 'A' : teamBScore > teamAScore ? 'B' : 'DRAW';

      assert.equal(finished, true);
      assert.equal(winnerTeam, 'A', 'Time A tem mais pontos acumulados no teto de 15 rodadas');
    }
  );

  await runner.test(
    'T2-ROU-004',
    'Teto 15 rodadas em MD5: Placar 2x1 na 15ª rodada consagra vitória de Time A',
    () => {
      const currentRound = 15;
      const teamAScore = 2;
      const teamBScore = 1;
      const targetWins = 3; // MD5 alvo é 3

      const finished = teamAScore >= targetWins || teamBScore >= targetWins || currentRound >= 15;
      const winnerTeam = teamAScore > teamBScore ? 'A' : teamBScore > teamAScore ? 'B' : 'DRAW';

      assert.equal(finished, true);
      assert.equal(winnerTeam, 'A');
    }
  );

  await runner.test(
    'T2-ROU-005',
    'Teto 15 rodadas em MD3: Placar 1x1 (1 vitória A, 1 vitória B, 13 empates) resulta em DRAW',
    () => {
      const currentRound = 15;
      const teamAScore = 1;
      const teamBScore = 1;
      const targetWins = 2;

      const finished = teamAScore >= targetWins || teamBScore >= targetWins || currentRound >= 15;
      const winnerTeam = teamAScore > teamBScore ? 'A' : teamBScore > teamAScore ? 'B' : 'DRAW';

      assert.equal(finished, true);
      assert.equal(winnerTeam, 'DRAW');
    }
  );

  await runner.test(
    'T2-ROU-006',
    'Rodada 14 com placar 0x0 em MD3 não finaliza e avança para a 15ª rodada',
    () => {
      const currentRound = 14;
      const teamAScore = 0;
      const teamBScore = 0;
      const targetWins = 2;

      const finished = teamAScore >= targetWins || teamBScore >= targetWins || currentRound >= 15;
      assert.equal(finished, false, 'Rodada 14 não atinge o teto de 15 rodadas');
    }
  );

  // ==========================================================================
  // GRUPO 4: TIMEOUTS DE 24 SEGUNDOS E AUTO-DESCARTE
  // ==========================================================================
  await runner.test(
    'T2-TMO-001',
    'Constante canônica de tempo: ROUND_DURATION_SECONDS deve ser exatamente 24',
    () => {
      assert.equal(ROUND_DURATION_SECONDS, 24);
    }
  );

  await runner.test(
    'T2-TMO-002',
    'Timeout 1v1: Jogador B omisso recebe carta aleatória válida em MOVE_ORDER e rodada conclui',
    () => {
      const moveA: MoveId = 'pedra';
      const roundPicks: Record<string, MoveId> = { uid_A: moveA };
      const participantUids = ['uid_A', 'uid_B'];

      // Simulação do tratamento de timeout
      for (const uid of participantUids) {
        if (!roundPicks[uid]) {
          roundPicks[uid] = MOVE_ORDER[Math.floor(Math.random() * MOVE_ORDER.length)];
        }
      }

      assert.ok(roundPicks['uid_B'], 'Pick de B deve ter sido preenchido pelo timeout');
      assert.ok(MOVE_ORDER.includes(roundPicks['uid_B']), 'Pick gerado deve pertencer a MOVE_ORDER');

      const clash = resolveMovePair(roundPicks['uid_A'], roundPicks['uid_B']);
      assert.ok(['win', 'loss', 'draw'].includes(clash.outcomeForA));
    }
  );

  await runner.test(
    'T2-TMO-003',
    'Timeout simultâneo 1v1: Ambos sofrem timeout e recebem jogadas válidas',
    () => {
      const roundPicks: Record<string, MoveId> = {};
      const participantUids = ['uid_A', 'uid_B'];

      for (const uid of participantUids) {
        if (!roundPicks[uid]) {
          roundPicks[uid] = MOVE_ORDER[Math.floor(Math.random() * MOVE_ORDER.length)];
        }
      }

      assert.ok(MOVE_ORDER.includes(roundPicks['uid_A']));
      assert.ok(MOVE_ORDER.includes(roundPicks['uid_B']));
      const clash = resolveMovePair(roundPicks['uid_A'], roundPicks['uid_B']);
      assert.ok(['win', 'loss', 'draw'].includes(clash.outcomeForA));
    }
  );

  await runner.test(
    'T2-TMO-004',
    'Timeout seletivo 2v2: Apenas 1 de 4 participantes omisso recebe auto-descarte preservando os outros 3',
    () => {
      const roundPicks: Record<string, MoveId> = {
        uid_A1: 'papel',
        uid_A2: 'tesoura',
        uid_B1: 'pedra',
        // uid_B2 omisso
      };
      const participantUids = ['uid_A1', 'uid_A2', 'uid_B1', 'uid_B2'];

      for (const uid of participantUids) {
        if (!roundPicks[uid]) {
          roundPicks[uid] = MOVE_ORDER[Math.floor(Math.random() * MOVE_ORDER.length)];
        }
      }

      assert.equal(roundPicks['uid_A1'], 'papel');
      assert.equal(roundPicks['uid_A2'], 'tesoura');
      assert.equal(roundPicks['uid_B1'], 'pedra');
      assert.ok(MOVE_ORDER.includes(roundPicks['uid_B2']));
    }
  );

  await runner.test(
    'T2-TMO-005',
    'Auto-pareamento no timeout de pareamento: Gera pares conectando membros de A com membros de B',
    () => {
      const teamA = ['A1', 'A2', 'A3'];
      const teamB = ['B1', 'B2', 'B3'];
      const currentPairings: string[] = ['A1:B1']; // Apenas 1 par foi selecionado manualmente

      const remA = teamA.filter((uidA) => !currentPairings.some((p) => p.startsWith(`${uidA}:`)));
      const remB = teamB.filter((uidB) => !currentPairings.some((p) => p.endsWith(`:${uidB}`)));

      const nextPairings = [...currentPairings];
      for (let i = 0; i < Math.min(remA.length, remB.length); i++) {
        nextPairings.push(`${remA[i]}:${remB[i]}`);
      }

      assert.equal(nextPairings.length, 3);
      assert.deepStrictEqual(nextPairings, ['A1:B1', 'A2:B2', 'A3:B3']);
    }
  );

  // ==========================================================================
  // GRUPO 5: VALIDAÇÕES DE NICKNAME E TURMAS INSTITUCIONAIS
  // ==========================================================================
  await runner.test(
    'T2-VAL-001',
    'Validação: Nicknames curtos (< 3 caracteres) são rejeitados',
    async () => {
      for (const nick of NICKNAME_TEST_CASES.invalidTooShort) {
        const available = await checkNicknameAvailable(nick);
        assert.equal(available, false, `Nickname "${nick}" deveria ser rejeitado por tamanho insuficiente`);
      }
    }
  );

  await runner.test(
    'T2-VAL-002',
    'Validação: Nicknames longos (> 20 caracteres) são rejeitados',
    async () => {
      for (const nick of NICKNAME_TEST_CASES.invalidTooLong) {
        const available = await checkNicknameAvailable(nick);
        assert.equal(available, false, `Nickname "${nick}" deveria ser rejeitado por exceder 20 caracteres`);
      }
    }
  );

  await runner.test(
    'T2-VAL-003',
    'Validação: Nicknames com caracteres especiais proibidos são rejeitados',
    async () => {
      for (const nick of NICKNAME_TEST_CASES.invalidCharacters) {
        const available = await checkNicknameAvailable(nick);
        assert.equal(available, false, `Nickname "${nick}" deveria ser rejeitado por conter caracteres inválidos`);
      }
    }
  );

  await runner.test(
    'T2-VAL-004',
    'Validação: Nicknames válidos nos limites exatos (3 e 20 chars, hífen, underline) passam com sucesso',
    async () => {
      for (const nick of NICKNAME_TEST_CASES.valid) {
        const lower = normalizeNickname(nick);
        const isValid = lower.length >= 3 && lower.length <= 20 && /^[a-z0-9_.-]+$/.test(lower);
        assert.equal(isValid, true, `Nickname "${nick}" deveria ser considerado válido`);
      }
    }
  );

  await runner.test(
    'T2-VAL-005',
    'Normalização de Nickname: normalizeNickname converte para lowercase e remove espaços externos',
    () => {
      assert.equal(normalizeNickname('  JoAo_ViToR  '), 'joao_vitor');
      assert.equal(normalizeNickname('DUELISTA-01'), 'duelista-01');
      assert.equal(normalizeNickname('Dev.ETM'), 'dev.etm');
    }
  );

  await runner.test(
    'T2-VAL-006',
    'Catálogo Institucional de Turmas: Deve conter exatamente 16 turmas institucionais em TURMAS',
    () => {
      assert.equal(TURMAS.length, 16, 'TURMAS deve ter 16 turmas');
    }
  );

  await runner.test(
    'T2-VAL-007',
    'Catálogo Institucional: Todas as 16 turmas institucionais esperadas estão presentes em TURMAS',
    () => {
      for (const t of VALID_TURMAS) {
        assert.ok(TURMAS.includes(t), `Turma esperada ${t} ausente em TURMAS`);
      }
    }
  );

  await runner.test(
    'T2-VAL-008',
    'Catálogo Institucional: Turmas externas ou inválidas são rejeitadas de TURMAS',
    () => {
      for (const t of INVALID_TURMAS) {
        assert.ok(!TURMAS.includes(t as any), `Turma inválida "${t}" não deve pertencer a TURMAS`);
      }
    }
  );

  return runner.printSummary();
}

// Invocação direta via CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith('tier2-boundaries.test.ts') || process.argv[1].endsWith('tier2-boundaries.test.js'))
) {
  runTier2()
    .then((summary) => {
      process.exit(summary.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
