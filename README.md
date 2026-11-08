# Combina

Gera multis de futebol a partir das ligas, dos tipos de aposta e dos intervalos de odds que escolhes. Os jogos e as odds vêm da [API-Football](https://www.api-football.com).

## Como está montado

```
public/index.html        a app (HTML, CSS e JS num só ficheiro, instalável no telemóvel)
api/fixtures.js          GET /api/fixtures?date=AAAA-MM-DD      jogos por começar nesse dia
api/odds.js              GET /api/odds?date=…&league=…&season=…  odds de uma liga nesse dia
api/status.js            GET /api/status                          pedidos gastos hoje (não conta para a quota)
lib/apiFootball.js       cliente da API-Football, erros e cache
```

A chave da API só existe no servidor (variável de ambiente). O browser nunca a vê.

## Quota (plano grátis: 100 pedidos/dia)

- Abrir a app num dia: 1 pedido (`/fixtures`).
- Gerar multis: 1 pedido por liga escolhida (mais, se a liga tiver muitos jogos com odds).
- As respostas ficam guardadas no CDN do Vercel: jogos 30 min (hoje) ou 6 h (dias seguintes), odds 1 h. Repetir a mesma consulta dentro desse tempo não gasta quota.

## Publicar no Vercel

1. Em vercel.com, **Add New → Project** e importa este repositório. Não é preciso mudar nada na configuração.
2. Em **Settings → Environment Variables** adiciona:
   - `API_FOOTBALL_KEY`: a tua chave (dashboard.api-football.com → Account → My Access).
   - `PREFERRED_BOOKMAKERS` (opcional): casas de apostas por ordem de preferência, separadas por vírgulas. Por defeito `Betano,Betclic,Bet365`.
3. Faz **Redeploy** para as variáveis entrarem em vigor.

Sem chave, a app abre em modo de dados de exemplo e avisa no topo.

## Correr no computador

```
API_FOOTBALL_KEY=a_tua_chave npm run dev     # http://localhost:3000
npm test                                     # testa as funções /api contra uma API falsa
```

## Se um mercado não aparecer

Os nomes dos mercados na API-Football são associados aos da app em `api/odds.js` (`BET_NAMES`). Para ver os nomes que a API devolve de facto, abre:

```
/api/odds?date=AAAA-MM-DD&league=94&season=2026&debug=1
```

e procura a lista `betsSeen`.

---

18+. Joga com responsabilidade.
