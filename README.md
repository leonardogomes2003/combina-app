# Combina

Gera multis de futebol a partir das ligas, dos tipos de aposta e dos intervalos de odds que escolhes. Os jogos e as odds vêm da [The Odds API](https://the-odds-api.com), no plano grátis.

## Como está montado

```
public/index.html   a app (HTML, CSS e JS num só ficheiro, instalável no telemóvel)
api/events.js       GET /api/events?date=AAAA-MM-DD[&all=1]           jogos por começar nesse dia (grátis)
api/odds.js         GET /api/odds?date=…&league=soccer_epl&markets=ft,ou,hcp   odds de uma liga nesse dia
api/status.js       GET /api/status                                    créditos que faltam (grátis)
lib/oddsApi.js      cliente da The Odds API, datas de Lisboa, erros e cache
```

A chave da API só existe no servidor (variável de ambiente). O browser nunca a vê.

## Créditos (plano grátis: 500 por mês)

- Lista de ligas e de jogos: grátis.
- Odds: 1 crédito por mercado, por liga, por região. Gerar com 3 ligas e 2 mercados gasta 6.
- A app só pede os mercados que escolheste e que ainda não carregou.
- As respostas ficam guardadas no CDN do Vercel: jogos 30 min (hoje) ou 6 h (dias seguintes), odds 1 h. Repetir a mesma consulta dentro desse tempo não gasta créditos.

No plano grátis só há três mercados no pedido por liga: Resultado Final (`h2h`), Mais/Menos Golos (`totals`) e Handicap (`spreads`). Os outros tipos de aposta aparecem na app mas ficam desativados com a API; continuam a funcionar no modo de exemplo.

## Publicar no Vercel

1. Em vercel.com, **Add New → Project** e importa este repositório. Não é preciso mudar nada na configuração.
2. Em **Settings → Environment Variables** adiciona:
   - `ODDS_API_KEY`: a tua chave (chega por email depois de te registares em the-odds-api.com).
   - `PREFERRED_BOOKMAKERS` (opcional): casas de apostas por ordem de preferência, separadas por vírgulas. Por defeito `Betclic,Unibet,Pinnacle,Bet365`.
   - `ODDS_REGIONS` (opcional): região das casas de apostas. Por defeito `eu`. Cada região a mais multiplica os créditos gastos.
3. Faz **Redeploy** para as variáveis entrarem em vigor.

Sem chave, a app abre em modo de dados de exemplo e avisa no topo.

## Correr no computador

```
ODDS_API_KEY=a_tua_chave npm run dev     # http://localhost:3000
npm test                                 # testa as funções /api contra uma API falsa
```

---

18+. Joga com responsabilidade.
