# 🗺️ Waystone Profit — Calculadora de Corrupção T15 → T16 (PoE2)

Ferramenta de página única (HTML + localStorage, **sem build, sem servidor**) para acompanhar o craft de corrupção de Waystones no Path of Exile 2 e ter certeza de que está lucrando.

**Como usar:** abra `index.html` no navegador. Pronto. Os dados ficam salvos só no seu navegador.

## O craft

`Waystone T15` + `Alchemy` + `2× Exalt` + `Vaal` → aposta:

| Resultado | Significado | Ação |
|-----------|-------------|------|
| **T16** | tier +1 (perfeito) | vender caro 💰 |
| **T15** | manteve o tier (afixos podem mudar) | vender se ≥ limite (padrão 5 ex) |
| **T14** | tier −1 | lixo ❌ |

## O que a ferramenta faz

- **Aprende suas taxas reais** de T16/T15/T14 conforme você registra cada craft (não chuta probabilidades).
- **Custo do período** + receita + **lucro líquido** (filtro por mês ou geral).
- **EV (valor esperado) por craft** — real (suas taxas) e teórico (estimativa da comunidade), com veredito ✅/❌.
- **Break-even**: a que preço a T16 precisa ser vendida pra você empatar.
- Preços 100% editáveis (em Exalted Orbs), histórico, export/import JSON, backup.

## Mecânica (pesquisa · patch 0.5.x "Runes of Aldur", jun/2026)

- **T16 só sai corrompendo uma T15** — único jeito de passar do cap normal.
- Corrupção é **definitiva**: por isso aplica-se Alchemy + Exalt **antes** do Vaal (item corrompido não aceita mais orbs).
- Vaal numa Waystone tem ~4 resultados; o de tier é **±1**. Estimativa comum da comunidade: ~12,5% T16 / ~12,5% T14 / ~75% mantém T15 — **as fontes divergem**, então a ferramenta mede a taxa real.
- Mudanças da liga atual: *Omen of Corruption* removido (tier-up virou aposta pura); waystones precisam ser identificadas. Os patch notes 0.5.x mexeram em sustain/quantidade, não nas odds de corrupção.

Fontes: Maxroll, timesaver.gg, Mobalytics, PoE2 Wiki (Fextralife), Game8, Gamerant.

> ⚠️ Probabilidades de jogo mudam entre patches e as fontes divergem. Trate o modelo teórico como referência e confie nas **suas taxas reais** após ~30–50 crafts.
