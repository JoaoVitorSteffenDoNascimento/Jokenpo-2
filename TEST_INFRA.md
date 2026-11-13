# E2E Test Infra: Jokenpo 2

## Test Philosophy
- **Opaque-box & Requirement-Driven**: Derivado diretamente dos requisitos do usuário (`ORIGINAL_REQUEST.md`) e da especificação autoritativa das regras de jogo, sem acoplamento com internals de renderização visual ou dependências de rede externa.
- **Progressive Testability**: Os testes de níveis fundamentais (Tier 1) podem ser executados e validados imediatamente com contratos de regras puros, enquanto Tiers 2, 3 e 4 testam bordas, combinações e ciclos completos de jogo progressivamente.
- **Metodologia**: 4 Tiers estruturados baseados em Category-Partition, Análise de Valor Limite (BVA), Cobertura Combinatória Par-a-Par (Pairwise) e Testes de Carga/Workload do Mundo Real.

---

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Matriz Hexagonal de 6 Jogadas (36 combinações) | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 2 | Resolução Determinística (Win, Loss, Draw) | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 3 | Modos de Jogo (1v1, 2v2, 3v3) | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 4 | Formatos Competitivos (MD3 e MD5) | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 5 | Temporizador e Timeout de Turno (24s) | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 6 | Placar de Rodadas e Teto Anti-Loop (15 rodadas) | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 7 | Escala de 12 Elos Competitivos | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 8 | Economia de Moedas e Recompensas Pós-Partida | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 9 | Piso Zero de Troféus (Sem troféus negativos) | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 10 | Mecânica Anti-Tilt (Streak Recovery no 3º revés) | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 11 | Validação de Nickname e Associação com Turma | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ |
| 12 | Simulação de Partida Completa contra Bots | ORIGINAL_REQUEST §R2, §R3 | ≥5 | ≥5 | ✓ |

---

## Test Architecture

### 1. Test Runner & Invocation
- **Executor**: Node.js com TypeScript via `npx tsx` (ou `npm run test:e2e`).
- **Comando Unificado de Execução**: `npx tsx tests/e2e/run-all-e2e.ts`
- **Semântica de Saída**:
  - Código de saída `0`: Todos os testes passaram com sucesso (100% de aprovação).
  - Código de saída `1`: Qualquer falha de asserção, timeout ou exceção não tratada.
  - Relatório legível no console exibindo o total de testes executados, passaram, falharam e taxa de cobertura por Tier.

### 2. Formato dos Casos de Teste
- Cada teste define explicitamente:
  - `id`: Identificador único (ex: `T1-FEAT-001`, `T2-BND-010`, `T3-COMB-005`, `T4-SCEN-002`).
  - `description`: Descrição clara do que está sendo testado e por quê.
  - `inputs`: Parâmetros de entrada do teste (jogadas, perfis de jogador, histórico, configurações de sala).
  - `expected`: Resultado esperado determinístico (desfecho, saldo de troféus, vencedor, flags de anti-tilt).
  - `assertion`: Comparação estrita `assert.strictEqual` / `assert.deepStrictEqual`.

### 3. Estrutura de Diretórios
```
tests/e2e/
├── fixtures/
│   └── testProfiles.ts          # Perfis representativos de jogadores e turmas
├── tier1-features.test.ts       # Cobertura funcional básica (36 regras, modos, formatos)
├── tier2-boundaries.test.ts     # Casos de borda (piso zero, 3 derrotas, 15 rounds, timeout)
├── tier3-combinations.test.ts   # Combinações entre recursos (recompensas x elos x modos)
├── tier4-scenarios.test.ts      # Simulações de partidas completas E2E e ciclos de progressão
└── run-all-e2e.ts               # Runner unificado que executa todos os tiers e reporta métricas
```

---

## Detalhamento dos 4 Tiers

### Tier 1 — Cobertura de Funcionalidades (Feature Coverage)
- **Objetivo**: Validar cada funcionalidade em isolamento no caminho feliz (happy path).
- **Cobertura Mínima**: Pelo menos 5 testes por funcionalidade central:
  - F1 & F2: Vitórias temáticas de cada uma das 6 jogadas (`papel > parafal, pedra`, `parafal > jegue, pedra`, etc.), derrotas espelhadas e empates.
  - F3: Iniciação de partidas nos modos 1v1, 2v2 e 3v3.
  - F4: Formatos MD3 (vitória com 2 pontos) e MD5 (vitória com 3 pontos).
  - F5: Respeito à janela de 24 segundos e auto-descarte no timeout.
  - F6: Contagem de placar de rodadas consecutivas.
  - F7: Classificação correta nos 12 elos (Novato até Pro).
  - F8: Cálculo padrão de recompensas por vitória.

### Tier 2 — Casos de Borda e Corner Cases (Boundary Value Analysis)
- **Objetivo**: Testar limites inferiores, superiores, entradas inesperadas e condições extremas.
- **Cobertura Mínima**:
  - Limite inferior de troféus: Jogador com 0, 1 ou 5 troféus sofrendo derrota de -20 troféus (verificar que o saldo final é exatamente 0 e nunca negativo).
  - Mecânica Anti-Tilt (Streak Recovery): Jogador sofrendo a 3ª derrota consecutiva em ranqueada (recebe bônus de recuperação de troféus e moedas, resetando `lossStreak` para 0).
  - Teto de Empates Contínuos: Partida com 15 empates consecutivos em MD3/MD5 (verificar término forçado em 15 rodadas sem loop infinito).
  - Timeouts de Turno: Jogador sem seleção no turno de 24 segundos aciona descarte de carta válida sem congelar a partida.
  - Validação de Nickname: Testar nicknames com menos de 3 caracteres, mais de 20 caracteres, caracteres especiais proibidos e duplicatas com diferenças de caixa alta/baixa.
  - Turmas fora do catálogo: Rejeição de turmas inválidas fora das 16 turmas institucionais.

### Tier 3 — Combinações Cruzadas (Cross-Feature Pairwise)
- **Objetivo**: Validar a interação entre diferentes subsistemas quando operam simultaneamente.
- **Cobertura Mínima**:
  - Recompensa Pós-Partida x Elo Atual x Streak Anti-Tilt (ex: Novato sofrendo 3ª derrota vs Pro sofrendo 3ª derrota).
  - Modo 2v2/3v3 x Formato MD3/MD5 x Pareamento de Oponentes (verificar cálculo de pontos por time através da soma dos confrontos individuais).
  - Partida Amistosa (`isFriendly: true`) x Qualquer Modo/Formato (garantir que troféus não são alterados, mas moedas são concedidas).
  - Resgate de Caminho de Troféus x Progressão Recém-Alcançada.

### Tier 4 — Cenários Reais de Aplicação (Real-World Workloads)
- **Objetivo**: Executar fluxos realistas de ponta a ponta simulando a experiência completa de um jogador real.
- **Cenários Definidos**:
| # | Cenário | Funcionalidades Exercitadas | Complexidade |
|---|---------|-----------------------------|--------------|
| 1 | Duelo Completo 1v1 MD3 com vitória por 2 a 1 | F1, F2, F3, F4, F6, F8 | Média |
| 2 | Duelo Completo 1v1 MD5 com virada épica (3 a 2) | F1, F2, F3, F4, F6, F8 | Média |
| 3 | Batalha de Equipes 2v2 com pareamento e soma de pontos | F1, F2, F3, F4, F6, F8 | Alta |
| 4 | Batalha de Trios 3v3 com rodadas múltiplas | F1, F2, F3, F4, F6, F8 | Alta |
| 5 | Ciclo de Recuperação Anti-Tilt: Jogador sofre 2 derrotas, na 3ª ativa o bônus, e em seguida vence uma partida | F8, F9, F10, F7 | Alta |
| 6 | Partida com Sucessivos Empates atingindo o teto de 15 rodadas | F2, F4, F6 | Alta |

---

## Coverage Thresholds
- **Tier 1**: ≥ 5 testes por funcionalidade central (≥ 60 testes no total).
- **Tier 2**: ≥ 5 testes por categoria de borda (≥ 30 testes no total).
- **Tier 3**: ≥ 15 combinações cruzadas documentadas e testadas.
- **Tier 4**: ≥ 6 cenários realistas completos de ponta a ponta.
- **Meta Total Mínima**: ≥ 110 asserções de testes E2E executadas e aprovadas com 100% de sucesso.
