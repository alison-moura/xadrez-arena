# Xadrez Arena ♞

**🟢 LIVE:** https://xadrez-arena-zeta.vercel.app

Plataforma de xadrez online multiplayer com sistema de apostas em coins.
Stack: **Next.js 14 (App Router) + TypeScript + Tailwind + Supabase (Postgres + service_role) + NextAuth + chess.js + react-chessboard**.

## Recursos

### Tabuleiro
- Tabuleiro interativo com **arrastar e clicar** (click-to-move com highlight de lances legais)
- **Highlight do último lance** (tint dourado nas casas from/to)
- **Highlight de xeque** (overlay vermelho no rei)
- **Highlight de lances legais** — dots para casas vazias, overlay para capturas
- **Coordenadas visíveis** (a-h, 1-8)
- **Peças capturadas** exibidas por jogador com ícones unicode
- **Vantagem material** (+N) ao lado do nome do jogador
- Orientação automática conforme a cor do jogador
- Spin overlay durante envio do lance
- Botões **copiar FEN** e **copiar PGN**
- Lista de lances com scroll automático e destaque do lance atual

### Plataforma
- Cadastro e login (NextAuth + credenciais)
- Bônus de boas-vindas de **1000 coins**
- Lobby de partidas abertas com aposta configurável (incluindo amistosos sem aposta)
- Partidas multiplayer em tempo real (polling de 1.5s) com validação de lances server-side via chess.js
- Sistema de **carteira/escrow** atômico (PL/pgSQL): o valor da aposta é trancado no `chess_wallets.locked` quando cada jogador entra; vencedor recebe o pote menos rake de 5%
- Detecção automática de xeque-mate, empate, e fim de jogo; suporte a desistência
- Depósitos simulados (sandbox)
- Pedidos de saque via PIX/USDT/BTC/transferência (registrados como `PENDING` para liquidação manual)
- Histórico de partidas, transações e saques
- Ranking de jogadores por rating (atualizado a cada partida finalizada)

### Anti-cheat e matchmaking justo
- **Faixa de rating obrigatória**: criador define ±200 (Competitivo), ±500 (Relaxado) ou Livre. Jogadores fora do range não podem entrar.
- **Limite de apostas para novatos**: contas com < 5 partidas finalizadas limitadas a 100 coins por aposta — protege iniciantes de sharks de alto nível.
- **Análise de movimentos futura**: centipawn loss via Stockfish pós-jogo (TODO) para detectar uso de engine.

### Pré-lance (pre-move)
- Enquanto o oponente joga, clique sua peça + destino para enfileirar um lance
- Executa instantaneamente quando o turno volta (como no Chess.com / Lichess)
- Highlight roxo diferencia do lance normal (dourado)
- Cancelável via clique direito ou botão "Cancelar"

### Sistema de conquistas (15 achievements)
- **Partidas**: Primeira Vitória, Veterano, Centurião, Em Chamas (3 seguidas), Imparável (5), Lenda (10)
- **Xadrez**: Relâmpago (mate em ≤15 lances), Longa Batalha (60+ lances), Diplomata (5 amistosos)
- **Bot**: Dominador, Exterminador (modo Difícil)
- **Rating**: Promissor (1200), Expert (1500), Mestre (1800)
- **Apostas**: Grande Apostador (≥500 coins)
- Coins de recompensa por conquista (50–500 coins)
- Toast de notificação no tabuleiro ao desbloquear
- Página `/achievements` com grid, filtro por categoria e barra de progresso

### Bot de xadrez
- 3 dificuldades: Fácil, Médio, Difícil
- Algoritmo **minimax + alpha-beta pruning** com tabelas PST
- Modo treino: sem aposta, sem rating
- **💡 Dica do coach**: em partidas vs bot, botão que mostra o melhor lance (Stockfish WASM) como seta azul, com contador de dicas usadas

### UI/UX
- Dark theme com accent dourado (#f5b301)
- Nav com **link ativo** destacado
- Avatares gerados por iniciais com cor baseada no username
- Cards de partida com rating ELO e wager colorido por valor
- Landing page com seção de features e CTA
- **Saldo compacto no header mobile** + nav scrollável com fade indicator
- **PWA** com manifest + meta tags
- Picker de promoção sobre a casa (não modal central)
- Modal de fim de jogo com emoji contextual, payout, rating delta e **dica do coach** (final tipo KQ vs K, escadinha, regra 50 lances etc.)
- Confetti de peças quando você ganha

### Puzzle do Dia 🧩
- **32 puzzles** táticos curados em `src/lib/puzzles.ts` (FEN + sequência UCI)
- Puzzle determinístico por dia (todos veem o mesmo)
- Dicas adaptativas (revela mais conforme erros/dicas anteriores)
- Streak persistente em `localStorage` (sem DB)
- **Filtros** por rating (Fácil/Médio/Difícil), por tema (15+ opções), ocultar resolvidos, só favoritos
- **Favoritos ★** (localStorage) + botão **🎲 Aleatório** respeitando filtros
- Banner no lobby + card de stats no perfil próprio (`/u/[username]`)

### Puzzle Rush ⚡
- Modo corrida em `/puzzle-rush`: resolva o máximo de puzzles em sequência de dificuldade crescente
- **2 modos**: 5 minutos contra o relógio ou Sobrevivência (sem tempo)
- **3 strikes**: lance errado conta strike e pula pro próximo puzzle; 3 erros encerram
- Recordes por modo + histórico das últimas 10 corridas (localStorage)
- Grid visual ✓/✗ da corrida atual e overlay de fim com novo recorde

### Lobby — filtros e busca
- Categorias por tempo (Bullet/Blitz/Rápido/Clássico/Sem tempo)
- **Filtro de aposta** (Amistoso, ≤100, 100–500, 500+)
- **Sort** (Mais recentes / Maior aposta / Maior rating / Menor rating)
- **Busca por @usuário** (case-insensitive)
- Toggle "Só joináveis" (oculta partidas fora da faixa de rating do viewer)

### Partidas privadas + Quick Match
- Quick Match: cria ou entra em partida com sua aposta e tempo automaticamente
- Partidas privadas (não aparecem no lobby — desafie amigo por link)

### Tempo, empate, rematch, chat
- Relógio com **9 presets** (30s, 1min, 2+1, 3min, 5+3, 10min, 15+10, 30+0, sem tempo)
- Auto-flag por tempo no client
- Oferta/aceitar/recusar empate · reivindicar empate (insufficient material, threefold, 50 lances)
- Rematch com cores invertidas
- Chat por partida com anti-flood + reactions rápidas
- Notificações de navegador (configurável)

### Configurações do tabuleiro
- Toggles persistentes em localStorage via `src/lib/board-prefs.ts`
- Destacar lances legais (on/off)
- Auto-promover pra rainha
- Coordenadas a-h/1-8 (on/off)
- **Velocidade da animação** das peças (Sem / Rápida / Normal / Lenta)
- Pack de sons (Clássico / Futurista / Suave)
- **Estilo das peças** (Clássico / Minimal / Neon / Royal) com preview — aplicado em partidas, puzzles e análises (`src/lib/piece-sets.ts`, unicode, zero assets)

### Histórico, análise e watch
- Histórico filtrável (vitória/derrota/empate, contra bot, etc.) com paginação
- **Review** com Stockfish (server-side + WASM fallback no browser) — CPL/accuracy por jogador + qualidade por lance
- **Gráfico de vantagem** no review (estilo chess.com): curva por lance reconstruída dos CPLs, clicável/arrastável pra navegar, blunders marcados em vermelho; navegação também por teclado (← → Home End)
- Página `/watch` pra assistir partidas ativas, `/overwatch` pra revisar suspeitas
- **Tempo por lance** exibido na lista após o fim (`/api/matches/[id]/moves` → `PgnList`)
- **Sparkline de rating** no perfil público (`/u/[username]`) — últimas 30 partidas
- **Anotação privada** por partida (textarea com auto-save em localStorage, apenas para jogadores em partidas finalizadas)
- **Dashboard pessoal** `/stats` — big numbers, breakdown por categoria de tempo com W/D/L empilhado, trajetória, atividade dos últimos 14 dias
- **Record de hoje** no topo do lobby — V/E/D e delta de rating do dia
- **Resumo agregado** em `/history` — total, win rate, contagem W/E/D, saldo
- **Onboarding** de 3 passos no primeiro acesso (modal dismissable, flag em localStorage)
- **Backup/Restore** das preferências em `/settings` (exporta/importa JSON com todas as chaves `xa.*`)

### Torneios + Marketplace
- Torneios estilo arena com leaderboard e prize pool
- Sistema de skins (board colors) com 6+ presets, marketplace P2P, drop por partida
- Inventory + shop com filtros por raridade

### Social
- Sistema de seguir (`/following`) + status online
- **Desafio direto** ⚔️ — desafie qualquer jogador pelo perfil ou pela lista de seguindo (tempo, aposta e cor configuráveis)
- **Inbox de desafios no lobby**: recebidos (aceitar/recusar com reembolso automático) e enviados (acompanhar/cancelar), com som de notificação
- Perfil público com stats, conquistas, trajetória, últimas partidas
- **Insights agregados** no perfil — lances médios, horário mais ativo, WR com brancas vs pretas
- Bônus diário com streak

### Anotações privadas
- **Anotação por partida** (textarea auto-save em localStorage) só em partidas finalizadas
- Página `/notes` lista todas as anotações com busca e link pra partida

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
│   ├── chess-bot.ts    # bot AI (minimax + alpha-beta + PST)
│   ├── bot-runner.ts   # executa lance do bot após cada move humano
│   ├── types.ts        # tipos TypeScript das tabelas
│   └── utils.ts
└── components/
    ├── LogoutButton.tsx
    └── NavLinks.tsx    # nav links com active state (usePathname)

supabase/migrations/0001_chess_arena_init.sql  # schema + RPCs
CLAUDE.md  # guia completo para desenvolvimento com agente Claude
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

## Considerações de produção (TODOs)

- Integração real com gateway de pagamento (Stripe Connect, PIX via Mercado Pago, etc)
- KYC/AML conforme legislação do seu país para apostas com dinheiro real
- Rate limiting distribuído (Upstash Redis) — hoje é in-memory por processo
- Detecção de cheating em background (job recorrente analisando partidas via Stockfish)
- Persistir streak/totals de puzzle no DB (hoje só localStorage)

## Licença

MIT — use à vontade.
