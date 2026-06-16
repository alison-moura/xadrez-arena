# CLAUDE.md — Xadrez Arena

Guia de desenvolvimento para o agente Claude. Contexto completo do projeto para continuação de sessões.

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
| `b5de7fb` | feat: add chess bot (easy/medium/hard) |
| `7b4f476` | docs: add live URL to README |
| `7168316` | fix: disable Next.js fetch cache for supabase |
| `9926be2` | feat: migrate from Prisma to Supabase |
| `09fe962` | feat: initial xadrez arena platform |

---

## TODOs de produção

- [ ] Relógio de xadrez (colunas `white_time_ms` / `black_time_ms` em `chess_matches`)
- [ ] WebSocket real (Supabase Realtime) — substitui polling de 1.5s
- [ ] Diálogo de promoção de peão (atualmente auto-promove pra rainha)
- [ ] Painel admin para aprovar saques
- [ ] Integração real com gateway de pagamento
- [ ] Rate limiting nas APIs (Upstash Ratelimit)
- [ ] Detecção de cheating (comparar com Stockfish)
- [ ] Chat na partida
- [ ] Navegação por lances no PGN (ver posição passada em modo read-only)
- [ ] Compartilhar link da partida

---

## Notas de implementação

**Polling vs Realtime**: O polling de 1.5s é intencional para simplicidade de deploy (não precisa configurar Supabase Realtime). Para trocar, usar `supabase.channel(...).on('postgres_changes', ...)`.

**service_role key no servidor**: Toda comunicação com Supabase é server-side com a service_role key. O cliente nunca tem acesso à chave.

**chess.js + react-chessboard**: A validação acontece em dois lugares: client (chess.js no browser para feedback imediato) e server (chess.js na API route + RPC para registro definitivo).

**Bot sem user_id**: Partidas vs bot têm `black_user_id = null` (ou `white_user_id = null`). Detectar: `match.white_user === null || match.black_user === null` quando status ≠ WAITING.
