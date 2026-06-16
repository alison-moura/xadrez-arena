# Xadrez Arena ♞

**🟢 LIVE:** https://xadrez-arena-zeta.vercel.app

Plataforma de xadrez online multiplayer com sistema de apostas em coins.
Stack: **Next.js 14 (App Router) + TypeScript + Tailwind + Supabase (Postgres + service_role) + NextAuth + chess.js + react-chessboard**.

## Recursos

- Cadastro e login (NextAuth + credenciais)
- Bônus de boas-vindas de **1000 coins**
- Lobby de partidas abertas com aposta configurável (incluindo amistosos sem aposta)
- Partidas multiplayer em tempo real (polling de 1.5s) com validação de lances server-side via chess.js
- Sistema de **carteira/escrow** atômico (PL/pgSQL): o valor da aposta é trancado no `chess_wallets.locked` quando cada jogador entra; vencedor recebe o pote menos rake de 5%
- Tabuleiro interativo (`react-chessboard`) com orientação automática conforme a cor do jogador
- Detecção automática de xeque-mate, empate, e fim de jogo; suporte a desistência
- Depósitos simulados (sandbox)
- Pedidos de saque via PIX/USDT/BTC/transferência (registrados como `PENDING` para liquidação manual)
- Histórico de partidas, transações e saques
- Ranking de jogadores por rating (atualizado a cada partida finalizada)

## Setup

### 1. Criar as tabelas no Supabase (1 minuto)

Abra o SQL Editor do seu projeto:

→ https://supabase.com/dashboard/project/_/sql/new

Cole o conteúdo de [`supabase/migrations/0001_chess_arena_init.sql`](./supabase/migrations/0001_chess_arena_init.sql) e clique em **Run**.

Isso cria 6 tabelas (`chess_users`, `chess_wallets`, `chess_transactions`, `chess_matches`, `chess_moves`, `chess_withdrawal_requests`) + 4 enums + 7 funções RPC para operações atômicas — todas com prefixo `chess_` pra não conflitar com outros projetos no mesmo banco.

### 2. Variáveis de ambiente

Crie `.env.local` (já gitignored) baseado em `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL="https://SEU_PROJECT_REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."   # NUNCA exponha no front
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:3000"
```

A `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_*`) está em **Dashboard → Project Settings → API → Service role** (NOVA chave secreta).

### 3. Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000.

## Deploy no Vercel

1. Clique no botão abaixo (vai abrir o Vercel já apontando pra este repo):

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/alison-moura/xadrez-arena&env=NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,NEXTAUTH_SECRET,NEXTAUTH_URL&envDescription=Supabase%20URL%20+%20service_role%20key%20+%20NextAuth%20secret%20e%20URL)

2. Configure as 4 env vars:
   - `NEXT_PUBLIC_SUPABASE_URL` → `https://SEU_PROJECT_REF.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` → `sb_secret_...`
   - `NEXTAUTH_SECRET` → gerada com `openssl rand -base64 32`
   - `NEXTAUTH_URL` → a URL do seu deploy (ex: `https://xadrez-arena.vercel.app`)

3. Pronto. Não tem migration — você já rodou o SQL no passo 1.

## Arquitetura

```
src/
├── app/
│   ├── (app)/          # rotas autenticadas (lobby, match, wallet, history, leaderboard)
│   ├── api/
│   │   ├── auth/       # NextAuth + register (chama RPC chess_register_user)
│   │   ├── wallet/     # saldo, deposit (RPC), withdraw (RPC)
│   │   ├── matches/    # CRUD + RPC chess_create_match / join / record_move / resign / cancel
│   │   ├── history/    # SELECT em chess_matches filtrado por jogador
│   │   └── leaderboard/# top 20 por rating
│   ├── login/
│   ├── register/
│   └── page.tsx        # landing
├── lib/
│   ├── supabase.ts     # cliente singleton com service_role
│   ├── auth.ts         # NextAuth config (JWT, credenciais)
│   ├── chess-engine.ts # wrapper chess.js para validar lances
│   ├── types.ts        # tipos TypeScript das tabelas
│   └── utils.ts
└── components/

supabase/migrations/0001_chess_arena_init.sql  # schema + RPCs
```

### Fluxo de uma partida

1. Jogador A cria match com `wager=100` → `chess_create_match` move 100 coins de `balance` pra `locked`, cria match `WAITING`
2. Jogador B entra → `chess_join_match` faz o mesmo com B, vira `ACTIVE`, pot=200
3. Cada lance: Node valida com chess.js → RPC `chess_record_move` registra atomicamente
4. Quando há xeque-mate (validado client+server):
   - 200 coins saem do `locked` (100 de cada)
   - Vencedor recebe `200 - 5%` = 190 coins no `balance`
   - 10 coins de rake permanecem fora (lucro da casa)
   - Ratings atualizados (+15 / -15)

Empate (`chess_record_move` com `p_is_draw=true`) devolve a aposta original a ambos.
Desistência (`chess_resign_match`) trata o oponente como vencedor.
Cancelamento (`chess_cancel_match`) só é permitido em `WAITING` pelo criador, reembolsa.

## Considerações de produção (5% restantes)

Para virar 100% production-grade você ainda vai querer:

- Relógio de xadrez (timer por jogador) — adicionar colunas `chess_matches.white_time_ms` / `black_time_ms`
- WebSocket real (Supabase Realtime) — substitui o polling de 1.5s; basta `supabase.channel(...).on('postgres_changes', ...)`
- Painel admin para aprovar saques (`chess_withdrawal_requests.status`)
- Integração real com gateway de pagamento (Stripe Connect, PIX via Mercado Pago, etc)
- KYC/AML conforme legislação do seu país para apostas com dinheiro real
- Rate limiting nas APIs (ex: Upstash Ratelimit)
- Detecção de cheating (lances do Stockfish)
- Sistema de chat na partida (Supabase Realtime + tabela `chess_messages`)

## Licença

MIT — use à vontade.
