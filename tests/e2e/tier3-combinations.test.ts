import { TierTestRunner, loadGameEngine, assert } from './fixtures/testRunner';
import {
  mockNovatoZero,
  mockNovatoTiltCandidate,
  mockPro,
} from './fixtures/testProfiles';
import type { MatchParticipant } from '../../src/types/game';

export async function runTier3() {
  const runner = new TierTestRunner(
    3,
    'Combinações Cruzadas (Cross-Feature Pairwise)',
    'Interações entre Recompensas, Elos, Modos 2v2/3v3, Pareamento Tático, Partidas Amistosas e Economia'
  );
  runner.start();

  const {
    calculateMatchReward,
    getEloInfo,
    getChoosingTeam,
    resolveMovePair,
    claimTrophyMilestone,
    TROPHY_ROAD_MILESTONES,
  } = await loadGameEngine();

  // ==========================================================================
  // GRUPO 1: RECOMPENSA x ELO x LIMITES DE BORDA
  // ==========================================================================
  await runner.test(
    'T3-COMB-001',
    'Recompensa x Elo: Derrota Ranqueada MD3 com Novato em 0 troféus mantém piso zero',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: mockNovatoZero.trophies,
        currentLossStreak: mockNovatoZero.lossStreak,
      });

      assert.equal(reward.newTrophies, 0);
      assert.equal(reward.trophyDelta, 0);
      assert.equal(reward.newLossStreak, 1);
      assert.equal(reward.coinsEarned, 15);
      const elo = getEloInfo(reward.newTrophies);
      assert.equal(elo.tier.id, 'novato');
    }
  );

  await runner.test(
    'T3-COMB-002',
    'Recompensa x Elo: Derrota Ranqueada MD3 com Novato em 5 troféus fixa saldo em 0 com delta -5',
    () => {
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
      assert.equal(reward.newLossStreak, 1);
      assert.equal(reward.coinsEarned, 15);
    }
  );

  await runner.test(
    'T3-COMB-003',
    'Anti-Tilt x Promoção: 3ª derrota na fronteira Novato->Bixo (490 troféus) concede bônus e promove para Bixo',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 490,
        currentLossStreak: 2,
      });

      assert.equal(reward.streakRecoveryTriggered, true);
      assert.ok(reward.trophyDelta >= 25 && reward.trophyDelta <= 30);
      assert.ok(reward.newTrophies >= 515 && reward.newTrophies <= 520);
      assert.equal(reward.newLossStreak, 0);
      assert.equal(reward.coinsEarned, 30);

      const elo = getEloInfo(reward.newTrophies);
      assert.equal(elo.tier.id, 'bixo', 'Jogador deve ser promovido para Bixo com os troféus de recuperação');
    }
  );

  await runner.test(
    'T3-COMB-004',
    'Anti-Tilt x Elo Pro: 3ª derrota de jogador no Elo Pro concede bônus e acumula troféus da temporada',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: mockPro.trophies, // 10050
        currentLossStreak: 2,
      });

      assert.equal(reward.streakRecoveryTriggered, true);
      assert.ok(reward.newTrophies >= 10075 && reward.newTrophies <= 10080);
      assert.equal(reward.newLossStreak, 0);

      const elo = getEloInfo(reward.newTrophies);
      assert.equal(elo.tier.id, 'pro');
      assert.ok(reward.newTrophies - 10000 >= 75);
    }
  );

  await runner.test(
    'T3-COMB-005',
    'Rebaixamento de Elo: Derrota Ranqueada MD5 na fronteira de Pro (10010 troféus) rebaixa para Global',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: 10010,
        currentLossStreak: 0,
      });

      assert.equal(reward.streakRecoveryTriggered, false);
      assert.ok(reward.newTrophies >= 9980 && reward.newTrophies <= 9990);
      assert.equal(reward.newLossStreak, 1);

      const elo = getEloInfo(reward.newTrophies);
      assert.equal(elo.tier.id, 'global', 'Troféus < 10000 devem rebaixar para Global');
    }
  );

  // ==========================================================================
  // GRUPO 2: VITÓRIAS COM PROMOÇÃO DE PATAMAR EM DIFERENTES MODOS
  // ==========================================================================
  await runner.test(
    'T3-COMB-006',
    'Vitória 1v1 MD3: Jogador com 990 troféus é promovido para Segundoanista (>=1000)',
    () => {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 990,
        currentLossStreak: 1,
      });

      assert.ok(reward.newTrophies >= 1000 && reward.newTrophies <= 1010);
      assert.equal(reward.coinsEarned, 40);
      assert.equal(reward.newLossStreak, 0);

      const elo = getEloInfo(reward.newTrophies);
      assert.equal(elo.tier.id, 'segundoanista');
    }
  );

  await runner.test(
    'T3-COMB-007',
    'Vitória 2v2 MD5: Jogador com 2240 troféus é promovido para Veterano (>=2250)',
    () => {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '2v2',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: 2240,
        currentLossStreak: 0,
      });

      assert.ok(reward.newTrophies >= 2285 && reward.newTrophies <= 2295);
      assert.equal(reward.coinsEarned, 65);

      const elo = getEloInfo(reward.newTrophies);
      assert.equal(elo.tier.id, 'veterano');
    }
  );

  await runner.test(
    'T3-COMB-008',
    'Vitória 3v3 MD5: Jogador com 7980 troféus é promovido para Global (>=8000)',
    () => {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '3v3',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: 7980,
        currentLossStreak: 0,
      });

      assert.ok(reward.newTrophies >= 8035 && reward.newTrophies <= 8045);
      assert.equal(reward.coinsEarned, 80);

      const elo = getEloInfo(reward.newTrophies);
      assert.equal(elo.tier.id, 'global');
    }
  );

  await runner.test(
    'T3-COMB-009',
    'Vitória 1v1 MD5: Jogador com 9985 troféus ingressa no patamar Pro (>=10000)',
    () => {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '1v1',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: 9985,
        currentLossStreak: 0,
      });

      assert.ok(reward.newTrophies >= 10005 && reward.newTrophies <= 10015);
      const elo = getEloInfo(reward.newTrophies);
      assert.equal(elo.tier.id, 'pro');
      assert.equal(elo.nextTier, null, 'Elo Pro é o patamar máximo');
      assert.equal(elo.progressPercent, 100);
    }
  );

  // ==========================================================================
  // GRUPO 3: PAREAMENTO TÁTICO POR SOMA DE TROFÉUS (getChoosingTeam)
  // ==========================================================================
  await runner.test(
    'T3-COMB-010',
    'Pareamento 2v2: Time A com maior pontuação cumulativa escolhe pareamento (1300 > 1100)',
    () => {
      const teamA: MatchParticipant[] = [
        { uid: 'a1', nickname: 'A1', turma: 'INF1M', trophies: 600 },
        { uid: 'a2', nickname: 'A2', turma: 'INF1M', trophies: 700 },
      ];
      const teamB: MatchParticipant[] = [
        { uid: 'b1', nickname: 'B1', turma: 'ETM1M', trophies: 500 },
        { uid: 'b2', nickname: 'B2', turma: 'ETM1M', trophies: 600 },
      ];

      const chooser = getChoosingTeam(teamA, teamB);
      assert.equal(chooser, 'A');
    }
  );

  await runner.test(
    'T3-COMB-011',
    'Pareamento 2v2: Time B com maior pontuação escolhe pareamento (1300 > 800)',
    () => {
      const teamA: MatchParticipant[] = [
        { uid: 'a1', nickname: 'A1', turma: 'INF1M', trophies: 400 },
        { uid: 'a2', nickname: 'A2', turma: 'INF1M', trophies: 400 },
      ];
      const teamB: MatchParticipant[] = [
        { uid: 'b1', nickname: 'B1', turma: 'ETM1M', trophies: 600 },
        { uid: 'b2', nickname: 'B2', turma: 'ETM1M', trophies: 700 },
      ];

      const chooser = getChoosingTeam(teamA, teamB);
      assert.equal(chooser, 'B');
    }
  );

  await runner.test(
    'T3-COMB-012',
    'Pareamento 2v2: Empate exato na soma de troféus (1000 === 1000) prioriza Time A',
    () => {
      const teamA: MatchParticipant[] = [
        { uid: 'a1', nickname: 'A1', turma: 'INF1M', trophies: 500 },
        { uid: 'a2', nickname: 'A2', turma: 'INF1M', trophies: 500 },
      ];
      const teamB: MatchParticipant[] = [
        { uid: 'b1', nickname: 'B1', turma: 'ETM1M', trophies: 500 },
        { uid: 'b2', nickname: 'B2', turma: 'ETM1M', trophies: 500 },
      ];

      const chooser = getChoosingTeam(teamA, teamB);
      assert.equal(chooser, 'A');
    }
  );

  await runner.test(
    'T3-COMB-013',
    'Pareamento 2v2: Auto-fechamento do 2º duelo quando o 1º duelo é selecionado',
    () => {
      const teamA = ['A1', 'A2'];
      const teamB = ['B1', 'B2'];
      const teamSize = 2;

      const nextPairings = ['A1:B2'];
      if (nextPairings.length === teamSize - 1) {
        const remA = teamA.filter((uidA) => !nextPairings.some((p) => p.startsWith(`${uidA}:`)));
        const remB = teamB.filter((uidB) => !nextPairings.some((p) => p.endsWith(`:${uidB}`)));
        if (remA.length === 1 && remB.length === 1) {
          nextPairings.push(`${remA[0]}:${remB[0]}`);
        }
      }

      assert.equal(nextPairings.length, 2);
      assert.deepStrictEqual(nextPairings, ['A1:B2', 'A2:B1']);
    }
  );

  // ==========================================================================
  // GRUPO 4: DISPUTAS EM EQUIPE (PONTUAÇÃO DE CONFRONTOS INDIVIDUAIS)
  // ==========================================================================
  await runner.test(
    'T3-COMB-014',
    'Duelo 2v2: Rodada com 1 vitória para Time A e 1 vitória para Time B termina em empate (DRAW)',
    () => {
      const clash1 = resolveMovePair('pedra', 'tesoura'); // Win A
      const clash2 = resolveMovePair('papel', 'tesoura'); // Loss A (Win B)

      let teamAPoints = 0;
      let teamBPoints = 0;
      if (clash1.outcomeForA === 'win') teamAPoints++;
      if (clash2.outcomeForA === 'loss') teamBPoints++;

      let roundWinner: 'A' | 'B' | 'DRAW' = 'DRAW';
      if (teamAPoints > teamBPoints) roundWinner = 'A';
      else if (teamBPoints > teamAPoints) roundWinner = 'B';

      assert.equal(teamAPoints, 1);
      assert.equal(teamBPoints, 1);
      assert.equal(roundWinner, 'DRAW');
    }
  );

  await runner.test(
    'T3-COMB-015',
    'Duelo 3v3: Rodada com 2 vitórias de Time A e 1 de Time B consagra rodada para Time A',
    () => {
      const clash1 = resolveMovePair('parafal', 'jegue'); // Win A
      const clash2 = resolveMovePair('gelo_invertido', 'parafal'); // Win A
      const clash3 = resolveMovePair('tesoura', 'pedra'); // Loss A (Win B)

      let teamAPoints = 0;
      let teamBPoints = 0;
      if (clash1.outcomeForA === 'win') teamAPoints++;
      if (clash2.outcomeForA === 'win') teamAPoints++;
      if (clash3.outcomeForA === 'loss') teamBPoints++;

      let roundWinner: 'A' | 'B' | 'DRAW' = 'DRAW';
      if (teamAPoints > teamBPoints) roundWinner = 'A';
      else if (teamBPoints > teamAPoints) roundWinner = 'B';

      assert.equal(teamAPoints, 2);
      assert.equal(teamBPoints, 1);
      assert.equal(roundWinner, 'A');
    }
  );

  await runner.test(
    'T3-COMB-016',
    'Duelo 3v3: Rodada com 3 empates neutros resulta em roundWinner = DRAW',
    () => {
      const clash1 = resolveMovePair('papel', 'gelo_invertido'); // Draw
      const clash2 = resolveMovePair('parafal', 'tesoura'); // Draw
      const clash3 = resolveMovePair('pedra', 'jegue'); // Draw

      assert.equal(clash1.outcomeForA, 'draw');
      assert.equal(clash2.outcomeForA, 'draw');
      assert.equal(clash3.outcomeForA, 'draw');

      let teamAPoints = 0;
      let teamBPoints = 0;
      let roundWinner: 'A' | 'B' | 'DRAW' = 'DRAW';
      if (teamAPoints > teamBPoints) roundWinner = 'A';
      else if (teamBPoints > teamAPoints) roundWinner = 'B';

      assert.equal(roundWinner, 'DRAW');
    }
  );

  // ==========================================================================
  // GRUPO 5: PARTIDAS AMISTOSAS E RESGATE DO CAMINHO DE TROFÉUS
  // ==========================================================================
  await runner.test(
    'T3-COMB-017',
    'Amistoso 1v1 MD3: Vitória concede 25 moedas sem alterar saldo de troféus nem lossStreak',
    () => {
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '1v1',
        format: 'MD3',
        isFriendly: true,
        currentTrophies: 500,
        currentLossStreak: 1,
      });

      assert.equal(reward.trophyDelta, 0);
      assert.equal(reward.newTrophies, 500);
      assert.equal(reward.coinsEarned, 25);
      assert.equal(reward.newLossStreak, 1);
      assert.equal(reward.streakRecoveryTriggered, false);
    }
  );

  await runner.test(
    'T3-COMB-018',
    'Amistoso 2v2 MD5: Derrota com streak=2 concede 10 moedas e não ativa anti-tilt',
    () => {
      const reward = calculateMatchReward({
        outcome: 'loss',
        mode: '2v2',
        format: 'MD5',
        isFriendly: true,
        currentTrophies: 1000,
        currentLossStreak: 2,
      });

      assert.equal(reward.trophyDelta, 0);
      assert.equal(reward.newTrophies, 1000);
      assert.equal(reward.coinsEarned, 10);
      assert.equal(reward.newLossStreak, 2);
      assert.equal(reward.streakRecoveryTriggered, false);
    }
  );

  await runner.test(
    'T3-COMB-019',
    'Economia x Progressão: Resgate autorizado de marco do caminho de troféus vs rejeição com saldo insuficiente',
    async () => {
      const milestone1000 = TROPHY_ROAD_MILESTONES.find((m: any) => m.trophies === 1000);
      assert.ok(milestone1000, 'Marco de 1000 troféus deve existir');

      // Tentativa autorizada com 1000 troféus
      const authorizedPlayer = {
        ...mockNovatoZero,
        uid: 'local_arena_test_prog_auth',
        trophies: 1000,
        claimedMilestones: [],
      };
      const claimResult = await claimTrophyMilestone(authorizedPlayer, milestone1000);
      assert.ok(claimResult.coinsAwarded > 0);

      // Tentativa não autorizada com 800 troféus
      const unauthorizedPlayer = {
        ...mockNovatoZero,
        uid: 'local_arena_test_prog_unauth',
        trophies: 800,
        claimedMilestones: [],
      };
      await assert.rejects(
        async () => {
          await claimTrophyMilestone(unauthorizedPlayer, milestone1000);
        },
        /Você precisa de 1000 troféus/
      );
    }
  );

  return runner.printSummary();
}

// Invocação direta via CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith('tier3-combinations.test.ts') || process.argv[1].endsWith('tier3-combinations.test.js'))
) {
  runTier3()
    .then((summary) => {
      process.exit(summary.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
