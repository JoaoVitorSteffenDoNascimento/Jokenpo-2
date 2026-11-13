# Project: Jokenpo 2

## Architecture
- **Framework & Frontend**: React 19 + TypeScript 5 + Vite + Tailwind CSS v4.
- **3D & Visual Components**: Three.js (com shaders procedurais PBR, personagens realistas com olhos e respiração, mãos articuladas, iluminação de Saloon/Taverna VIP, partículas de poeira e velas animadas em `src/components/three/TableArena3D.tsx`, `CharacterCustomizer3D.tsx` e `TableEnvironment3D.ts`) com fallback 2D tático (`src/components/UnoTableStage.tsx`).
- **Game Engine & Rules**: Motor hexagonal brasileiro de 6 jogadas (`papel`, `parafal`, `pedra`, `gelo_invertido`, `tesoura`, `jegue`) em `src/constants/gameData.ts` e `resolveMovePair()`.
- **Matchmaking & Modes**: Duelos 1v1, 2v2 e 3v3 nos formatos MD3 e MD5; modos offline com bots humanizados e multiplayer com salas públicas/privadas.
- **Persistência Híbrida**: Firebase Firestore / Auth na nuvem com fallback autônomo offline `Local Arena Mode` (`localStorage` + `BroadcastChannel`) em `src/firebase/services.ts`.
- **Áudio & Efeitos**: Síntese procedural nativa via Web Audio API (`src/utils/soundFx.ts`) e hápticos seguros (`src/utils/haptics.ts`).
- **Fullscreen & Safe Area**: Fullscreen API automático ao entrar na Arena com toggle manual/ESC e layout anti-clipping com safe-padding superior para o HUD.

## Code Layout
```
/home/brendha/.gemini/antigravity/scratch/jokenpo-2/
├── index.html                 # Ponto de entrada HTML
├── package.json               # Configurações de dependências e scripts npm
├── vite.config.ts             # Configuração do Vite e plugins (React, Tailwind)
├── tsconfig.json              # Configurações do TypeScript
├── public/                    # Manifest PWA, service worker e favicons
├── src/
│   ├── main.tsx               # Ponto de entrada React
│   ├── App.tsx                # Componente raiz, controle de abas e autenticação
│   ├── types/game.ts          # Definições de tipos (MoveId, Elo, Room, Turma, etc.)
│   ├── constants/gameData.ts  # Matriz hexagonal de regras, Elos, Skins, Auras, Temas
│   ├── components/            # Componentes de UI (ArenaView, LobbyView, Rankings, etc.)
│   │   ├── three/             # Visualização 3D Three.js rica (cenário, avatares, partículas, mãos)
│   │   └── UnoTableStage.tsx  # Visualização 2D leve
│   ├── firebase/services.ts   # Camada de serviços Firebase e Local Arena híbrido
│   └── utils/                 # Efeitos sonoros procedurais e hápticos
├── tests/                     # Suíte de testes automatizados unitários, integração e E2E
└── .agents/teamwork/          # Metadados e coordenação de agentes
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Matriz Hexagonal de 6 Jogadas | Lógica do Jokenpo 2 com 6 jogadas (Papel, Parafal, Pedra, Gelo Invertido, Tesoura, Jegue) | M2 | survey |
| 2 | Resolução Determinística (36 combinações) | Função resolveMovePair com 12 vitórias, 12 derrotas, 6 empates espelho e 6 empates neutros | M2 | survey |
| 3 | Duelo 1v1 | Confronto individual direto (MD3/MD5) com cálculo de rodadas | M2 | survey |
| 4 | Duelo 2v2 em Duplas | Fase de pareamento tático e confrontos individuais com soma de pontos | M2 | survey |
| 5 | Duelo 3v3 em Trios | Fase de pareamento e confrontos de trios | M2 | survey |
| 6 | Formato Melhor de 3 (MD3) | Vencedor ao atingir 2 rodadas ganhas (limite 15 rodadas) | M2 | survey |
| 7 | Formato Melhor de 5 (MD5) | Vencedor ao atingir 3 rodadas ganhas (limite 15 rodadas) | M2 | survey |
| 8 | Modo Offline com Bots | Bots locais simulados com nomes, skins e jogadas | M2 | survey |
| 9 | Fila Pública de Matchmaking | Busca e pareamento instantâneo de salas públicas | M2 | survey |
| 10 | Salas Privadas por Código | Criação e entrada por código de 4 a 6 dígitos | M2 | survey |
| 11 | Desafio Direto a Amigos | Convites de duelo para contatos adicionados | M2 | survey |
| 12 | Mesa 3D Three.js PBR | Renderização 3D imersiva com totens e avatares | M1 | survey |
| 13 | Mesa 2D UnoTableStage | Visualização em mesa de feltro 2D com suporte a navegadores sem GPU | M1 | survey |
| 14 | Efeitos Sonoros Procedurais | Síntese de áudio via Web Audio API sem arquivos externos | M1 | survey |
| 15 | Vibração Háptica | Feedback tátil seguro com fallback para navegadores sem suporte | M1 | survey |
| 16 | Temporizador de Turno (24s) | Timeout automático para auto-descarte de carta | M2 | survey |
| 17 | Overlay de Revelação de Cartas | Resumo com justificativas temáticas do confronto | M2 | survey |
| 18 | Escala de 12 Elos Competitivos | Novato até Pro com cálculo de progresso | M2 | survey |
| 19 | Caminho de Troféus (11 Marcos) | Recompensas de moedas e skins por troféus acumulados | M2 | survey |
| 20 | Recompensa Diária de Login (150 moedas) | Resgate de moedas a cada 24 horas | M2 | survey |
| 21 | Cálculo de Recompensas Pós-Partida | Troféus e moedas por modo e formato com piso zero | M2 | survey |
| 22 | Mecânica Anti-Tilt (Streak Recovery) | Bônus de recuperação na 3ª derrota consecutiva | M2 | survey |
| 23 | Temporada Pro Mensal | Reset mensal para jogadores com 10.000+ troféus | M2 | survey |
| 24 | Loja de 18 Skins de Cartas | 3 variantes para cada uma das 6 jogadas com compra por moedas | M2 | survey |
| 25 | Estúdio 3D de Personagens | Customização completa de avatar 3D (arquétipos, trajes, armas) | M1 | survey |
| 26 | Ranking Top Global | Classificação geral por troféus | M2 | survey |
| 27 | Ranking Regional por Turma | Classificação específica para turmas INF e ETM | M2 | survey |
| 28 | Guerra das Turmas | Classificação agregada entre as 16 turmas escolares | M2 | survey |
| 29 | Gerenciamento de Amizades | Envio, aceite e recusa de amigos por nickname | M2 | survey |
| 30 | Autenticação Google & Local Arena | Login via conta Google ou modo local anônimo com persistência | M1 | survey |
| 31 | Cadastro e Validação de Nickname | Regex de 3-20 caracteres e unicidade insensível a maiúsculas | M2 | survey |
| 32 | Vínculo com Turma Escolar | Associação obrigatória com uma das 16 turmas do IF | M2 | survey |
| 33 | Diagrama Interativo do Hexágono | Modal interativo demonstrando todas as vantagens das 6 jogadas | M1 | survey |
| 34 | PWA e Suporte Offline | Manifest web e service worker | M1 | survey |
| 35 | Histórico Recente de Partidas | Registro dos últimos 20 confrontos | M2 | survey |
| 36 | Fullscreen Automático na Arena | Fullscreen API ao entrar na partida com suporte a ESC e botão toggle | M3 | follow-up |
| 37 | HUD Anti-Clip Safe Area | Safe-area padding e layout responsivo que impede corte do timer, mesa e placar | M3 | follow-up |
| 38 | Modelagem 3D Enriquecida de Personagens | Cabeças estilizadas, olhos que piscam e olham para cartas, chapéus e jaquetas detalhados | M4 | follow-up |
| 39 | Expressões & Animações Corporais de Reação | Respiração contínua, inclinação ao jogar e reações emotivas de vitória/derrota | M4 | follow-up |
| 40 | Mãos Articuladas 1ª e 3ª Pessoa | Dedos articulados, punhos e animações de hover, seleção e arremesso suave de carta | M4 | follow-up |
| 41 | Cenário 3D Atmosférico Saloon/Taverna VIP | Mesa detalhada madeira/mármore com borda metálica, iluminação dramática e sombras suaves | M4 | follow-up |
| 42 | Partículas de Poeira Dourada & Chamas de Velas | Sistemas de partículas atmosféricas e chamas animadas na cena Three.js | M4 | follow-up |
| 43 | Cartas 3D com Relevo & Onda de Choque de Clash | Relevo/brilho nas cartas e impacto de choque expansivo na mesa durante o clash | M4 | follow-up |
| 44 | Design AAA do Site & Micro-Interações | Glassmorphism refinado, transições fluidas, micro-interações e clash cinematográfico | M3 | follow-up |
| 45 | Expansão de Customização (Auras, Expressões, Mesas) | Mais opções de customização cosmética de avatares, temas de mesa e efeitos de carta | M3 | follow-up |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Ambiente, Dependências e Correção de Tipos | Ajuste no package.json/typescript, instalação limpa de dependências com `--legacy-peer-deps`, correção do bug de tipo em `ArenaView.tsx:76` e validação de `npm run lint` e `npm run build` | none | DONE |
| M2 | Suíte de Testes e Validação de Regras | Suíte de 131 testes automatizados reais nos 4 Tiers, 100% aprovada, cobrindo as 36 regras hexagonais, elos, economia e anti-tilt | M1 | DONE |
| M3 | Fullscreen, HUD Anti-Clip & Design AAA / Customização | Fullscreen API com botão toggle/ESC, correção do HUD clipado, layout safe-area, design glassmorphism refinado, clash cinematográfico e expansão de customização | M1 | DONE |
| M4 | Modelagem 3D & Cenário Tridimensional Imersivo | Geometria 3D de personagens (olhos piscando, respiração, reações), mãos articuladas com arremesso, cenário Saloon/Taverna VIP com velas, poeira dourada e choque de colisão de cartas | M1 | IN_PROGRESS |
| M5 | Validação E2E, Integração Total e Hardening Adversarial | Execução e aprovação de 100% dos testes E2E (Tiers 1-4) e hardening adversarial (Tier 5) | M2, M3, M4, TEST_READY | IN_PROGRESS |

## Interface Contracts
### `src/constants/gameData.ts` ↔ `src/components/ArenaView.tsx` & Test Suites
- `resolveMovePair(moveA: MoveId, moveB: MoveId): PairClashResult`
  - Retorna `{ outcomeForA: 'win' | 'loss' | 'draw', reason: string }`
  - Determinístico para todas as 36 permutações de `MoveId`.
- `calculateMatchReward(player: PlayerProfile, outcome: 'win' | 'loss' | 'draw', mode: MatchMode, format: MatchFormat, isFriendly?: boolean): MatchRewardResult`
  - Garante piso zero de troféus e bônus de recuperação caso `lossStreak + 1 >= 3`.
- `getEloInfo(trophies: number): EloInfo`
  - Retorna o tier atual entre os 12 Elos, progresso percentual e troféus necessários para o próximo tier.
### Fullscreen & HUD Contract
- `ArenaView.tsx` deve gerenciar `isFullscreen: boolean`, listener de `fullscreenchange` e `Escape`, e estilizar o container raiz como `fixed inset-0 z-50 w-screen h-screen overflow-hidden bg-slate-950` com padding superior seguro (`pt-safe pt-4 md:pt-6`) garantindo visibilidade total do topo.
### 3D Scene Contract (`TableArena3D.tsx` / `three/`)
- Módulos de Three.js devem suportar renderização contextual com luzes dinâmicas, partículas procedurais e animação em `requestAnimationFrame`, mantendo compatibilidade com `detectSoftwareGl()` para fallback automático 2D caso WebGL não esteja disponível.
