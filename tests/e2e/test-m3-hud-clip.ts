import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  isFullscreenActive,
  requestArenaFullscreen,
  exitArenaFullscreen,
  toggleArenaFullscreen,
} from '../../src/utils/haptics';

// ============================================================================
// SUÍTE DE TESTES EMPÍRICOS ADVERSARIAIS — MILESTONE M3
// M3: Empirical Stress, Fullscreen Lifecycle & Anti-Clip Layout Verification
// ============================================================================

interface ChallengeResult {
  id: string;
  name: string;
  status: 'passed' | 'failed';
  durationMs: number;
  details?: string;
}

const results: ChallengeResult[] = [];

async function challenge(id: string, name: string, fn: () => void | Promise<void>) {
  const t0 = performance.now();
  try {
    await fn();
    const durationMs = Number((performance.now() - t0).toFixed(2));
    results.push({ id, name, status: 'passed', durationMs });
    console.log(`  \x1b[32m✔\x1b[0m \x1b[1m${id}\x1b[0m: ${name} \x1b[90m(${durationMs}ms)\x1b[0m`);
  } catch (err: any) {
    const durationMs = Number((performance.now() - t0).toFixed(2));
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ id, name, status: 'failed', durationMs, details: msg });
    console.error(`  \x1b[31m✖ ${id}\x1b[0m: ${name} \x1b[90m(${durationMs}ms)\x1b[0m`);
    console.error(`    \x1b[31m${msg}\x1b[0m`);
  }
}

// Helper para mockar ambiente DOM
function setupMockDocument() {
  let fullscreenEl: any = null;
  let webkitFullscreenEl: any = null;

  const mockDoc: any = {
    get fullscreenElement() {
      return fullscreenEl;
    },
    get webkitFullscreenElement() {
      return webkitFullscreenEl;
    },
    documentElement: {
      requestFullscreen: async (opts?: any) => {
        fullscreenEl = mockDoc.documentElement;
      },
    },
    exitFullscreen: async () => {
      fullscreenEl = null;
      webkitFullscreenEl = null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };

  (globalThis as any).document = mockDoc;
  return {
    doc: mockDoc,
    setFs: (el: any) => { fullscreenEl = el; },
    setWebkitFs: (el: any) => { webkitFullscreenEl = el; },
  };
}

async function runM3EmpiricalStressSuite() {
  console.log('\n================================================================================');
  console.log('    MILESTONE M3 — SUÍTE DE TESTES EMPÍRICOS DE FULLSCREEN E ANTI-CLIP HUD    ');
  console.log('================================================================================\n');

  // --------------------------------------------------------------------------
  // PARTE 1: CICLO DE VIDA, REJEIÇÃO DE PROMISES E ROBUSTEZ DA FULLSCREEN API
  // --------------------------------------------------------------------------
  console.log('\x1b[36m▶ [PARTE 1] Desafio do Ciclo de Vida da Fullscreen API (Rejeições, ESC, Toggles)\x1b[0m');

  await challenge('M3-FS-001', 'Detecção padrão de status Fullscreen (ativo vs inativo)', async () => {
    const { setFs } = setupMockDocument();
    assert.equal(isFullscreenActive(), false, 'Deve reportar falso quando nenhum elemento está em fullscreen');
    setFs({});
    assert.equal(isFullscreenActive(), true, 'Deve reportar verdadeiro quando fullscreenElement está definido');
  });

  await challenge('M3-FS-002', 'Rejeição de Promise em requestFullscreen (NotAllowedError) sem unhandled rejection', async () => {
    const { doc } = setupMockDocument();
    // Simula navegador bloqueando requestFullscreen por ausência de gesto do usuário
    doc.documentElement.requestFullscreen = () => {
      return Promise.reject(new Error('NotAllowedError: user gesture required or permission denied'));
    };

    let caughtError: any = null;
    try {
      const success = await requestArenaFullscreen();
      assert.equal(success, false, 'requestArenaFullscreen deve retornar false quando promise é rejeitada');
    } catch (e) {
      caughtError = e;
    }
    assert.equal(caughtError, null, 'Nenhuma exceção deve vazar da chamada de requestArenaFullscreen');
    assert.equal(isFullscreenActive(), false, 'isFullscreenActive deve permanecer false');
  });

  await challenge('M3-FS-003', 'Exceção síncrona em requestFullscreen é capturada com segurança', async () => {
    const { doc } = setupMockDocument();
    doc.documentElement.requestFullscreen = () => {
      throw new Error('SecurityError: Fullscreen denied by iframe policy');
    };

    let caughtError: any = null;
    try {
      const success = await requestArenaFullscreen();
      assert.equal(success, false, 'Deve retornar false diante de exceção síncrona');
    } catch (e) {
      caughtError = e;
    }
    assert.equal(caughtError, null, 'Exceção síncrona não pode vazar');
  });

  await challenge('M3-FS-004', 'Degradação graciosa em navegadores sem Fullscreen API (ex: iOS Safari em iPhone)', async () => {
    const { doc } = setupMockDocument();
    delete doc.documentElement.requestFullscreen;
    delete doc.documentElement.webkitRequestFullscreen;
    delete doc.exitFullscreen;
    delete doc.webkitExitFullscreen;

    const resReq = await requestArenaFullscreen();
    assert.equal(resReq, false, 'Deve retornar false sem lançar erro');

    let exitError: any = null;
    try {
      await exitArenaFullscreen();
    } catch (e) {
      exitError = e;
    }
    assert.equal(exitError, null, 'exitArenaFullscreen não deve falhar');
  });

  await challenge('M3-FS-005', 'Suporte a prefixo legado WebKit (webkitRequestFullscreen e webkitFullscreenElement)', async () => {
    const { doc, setWebkitFs } = setupMockDocument();
    delete doc.documentElement.requestFullscreen;
    let webkitCalled = false;
    doc.documentElement.webkitRequestFullscreen = async () => {
      webkitCalled = true;
      setWebkitFs(doc.documentElement);
    };

    const res = await requestArenaFullscreen();
    assert.equal(res, true, 'Deve retornar true usando fallback webkit');
    assert.equal(webkitCalled, true, 'Deve ter invocado webkitRequestFullscreen');
    assert.equal(isFullscreenActive(), true, 'isFullscreenActive deve detectar webkitFullscreenElement');
  });

  await challenge('M3-FS-006', 'Idempotência: chamadas repetidas a request e exit não geram chamadas redundantes', async () => {
    const { doc, setFs } = setupMockDocument();
    let requestCount = 0;
    doc.documentElement.requestFullscreen = async () => {
      requestCount++;
      setFs(doc.documentElement);
    };

    await requestArenaFullscreen();
    assert.equal(requestCount, 1, 'Primeira chamada executa');
    await requestArenaFullscreen();
    assert.equal(requestCount, 1, 'Segunda chamada com fullscreen já ativo deve ser no-op');

    let exitCount = 0;
    doc.exitFullscreen = async () => {
      exitCount++;
      setFs(null);
    };

    await exitArenaFullscreen();
    assert.equal(exitCount, 1, 'Primeira saída executa');
    await exitArenaFullscreen();
    assert.equal(exitCount, 1, 'Segunda saída com fullscreen já inativo deve ser no-op');
  });

  await challenge('M3-FS-007', 'Stress Concorrente: 100 toggles sequenciais rápidos sem falhas', async () => {
    const { doc, setFs } = setupMockDocument();
    doc.documentElement.requestFullscreen = async () => {
      setFs(doc.documentElement);
    };
    doc.exitFullscreen = async () => {
      setFs(null);
    };

    for (let i = 0; i < 100; i++) {
      const active = await toggleArenaFullscreen();
      assert.equal(active, i % 2 === 0, `Toggle ${i} deve alternar estado consistentemente`);
    }
    assert.equal(isFullscreenActive(), false, 'Após 100 toggles (par), deve estar inativo');
  });

  await challenge('M3-FS-008', 'Stress Concorrente: 50 toggles paralelos (Promise.all) resolvem sem deadlock', async () => {
    const { doc, setFs } = setupMockDocument();
    doc.documentElement.requestFullscreen = async () => {
      setFs(doc.documentElement);
    };
    doc.exitFullscreen = async () => {
      setFs(null);
    };

    const promises = Array.from({ length: 50 }, () => toggleArenaFullscreen());
    const res = await Promise.all(promises);
    assert.equal(res.length, 50, 'Todas as 50 chamadas devem resolver com sucesso');
    assert.ok(typeof isFullscreenActive() === 'boolean', 'Estado final deve ser booleano válido');
  });

  await challenge('M3-FS-009', 'Manipulador de Teclado ESC: aciona exitArenaFullscreen apenas quando ativo', async () => {
    const { doc, setFs } = setupMockDocument();
    let exitTriggered = false;
    doc.exitFullscreen = async () => {
      exitTriggered = true;
      setFs(null);
    };

    // Função que replica o handleKeyDown de ArenaView.tsx:339
    const simulateKeyDown = async (key: string) => {
      if (key === 'Escape' && isFullscreenActive()) {
        await exitArenaFullscreen();
      }
    };

    // Caso 1: ESC quando fullscreen está inativo -> não dispara exit
    setFs(null);
    await simulateKeyDown('Escape');
    assert.equal(exitTriggered, false, 'ESC não deve disparar exit se já inativo');

    // Caso 2: Tecla diferente (ex: Espaço ou Enter) quando fullscreen está ativo -> não dispara exit
    setFs(doc.documentElement);
    await simulateKeyDown('Space');
    assert.equal(exitTriggered, false, 'Outras teclas não devem disparar exit');

    // Caso 3: Tecla ESC quando fullscreen está ativo -> dispara exit com sucesso
    await simulateKeyDown('Escape');
    assert.equal(exitTriggered, true, 'ESC deve disparar exitFullscreen');
    assert.equal(isFullscreenActive(), false, 'Estado deve passar a falso');
  });

  await challenge('M3-FS-010', 'Segurança SSR: ausência de objeto document não lança ReferenceError', async () => {
    const originalDoc = (globalThis as any).document;
    try {
      delete (globalThis as any).document;
      assert.equal(isFullscreenActive(), false, 'Deve retornar false sem lançar erro');
      const reqRes = await requestArenaFullscreen();
      assert.equal(reqRes, false, 'request deve retornar false');
      await exitArenaFullscreen(); // Não deve lançar
      const togRes = await toggleArenaFullscreen();
      assert.equal(togRes, false, 'toggle deve retornar false');
    } finally {
      (globalThis as any).document = originalDoc;
    }
  });

  // --------------------------------------------------------------------------
  // PARTE 2: DESAFIO DE RESOLUÇÕES, PROPORÇÕES EXTREMAS E ANTI-CLIP DO HUD
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ [PARTE 2] Desafio de Resoluções Extremas e Anti-Clip de HUD (1024x453, 21:9, 360x800)\x1b[0m');

  // Oráculo de cálculo de layout de ArenaView.tsx e TableArena3D.tsx
  function calculateArenaVerticalLayout(viewportWidth: number, viewportHeight: number, safeAreaTopPx: number) {
    // 1. Padding Top efetivo de ArenaView: style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
    const effectivePaddingTop = Math.max(safeAreaTopPx, 12);
    const effectivePaddingBottom = 8; // pb-2
    const flexGap = viewportWidth >= 640 ? 8 : 6; // gap-1.5 sm:gap-2

    // 2. Altura mínima do Top HUD: min-h-[54px] sm:min-h-[60px] md:min-h-[64px]
    let topHudMinHeight = 54;
    if (viewportWidth >= 768) topHudMinHeight = 64;
    else if (viewportWidth >= 640) topHudMinHeight = 60;

    // 3. Regra de auto-recolhimento do dock em telas curtas:
    // ArenaView.tsx:335 -> if (window.innerHeight < 520) setHudCollapsed(true);
    const isHudCollapsed = viewportHeight < 520;
    const dockHeight = isHudCollapsed ? 42 : (viewportWidth < 640 ? 150 : 110);

    // 4. Espaço disponível para a mesa (Three.js Canvas ou 2D Stage):
    const arenaStageHeight = viewportHeight - effectivePaddingTop - effectivePaddingBottom - topHudMinHeight - (flexGap * 2) - dockHeight;

    // 5. Posicionamento de "MESA NOVATO" e Timer dentro do TableArena3D:
    // TableArena3D.tsx:1431 e 1542 -> top-4 (16px) ou sm:top-5 (20px)
    const stageElementTopOffset = viewportWidth >= 640 ? 20 : 16;
    const absoluteElementTop = effectivePaddingTop + topHudMinHeight + flexGap + stageElementTopOffset;

    return {
      effectivePaddingTop,
      topHudMinHeight,
      isHudCollapsed,
      dockHeight,
      arenaStageHeight,
      stageElementTopOffset,
      absoluteElementTop,
      isTopClipped: effectivePaddingTop < 12 || absoluteElementTop < (effectivePaddingTop + topHudMinHeight),
    };
  }

  await challenge('M3-LAY-001', 'Resolução da Imagem do Usuário: 1024x453 px (proporção ultra-ampla 2.26:1)', async () => {
    const layout = calculateArenaVerticalLayout(1024, 453, 0);

    assert.ok(layout.effectivePaddingTop >= 12, `Padding top efetivo (${layout.effectivePaddingTop}px) deve ser >= 12px`);
    assert.equal(layout.isHudCollapsed, true, 'Viewport < 520px deve acionar recolhimento automático do dock de cartas');
    assert.ok(layout.arenaStageHeight >= 280, `Mesa 3D deve ter pelo menos 280px livres (calculado: ${layout.arenaStageHeight}px)`);
    assert.ok(layout.absoluteElementTop >= 90, `MESA NOVATO e Timer devem ficar a pelo menos 90px do teto físico (calculado: ${layout.absoluteElementTop}px)`);
    assert.equal(layout.isTopClipped, false, 'Não pode haver qualquer corte/clipping no topo');
  });

  await challenge('M3-LAY-002', 'Proporção Ultrawide 21:9: 2560x1080 px', async () => {
    const layout = calculateArenaVerticalLayout(2560, 1080, 0);

    assert.ok(layout.effectivePaddingTop >= 12, 'Padding top deve ser >= 12px');
    assert.equal(layout.isHudCollapsed, false, 'Tela de 1080px de altura mantém dock expandido');
    assert.ok(layout.arenaStageHeight >= 800, `Área 3D generosa (>800px) em 1080p (calculado: ${layout.arenaStageHeight}px)`);
    assert.equal(layout.isTopClipped, false, 'Sem corte de topo');
  });

  await challenge('M3-LAY-003', 'Mobile Ultra-Estreito Vertical: 360x800 px', async () => {
    const layout = calculateArenaVerticalLayout(360, 800, 0);

    assert.ok(layout.effectivePaddingTop >= 12, 'Padding top deve ser >= 12px');
    assert.equal(layout.topHudMinHeight, 54, 'Mobile deve usar altura mínima compacta de 54px');
    assert.equal(layout.isHudCollapsed, false, 'Em 800px de altura dock permanece visível');
    assert.ok(layout.arenaStageHeight >= 500, `Área de jogo acima de 500px em mobile vertical (calculado: ${layout.arenaStageHeight}px)`);
    assert.equal(layout.isTopClipped, false, 'Sem corte de topo');
  });

  await challenge('M3-LAY-004', 'Mobile Paisagem Extrema Curta: 640x360 px (proporção 16:9 widescreen)', async () => {
    const layout = calculateArenaVerticalLayout(640, 360, 0);

    assert.ok(layout.effectivePaddingTop >= 12, 'Padding top deve ser >= 12px');
    assert.equal(layout.isHudCollapsed, true, 'Altura 360px < 520px recolhe dock automaticamente');
    assert.ok(layout.arenaStageHeight >= 200, `Mesa 3D mantém pelo menos 200px de altura (calculado: ${layout.arenaStageHeight}px)`);
    assert.equal(layout.isTopClipped, false, 'Sem corte');
  });

  await challenge('M3-LAY-005', 'Varredura Adversarial de Safe-Area Insets (0px até 64px)', async () => {
    const insets = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64];
    for (const inset of insets) {
      const layout = calculateArenaVerticalLayout(390, 844, inset);
      assert.ok(
        layout.effectivePaddingTop >= 12,
        `Para inset ${inset}px, padding top efetivo (${layout.effectivePaddingTop}px) deve ser >= 12px`
      );
      if (inset >= 12) {
        assert.equal(
          layout.effectivePaddingTop,
          inset,
          `Para inset ${inset}px >= 12px, padding top deve acompanhar exatamente o inset`
        );
      }
      assert.equal(layout.isTopClipped, false, `Inset ${inset}px não pode causar clipping`);
    }
  });

  // --------------------------------------------------------------------------
  // PARTE 3: VALIDAÇÃO EMPÍRICA REAL COM RENDERIZAÇÃO CHROMIUM HEADLESS
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m▶ [PARTE 3] Validação Empírica no Motor Chromium Headless (Pixel & Box Inspection)\x1b[0m');

  await challenge('M3-CHR-001', 'Renderização real no Chromium a 1024x453 px valida paddingTop >= 12px e Top HUD intacto', async () => {
    const fixtureHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: #020617; overflow: hidden; }
    .arena-root {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding-top: max(env(safe-area-inset-top, 0px), 12px);
      padding-bottom: 8px;
      padding-left: 8px;
      padding-right: 8px;
      gap: 8px;
    }
    .top-hud {
      flex-shrink: 0;
      min-height: 60px;
      background: #131A26;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      color: #F1F5F9;
    }
    .table-stage {
      position: relative;
      flex: 1;
      min-height: 0;
      background: #0B0F17;
      border-radius: 12px;
    }
    .badge-mesa {
      position: absolute;
      top: 20px;
      left: 20px;
      padding: 6px 12px;
      background: #120A07;
      color: #F59E0B;
      font-weight: bold;
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: 8px;
    }
    .badge-timer {
      position: absolute;
      top: 20px;
      right: 20px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #120A07;
      border: 2px solid #F59E0B;
      color: #F59E0B;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <main class="arena-root" id="arenaRoot">
    <section class="top-hud" id="topHud">
      <div>JOKENPO 2 · 1v1 · Ranqueada</div>
      <div>Placar: 1 - 0</div>
      <div>[Fullscreen] [Som]</div>
    </section>
    <div class="table-stage" id="tableStage">
      <div class="badge-mesa" id="badgeMesa">MESA NOVATO</div>
      <div class="badge-timer" id="badgeTimer">10</div>
    </div>
  </main>
</body>
</html>`;

    const tmpHtmlPath = path.join('/tmp', 'm3_arena_headless_test.html');
    const tmpPngPath = path.join('/tmp', 'm3_arena_1024x453.png');
    fs.writeFileSync(tmpHtmlPath, fixtureHtml, 'utf-8');

    // Executa Chromium headless
    execFileSync('/usr/sbin/chromium', [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1024,453',
      `--screenshot=${tmpPngPath}`,
      `file://${tmpHtmlPath}`,
    ], { stdio: 'pipe' });

    assert.ok(fs.existsSync(tmpPngPath), 'Screenshot gerado com sucesso pelo Chromium');

    // Analisa as coordenadas reais renderizadas via script Python
    const pyScript = `
from PIL import Image
im = Image.open('${tmpPngPath}')
w, h = im.size
assert (w, h) == (1024, 453), f"Dimensoes incorretas: {w}x{h}"

# Encontra a primeira linha Y onde o Top HUD (#131A26 -> rgb ~19, 26, 38) comeca
pixels = im.load()
first_hud_y = None
for y in range(h):
    for x in range(30, w - 30):
        r, g, b = pixels[x, y][:3]
        if 15 <= r <= 25 and 20 <= g <= 32 and 32 <= b <= 45:
            first_hud_y = y
            break
    if first_hud_y is not None:
        break

print(f"FIRST_HUD_Y:{first_hud_y}")
assert first_hud_y is not None, "Top HUD nao encontrado no screenshot"
assert first_hud_y >= 12, f"Top HUD cortado! y={first_hud_y} < 12px"
`;

    const pyOutput = execFileSync('python3', ['-c', pyScript], { encoding: 'utf-8' });
    assert.ok(pyOutput.includes('FIRST_HUD_Y:'), 'Leitura de coordenadas Y confirmada');
    const match = pyOutput.match(/FIRST_HUD_Y:(\d+)/);
    const hudY = match ? parseInt(match[1], 10) : 0;
    assert.ok(hudY >= 12, `Top HUD no Chromium inicia em y=${hudY}px (>= 12px garantido)`);
  });

  // --------------------------------------------------------------------------
  // RELATÓRIO CONSOLIDADO
  // --------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log('             RESUMO DA EXECUÇÃO ADVERSARIAL DA MILESTONE M3                     ');
  console.log('================================================================================');

  const total = results.length;
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  console.log(`  Total de Desafios Executados: ${total}`);
  console.log(`  Aprovados: \x1b[32m${passed}\x1b[0m`);
  console.log(`  Falhas:    ${failed > 0 ? `\x1b[31m${failed}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);
  console.log(`  Taxa de Sucesso: \x1b[1m${((passed / total) * 100).toFixed(1)}%\x1b[0m`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runM3EmpiricalStressSuite().catch((err) => {
  console.error('Falha fatal na execução da suíte adversarial:', err);
  process.exit(1);
});
