# Jokenpo 2 — Arena Escolar Online (3D & 2D)

Plataforma competitiva escolar de **Jokenpo 2** do Instituto Federal (`INF1M`–`INF4T` e `ETM1M`–`ETM4T`), com mesa 3D estilo *Liar's Bar* (Three.js PBR), modo tático 2D estilo *UNO*, **6 jogadas balanceadas em hexágono**, **12 Elos competitivos**, Caminho de Troféus, Loja de Skins 3D e Guerra das Turmas.

- **Jogar Online (GitHub Pages)**: [https://joaovitorsteffendonascimento.github.io/Jokenpo-2/](https://joaovitorsteffendonascimento.github.io/Jokenpo-2/)
- **Repositório Oficial**: [https://github.com/JoaoVitorSteffenDoNascimento/Jokenpo-2](https://github.com/JoaoVitorSteffenDoNascimento/Jokenpo-2)

---

## Hexágono das 6 Jogadas (Balanceamento Simétrico)

Cada uma das **6 jogadas** vence **2**, perde para **2** e **empata com 2** (ela mesma e o vértice oposto do hexágono):

| Jogada | Vence de (2) | Perde para (2) | Empata com (2) |
| :--- | :--- | :--- | :--- |
| **Papel** | Pedra, Jegue | Tesoura, Parafal | Papel, Gelo Invertido |
| **Parafal** | Papel, Tesoura | Pedra, Gelo Invertido | Parafal, Jegue |
| **Pedra** | Tesoura, Parafal | Papel, Gelo Invertido | Pedra, Jegue |
| **Gelo Invertido** | Pedra, Parafal | Tesoura, Jegue | Gelo Invertido, Papel |
| **Tesoura** | Papel, Gelo Invertido | Pedra, Parafal | Tesoura, Jegue |
| **Jegue** | Gelo Invertido, Jegue (Rival) | Papel | Jegue (Espelho), Pedra, Tesoura, Parafal |

---

## Modos de Jogo & Pareamento Tático

- **1v1 Solo** (`MD3` ou `MD5`)
- **2v2 Duplas** (`MD3` ou `MD5`) — O time com **maior soma de troféus** inicia a fase de pareamento escolhendo os confrontos individuais (`Enfrentar`) antes da escolha secreta das jogadas.
- **3v3 Trios** (`MD3` ou `MD5`) — Pareamento tático sequencial entre os 3 integrantes de cada equipe.
- **Partidas Valendo Troféus ou Amistosas** — Salas com código de 6 dígitos, Fila Pública, Convites de Amigos ou Treino contra Bots da Arena.

---

## Sistema de 12 Elos & Temporada Pro

| Elo | Faixa de Troféus | Categoria |
| :--- | :--- | :--- |
| **1. Novato** | `0 – 499` | Escolar |
| **2. Bixo** | `500 – 999` | Escolar |
| **3. Segundoanista** | `1.000 – 1.499` | Escolar |
| **4. Terceiranista** | `1.500 – 2.249` | Escolar |
| **5. Veterano** | `2.250 – 2.999` | Escolar |
| **6. Municipal** | `3.000 – 3.999` | Campeonato Regional+ |
| **7. Regional** | `4.000 – 4.999` | Campeonato Regional+ |
| **8. Estadual** | `5.000 – 5.999` | Campeonato Regional+ |
| **9. Nacional** | `6.000 – 7.499` | Campeonato Regional+ |
| **10. Continental** | `7.500 – 7.999` | Elite |
| **11. Global** | `8.000 – 9.999` | Elite |
| **12. Liga Pro** | `10.000+` | Liga Pro (Reset mensal para `10.000`) |

---

## Autenticação Híbrida (Google + Modo Arena Direto)

- **Login com Google (Firebase Auth + Firestore)**: sincroniza perfil, skins, histórico e salas online na nuvem.
- **Modo Arena Direto (Nickname + Turma)**: permite entrar imediatamente pelo navegador em qualquer domínio (incluindo GitHub Pages, `localhost` e dispositivos móveis PWA) com persistência local e sincronização entre abas via `BroadcastChannel`.

---

## Como Rodar Localmente

```bash
# 1. Instalar dependências
npm install --legacy-peer-deps

# 2. Iniciar servidor de desenvolvimento (http://localhost:3000)
npm run dev

# 3. Verificar tipagem TypeScript e gerar build de produção
npm run lint
npm run build
```
