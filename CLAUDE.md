# CLAUDE.md — Xadrez Arena

Guia de desenvolvimento para o agente Claude. Contexto completo do projeto para continuação de sessões.

---

## Modo de trabalho autônomo (IMPORTANTE)

Quando o usuário pedir "continue melhorando", "incremente até esgotar créditos" ou variação:

1. **Trabalhe em loop contínuo** — termine uma feature, escolha a próxima sozinho, e siga sem perguntar. Só pare se: (a) o usuário interromper, (b) ele explicitar uma tarefa específica diferente, ou (c) build/TS quebrar repetidamente.
2. **Cace funcionalidades** — olhe o estado atual, identifique lacunas (UX, polish, features faltando vs concorrentes lichess/chess.com), proponha e implemente. Mantenha TaskCreate/TaskUpdate atualizado.
3. **Commit a cada passo concluído** — assim que uma feature builda limpa (TypeScript sem erros, `npm run build` OK), faça commit imediatamente. Isso garante que se a conexão cair, nenhum raciocínio é perdido. **Push para `main` também** — branch principal é `main` e merge direto é OK pra este projeto.
4. **Atualize `README.md`** a cada commit relevante (feature visível ao usuário) — entradas novas em "Recursos", remova TODOs concluídos.
5. **Atualize `CLAUDE.md`** sempre que adicionar:
   - Nova migration de DB (descrever colunas/RPCs)
   - Novo padrão de arquitetura
   - Comportamento não-óbvio que sessão futura precisa saber
   - Mas NÃO precisa atualizar pra polish/bugfix triviais.
6. **Ordem ideal por iteração**: implementar → `npm run build` → commit → push → README+CLAUDE se necessário → próxima feature.
7. **Granularidade de commit**: um commit por feature/melhoria autocontida. Mensagens curtas no padrão `feat:`/`fix:`/`docs:`/`refactor:` (estilo já existente no repo).
8. **Não pule hooks ou `--no-verify`** — se um pre-commit hook quebrar, corrija a raiz.

## Visão geral

Plataforma de xadrez multiplayer com apostas em coins. Stack: **Next.js 14 (App Router) + TypeScript + Tailwind + Supabase + NextAuth + chess.js + react-chessboard**.

URL de produção: https://xadrez-arena-zeta.vercel.app  
Branch de desenvolvimento: `claude/layout-design-board-optimization-1731ke`

---

## Arquitetura de arquivos

```
src/
├── app/
│   ├── page.tsx                    # Landing page (redireciona autenticados → /lobby)
│   ├── globals.css                 # Tailwind + componentes customizados + scrollbar
│   ├── layout.tsx                  # Root layout (html, body, globals)
│   ├── login/page.tsx              # Página de login (NextAuth credentials)
│   ├── register/page.tsx           # Registro (chama RPC chess_register_user)
│   ├── (app)/                      # Rotas autenticadas (verifica sessão no layout)
│   │   ├── layout.tsx              # Header sticky + NavLinks + saldo da carteira
│   │   ├── lobby/
│   │   │   ├── page.tsx            # force-dynamic, renderiza LobbyClient
│   │   │   └── LobbyClient.tsx     # Lista de partidas + criação + vs bot
│   │   ├── match/[id]/
│   │   │   ├── page.tsx            # Carrega match + viewerId do session
│   │   │   └── MatchClient.tsx     # Tabuleiro interativo (componente principal)
│   │   ├── wallet/
│   │   │   ├── page.tsx            # SSR: busca saldo + transações + saques
│   │   │   └── WalletClient.tsx    # Formulários de depósito/saque
│   │   ├── history/page.tsx        # Histórico de partidas do usuário
│   │   └── leaderboard/page.tsx    # Top 20 por rating
│   └── api/
│       ├── auth/[...nextauth]/route.ts    # NextAuth handler
│       ├── auth/register/route.ts         # POST → chess_register_user RPC
│       ├── matches/
│       │   ├── route.ts                   # GET (lista) / POST (cria)
│       │   ├── vs-bot/route.ts            # POST → cria partida vs bot
│       │   └── [id]/
│       │       ├── route.ts               # GET match by id
│       │       ├── join/route.ts          # POST → chess_join_match
│       │       ├── move/route.ts          # POST → chess_record_move + trigger bot
│       │       ├── resign/route.ts        # POST → chess_resign_match
│       │       └── cancel/route.ts        # POST → chess_cancel_match
│       ├── wallet/
│       │   ├── route.ts                   # GET saldo + histórico
│       │   ├── deposit/route.ts           # POST depósito sandbox
│       │   └── withdraw/route.ts          # POST pedido de saque
│       ├── history/route.ts               # GET partidas do usuário
│       └── leaderboard/route.ts           # GET top 20
├── components/
│   ├── LogoutButton.tsx            # Botão de logout (client component)
│   └── NavLinks.tsx                # Links de nav com active state (usePathname)
└── lib/
    ├── auth.ts                     # NextAuth config (JWT, credenciais, callbacks)
    ├── supabase.ts                 # Cliente singleton com service_role key
    ├── chess-engine.ts             # Wrapper chess.js (applyMove, gameStatus)
    ├── chess-bot.ts                # Bot AI (minimax + alpha-beta + PST)
    ├── bot-runner.ts               # Executa lance do bot após move humano
    ├── types.ts                    # Interfaces TypeScript das tabelas DB
    └── utils.ts                    # formatCoins, formatDate
```

---

## Banco de dados (Supabase Postgres)

### Tabelas principais
- `chess_users` — contas (id, username, email, password_hash, rating)
- `chess_wallets` — saldo (balance, locked) por user_id
- `chess_transactions` — log de movimentações
- `chess_matches` — partidas (fen, pgn, status, wager, pot, rake, result, bot_difficulty)
- `chess_moves` — histórico de lances
- `chess_withdrawal_requests` — pedidos de saque pendentes

### RPCs atômicas (PL/pgSQL)
- `chess_register_user` — cria user + wallet com 1000 coins
- `chess_create_match` — bloqueia wager + cria match WAITING
- `chess_create_bot_match` — idem para partida vs bot
- `chess_join_match` — bloqueia wager do oponente + ativa match
- `chess_record_move` — registra lance + detecta fim + distribui prêmio
- `chess_resign_match` — trata oponente como vencedor
- `chess_cancel_match` — reembolsa criador (só em WAITING)

---

## Componente MatchClient — funcionalidades do tabuleiro

O tabuleiro usa `react-chessboard` com as seguintes melhorias implementadas:

### Highlights de squares
- **Último lance**: tint dourado sutil no `from` e `to` do último movimento
- **Xeque**: overlay vermelho na casa do rei em xeque
- **Lances legais**: ao clicar uma peça própria:
  - Casa selecionada: dourado sólido
  - Destinos válidos (casa vazia): dot radial dourado
  - Destinos válidos (captura): overlay dourado mais sólido

### Click-to-move
- Clique na peça própria → seleciona e mostra lances legais
- Clique no destino válido → executa o lance
- Clique em peça própria diferente → reseleciona
- Clique em casa inválida/vazia → deseleciona

### Informações extras por jogador (PlayerBar)
- Nome de usuário + rating ELO
- Indicador de vantagem material (`+N`)
- Peças capturadas (ícones ordenados por valor)
- Indicador de turno animado (pulse)

### Sidebar do tabuleiro
- **Status card**: texto contextual + badge + botões de ação (entrar/desistir/cancelar/voltar)
- **Pot card**: valor do pote + aposta por jogador
- **Moves card**: lista de lances em formato par (1. e4 e5), destaca último lance, auto-scroll, botões copy FEN/PGN

### Outros
- `showBoardNotation={true}` — coordenadas a-h, 1-8 visíveis
- Spinner overlay durante `busy` (enviando lance ao servidor)
- Badge "vs Bot" quando é uma partida contra bot
- Detecção de bot match: `status !== WAITING && (white_user === null || black_user === null)`

---

## Sistema de bot

Arquivo: `src/lib/chess-bot.ts`

- Algoritmo: minimax com alpha-beta pruning
- Tabelas PST (piece-square tables) para avaliação posicional
- **Fácil** (depth 1): 35% moves aleatórios, tolerância 25cp
- **Médio** (depth 2): minimax puro
- **Difícil** (depth 3): minimax mais profundo

Fluxo: `POST /api/matches/vs-bot` → RPC `chess_create_bot_match` → se bot joga primeiro, `playBotMove()` imediato → cada lance humano via `POST /api/matches/[id]/move` triggera `playBotMove()`.

---

## Design system (Tailwind)

### Cores (`tailwind.config.ts`)
- `background`: #0a0a0f
- `surface`: #13131c
- `surfaceAlt`: #1c1c2a
- `border`: #2a2a3a
- `accent`: #f5b301 (dourado)
- `accentDark`: #c89400
- `muted`: #8a8aa3
- `danger`: #e15252
- `success`: #41c96d

### Componentes (`globals.css`)
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`
- `.card` — rounded-xl border bg-surface p-5 shadow-lg
- `.input`, `.label`
- `.badge`, `.badge-accent`, `.badge-success`, `.badge-danger`
- `.scrollbar-thin` — scrollbar fina e discreta para listas

### Cores do tabuleiro
- Casas escuras: `#3a3a55`
- Casas claras: `#d8d8e5`

---

## Fluxo de desenvolvimento

### Rodar localmente
```bash
npm install
npm run dev        # localhost:3000
npm run build      # verifica TypeScript + build de produção
```

### Variáveis de ambiente (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

### Deploy
O projeto está no Vercel. Push para `main` deploya automaticamente.

---

## Histórico de commits relevantes

| Hash | Descrição |
|------|-----------|
| `e542c7d` | feat: skin system, marketplace, drop system |
| `43e2d63` | feat: ELO K-factor, Overwatch, ban system, Stockfish analysis |
| `de8ab8a` | feat: premove, rating matchmaking, stake limits, achievements |
| `b5de7fb` | feat: add chess bot (easy/medium/hard) |
| `9926be2` | feat: migrate from Prisma to Supabase |
| `09fe962` | feat: initial xadrez arena platform |

---

## Pré-lance (pre-move)

Implementado 100% client-side em `MatchClient.tsx`:
- `premoveRef` (useRef) armazena `{ from, to }` do pré-lance pendente
- Durante o turno do oponente (`!isMyTurn && isPlayer`), clique na peça própria → destino define o pré-lance
- `refresh()` verifica `newMatch.turn === myColor && premoveRef.current` → executa imediatamente
- Highlight roxo (`rgba(120,80,220,...)`) diferencia do highlight de lance normal (dourado)
- `onSquareRightClick` cancela o pré-lance
- Pré-lance inválido (peça foi capturada etc.) é descartado silenciosamente no try/catch

## Matchmaking por faixa de rating

- `chess_matches.rating_min / rating_max` — novos campos (NULL = aberto)
- RPC `chess_create_match` aceita `p_rating_min` e `p_rating_max`
- RPC `chess_join_match` valida rating do entrante; errors: `rating_too_low`, `rating_too_high`
- API `POST /api/matches` aceita `ratingRange: "200" | "500" | "open"`
- Stake limit: `< 5 partidas finalizadas → max wager = 100 coins` (verificado em `POST /api/matches`)

## Sistema de conquistas

### DB (migration 0002)
- `chess_achievement_types` — 15 conquistas definidas com reward_coins
- `chess_user_achievements` — junction table user × achievement
- `chess_grant_achievement(user_id, achievement_id)` — RPC idempotente + transferência de coins

### Flow
1. Partida termina → `MatchClient` detecta `status === FINISHED`
2. `POST /api/achievements/check` com `matchId`
3. API calcula stats (total matches, wins, streak, rating) e chama RPC para cada achievement elegível
4. Retorna lista de conquistas recém ganhas
5. Client exibe toast com icon + nome + coins

### Conquistas por categoria
- **Partidas**: Primeira Vitória, Veterano (10), Centurião (100), Em Chamas (3 seguidas), Imparável (5), Lenda (10)
- **Xadrez**: Relâmpago (mate ≤ 15 lances), Longa Batalha (60+ lances), Diplomata (5 amistosos)
- **Bot**: Dominador (vencer qualquer bot), Exterminador (vencer bot Difícil)
- **Rating**: Promissor (1200), Expert (1500), Mestre (1800)
- **Apostas**: Grande Apostador (aposta ≥ 500 coins)

## TODOs de produção

- [ ] Integração real com gateway de pagamento (atualmente sandbox)
- [ ] Rate limiting distribuído (Upstash/Redis) — hoje é in-memory por processo
- [ ] Detecção de cheating em background — já tem Stockfish analysis nos endpoints; falta job recorrente

## Melhorias da página de jogo (commit d5566c7)

Inspiradas em lichess/chess.com:

- **Sons sintetizados** (`src/lib/sounds.ts`) via Web Audio, sem assets externos. Eventos: move/capture/check/castle/promote/start/winSelf/loseSelf/draw/lowTime/notify/click. Mute persistente em `localStorage` (`xa.muted`). Toggle 🔊 na header + tecla **M**.
- **Anotações de casa por right-click**: 3 cores cíclicas (verde → vermelho → azul → off). Esc limpa todas. Se houver pré-lance ativo, right-click ainda cancela ele primeiro.
- **Seta dourada do último lance** via `customArrows` do react-chessboard.
- **Atalhos de teclado**: ← → navegam lances, ↑/Home início, ↓/End ao vivo, F inverte tabuleiro (override temporário), M mute, Esc limpa marcações/pré-lance.
- **Modal de fim de jogo** full-screen com emoji contextual (👑/😔/🤝/🏁), motivo, payout, CTA de rematch e botão "Ver tabuleiro" pra fechar.
- **Picker de promoção na própria casa**: pilha vertical Q/R/B/N posicionada sobre o square de destino (substitui modal central).
- **Detecção de abertura** (`src/lib/openings.ts`): mini-DB ECO com ~65 entradas, mostra o nome embaixo do tabuleiro até o lance 20.
- **Reivindicar empate**: detecção client-side via `chess.js` (`isThreefoldRepetition`, `isInsufficientMaterial`, `isDraw`); banner azul aparece quando aplicável. `POST /api/matches/[id]/claim-draw` → RPC `chess_claim_draw` (migration 0006).
- **Animação +Ns**: pequeno texto flutuante sobre o relógio quando incremento é aplicado. Keyframe `floatUp` em globals.css.
- **Pulse no clock** quando tempo < 30s.
- **Beep de tempo curto**: som curto a cada segundo entre 10s e 0 quando é nossa vez.
- **Cheat-sheet de atalhos** exibido sob o tabuleiro durante partida ativa.

## Features implementadas (migration 0005)

- **Relógio**: `time_control_seconds`, `time_increment_seconds`, `white_time_ms`, `black_time_ms`, `last_move_at` em `chess_matches`. RPC `chess_record_move` debita tempo + soma incremento. `chess_flag_time` reivindica perda por tempo. Auto-flag no client quando o tempo expira.
- **Presets de tempo**: 1min, 3min, 5+3, 10min, 15+10, sem tempo (default: 5+3 blitz).
- **Oferta de empate**: `chess_offer_draw`, `chess_accept_draw`, `chess_decline_draw`. Bandeira na sidebar do match.
- **Rematch**: `chess_request_rematch` — cria nova partida com cores invertidas e mesma config (wager, rating range, time control). Auto-inicia quando ambos pedem.
- **Promoção de peão**: modal com Q/R/B/N. Detectado pelo client antes de enviar o lance.
- **Chat por partida**: tabela `chess_match_messages` + RPC `chess_post_message` (anti-flood: 5 msgs/10s, max 240 chars). Apenas jogadores podem postar.
- **Navegação por lances**: botões ⏮ ◀ ▶ ⏭ na lista de PGN. Clique em lance pula pra posição. Modo "navegando" mostra overlay roxo.
- **Compartilhar link**: botão na header copia URL absoluta da partida.
- **Painel admin de saques**: `/admin/withdrawals`. Acessível só com `chess_users.is_admin = true`. RPCs `chess_approve_withdrawal`, `chess_reject_withdrawal` (devolve coins), `chess_mark_withdrawal_paid`.
- **Rate limiting**: token bucket em memória (`src/lib/rate-limit.ts`) nos endpoints quentes (move, chat, draw, rematch, flag-time, create-match).
- **Realtime opcional**: `src/lib/supabase-browser.ts` cria client com anon key (se `NEXT_PUBLIC_SUPABASE_ANON_KEY` estiver no env). `MatchClient` subscreve a `chess_matches`/`chess_moves`/`chess_match_messages` por canal. Polling de 1.5s segue como fallback. RLS habilitada (SELECT público) nas três tabelas.

### Como dar admin a um usuário

```sql
UPDATE chess_users SET is_admin = true WHERE username = 'meunome';
```

### Como habilitar Realtime

1. Pegue a anon key em Supabase Dashboard → Settings → API.
2. Adicione no `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
3. A migration 0005 já habilita RLS + publication para realtime; nada mais é necessário no DB.

---

## App shell (sidebar)

- `src/components/AppShell.tsx` — client component único que renderiza sidebar desktop (fixa, w-60, grupos de nav com ícones), topbar+drawer mobile e o `<main>`. Recebe `{ username, balance, locked, isAdmin }` do server layout `(app)/layout.tsx`.
- `NavLinks.tsx` e `LogoutButton.tsx` foram removidos (substituídos pelo shell).
- Grupos de navegação são o array `GROUPS` no topo do AppShell — adicionar página nova = adicionar item lá.
- Carteira, perfil (`/u/<username>`), settings (⚙️) e logout (⏻) ficam no rodapé da sidebar.

## Desafios diretos (migration 0016)

- `chess_matches.challenged_user_id` — partida endereçada a um usuário; sempre `is_private = true`.
- `chess_create_match` ganhou `p_challenged_user_id` (valida alvo existe/não banido/não é o próprio; máx. 3 desafios pendentes por par criador→alvo).
- `chess_join_match`: se `challenged_user_id` setado, só o desafiado entra (erro `not_challenged_user`) e a faixa de rating é ignorada.
- `chess_decline_challenge(p_user_id, p_match_id)` — desafiado recusa; reembolsa o criador e cancela.
- API: `POST /api/matches` aceita `challengedUsername`; `GET /api/challenges` retorna `{incoming, outgoing}` pendentes; `POST /api/matches/[id]/decline-challenge`.
- UI: `ChallengeButton` (perfil `/u/[username]` + `/following`, prop `compact`), `ChallengesInbox` no topo do `LobbyClient` (polling 10s + som "notify" quando chega desafio novo).

## Notas de implementação

**Polling vs Realtime**: O polling de 1.5s é intencional para simplicidade de deploy (não precisa configurar Supabase Realtime). Para trocar, usar `supabase.channel(...).on('postgres_changes', ...)`.

**service_role key no servidor**: Toda comunicação com Supabase é server-side com a service_role key. O cliente nunca tem acesso à chave.

**chess.js + react-chessboard**: A validação acontece em dois lugares: client (chess.js no browser para feedback imediato) e server (chess.js na API route + RPC para registro definitivo).

**Bot sem user_id**: Partidas vs bot têm `black_user_id = null` (ou `white_user_id = null`). Detectar: `match.white_user === null || match.black_user === null` quando status ≠ WAITING.

---

## Puzzle do Dia (tactics training)

- **Banco curado**: `src/lib/puzzles.ts` com ~15 puzzles (FEN inicial + lista de UCI). O primeiro lance da lista é executado pelo "oponente" automaticamente; o resto é o que o jogador deve responder.
- **Puzzle do dia determinístico**: `puzzleOfDay()` indexa o array a partir de um epoch UTC, então todos os usuários veem o mesmo puzzle no mesmo dia.
- **Página**: `/puzzle` (`src/app/(app)/puzzle/PuzzleClient.tsx`). Tabuleiro live, dicas adaptativas (revela mais info conforme erros), botões reiniciar/ver solução, navegação pra próximo puzzle do banco.
- **Estado local**: `localStorage["xa.puzzle.v1"]` guarda streak, totais e por-puzzle (resolvido, tempo, erros, dicas). Não há tabela DB — nenhuma migração necessária.
- **Banner no lobby**: `src/components/PuzzleCard.tsx` linka direto pro puzzle e mostra streak. Componente `PuzzleStatsCard` aparece no perfil próprio do usuário (`/u/[username]`).

## Endgame coach (dica pós-partida)

- `src/lib/endgame-coach.ts` — detecta padrões de final pela contagem de material da FEN final + result. Retorna `{ emoji, title, body }`.
- Wire: modal de fim de jogo em `MatchClient.tsx` mostra dica curta sobre KQ vs K, KR vs K, escadinha, material insuficiente, regra dos 50 lances, etc.

## Lobby (filtros adicionais)

- **Filtro de aposta**: chips por faixa (Amistoso, ≤100, 100–500, 500+) — `WAGER_FILTERS`.
- **Sort**: select com Mais recentes / Maior aposta / Maior rating / Menor rating.
- **Busca por @usuário**: input de busca filtra por username (case-insensitive).
- **Toggle "Só joináveis"**: oculta partidas fora da faixa de rating do viewer.

## Tempo por lance (timestamps)

- `GET /api/matches/[id]/moves` retorna lista de moves com `move_time_ms`.
- `MatchClient` busca esses dados quando partida termina (`status === FINISHED`) e passa pro `PgnList`, que exibe tempo formatado ao lado de cada lance.

## Sparkline de rating

- Componente `src/components/Sparkline.tsx` (SVG puro, SSR).
- Perfil público (`/u/[username]`) calcula trajetória de rating retroagindo deltas: parte do rating atual e subtrai `white_rating_delta`/`black_rating_delta` partida-a-partida (ordem decrescente), inverte pra ordem cronológica.

## Board prefs (preferências de tabuleiro)

- `src/lib/board-prefs.ts` — chaves `xa.highlightLegal`, `xa.autoPromote`, `xa.showNotation`, `xa.animSpeed` no localStorage.
- `getBoardPrefs()` carrega tudo em uma estrutura; `animDurationMs(speed)` mapeia pra duração da animação do `react-chessboard`.
- Wire em `MatchClient`, `PuzzleClient`, `SettingsClient`.
- `MatchClient` recarrega prefs no `visibilitychange` (usuário pode ter mudado em `/settings` em outra aba).

## Anotação privada por partida

- `src/components/MatchNoteCard.tsx` — textarea com debounce de 500ms.
- Persistência em `localStorage` com chave `xa.matchNote.<matchId>`, valor `{ text, savedAt }`.
- Renderizado apenas em partidas FINISHED para jogadores.
- Página `/notes` (`src/app/(app)/notes/NotesClient.tsx`) lista todas, suporta busca, apagar individual e apagar tudo.

## Profile insights

Em `/u/[username]`:
- **Média de lances** por partida (das últimas 100).
- **Horário ativo**: hora do dia (0–23h) com mais partidas finalizadas.
- **WR por cor**: separa win rate com brancas vs com pretas.
- Tudo calculado SSR a partir do mesmo query de `chess_matches` já existente.

## /stats — dashboard pessoal

- `src/app/(app)/stats/page.tsx` — SSR.
- Query: últimas 500 partidas finalizadas do usuário em `chess_matches`.
- Calcula buckets de tempo (`bucketOf(sec)`): bullet ≤120, blitz ≤300, rapid ≤1800, classical >1800, untimed.
- Por bucket: W/D/L, total e somatório de rating delta.
- Mostra: big numbers, breakdown empilhado, sparkline (60 partidas), bar chart de atividade (14 dias), painel vs bot.
- Não duplica dados do `/u/[username]` — esse foca em perfil público, `/stats` foca em métricas pessoais detalhadas.

## Onboarding + Backup local

- `src/components/OnboardingModal.tsx` — 3 passos, flag `xa.onboarded.v1`. Renderizado em `/lobby/page.tsx`.
- Settings `BackupRestoreCard` exporta/importa todas as chaves `xa.*` como JSON. Recarrega a página após import bem-sucedido.

## Lobby: record de hoje

- Query SSR em `/lobby/page.tsx` filtra `chess_matches` finalizadas desde 00:00 UTC do dia (`gte("finished_at", startOfDayUTC)`).
- Card no topo linka pra `/stats`. Cores semânticas (V verde, D vermelho, delta colorido).

## History: resumo agregado

- `HistoryClient.tsx` computa `summary { netCoins, winRate, total }` via `useMemo` sobre `classified[]`.
- Renderiza 4 SummaryBox no topo (antes dos filtros).

## Achievements: progresso por categoria

`/achievements` mostra um mini-card por categoria com barra de progresso colorida (verde se 100%, dourado caso contrário), antes da grade principal.

## Banco de puzzles (32)

- IDs `p001`–`p032`. Todos validados via chess.js antes do commit.
- Cobertura: aberturas táticas, mates 1–3, endgames, sacrifícios (Greek gift), forks, pins, skewers, escadinha de torres, double attack.
- Filtros disponíveis: rating (Fácil ≤800 / Médio 801-1300 / Difícil 1301+), tema, ocultar resolvidos, só favoritos.
- Favoritos armazenados em `xa.puzzle.v1.favorites: string[]`.
