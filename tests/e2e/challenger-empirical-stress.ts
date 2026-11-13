import assert from 'node:assert/strict';
import { loadGameEngine } from './fixtures/testRunner';
import type { MatchParticipant, MatchFormat, MatchMode } from '../../src/types/game';

async function runEmpiricalStressSuite() {
  console.log('='.repeat(80));
  console.log('  CHALLENGER E2E 2 — EMPIRICAL STRESS & ORACLE VERIFICATION HARNESS');
  console.log('='.repeat(80));

  const {
    calculateMatchReward,
    getEloInfo,
    ELO_TIERS,
    getChoosingTeam,
    resolveMovePair,
  } = await loadGameEngine();

  let totalAssertions = 0;
  let passedAssertions = 0;

  function check(desc: string, fn: () => void) {
    try {
      fn();
      passedAssertions++;
      totalAssertions++;
    } catch (err: any) {
      totalAssertions++;
      console.error(`  ❌ FALHA: ${desc}`);
      console.error(err);
      throw err;
    }
  }

  // ============================================================================
  // FRENTE 1: PISO ZERO DE TROFÉUS COM PENALIDADES MASSIVAS
  // ============================================================================
  console.log('\n▶ [FRENTE 1] Teste de Estresse: Piso Zero de Troféus');

  // Testar todas as combinações de saldos limítrofes e baixos [0..35]
  const boundaryTrophyValues = [0, 1, 2, 3, 5, 8, 9, 10, 11, 14, 15, 19, 20, 21, 24, 25, 29, 30, 31, 35, 100];
  const formats: MatchFormat[] = ['MD3', 'MD5'];
  const modes: MatchMode[] = ['1v1', '2v2', '3v3'];

  for (const trophies of boundaryTrophyValues) {
    for (const fmt of formats) {
      for (const md of modes) {
        check(`Piso zero para ${trophies} troféus no formato ${fmt} modo ${md}`, () => {
          // Rodar 10 iterações para cobrir toda a aleatoriedade da penalidade
          for (let iter = 0; iter < 10; iter++) {
            const res = calculateMatchReward({
              outcome: 'loss',
              mode: md,
              format: fmt,
              isFriendly: false,
              currentTrophies: trophies,
              currentLossStreak: 0,
            });

            // Invariante 1: newTrophies jamais pode ser negativo
            assert.ok(res.newTrophies >= 0, `newTrophies deve ser >= 0, obteve ${res.newTrophies}`);

            // Invariante 2: trophyDelta deve ser <= 0 (penalidade não pode ser bônus de troféus)
            assert.ok(res.trophyDelta <= 0, `trophyDelta deve ser <= 0, obteve ${res.trophyDelta}`);

            // Invariante 3: Conservação matemática exata
            assert.equal(
              res.currentTrophies !== undefined ? res.newTrophies : res.newTrophies,
              trophies + res.trophyDelta,
              'Conservação: newTrophies === currentTrophies + trophyDelta'
            );

            // Invariante 4: Se o saldo era 0, delta DEVE ser 0 e novo saldo 0
            if (trophies === 0) {
              assert.equal(res.newTrophies, 0);
              assert.equal(res.trophyDelta, 0);
            }

            // Invariante 5: Se a penalidade mínima for maior ou igual ao saldo, novo saldo é 0
            const minPenalty = fmt === 'MD5' ? 20 : 10;
            if (trophies <= minPenalty) {
              assert.equal(res.newTrophies, 0, `Saldo ${trophies} com penalidade min ${minPenalty} deve zerar`);
              const expectedDelta = trophies === 0 ? 0 : -trophies;
              assert.equal(res.trophyDelta, expectedDelta, `Delta deve ser exatamente ${expectedDelta}`);
            }

            // Invariante 6: Moedas de consolação da derrota ranqueada
            assert.equal(res.coinsEarned, 15);
            assert.equal(res.newLossStreak, 1);
            assert.equal(res.streakRecoveryTriggered, false);
          }
        });
      }
    }
  }

  // Testar penalidade massiva hipotética através de simulação de múltiplas derrotas consecutivas com saldo baixo
  check('Sequência de 50 derrotas a partir de 15 troféus (respeitando anti-tilt)', () => {
    let currentTrophies = 15;
    let currentLossStreak = 0;

    for (let match = 1; match <= 50; match++) {
      const res = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD5',
        isFriendly: false,
        currentTrophies,
        currentLossStreak,
      });

      assert.ok(res.newTrophies >= 0, `Saldo nunca pode ser negativo no match ${match}`);
      currentTrophies = res.newTrophies;
      currentLossStreak = res.newLossStreak;
    }
    assert.ok(currentTrophies >= 0);
  });

  console.log(`  ✔ Frente 1 Aprovada: Todas as asserções de piso zero e conservação válidas.`);

  // ============================================================================
  // FRENTE 2: ANTI-TILT COM STREAKS LEGADOS (>= 3)
  // ============================================================================
  console.log('\n▶ [FRENTE 2] Teste de Estresse: Mecânica Anti-Tilt & Streaks Legados');

  const legacyStreakValues = [2, 3, 4, 5, 6, 7, 10, 15, 20, 50, 100, 999];

  for (const streak of legacyStreakValues) {
    check(`Anti-tilt disparado para derrota com currentLossStreak = ${streak}`, () => {
      for (let iter = 0; iter < 10; iter++) {
        const res = calculateMatchReward({
          outcome: 'loss',
          mode: '1v1',
          format: 'MD3',
          isFriendly: false,
          currentTrophies: 100,
          currentLossStreak: streak,
        });

        // nextStreak = streak + 1 >= 3, portanto DEVE disparar streak recovery
        assert.equal(res.streakRecoveryTriggered, true, `Anti-tilt deve disparar para streak ${streak}`);
        assert.equal(res.newLossStreak, 0, `Streak de derrotas deve ser resetado para 0`);
        assert.ok(
          res.trophyDelta >= 25 && res.trophyDelta <= 30,
          `Bônus deve ser entre 25 e 30, obteve ${res.trophyDelta}`
        );
        assert.equal(res.newTrophies, 100 + res.trophyDelta);
        assert.equal(res.coinsEarned, 30, 'Deve conceder 30 moedas de consolo anti-tilt');
      }
    });
  }

  // Testar que vitórias com streak anômalo zeram o streak sem disparar recovery
  for (const streak of [0, 1, 2, 3, 5, 10, 50]) {
    check(`Vitória com currentLossStreak = ${streak} zera streak sem recovery`, () => {
      const res = calculateMatchReward({
        outcome: 'win',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 200,
        currentLossStreak: streak,
      });

      assert.equal(res.newLossStreak, 0, 'Vitória deve zerar streak');
      assert.equal(res.streakRecoveryTriggered, false);
      assert.ok(res.trophyDelta > 0);
    });
  }

  // Testar que empates preservam qualquer streak
  for (const streak of [0, 1, 2, 3, 5, 10, 50]) {
    check(`Empate com currentLossStreak = ${streak} preserva streak sem recovery`, () => {
      const res = calculateMatchReward({
        outcome: 'draw',
        mode: '1v1',
        format: 'MD3',
        isFriendly: false,
        currentTrophies: 200,
        currentLossStreak: streak,
      });

      assert.equal(res.newLossStreak, streak, 'Empate deve manter o streak exatamente inalterado');
      assert.equal(res.streakRecoveryTriggered, false);
      assert.equal(res.trophyDelta, 0);
      assert.equal(res.coinsEarned, 20);
    });
  }

  // Testar que amistoso preserva o streak e não dispara anti-tilt
  for (const streak of [2, 3, 4, 10]) {
    check(`Amistoso com derrota e currentLossStreak = ${streak} não dispara anti-tilt`, () => {
      const res = calculateMatchReward({
        outcome: 'loss',
        mode: '1v1',
        format: 'MD5',
        isFriendly: true,
        currentTrophies: 300,
        currentLossStreak: streak,
      });

      assert.equal(res.streakRecoveryTriggered, false);
      assert.equal(res.newLossStreak, streak);
      assert.equal(res.trophyDelta, 0);
      assert.equal(res.newTrophies, 300);
      assert.equal(res.coinsEarned, 10);
    });
  }

  console.log(`  ✔ Frente 2 Aprovada: Mecânica Anti-Tilt robusta inclusive para streaks anômalos >= 3.`);

  // ============================================================================
  // FRENTE 3: ORDENAÇÃO E TRANSIÇÃO MONOTÔNICA DOS 12 ELOS
  // ============================================================================
  console.log('\n▶ [FRENTE 3] Teste de Estresse: Transição Monotônica dos 12 Elos');

  check('Integridade estrutural dos 12 elos (sem lacunas e sem sobreposições)', () => {
    assert.equal(ELO_TIERS.length, 12, 'Devem existir exatamente 12 Elos');

    const expectedTiers = [
      'novato',
      'bixo',
      'segundoanista',
      'terceiranista',
      'veterano',
      'municipal',
      'regional',
      'estadual',
      'nacional',
      'continental',
      'global',
      'pro',
    ];

    for (let i = 0; i < ELO_TIERS.length; i++) {
      assert.equal(ELO_TIERS[i].id, expectedTiers[i], `Elo no índice ${i} deve ser ${expectedTiers[i]}`);
    }

    // Verificar contiguidade
    for (let i = 0; i < ELO_TIERS.length - 1; i++) {
      const cur = ELO_TIERS[i];
      const next = ELO_TIERS[i + 1];
      assert.ok(cur.maxTrophies !== null, `Elo ${cur.id} deve ter maxTrophies numérico`);
      assert.equal(
        cur.maxTrophies! + 1,
        next.minTrophies,
        `Contiguidade estrita quebrada entre ${cur.id} (${cur.maxTrophies}) e ${next.id} (${next.minTrophies})`
      );
      assert.ok(
        cur.minTrophies <= cur.maxTrophies!,
        `minTrophies deve ser <= maxTrophies para ${cur.id}`
      );
    }

    // Último elo (Pro)
    const pro = ELO_TIERS[11];
    assert.equal(pro.id, 'pro');
    assert.equal(pro.minTrophies, 10000);
    assert.equal(pro.maxTrophies, null);
  });

  check('Monotonicidade estrita de getEloInfo em todo o espectro 0..15000 troféus', () => {
    let lastTierIndex = -1;

    for (let t = 0; t <= 15000; t++) {
      const info = getEloInfo(t);
      const tierIndex = ELO_TIERS.findIndex((el) => el.id === info.tier.id);

      // Monotonicidade: o índice do elo não pode retroceder quando troféus aumentam
      assert.ok(
        tierIndex >= lastTierIndex,
        `Monotonicidade violada em t=${t}: elo anterior index=${lastTierIndex}, novo=${tierIndex}`
      );
      lastTierIndex = tierIndex;

      // Invariante de limites do elo
      assert.ok(t >= info.tier.minTrophies, `t=${t} deve ser >= minTrophies (${info.tier.minTrophies})`);
      if (info.tier.maxTrophies !== null) {
        assert.ok(t <= info.tier.maxTrophies, `t=${t} deve ser <= maxTrophies (${info.tier.maxTrophies})`);
      }

      // Invariante de porcentagem de progresso
      assert.ok(
        info.progressPercent >= 0 && info.progressPercent <= 100,
        `progressPercent deve estar em [0, 100], obteve ${info.progressPercent} em t=${t}`
      );

      // Próximo elo e troféus faltantes
      if (info.nextTier !== null) {
        assert.equal(
          info.nextTier.id,
          ELO_TIERS[tierIndex + 1].id,
          `Próximo elo deve ser o índice ${tierIndex + 1}`
        );
        assert.equal(
          info.trophiesToNext,
          info.nextTier.minTrophies - t,
          `trophiesToNext deve ser exatamente nextTier.minTrophies - t`
        );
        assert.ok(info.trophiesToNext > 0, `trophiesToNext deve ser > 0 para tiers com nextTier`);
      } else {
        // No Pro
        assert.equal(info.tier.id, 'pro');
        assert.equal(info.progressPercent, 100);
        assert.equal(info.trophiesToNext, 0);
      }
    }
  });

  console.log(`  ✔ Frente 3 Aprovada: Ordenação e monotonicidade estrita de 100% dos 12 Elos (0 a 15000).`);

  // ============================================================================
  // FRENTE 4: PAREAMENTO DE EQUIPES COM EMPATES MÚLTIPLOS
  // ============================================================================
  console.log('\n▶ [FRENTE 4] Teste de Estresse: Pareamento de Equipes com Empates Múltiplos');

  check('getChoosingTeam com empates múltiplos em 2v2 e 3v3', () => {
    // Caso 1: 2v2 com pontuação idêntica (500+500 vs 500+500)
    const res1 = getChoosingTeam(
      [
        { uid: 'a1', nickname: 'A1', turma: 'INF1M', trophies: 500 },
        { uid: 'a2', nickname: 'A2', turma: 'INF1M', trophies: 500 },
      ],
      [
        { uid: 'b1', nickname: 'B1', turma: 'ETM1M', trophies: 500 },
        { uid: 'b2', nickname: 'B2', turma: 'ETM1M', trophies: 500 },
      ]
    );
    assert.equal(res1, 'A', 'Empate exato em 2v2 deve priorizar Time A');

    // Caso 2: 2v2 com soma idêntica mas distribuição heterogênea (200+800 vs 500+500)
    const res2 = getChoosingTeam(
      [
        { uid: 'a1', nickname: 'A1', turma: 'INF1M', trophies: 200 },
        { uid: 'a2', nickname: 'A2', turma: 'INF1M', trophies: 800 },
      ],
      [
        { uid: 'b1', nickname: 'B1', turma: 'ETM1M', trophies: 500 },
        { uid: 'b2', nickname: 'B2', turma: 'ETM1M', trophies: 500 },
      ]
    );
    assert.equal(res2, 'A');

    // Caso 3: 2v2 com participantes com 0 troféus (0+0 vs 0+0)
    const res3 = getChoosingTeam(
      [
        { uid: 'a1', nickname: 'A1', turma: 'INF1M', trophies: 0 },
        { uid: 'a2', nickname: 'A2', turma: 'INF1M', trophies: 0 },
      ],
      [
        { uid: 'b1', nickname: 'B1', turma: 'ETM1M', trophies: 0 },
        { uid: 'b2', nickname: 'B2', turma: 'ETM1M', trophies: 0 },
      ]
    );
    assert.equal(res3, 'A');

    // Caso 4: 3v3 com soma idêntica (1000+1000+1000 vs 500+1500+1000 = 3000)
    const res4 = getChoosingTeam(
      [
        { uid: 'a1', nickname: 'A1', turma: 'INF1M', trophies: 1000 },
        { uid: 'a2', nickname: 'A2', turma: 'INF1M', trophies: 1000 },
        { uid: 'a3', nickname: 'A3', turma: 'INF1M', trophies: 1000 },
      ],
      [
        { uid: 'b1', nickname: 'B1', turma: 'ETM1M', trophies: 500 },
        { uid: 'b2', nickname: 'B2', turma: 'ETM1M', trophies: 1500 },
        { uid: 'b3', nickname: 'B3', turma: 'ETM1M', trophies: 1000 },
      ]
    );
    assert.equal(res4, 'A');

    // Caso 5: Diferença marginal de 1 troféu favorecendo Time B (1999 vs 2000)
    const res5 = getChoosingTeam(
      [
        { uid: 'a1', nickname: 'A1', turma: 'INF1M', trophies: 999 },
        { uid: 'a2', nickname: 'A2', turma: 'INF1M', trophies: 1000 },
      ],
      [
        { uid: 'b1', nickname: 'B1', turma: 'ETM1M', trophies: 1000 },
        { uid: 'b2', nickname: 'B2', turma: 'ETM1M', trophies: 1000 },
      ]
    );
    assert.equal(res5, 'B');

    // Caso 6: Diferença marginal de 1 troféu favorecendo Time A (2001 vs 2000)
    const res6 = getChoosingTeam(
      [
        { uid: 'a1', nickname: 'A1', turma: 'INF1M', trophies: 1001 },
        { uid: 'a2', nickname: 'A2', turma: 'INF1M', trophies: 1000 },
      ],
      [
        { uid: 'b1', nickname: 'B1', turma: 'ETM1M', trophies: 1000 },
        { uid: 'b2', nickname: 'B2', turma: 'ETM1M', trophies: 1000 },
      ]
    );
    assert.equal(res6, 'A');

    // Caso 7: Participante com trophies undefined (fallback seguro para 0)
    const res7 = getChoosingTeam(
      [
        { uid: 'a1', nickname: 'A1', turma: 'INF1M', trophies: undefined as any },
        { uid: 'a2', nickname: 'A2', turma: 'INF1M', trophies: 500 },
      ],
      [
        { uid: 'b1', nickname: 'B1', turma: 'ETM1M', trophies: 200 },
        { uid: 'b2', nickname: 'B2', turma: 'ETM1M', trophies: 200 },
      ]
    );
    assert.equal(res7, 'A', '500 > 400 mesmo com participante undefined');
  });

  check('Resolução de rodadas de equipes com múltiplos empates sucessivos', () => {
    // 2v2: Ambos os duelos são empates espelho
    const d1 = resolveMovePair('pedra', 'pedra');
    const d2 = resolveMovePair('parafal', 'parafal');
    let ptsA = 0;
    let ptsB = 0;
    if (d1.outcomeForA === 'win') ptsA++;
    if (d1.outcomeForA === 'loss') ptsB++;
    if (d2.outcomeForA === 'win') ptsA++;
    if (d2.outcomeForA === 'loss') ptsB++;

    let roundWinner: 'A' | 'B' | 'DRAW' = 'DRAW';
    if (ptsA > ptsB) roundWinner = 'A';
    else if (ptsB > ptsA) roundWinner = 'B';
    assert.equal(roundWinner, 'DRAW');
    assert.equal(ptsA, 0);
    assert.equal(ptsB, 0);

    // 2v2: Vitórias trocadas (A vence D1, B vence D2)
    const w1 = resolveMovePair('papel', 'pedra'); // Win A
    const w2 = resolveMovePair('papel', 'tesoura'); // Loss A
    ptsA = (w1.outcomeForA === 'win' ? 1 : 0) + (w2.outcomeForA === 'win' ? 1 : 0);
    ptsB = (w1.outcomeForA === 'loss' ? 1 : 0) + (w2.outcomeForA === 'loss' ? 1 : 0);
    roundWinner = ptsA > ptsB ? 'A' : ptsB > ptsA ? 'B' : 'DRAW';
    assert.equal(roundWinner, 'DRAW');
    assert.equal(ptsA, 1);
    assert.equal(ptsB, 1);

    // 3v3: 3 empates neutros
    const n1 = resolveMovePair('papel', 'gelo_invertido');
    const n2 = resolveMovePair('parafal', 'tesoura');
    const n3 = resolveMovePair('pedra', 'jegue');
    ptsA = [n1, n2, n3].filter((c) => c.outcomeForA === 'win').length;
    ptsB = [n1, n2, n3].filter((c) => c.outcomeForA === 'loss').length;
    roundWinner = ptsA > ptsB ? 'A' : ptsB > ptsA ? 'B' : 'DRAW';
    assert.equal(roundWinner, 'DRAW');
    assert.equal(ptsA, 0);
    assert.equal(ptsB, 0);

    // 3v3: 1 vitória A, 1 vitória B, 1 empate neutro
    const v1 = resolveMovePair('tesoura', 'papel'); // Win A
    const v2 = resolveMovePair('papel', 'jegue'); // Loss A (Win B)
    const v3 = resolveMovePair('pedra', 'jegue'); // Draw
    ptsA = [v1, v2, v3].filter((c) => c.outcomeForA === 'win').length;
    ptsB = [v1, v2, v3].filter((c) => c.outcomeForA === 'loss').length;
    roundWinner = ptsA > ptsB ? 'A' : ptsB > ptsA ? 'B' : 'DRAW';
    assert.equal(roundWinner, 'DRAW');
    assert.equal(ptsA, 1);
    assert.equal(ptsB, 1);
  });

  console.log(`  ✔ Frente 4 Aprovada: Pareamento e resolução de equipes com empates múltiplos válidos.`);

  console.log('\n' + '='.repeat(80));
  console.log(`  SUCESSO TOTAL NO HARNESS DE ESTRESSE EMPÍRICO!`);
  console.log(`  Total de Verificações / Oráculos Aprovados: ${passedAssertions} / ${totalAssertions}`);
  console.log('='.repeat(80) + '\n');
}

runEmpiricalStressSuite().catch((err) => {
  console.error('Falha fatal no harness de estresse:', err);
  process.exit(1);
});
