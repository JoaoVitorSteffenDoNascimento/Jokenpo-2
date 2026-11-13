import { printFinalReport } from './fixtures/testRunner';
import { runTier1 } from './tier1-features.test';
import { runTier2 } from './tier2-boundaries.test';
import { runTier3 } from './tier3-combinations.test';
import { runTier4 } from './tier4-scenarios.test';

async function main() {
  console.log('='.repeat(80));
  console.log('          JOKENPO 2 — INICIANDO SUÍTE COMPLETA DE TESTES E2E (4 TIERS)');
  console.log('='.repeat(80));
  console.log(`Ambiente: Node.js ${process.version} | Runner: tsx | Diretório: tests/e2e/`);

  const summaries = [];

  // Executa progressivamente os 4 Tiers
  summaries.push(await runTier1());
  summaries.push(await runTier2());
  summaries.push(await runTier3());
  summaries.push(await runTier4());

  const success = printFinalReport(summaries);
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error('\nErro fatal durante a execução da suíte E2E:', err);
  process.exit(1);
});
