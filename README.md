# Xadrez Arena ♞

Plataforma de xadrez online multiplayer com sistema de apostas em coins.
Stack: **Next.js 14 (App Router) + TypeScript + Tailwind + Prisma + PostgreSQL + NextAuth + chess.js + react-chessboard**.

**Deploy em 1 clique no Vercel:**
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/alison-moura/xadrez-arena&env=DATABASE_URL,NEXTAUTH_SECRET,NEXTAUTH_URL&envDescription=Postgres%20URL%20%2B%20NextAuth%20secret&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D)

Após o deploy, rode `npx prisma db push` apontando para o `DATABASE_URL` do Vercel para criar as tabelas (instruções completas abaixo).

## Recursos

- Cadastro e login (NextAuth + credenciais)
- Bônus de boas-vindas de **1000 coins**
- Lobby de partidas abertas com aposta configurável (incluindo amistosos sem aposta)
- Partidas multiplayer em tempo real (polling) com validação de lances server-side via chess.js
- Sistema de **carteira/escrow**: o valor da aposta é trancado quando cada jogador entra; vencedor recebe o pote menos rake de 5%
- Tabuleiro interativo (`react-chessboard`) com orientação automática conforme a cor do jogador
- Detecção automática de xeque-mate, empate, e fim de jogo; suporte a desistência
- Depósitos simulados (sandbox)
- Pedidos de saque via PIX/USDT/BTC/transferência (registrados como `PENDING` para liquidação manual)
- Histórico de partidas, transações e saques
- Ranking de jogadores por rating

## Setup local

### 1. Instale dependências

```bash
npm install
```

### 2. Configure o banco

Crie um arquivo `.env` baseado em `.env.example`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/xadrez?schema=public"
NEXTAUTH_SECRET="gere-com-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
```

Opções de Postgres para dev:
- **Docker**: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=chess -e POSTGRES_DB=xadrez postgres:16`
- **Neon** (grátis): https://neon.tech
- **Supabase** (grátis): https://supabase.com
- **Vercel Postgres**: criar pela dashboard do Vercel

### 3. Crie as tabelas

```bash
npm run db:push
```

### 4. Rode em desenvolvimento

```bash
npm run dev
```

Abra http://localhost:3000.

## Deploy no Vercel

1. Faça `vercel link` ou conecte via GitHub
2. Crie um banco Postgres (Vercel Postgres, Neon, ou Supabase) e copie a connection string
3. Na dashboard do Vercel, configure as variáveis de ambiente:
   - `DATABASE_URL` — a connection string do Postgres
   - `NEXTAUTH_SECRET` — uma string aleatória forte (use `openssl rand -base64 32`)
   - `NEXTAUTH_URL` — a URL do deploy (ex: `https://xadrez-arena.vercel.app`)
4. Depois do primeiro deploy, rode uma vez para criar as tabelas:
   ```bash
   DATABASE_URL="..." npx prisma db push
   ```
   ou use `vercel env pull .env.production.local && npx prisma db push`.

## Arquitetura

- **`/src/app/api/*`** — rotas REST (auth, wallet, matches, leaderboard, history)
- **`/src/lib/chess-engine.ts`** — wrapper sobre `chess.js` para validar lances
- **`/src/lib/wallet.ts`** — operações atômicas de carteira (lock, refund, payout)
- **`/src/app/(app)/match/[id]/MatchClient.tsx`** — componente do tabuleiro com polling de 1.5s
- **`prisma/schema.prisma`** — modelos: `User`, `Wallet`, `Transaction`, `Match`, `Move`, `WithdrawalRequest`

### Fluxo de uma partida

1. Jogador A cria match com `wager=100` → 100 coins saem do `balance` e vão pro `locked`
2. Jogador B entra → 100 coins de B também vão pro `locked`
3. Partida vira `ACTIVE`, pot = 200
4. Lances são validados no servidor a cada `POST /api/matches/:id/move`
5. Quando há xeque-mate / desistência:
   - 200 coins saem do `locked` (100 de cada)
   - Vencedor recebe `200 - 5%` = 190 coins no `balance`
   - 10 coins ficam como rake

Empate devolve o valor original a ambos.

## Considerações de produção (5% restantes)

Para virar 100% production-grade você ainda vai querer:

- Relógio de xadrez (timer por jogador) — schema já tem campos prontos pra adicionar
- WebSocket real via Pusher/Ably/Soketi (substitui o polling de 1.5s)
- Painel admin para aprovar saques (`WithdrawalRequest.status`)
- Integração real com gateway de pagamento (Stripe Connect, PIX via Mercado Pago, etc)
- KYC/AML conforme legislação do seu país para apostas com dinheiro real
- Rate limiting nas APIs (ex: Upstash Ratelimit)
- Detecção de cheating (lances do Stockfish)
- Sistema de chat na partida

## Licença

MIT — use à vontade.
