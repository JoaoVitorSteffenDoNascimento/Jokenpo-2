import { TierTestRunner, loadGameEngine, assert } from './fixtures/testRunner';
import {
  mockNovatoZero,
  mockBixo,
  mockRivalA,
  mockRivalB,
} from './fixtures/testProfiles';
import type { MatchParticipant, MoveId } from '../../src/types/game';

export async function runTier4() {
  const runner = new TierTestRunner(
    4,
    'Cenários Reais de Aplicação (Real-World Workloads)',
    'Simulações ponta a ponta de partidas 1v1, 2v2, 3v3, viradas MD5, ciclos anti-tilt e anti-loop de 15 rodadas'
  );
  runner.start();

  const {
    resolveMovePair,
    calculateMatchReward,
    getChoosingTeam,
    recordPlayerMatchResult,
    getEloInfo,
  } = await loadGameEngine();

  // ==========================================================================
  // CENÁRIO 1: DUELO COMPLETO 1v1 MD3 COM VITÓRIA POR 2 A 1
  // ==========================================================================
  await runner.test(
    'T4-SCEN-001',
    'Duelo Completo 1v1 MD3: Jogador A vence Rival B por 2 a 1 e recebe recompensas com histórico',
    async () => {
      let currentRound = 1;
      let scoreA = 0;
      let scoreB = 0;
      let isFinished = false;
      let winnerTeam: 'A' | 'B' | 'DRAW' = 'DRAW';
      const targetWins = 2; // MD3

      // Rodada 1: A joga pedra, B joga tesoura -> Pedra quebra Tesoura (Vitória A)
      const r1 = resolveMovePair('pedra', 'tesoura');
      assert.equal(r1.outcomeForA, 'win');
      scoreA++;
      assert.equal(scoreA, 1);
      assert.equal(scoreB, 0);
      isFinished = scoreA >= targetWins || scoreB >= targetWins || currentRound >= 15;
      assert.equal(isFinished, false, 'Partida deve continuar após round 1 (1x0)');

      // Rodada 2: A joga papel, B joga tesoura -> Tesoura corta Papel (Vitória B)
      currentRound++;
      const r2 = resolveMovePair('papel', 'tesoura');
      assert.equal(r2.outcomeForA, 'loss');
      scoreB++;
      assert.equal(scoreA, 1);
      assert.equal(scoreB, 1);
      isFinished = scoreA >= targetWins || scoreB >= targetWins || currentRound >= 15;
      assert.equal(isFinished, false, 'Partida deve continuar após round 2 (1x1)');

      // Rodada 3: A joga gelo_invertido, B joga parafal -> Gelo Invertido para o tiro da Parafal (Vitória A)
      currentRound++;
      const r3 = resolveMovePair('gelo_invertido', 'parafal');
      assert.equal(r3.outcomeForA, 'win');
      scoreA++;
      assert.equal(scoreA, 2);
      assert.equal(scoreB, 1);
      isFinished = scoreA >= targetWins || scoreB >= targetWins || currentRound >= 15;
      assert.equal(isFinished, true, 'Partida deve encerrar após round 3 (2x1)');

      if (scoreA > scoreB) winnerTeam = 'A';
      else if (scoreB > scoreA) winnerTeam = 'B';
      assert.equal(winnerTeam, 'A');

      // Pós-Partida: Cálculo de recompensas
      const initialTrophies = 300;
      const initialCoins = 100;
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: initialTrophies,
        currentLossStreak: 0,
      });

      assert.ok(reward.trophyDelta >= 10 && reward.trophyDelta <= 20);
      assert.equal(reward.coinsEarned, 40);
      assert.equal(reward.newLossStreak, 0);

      // Gravação no histórico Local Arena
      const localUser = await (async () => {
        const { signInWithLocalArena, createPlayerAccount, subscribeRecentMatchHistory, subscribePlayerProfile } = await loadGameEngine();
        const user = signInWithLocalArena('Teste_T4_01');
        await createPlayerAccount(user, 'Duelista_T4_01', 'INF1M');
        return { user, subscribeRecentMatchHistory, subscribePlayerProfile };
      })();

      await recordPlayerMatchResult(localUser.user.uid, {
        outcome: 'win',
        newTrophies: reward.newTrophies,
        coinsEarned: reward.coinsEarned,
        newLossStreak: reward.newLossStreak,
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        opponentName: mockRivalA.nickname,
        opponentTurma: mockRivalA.turma,
        scoreText: `${scoreA} - ${scoreB}`,
        trophyDelta: reward.trophyDelta,
      });

      let updatedProfile: any = null;
      localUser.subscribePlayerProfile(localUser.user.uid, (p: any) => {
        updatedProfile = p;
      })();
      assert.ok(updatedProfile, 'Perfil do jogador deve existir');
      assert.equal(updatedProfile.trophies, reward.newTrophies);

      let historyEntries: any[] = [];
      localUser.subscribeRecentMatchHistory(localUser.user.uid, (list: any[]) => {
        historyEntries = list;
      })();

      assert.ok(historyEntries.length > 0, 'Histórico de partidas deve conter a partida gravada');
      assert.equal(historyEntries[0].scoreText, '2 - 1');
      assert.equal(historyEntries[0].outcome, 'win');
    }
  );

  // ==========================================================================
  // CENÁRIO 2: DUELO COMPLETO 1v1 MD5 COM VIRADA ÉPICA (3 A 2)
  // ==========================================================================
  await runner.test(
    'T4-SCEN-002',
    'Duelo Completo 1v1 MD5: Virada épica do Jogador A saindo de 0x2 para vencer por 3x2',
    async () => {
      let currentRound = 1;
      let scoreA = 0;
      let scoreB = 0;
      const targetWins = 3; // MD5

      // Rodada 1: papel vs jegue -> Jegue come papel (Vitória B)
      const r1 = resolveMovePair('papel', 'jegue');
      assert.equal(r1.outcomeForA, 'loss');
      scoreB++;
      assert.equal(scoreA, 0);
      assert.equal(scoreB, 1);

      // Rodada 2: pedra vs parafal -> Parafal explode pedra (Vitória B, 0x2 - Match point!)
      currentRound++;
      const r2 = resolveMovePair('pedra', 'parafal');
      assert.equal(r2.outcomeForA, 'loss');
      scoreB++;
      assert.equal(scoreA, 0);
      assert.equal(scoreB, 2);

      // Rodada 3: parafal vs pedra -> Parafal explode pedra (Vitória A, 1x2)
      currentRound++;
      const r3 = resolveMovePair('parafal', 'pedra');
      assert.equal(r3.outcomeForA, 'win');
      scoreA++;
      assert.equal(scoreA, 1);
      assert.equal(scoreB, 2);

      // Rodada 4: tesoura vs papel -> Tesoura corta papel (Vitória A, 2x2 - Empate!)
      currentRound++;
      const r4 = resolveMovePair('tesoura', 'papel');
      assert.equal(r4.outcomeForA, 'win');
      scoreA++;
      assert.equal(scoreA, 2);
      assert.equal(scoreB, 2);

      // Rodada 5: jegue vs gelo_invertido -> Jegue atropela gelo invertido (Vitória A, 3x2 - Virada!)
      currentRound++;
      const r5 = resolveMovePair('jegue', 'gelo_invertido');
      assert.equal(r5.outcomeForA, 'win');
      scoreA++;
      assert.equal(scoreA, 3);
      assert.equal(scoreB, 2);

      const isFinished = scoreA >= targetWins || scoreB >= targetWins || currentRound >= 15;
      assert.equal(isFinished, true);
      const winner = scoreA > scoreB ? 'A' : 'B';
      assert.equal(winner, 'A');

      // Recompensa 1v1 MD5
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '1v1',
        format: 'MD5',
        isFriendly: false,
        currentTrophies: mockBixo.trophies,
        currentLossStreak: 0,
      });

      assert.ok(reward.trophyDelta >= 20 && reward.trophyDelta <= 30);
      assert.equal(reward.coinsEarned, 55);
      assert.equal(reward.newLossStreak, 0);
    }
  );

  // ==========================================================================
  // CENÁRIO 3: BATALHA 2v2 COM PAREAMENTO TÁTICO E SOMA DE PONTOS
  // ==========================================================================
  await runner.test(
    'T4-SCEN-003',
    'Batalha 2v2: Time A (Humano + Bot) vence Time B por 2x0 com escolha tática de pareamento',
    () => {
      const teamA: MatchParticipant[] = [
        { uid: 'human_A1', nickname: 'Humano', turma: 'INF1M', trophies: 500 },
        { uid: 'bot_A2', nickname: 'BotAliado', turma: 'INF2M', trophies: 600 },
      ];
      const teamB: MatchParticipant[] = [
        { uid: 'bot_B1', nickname: 'Rival1', turma: 'ETM1M', trophies: 400 },
        { uid: 'bot_B2', nickname: 'Rival2', turma: 'ETM2M', trophies: 550 },
      ];

      // Verificação do time com direito de escolha (1100 vs 950)
      const chooser = getChoosingTeam(teamA, teamB);
      assert.equal(chooser, 'A');

      // Rodada 1 Pareamento: Humano pareia com Rival 1, Bot Aliado com Rival 2
      const pairingsR1 = ['human_A1:bot_B1', 'bot_A2:bot_B2'];
      // Picks Rodada 1:
      // Duelo 1: Humano joga parafal, Rival 1 joga jegue -> Win A
      // Duelo 2: Bot Aliado joga pedra, Rival 2 joga tesoura -> Win A
      const d1_r1 = resolveMovePair('parafal', 'jegue');
      const d2_r1 = resolveMovePair('pedra', 'tesoura');
      assert.equal(d1_r1.outcomeForA, 'win');
      assert.equal(d2_r1.outcomeForA, 'win');

      let teamAPointsR1 = 2;
      let teamBPointsR1 = 0;
      let scoreA = 1;
      let scoreB = 0;

      // Rodada 2 Pareamento: Humano pareia com Rival 2, Bot Aliado com Rival 1
      const pairingsR2 = ['human_A1:bot_B2', 'bot_A2:bot_B1'];
      // Picks Rodada 2:
      // Duelo 1: Humano joga gelo_invertido, Rival 2 joga tesoura -> Win A
      // Duelo 2: Bot Aliado joga papel, Rival 1 joga pedra -> Win A
      const d1_r2 = resolveMovePair('gelo_invertido', 'tesoura');
      const d2_r2 = resolveMovePair('papel', 'pedra');
      assert.equal(d1_r2.outcomeForA, 'win');
      assert.equal(d2_r2.outcomeForA, 'win');

      scoreA++;
      assert.equal(scoreA, 2);
      assert.equal(scoreB, 0);

      // Partida MD3 finalizada com 2x0 para Time A
      const targetWins = 2;
      const isFinished = scoreA >= targetWins || scoreB >= targetWins;
      assert.equal(isFinished, true);

      // Recompensa de 2v2 MD3
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
  );

  // ==========================================================================
  // CENÁRIO 4: CICLO COMPLETO DE RECUPERAÇÃO ANTI-TILT (STREAK RECOVERY)
  // ==========================================================================
  await runner.test(
    'T4-SCEN-004',
    'Ciclo Anti-Tilt: Jogador sofre 2 derrotas normais, na 3ª recebe bônus (+25..30) com reset e vence a 4ª',
    () => {
      let currentTrophies = 35;
      let currentCoins = 100;
      let currentLossStreak = 0;

      // Partida 1: Derrota 1v1 MD3
      const p1 = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies,
        currentLossStreak,
      });
      assert.equal(p1.streakRecoveryTriggered, false);
      assert.equal(p1.newLossStreak, 1);
      assert.ok(p1.trophyDelta >= -20 && p1.trophyDelta <= -10);
      currentTrophies = p1.newTrophies;
      currentCoins += p1.coinsEarned;
      currentLossStreak = p1.newLossStreak;
      assert.ok(currentTrophies >= 15 && currentTrophies <= 25);

      // Partida 2: Derrota 1v1 MD3
      const p2 = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies,
        currentLossStreak,
      });
      assert.equal(p2.streakRecoveryTriggered, false);
      assert.equal(p2.newLossStreak, 2);
      currentTrophies = p2.newTrophies;
      currentCoins += p2.coinsEarned;
      currentLossStreak = p2.newLossStreak;
      assert.ok(currentTrophies >= 0);

      // Partida 3: 3ª Derrota consecutiva -> Ativação mecânica Anti-Tilt!
      const p3 = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies,
        currentLossStreak,
      });
      assert.equal(p3.streakRecoveryTriggered, true, 'Anti-tilt deve disparar na 3ª derrota!');
      assert.ok(p3.trophyDelta >= 25 && p3.trophyDelta <= 30, 'Bônus de recuperação de +25 a +30');
      assert.equal(p3.newLossStreak, 0, 'Streak deve resetar imediatamente para 0');
      assert.equal(p3.coinsEarned, 30, '30 moedas de consolo anti-tilt');
      currentTrophies = p3.newTrophies;
      currentCoins += p3.coinsEarned;
      currentLossStreak = p3.newLossStreak;
      assert.ok(currentTrophies >= 25, 'Saldo recuperado com bônus');

      // Partida 4: Vitória subsequente MD3
      const p4 = calculateMatchReward({
        outcome: 'win',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies,
        currentLossStreak,
      });
      assert.equal(p4.streakRecoveryTriggered, false);
      assert.equal(p4.newLossStreak, 0);
      assert.ok(p4.trophyDelta >= 10 && p4.trophyDelta <= 20);
      currentTrophies = p4.newTrophies;
      currentCoins += p4.coinsEarned;
      assert.ok(currentTrophies >= 35, 'Jogador encerra ciclo acima de onde iniciou a crise');
    }
  );

  // ==========================================================================
  // CENÁRIO 5: TETO DE 15 EMPATES CONSECUTIVOS (ANTI-LOOP)
  // ==========================================================================
  await runner.test(
    'T4-SCEN-005',
    'Teto Anti-Loop: Partida 1v1 MD3 atinge 15 empates consecutivos e finaliza com resultado DRAW sem travar',
    () => {
      let scoreA = 0;
      let scoreB = 0;
      let currentRound = 1;
      let finished = false;
      let winnerTeam = '';

      const targetWins = 2;

      while (!finished && currentRound <= 15) {
        // Empate por jogadas neutras (papel x gelo_invertido)
        const clash = resolveMovePair('papel', 'gelo_invertido');
        assert.equal(clash.outcomeForA, 'draw');

        // Placar não altera
        finished = scoreA >= targetWins || scoreB >= targetWins || currentRound >= 15;
        if (finished) {
          if (scoreA > scoreB) winnerTeam = 'A';
          else if (scoreB > scoreA) winnerTeam = 'B';
          else winnerTeam = 'DRAW';
          break;
        }
        currentRound++;
      }

      assert.equal(currentRound, 15, 'Partida deve parar na 15ª rodada');
      assert.equal(finished, true);
      assert.equal(winnerTeam, 'DRAW');

      // Recompensa de empate concedida sem alterar troféus
      const rewardA = calculateMatchReward({
        outcome: 'draw',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 500,
        currentLossStreak: 1,
      });
      assert.equal(rewardA.trophyDelta, 0);
      assert.equal(rewardA.coinsEarned, 20);
      assert.equal(rewardA.newLossStreak, 1, 'Empate preserva streak');
    }
  );

  // ==========================================================================
  // CENÁRIO 6: BATALHA DE TRIOS 3v3 COM MÚLTIPLAS RODADAS
  // ==========================================================================
  await runner.test(
    'T4-SCEN-006',
    'Batalha de Trios 3v3: Time A supera Time B em confronto de 3 rodadas com rodada empatada (2x0 placar final)',
    () => {
      let scoreA = 0;
      let scoreB = 0;
      const targetWins = 2; // MD3

      // Rodada 1: Duelos A vs B
      // D1: Papel > Pedra (Win A)
      // D2: Pedra = Jegue (Draw)
      // D3: Parafal > Jegue (Loss A / Win B)
      const d1_1 = resolveMovePair('papel', 'pedra');
      const d1_2 = resolveMovePair('pedra', 'jegue');
      const d1_3 = resolveMovePair('jegue', 'parafal');
      assert.equal(d1_1.outcomeForA, 'win');
      assert.equal(d1_2.outcomeForA, 'draw');
      assert.equal(d1_3.outcomeForA, 'loss');

      let ptsA1 = 1;
      let ptsB1 = 1;
      let winnerR1: 'A' | 'B' | 'DRAW' = ptsA1 > ptsB1 ? 'A' : ptsB1 > ptsA1 ? 'B' : 'DRAW';
      assert.equal(winnerR1, 'DRAW');
      assert.equal(scoreA, 0);
      assert.equal(scoreB, 0);

      // Rodada 2:
      // D1: Pedra > Tesoura (Win A)
      // D2: Tesoura > Papel (Win A)
      // D3: Tesoura < Gelo Invertido (Loss A / Win B)
      const d2_1 = resolveMovePair('pedra', 'tesoura');
      const d2_2 = resolveMovePair('tesoura', 'papel');
      const d2_3 = resolveMovePair('tesoura', 'gelo_invertido');
      assert.equal(d2_1.outcomeForA, 'win');
      assert.equal(d2_2.outcomeForA, 'win');
      assert.equal(d2_3.outcomeForA, 'loss');

      let ptsA2 = 2;
      let ptsB2 = 1;
      let winnerR2 = ptsA2 > ptsB2 ? 'A' : 'B';
      assert.equal(winnerR2, 'A');
      scoreA++;
      assert.equal(scoreA, 1);
      assert.equal(scoreB, 0);

      // Rodada 3:
      // D1: Jegue > Gelo Invertido (Win A)
      // D2: Parafal > Pedra (Win A)
      // D3: Papel > Parafal (Win A)
      const d3_1 = resolveMovePair('jegue', 'gelo_invertido');
      const d3_2 = resolveMovePair('parafal', 'pedra');
      const d3_3 = resolveMovePair('papel', 'parafal');
      assert.equal(d3_1.outcomeForA, 'win');
      assert.equal(d3_2.outcomeForA, 'win');
      assert.equal(d3_3.outcomeForA, 'win');

      let ptsA3 = 3;
      let ptsB3 = 0;
      let winnerR3 = ptsA3 > ptsB3 ? 'A' : 'B';
      assert.equal(winnerR3, 'A');
      scoreA++;
      assert.equal(scoreA, 2);
      assert.equal(scoreB, 0);

      const isFinished = scoreA >= targetWins || scoreB >= targetWins;
      assert.equal(isFinished, true);
      assert.equal(scoreA, 2);

      // Recompensa 3v3 MD3
      const reward = calculateMatchReward({
        outcome: 'win',
        mode: '3v3',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 1500,
        currentLossStreak: 0,
      });

      assert.ok(reward.trophyDelta >= 50 && reward.trophyDelta <= 60);
      assert.equal(reward.coinsEarned, 80);
    }
  );

  return runner.printSummary();
}

// Invocação direta via CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith('tier4-scenarios.test.ts') || process.argv[1].endsWith('tier4-scenarios.test.js'))
) {
  runTier4()
    .then((summary) => {
      process.exit(summary.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
