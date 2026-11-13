import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

interface MutationDef {
  id: string;
  name: string;
  file: string;
  search: string;
  replace: string;
  testCmd: string;
}

const MUTATIONS: MutationDef[] = [
  {
    id: 'M1',
    name: 'Piso Zero: Remover Math.max(0, ...) permitindo saldo negativo',
    file: 'src/constants/gameData.ts',
    search: 'const clampedNewTrophies = Math.max(0, currentTrophies - penalty);',
    replace: 'const clampedNewTrophies = currentTrophies - penalty;',
    testCmd: 'npx tsx tests/e2e/tier2-boundaries.test.ts',
  },
  {
    id: 'M2',
    name: 'Anti-Tilt: Alterar nextStreak >= 3 para nextStreak === 3 (falha em streaks legados > 3)',
    file: 'src/constants/gameData.ts',
    search: 'if (nextStreak >= 3) {',
    replace: 'if (nextStreak === 3) {',
    testCmd: 'npx tsx tests/e2e/tier2-boundaries.test.ts',
  },
  {
    id: 'M3',
    name: 'Anti-Tilt: Omitir reset do lossStreak na ativação da recuperação',
    file: 'src/constants/gameData.ts',
    search: 'newLossStreak: 0,\n      streakRecoveryTriggered: true,',
    replace: 'newLossStreak: nextStreak,\n      streakRecoveryTriggered: true,',
    testCmd: 'npx tsx tests/e2e/tier2-boundaries.test.ts',
  },
  {
    id: 'M4',
    name: '12 Elos: Alterar minTrophies do Bixo de 500 para 600 criando lacuna',
    file: 'src/constants/gameData.ts',
    search: "id: 'bixo',\n    name: 'Bixo',\n    minTrophies: 500,",
    replace: "id: 'bixo',\n    name: 'Bixo',\n    minTrophies: 600,",
    testCmd: 'npx tsx tests/e2e/tier1-features.test.ts',
  },
  {
    id: 'M5',
    name: 'Pareamento de Equipe: Alterar sumA >= sumB para sumA > sumB (inverte desempate)',
    file: 'src/firebase/services.ts',
    search: "return sumA >= sumB ? 'A' : 'B';",
    replace: "return sumA > sumB ? 'A' : 'B';",
    testCmd: 'npx tsx tests/e2e/tier3-combinations.test.ts',
  },
  {
    id: 'M6',
    name: 'Economia Amistoso: Alterar trophyDelta: 0 para trophyDelta: 15 na vitória',
    file: 'src/constants/gameData.ts',
    search: "trophyDelta: 0,\n      coinsEarned: outcome === 'win' ? 25 : 10,",
    replace: "trophyDelta: 15,\n      coinsEarned: outcome === 'win' ? 25 : 10,",
    testCmd: 'npx tsx tests/e2e/tier3-combinations.test.ts',
  },
];

async function runMutationTesting() {
  console.log('='.repeat(80));
  console.log('  CHALLENGER E2E 2 — EMPIRICAL MUTATION TESTING MATRIX');
  console.log('='.repeat(80));

  const rootDir = process.cwd();
  let killedCount = 0;
  let survivedCount = 0;
  const results: { id: string; name: string; status: 'KILLED' | 'SURVIVED'; killerTest?: string }[] = [];

  for (const m of MUTATIONS) {
    const fullPath = path.resolve(rootDir, m.file);
    const originalContent = fs.readFileSync(fullPath, 'utf-8');

    if (!originalContent.includes(m.search)) {
      console.error(`❌ ERRO DE CONFIGURAÇÃO: Trecho de busca não encontrado para ${m.id} em ${m.file}`);
      process.exit(1);
    }

    try {
      // Injeta a mutação
      const mutatedContent = originalContent.replace(m.search, m.replace);
      fs.writeFileSync(fullPath, mutatedContent, 'utf-8');

      console.log(`\n▶ [MUTANTE ${m.id}] ${m.name}`);
      console.log(`  Arquivo: ${m.file}`);
      console.log(`  Comando de verificação: ${m.testCmd}`);

      let testPassed = false;
      let failureSnippet = '';
      try {
        execSync(m.testCmd, { cwd: rootDir, stdio: 'pipe' });
        testPassed = true;
      } catch (err: any) {
        testPassed = false;
        failureSnippet = (err.stderr?.toString() || err.stdout?.toString() || err.message).slice(0, 300);
      }

      if (!testPassed) {
        console.log(`  💥 MUTANTE MORTO (KILLED)! Os testes falharam conforme esperado.`);
        killedCount++;
        results.push({ id: m.id, name: m.name, status: 'KILLED' });
      } else {
        console.log(`  ⚠️ MUTANTE SOBREVIVEU (SURVIVED)! Os testes não detectaram o bug injetado.`);
        survivedCount++;
        results.push({ id: m.id, name: m.name, status: 'SURVIVED' });
      }
    } finally {
      // Restaura incondicionalmente o arquivo original
      fs.writeFileSync(fullPath, originalContent, 'utf-8');
    }
  }

  // Verifica restauração limpa
  const statusClean = execSync('git status --porcelain src/', { cwd: rootDir }).toString().trim();
  if (statusClean !== '') {
    console.warn(`Aviso de integridade do git após restauração: ${statusClean}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('  RELATÓRIO CONSOLIDADO DE MUTATION TESTING');
  console.log('='.repeat(80));
  for (const r of results) {
    const icon = r.status === 'KILLED' ? '✔ MORTO (Killed)' : '❌ SOBREVIVEU (Survived)';
    console.log(`  ${r.id.padEnd(5)} ${r.status.padEnd(10)} ${icon.padEnd(25)} ${r.name}`);
  }
  console.log('-'.repeat(80));
  const killRate = ((killedCount / MUTATIONS.length) * 100).toFixed(1);
  console.log(`  Total de Mutantes: ${MUTATIONS.length}`);
  console.log(`  Mutantes Mortos (Killed): ${killedCount}`);
  console.log(`  Mutantes Sobreviventes (Survived): ${survivedCount}`);
  console.log(`  Taxa de Eliminação de Mutantes (Kill Rate): ${killRate}%`);
  console.log('='.repeat(80) + '\n');

  if (survivedCount > 0) {
    console.error('ALERTA: Há mutantes sobreviventes na suíte E2E!');
    process.exit(1);
  }
}

runMutationTesting().catch((err) => {
  console.error('Falha no processo de mutation testing:', err);
  process.exit(1);
});
