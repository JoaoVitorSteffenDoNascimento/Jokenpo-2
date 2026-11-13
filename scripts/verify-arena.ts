import assert from 'node:assert/strict';
import module from 'node:module';

// Register asset loader hook so Vite image imports (.jpg/.png/.svg) resolve in Node ESM
if ('registerHooks' in module && typeof module.registerHooks === 'function') {
  module.registerHooks({
    load(url, context, nextLoad) {
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

// Polyfill browser globals for Hybrid Local Arena testing in Node
const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => memoryStorage.get(k) ?? null,
    setItem: (k: string, v: string) => memoryStorage.set(k, String(v)),
    removeItem: (k: string) => memoryStorage.delete(k),
    clear: () => memoryStorage.clear(),
  },
  configurable: true,
});
if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    },
    configurable: true,
  });
}

async function main() {
  const {
    ARENA_TABLE_THEMES,
    calculateMatchReward,
    CARD_AURAS,
    CHARACTER_ARCHETYPES,
    CHARACTER_EYEWEAR,
    CHARACTER_GUN_SKINS,
    CHARACTER_HATS,
    CHARACTER_OUTFITS,
    CHARACTER_PRESETS,
    CHARACTER_PROPS,
    ELO_TIERS,
    getCurrentSeasonMonthKey,
    getEloInfo,
    getSkinById,
    MOVE_ORDER,
    MOVES,
    resolveCharacterCustomization,
    resolveMovePair,
    SKINS_CATALOG,
    TROPHY_ROAD_MILESTONES: TROPHY_MILESTONES,
    VICTORY_EMOTES,
  } = await import('../src/constants/gameData');
  const { TURMAS } = await import('../src/types/game');
  const {
    buySkin,
    claimTrophyMilestone,
    createMatchRoom,
    createPlayerAccount,
    equipSkin,
    isLocalArenaUid,
    processDailyLoginReward,
    recordPlayerMatchResult,
    signInWithLocalArena,
  } = await import('../src/firebase/services');

  console.log('=== Verificando Regras e Mecânicas do Jokenpo 2 ===');

  // 1. Verify all 6 moves and their 36 combinations
  assert.equal(MOVE_ORDER.length, 6, 'Deve conter exatamente 6 jogadas');

  for (const moveA of MOVE_ORDER) {
    const defA = MOVES[moveA];
    assert.ok(defA, `Definição ausente para ${moveA}`);
    assert.equal(defA.beats.length, 2, `${moveA} deve vencer exatamente 2 jogadas`);
    assert.equal(defA.losesTo.length, 2, `${moveA} deve perder para exatamente 2 jogadas`);

    // Mirror match must always draw
    const mirror = resolveMovePair(moveA, moveA);
    assert.equal(mirror.outcomeForA, 'draw', `Espelho ${moveA} vs ${moveA} deve empatar`);

    for (const moveB of MOVE_ORDER) {
      const resAB = resolveMovePair(moveA, moveB);
      const resBA = resolveMovePair(moveB, moveA);
      assert.ok(resAB.reason.length > 5, `Razão vazia para ${moveA} vs ${moveB}`);

      if (resAB.outcomeForA === 'win') {
        assert.equal(
          resBA.outcomeForA,
          'loss',
          `Assimetria inválida entre ${moveA} e ${moveB}`
        );
      } else if (resAB.outcomeForA === 'loss') {
        assert.equal(
          resBA.outcomeForA,
          'win',
          `Assimetria inválida entre ${moveA} e ${moveB}`
        );
      } else {
        assert.equal(
          resBA.outcomeForA,
          'draw',
          `Empate assimétrico entre ${moveA} e ${moveB}`
        );
      }
    }
  }
  console.log('✓ Matriz 6x6 (36 combinações de jogadas) validada com simetria perfeita.');

  // 2. Verify all 12 Elos and boundary values
  assert.equal(ELO_TIERS.length, 12, 'Deve conter exatamente 12 Elos');
  const eloBoundaries: Array<[number, string]> = [
    [-50, 'Novato'],
    [0, 'Novato'],
    [499, 'Novato'],
    [500, 'Bixo'],
    [999, 'Bixo'],
    [1000, 'Segundoanista'],
    [1499, 'Segundoanista'],
    [1500, 'Terceiranista'],
    [2249, 'Terceiranista'],
    [2250, 'Veterano'],
    [2999, 'Veterano'],
    [3000, 'Municipal'],
    [3999, 'Municipal'],
    [4000, 'Regional'],
    [4999, 'Regional'],
    [5000, 'Estadual'],
    [5999, 'Estadual'],
    [6000, 'Nacional'],
    [7499, 'Nacional'],
    [7500, 'Continental'],
    [7999, 'Continental'],
    [8000, 'Global'],
    [9999, 'Global'],
    [10000, 'Pro'],
    [15000, 'Pro'],
  ];

  for (const [trophies, expectedName] of eloBoundaries) {
    const info = getEloInfo(trophies);
    assert.equal(
      info.tier.name,
      expectedName,
      `Troféus=${trophies} deveria ser Elo ${expectedName}, mas retornou ${info.tier.name}`
    );
  }
  console.log('✓ Todos os 12 Elos e valores de fronteira (-50 até 15.000+) validados.');

  // 3. Verify calculateMatchReward across modes, formats, friendly, and 3-loss streak recovery
  for (let i = 0; i < 30; i++) {
    const friendlyWin = calculateMatchReward({
      outcome: 'win',
      mode: '1v1',
      format: 'MD3',
      isFriendly: true,
      currentTrophies: 500,
      currentLossStreak: 2,
    });
    assert.equal(friendlyWin.trophyDelta, 0);
    assert.equal(friendlyWin.newTrophies, 500);
    assert.equal(friendlyWin.coinsEarned, 25);

    const win1v1Md3 = calculateMatchReward({
      outcome: 'win',
      mode: '1v1',
      format: 'MD3',
      isFriendly: false,
      currentTrophies: 500,
      currentLossStreak: 0,
    });
    assert.ok(win1v1Md3.trophyDelta >= 10 && win1v1Md3.trophyDelta <= 20);
    assert.equal(win1v1Md3.newLossStreak, 0);

    const win1v1Md5 = calculateMatchReward({
      outcome: 'win',
      mode: '1v1',
      format: 'MD5',
      isFriendly: false,
      currentTrophies: 500,
      currentLossStreak: 0,
    });
    assert.ok(win1v1Md5.trophyDelta >= 20 && win1v1Md5.trophyDelta <= 30);

    const recoveryOn3rdLoss = calculateMatchReward({
      outcome: 'loss',
      mode: '1v1',
      format: 'MD3',
      isFriendly: false,
      currentTrophies: 500,
      currentLossStreak: 2,
    });
    assert.ok(recoveryOn3rdLoss.trophyDelta >= 25 && recoveryOn3rdLoss.trophyDelta <= 30);
    assert.equal(recoveryOn3rdLoss.streakRecoveryTriggered, true);
    assert.equal(recoveryOn3rdLoss.newLossStreak, 0);

    const win2v2 = calculateMatchReward({
      outcome: 'win',
      mode: '2v2',
      format: 'MD3',
      isFriendly: false,
      currentTrophies: 1000,
      currentLossStreak: 0,
    });
    assert.ok(win2v2.trophyDelta >= 40 && win2v2.trophyDelta <= 50);

    const win3v3 = calculateMatchReward({
      outcome: 'win',
      mode: '3v3',
      format: 'MD5',
      isFriendly: false,
      currentTrophies: 1000,
      currentLossStreak: 0,
    });
    assert.ok(win3v3.trophyDelta >= 55 && win3v3.trophyDelta <= 65);

    const zeroLoss = calculateMatchReward({
      outcome: 'loss',
      mode: '1v1',
      format: 'MD5',
      isFriendly: false,
      currentTrophies: 5,
      currentLossStreak: 1,
    });
    assert.equal(zeroLoss.newTrophies, 0);
    assert.equal(zeroLoss.newLossStreak, 2);
  }
  console.log('✓ Recompensas de partidas (1v1, 2v2, 3v3, MD3, MD5, Amistoso, Recuperação de 3 derrotas e piso zero) validadas.');

  // 4. Verify Skins Catalog, Trophy Milestones, Turmas, and Character Customizer
  assert.equal(TURMAS.length, 16, 'Deve haver 16 turmas (INF1M-INF4T, ETM1M-ETM4T)');
  assert.equal(SKINS_CATALOG.length, 18, 'Deve haver 18 skins no catálogo');
  for (const m of MOVE_ORDER) {
    const moveSkins = SKINS_CATALOG.filter((s) => s.moveId === m);
    assert.equal(moveSkins.length, 3, `Cada jogada (${m}) deve possuir 3 skins`);
  }
  for (const ms of TROPHY_MILESTONES) {
    if (ms.skinId) {
      const skin = getSkinById(ms.skinId);
      assert.equal(skin.id, ms.skinId, `Skin de marco inválida: ${ms.skinId}`);
    }
  }

  const customResolved = resolveCharacterCustomization({ archetypeId: 'dom_jegue' }, 0);
  assert.equal(customResolved.archetypeId, 'dom_jegue');
  assert.ok(CHARACTER_ARCHETYPES.length >= 6, 'Deve haver pelo menos 6 arquétipos 3D');
  assert.ok(CHARACTER_HATS.length >= 7, 'Deve haver pelo menos 7 chapéus/elmos 3D');
  assert.ok(CHARACTER_EYEWEAR.length >= 6, 'Deve haver pelo menos 6 visores/óculos 3D');
  assert.ok(CHARACTER_OUTFITS.length >= 6, 'Deve haver pelo menos 6 trajes 3D');
  assert.ok(CHARACTER_PROPS.length >= 5, 'Deve haver pelo menos 5 acessórios 3D');
  assert.ok(CHARACTER_GUN_SKINS.length >= 4, 'Deve haver pelo menos 4 skins de arma 3D');
  assert.ok(ARENA_TABLE_THEMES.length >= 4, 'Deve haver pelo menos 4 temas de mesa 3D');
  assert.ok(CARD_AURAS.length >= 4, 'Deve haver pelo menos 4 auras de carta 3D');
  assert.ok(VICTORY_EMOTES.length >= 4, 'Deve haver pelo menos 4 emotes de mesa 3D');
  assert.ok(CHARACTER_PRESETS.length >= 4, 'Deve haver pelo menos 4 presets lendários 3D');
  for (const preset of CHARACTER_PRESETS) {
    const resolvedPreset = resolveCharacterCustomization(preset.config, 0);
    assert.equal(resolvedPreset.archetypeId, preset.config.archetypeId);
    assert.equal(resolvedPreset.tableThemeId, preset.config.tableThemeId);
    assert.equal(resolvedPreset.cardAuraId, preset.config.cardAuraId);
  }
  assert.match(getCurrentSeasonMonthKey(), /^\d{4}-\d{2}$/);
  console.log('✓ Catálogo de 18 skins, 16 turmas, Caminho de Troféus e Customizador 3D (9 categorias + 4 Presets) validados.');

  // 5. Verify Hybrid Local Arena Account Creation, Daily Reward, Skin Purchase, Match Recording & Room Creation
  const localUser = signInWithLocalArena('Teste_IF');
  assert.ok(isLocalArenaUid(localUser.uid), 'UID local deve possuir prefixo local_arena_');

  const profile = await createPlayerAccount(localUser, 'Duelista_IF2M', 'INF2M');
  assert.equal(profile.nickname, 'Duelista_IF2M');
  assert.equal(profile.turma, 'INF2M');
  assert.equal(profile.coins, 150);

  const daily1 = await processDailyLoginReward(localUser.uid);
  assert.equal(daily1.awarded, true);
  assert.equal(daily1.coinsAwarded, 150);
  assert.equal(daily1.newCoins, 300);

  const daily2 = await processDailyLoginReward(localUser.uid);
  assert.equal(daily2.awarded, false, 'Não deve premiar duas vezes no mesmo dia');

  await recordPlayerMatchResult(localUser.uid, {
    outcome: 'win',
    newTrophies: 300,
    coinsEarned: 150,
    newLossStreak: 0,
    mode: '2v2',
    format: 'MD3',
    isFriendly: false,
    opponentName: 'Rival_ETM',
    opponentTurma: 'ETM1M',
    scoreText: '2 - 0',
    trophyDelta: 45,
  });

  const targetSkin = SKINS_CATALOG.find((s) => s.cost > 0 && s.cost <= 300)!;
  await buySkin(
    { ...profile, coins: 450, trophies: 300 },
    targetSkin
  );
  await equipSkin(
    {
      ...profile,
      coins: 450 - targetSkin.cost,
      unlockedSkins: [...profile.unlockedSkins, targetSkin.id],
    },
    targetSkin.moveId,
    targetSkin.id
  );

  const milestone = TROPHY_MILESTONES.find((m) => m.trophies <= 250)!;
  const msRes = await claimTrophyMilestone(
    { ...profile, trophies: 300, coins: 200 },
    milestone
  );
  assert.ok(msRes.coinsAwarded > 0);

  const room = await createMatchRoom({
    player: { ...profile, trophies: 300 },
    mode: '2v2',
    format: 'MD3',
    isFriendly: false,
    isPublicQueue: true,
  });
  assert.equal(room.mode, '2v2');
  assert.equal(room.teamSize, 2);
  assert.equal(room.roundPhase, 'pairing');

  console.log('✓ Fluxo completo do Modo Arena Direto (Conta, Moedas Diárias, Partidas, Loja de Skins, Marcos e Salas) validado!');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
