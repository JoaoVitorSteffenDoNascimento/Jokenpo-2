import assert from 'node:assert/strict';
import module from 'node:module';
import { performance } from 'node:perf_hooks';

// ============================================================================
// 1. ASSET LOADER HOOK (para resolver imports .jpg/.png/.svg em Node.js ESM)
// ============================================================================
if ('registerHooks' in module && typeof (module as any).registerHooks === 'function') {
  (module as any).registerHooks({
    load(url: string, context: unknown, nextLoad: (url: string, context: unknown) => any) {
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

// ============================================================================
// 2. POLYFILLS MÍNIMOS DE BROWSER EM MEMÓRIA
// ============================================================================
const memoryStorage = new Map<string, string>();
if (typeof (globalThis as any).localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => memoryStorage.get(k) ?? null,
      setItem: (k: string, v: string) => memoryStorage.set(k, String(v)),
      removeItem: (k: string) => memoryStorage.delete(k),
      clear: () => memoryStorage.clear(),
      key: (i: number) => Array.from(memoryStorage.keys())[i] ?? null,
      get length() {
        return memoryStorage.size;
      },
    },
    configurable: true,
    writable: true,
  });
}

if (typeof (globalThis as any).window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { host: 'localhost:3000', origin: 'http://localhost:3000', href: 'http://localhost:3000' },
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    },
    configurable: true,
    writable: true,
  });
}

// ============================================================================
// 3. ESTRUTURAS E TIPOS DOS TESTES
// ============================================================================
export interface TestCaseResult {
  id: string;
  description: string;
  status: 'passed' | 'failed';
  durationMs: number;
  error?: Error;
}

export interface TierSummary {
  tierName: string;
  tierNumber: 1 | 2 | 3 | 4;
  description: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestCaseResult[];
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// ============================================================================
// 4. TEST RUNNER DE TIER
// ============================================================================
export class TierTestRunner {
  public readonly results: TestCaseResult[] = [];
  private startTime = 0;
  private endTime = 0;

  constructor(
    public readonly tierNumber: 1 | 2 | 3 | 4,
    public readonly tierName: string,
    public readonly description: string
  ) {}

  public start(): void {
    this.startTime = performance.now();
    console.log(
      `\n${colors.cyan}▶ [TIER ${this.tierNumber}] ${this.tierName}${colors.reset} — ${colors.gray}${this.description}${colors.reset}`
    );
  }

  public async test(
    id: string,
    description: string,
    testFn: () => void | Promise<void>
  ): Promise<TestCaseResult> {
    const t0 = performance.now();
    try {
      await testFn();
      const durationMs = Number((performance.now() - t0).toFixed(2));
      const res: TestCaseResult = { id, description, status: 'passed', durationMs };
      this.results.push(res);
      console.log(
        `  ${colors.green}✔${colors.reset} ${colors.bright}${id}${colors.reset}: ${description} ${colors.gray}(${durationMs}ms)${colors.reset}`
      );
      return res;
    } catch (err: any) {
      const durationMs = Number((performance.now() - t0).toFixed(2));
      const errorObj = err instanceof Error ? err : new Error(String(err));
      const res: TestCaseResult = {
        id,
        description,
        status: 'failed',
        durationMs,
        error: errorObj,
      };
      this.results.push(res);
      console.error(
        `  ${colors.red}✖ ${id}: ${description}${colors.reset} ${colors.gray}(${durationMs}ms)${colors.reset}`
      );
      console.error(`    ${colors.red}${errorObj.message}${colors.reset}`);
      if (errorObj.stack) {
        const stackLine = errorObj.stack.split('\n')[1] || '';
        console.error(`    ${colors.gray}${stackLine.trim()}${colors.reset}`);
      }
      return res;
    }
  }

  public getSummary(): TierSummary {
    if (this.endTime === 0) {
      this.endTime = performance.now();
    }
    const passed = this.results.filter((r) => r.status === 'passed').length;
    const failed = this.results.filter((r) => r.status === 'failed').length;
    const durationMs = Number((this.endTime - this.startTime).toFixed(2));

    return {
      tierNumber: this.tierNumber,
      tierName: this.tierName,
      description: this.description,
      total: this.results.length,
      passed,
      failed,
      durationMs,
      results: this.results,
    };
  }

  public printSummary(): TierSummary {
    const s = this.getSummary();
    const statusColor = s.failed === 0 ? colors.green : colors.red;
    console.log(
      `  ${statusColor}[TIER ${s.tierNumber}] Subtotal: ${s.total} executados | ${s.passed} passaram | ${s.failed} falhas (${s.durationMs}ms)${colors.reset}`
    );
    return s;
  }
}

// ============================================================================
// 5. HELPER DE CARREGAMENTO DO MOTOR DE JOGO (ESM DYNAMIC IMPORT)
// ============================================================================
export async function loadGameEngine() {
  const gameData = await import('../../../src/constants/gameData');
  const gameTypes = await import('../../../src/types/game');
  const services = await import('../../../src/firebase/services');
  return {
    ...gameData,
    ...gameTypes,
    ...services,
  };
}

// ============================================================================
// 6. RELATÓRIO FINAL CONSOLIDADO (TODOS OS TIERS)
// ============================================================================
export function printFinalReport(summaries: TierSummary[]): boolean {
  const total = summaries.reduce((acc, s) => acc + s.total, 0);
  const passed = summaries.reduce((acc, s) => acc + s.passed, 0);
  const failed = summaries.reduce((acc, s) => acc + s.failed, 0);
  const totalDurationMs = Number(summaries.reduce((acc, s) => acc + s.durationMs, 0).toFixed(2));
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

  console.log('\n' + '='.repeat(80));
  console.log(`          ${colors.bright}JOKENPO 2 — RESUMO DA EXECUÇÃO E2E (4 TIERS)${colors.reset}`);
  console.log('='.repeat(80));
  console.log(
    `  ${'Tier'.padEnd(30)} ${'Status'.padEnd(10)} ${'Total'.padStart(7)} ${'Passou'.padStart(8)} ${'Falhou'.padStart(8)} ${'Tempo'.padStart(9)}`
  );
  console.log('  ' + '-'.repeat(74));

  for (const s of summaries) {
    const status = s.failed === 0 ? `${colors.green}PASSOU${colors.reset}` : `${colors.red}FALHOU${colors.reset}`;
    const name = `Tier ${s.tierNumber} - ${s.tierName}`.padEnd(30);
    console.log(
      `  ${name} ${status.padEnd(19)} ${String(s.total).padStart(7)} ${String(s.passed).padStart(8)} ${String(s.failed).padStart(8)} ${(s.durationMs + 'ms').padStart(9)}`
    );
  }

  console.log('  ' + '-'.repeat(74));
  const overallStatus =
    failed === 0 ? `${colors.green}${colors.bright}PASSOU${colors.reset}` : `${colors.red}${colors.bright}FALHOU${colors.reset}`;
  console.log(
    `  ${'TOTAL'.padEnd(30)} ${overallStatus.padEnd(19)} ${String(total).padStart(7)} ${String(passed).padStart(8)} ${String(failed).padStart(8)} ${(totalDurationMs + 'ms').padStart(9)}`
  );
  console.log('='.repeat(80));
  console.log(`  Taxa de Aprovação: ${colors.bright}${passRate}%${colors.reset} (${passed}/${total} asserções aprovadas)`);
  if (failed === 0) {
    console.log(`  Status Final: ${colors.green}${colors.bright}SUCESSO TOTAL (Código de saída: 0)${colors.reset}`);
  } else {
    console.log(`  Status Final: ${colors.red}${colors.bright}FALHAS DETECTADAS (Código de saída: 1)${colors.reset}`);
  }
  console.log('='.repeat(80) + '\n');

  return failed === 0;
}

export { assert };
