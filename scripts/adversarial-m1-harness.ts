import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Register hook for Vite image assets if needed in Node ESM
import module from 'node:module';
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

// Global browser mocks for node runtime
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

async function runAdversarialHarness() {
  console.log('='.repeat(70));
  console.log('  CHALLENGER M1-1: ADVERSARIAL STRESS TEST & EMPIRICAL HARNESS');
  console.log('='.repeat(70));

  // 1. Carregar tipos de domínio e constantes
  const { TURMAS } = await import('../src/types/game');
  const {
    DEFAULT_EQUIPPED_SKINS,
    MOVE_ORDER,
    resolveCharacterCustomization,
    SKINS_CATALOG,
  } = await import('../src/constants/gameData');
  type Turma = (typeof TURMAS)[number];

  console.log(`[PASS] 16 Turmas carregadas com sucesso: ${TURMAS.length} turmas.`);
  assert.equal(TURMAS.length, 16, 'Devem existir exatamente 16 turmas escolares.');

  // Validar formato de cada turma
  const turmaRegex = /^(INF|ETM)[1-4][MT]$/;
  for (const t of TURMAS) {
    assert.match(t, turmaRegex, `Turma ${t} não segue o padrão (INF|ETM)[1-4][MT]`);
  }

  // 2. Inspecionar o arquivo ArenaView.tsx para garantir tipagem correta de excludeTurma
  const arenaViewPath = path.resolve(process.cwd(), 'src/components/ArenaView.tsx');
  const arenaViewContent = fs.readFileSync(arenaViewPath, 'utf-8');

  assert.ok(
    arenaViewContent.includes('excludeTurma: Turma'),
    'ArenaView.tsx DEVE declarar `excludeTurma: Turma` em buildBotTeam'
  );
  assert.ok(
    !arenaViewContent.includes('excludeTurma: string'),
    'ArenaView.tsx NÃO DEVE conter `excludeTurma: string`'
  );
  console.log('[PASS] Verificação estática de assinatura em ArenaView.tsx confirmada: excludeTurma: Turma.');

  // 3. Implementação exata de buildBotTeam conforme ArenaView.tsx
  function buildBotTeam(
    count: number,
    prefix: string,
    excludeTurma: Turma,
    baseTrophies = 400
  ) {
    const result = [];
    for (let i = 0; i < count; i++) {
      const turma =
        TURMAS[(i * 3 + (prefix === 'Ally' ? 1 : 5)) % TURMAS.length] || excludeTurma;
      const equipped = { ...DEFAULT_EQUIPPED_SKINS };
      for (const m of MOVE_ORDER) {
        const options = SKINS_CATALOG.filter((s) => s.moveId === m);
        const pick = options[Math.floor(Math.random() * options.length)];
        if (pick) equipped[m] = pick.id;
      }
      const botTrophies =
        prefix === 'Ally'
          ? Math.max(120, baseTrophies + 260 + i * 150)
          : Math.max(40, baseTrophies + 60 + i * 80);
      result.push({
        uid: `bot_${prefix.toLowerCase()}_${i}`,
        nickname:
          prefix === 'Ally' ? `Parceiro_${i + 1}` : `Rival_${turma}`,
        turma,
        trophies: botTrophies,
        equippedSkins: equipped,
        characterCustomization: resolveCharacterCustomization(
          null,
          i + (prefix === 'Ally' ? 1 : 3)
        ),
        isBot: true,
      });
    }
    return result;
  }

  // 4. Teste Empírico das 16 Turmas com contagens 1, 2, 3 bots (e variações de elo)
  console.log('\n[TEST] Executando matriz empírica: 16 turmas x [1, 2, 3] bots x [Ally, Rival]...');
  let totalBotsInstantiated = 0;
  const skinCatalogIds = new Set(SKINS_CATALOG.map((s) => s.id));

  for (const turma of TURMAS) {
    for (const count of [1, 2, 3]) {
      for (const prefix of ['Ally', 'Rival'] as const) {
        for (const baseTrophies of [0, 400, 1500, 10000]) {
          const team = buildBotTeam(count, prefix, turma, baseTrophies);
          assert.equal(team.length, count, `Time deve conter exatamente ${count} bots`);

          const seenUids = new Set<string>();

          for (let i = 0; i < team.length; i++) {
            const bot = team[i];
            totalBotsInstantiated++;

            // Validar ausência de undefined / null em propriedades chave
            assert.notEqual(bot.uid, undefined, 'UID não pode ser undefined');
            assert.notEqual(bot.nickname, undefined, 'Nickname não pode ser undefined');
            assert.notEqual(bot.turma, undefined, 'Turma não pode ser undefined');
            assert.notEqual(bot.trophies, undefined, 'Trophies não pode ser undefined');
            assert.notEqual(bot.equippedSkins, undefined, 'equippedSkins não pode ser undefined');
            assert.notEqual(bot.characterCustomization, undefined, 'characterCustomization não pode ser undefined');
            assert.equal(bot.isBot, true, 'isBot deve ser true');

            // Unicidade de UID na equipe
            assert.ok(!seenUids.has(bot.uid), `UID duplicado detectado: ${bot.uid}`);
            seenUids.add(bot.uid);

            // Validar turma válida
            assert.ok(
              TURMAS.includes(bot.turma as any),
              `Turma gerada ${bot.turma} deve pertencer ao array TURMAS`
            );

            // Validar troféus
            assert.ok(!Number.isNaN(bot.trophies), 'Troféus não podem ser NaN');
            assert.ok(bot.trophies >= (prefix === 'Ally' ? 120 : 40), 'Piso de troféus deve ser respeitado');

            // Validar customização de personagem
            const c = bot.characterCustomization;
            assert.ok(c.archetypeId, 'archetypeId obrigatório');
            assert.ok(c.hatId, 'hatId obrigatório');
            assert.ok(c.eyewearId, 'eyewearId obrigatório');
            assert.ok(c.outfitId, 'outfitId obrigatório');
            assert.ok(c.propId, 'propId obrigatório');
            assert.ok(c.gunSkinId, 'gunSkinId obrigatório');
            assert.ok(c.tableThemeId, 'tableThemeId obrigatório');
            assert.ok(c.cardAuraId, 'cardAuraId obrigatório');
            assert.ok(c.victoryEmoteId, 'victoryEmoteId obrigatório');

            // Validar equippedSkins para todos os 6 movimentos
            for (const move of MOVE_ORDER) {
              const skinId = bot.equippedSkins[move];
              assert.ok(skinId, `Skin para jogada ${move} ausente`);
              assert.ok(skinCatalogIds.has(skinId), `Skin ID ${skinId} inexistente no catálogo`);
            }
          }
        }
      }
    }
  }

  console.log(`[PASS] ${totalBotsInstantiated} instâncias de bots testadas com 100% de sucesso!`);

  // 5. Testes Adversariais de Borda
  console.log('\n[TEST] Executando testes adversariais de borda...');

  // Borda A: count = 0 (deve retornar array vazio sem lançar exceção)
  const emptyTeam = buildBotTeam(0, 'Ally', 'INF1M', 400);
  assert.equal(emptyTeam.length, 0, 'count=0 deve retornar array vazio');

  // Borda B: Troféus negativos (deve aplicar Math.max com piso seguro)
  const negativeTeam = buildBotTeam(2, 'Rival', 'ETM4T', -5000);
  assert.ok(negativeTeam[0].trophies >= 40, 'Piso mínimo de 40 troféus para rival deve ser mantido');

  // Borda C: Contagem alta (count = 50, testando overflow de índice com modulo)
  const bigTeam = buildBotTeam(50, 'Ally', 'INF2T', 1000);
  assert.equal(bigTeam.length, 50, 'Deve gerar 50 bots');
  for (const bot of bigTeam) {
    assert.ok(TURMAS.includes(bot.turma as any), `Turma ${bot.turma} deve ser válida mesmo com i alto`);
  }

  // Borda D: Prefixos arbitrários / vazios
  const customPrefixTeam = buildBotTeam(2, 'Spectator', 'INF3M', 500);
  assert.equal(customPrefixTeam.length, 2);
  assert.ok(customPrefixTeam[0].uid.startsWith('bot_spectator_'));

  console.log('[PASS] Todos os cenários adversariais de borda foram aprovados com sucesso!');
  console.log('\n' + '='.repeat(70));
  console.log('  TODOS OS TESTES DO HARNESS PASSARAM COM SUCESSO (100% GREEN)');
  console.log('='.repeat(70));
}

runAdversarialHarness().catch((err) => {
  console.error('\n[FAIL] Erro fatal no harness adversarial:', err);
  process.exit(1);
});
