// Testa as funções /api contra uma The Odds API falsa (sem gastar créditos). Uso: npm test
import http from 'node:http';
import assert from 'node:assert/strict';

const soon = (h) => new Date(Date.now() + h * 3600e3).toISOString().slice(0, 19) + 'Z';
const events = {
  soccer_portugal_primeira_liga: [
    { id: 'e1', home_team: 'Benfica', away_team: 'Arouca', commence_time: soon(2) },
    { id: 'e2', home_team: 'FC Porto', away_team: 'Estoril', commence_time: soon(1) },
  ],
  soccer_epl: [{ id: 'e3', home_team: 'Arsenal', away_team: 'Fulham', commence_time: soon(3) }],
  soccer_ukraine_premier_league: [{ id: 'e4', home_team: 'A', away_team: 'B', commence_time: soon(3) }],
};
const sports = [
  { key: 'soccer_portugal_primeira_liga', group: 'Soccer', title: 'Primeira Liga - Portugal', description: 'Portugal', active: true, has_outrights: false },
  { key: 'soccer_epl', group: 'Soccer', title: 'EPL', description: 'England', active: true, has_outrights: false },
  { key: 'soccer_ukraine_premier_league', group: 'Soccer', title: 'Premier League - Ukraine', description: 'Ukraine', active: true, has_outrights: false },
  { key: 'soccer_fifa_world_cup_winner', group: 'Soccer', title: 'World Cup Winner', active: true, has_outrights: true },
  { key: 'basketball_nba', group: 'Basketball', title: 'NBA', active: true, has_outrights: false },
];
const book = (key, title, mul, markets) => ({
  key, title,
  markets: markets.map((m) => ({
    key: m,
    outcomes: m === 'h2h'
      ? [{ name: 'Benfica', price: 1.4 * mul }, { name: 'Draw', price: 4.5 * mul }, { name: 'Arouca', price: 7 * mul }]
      : m === 'totals'
        ? [{ name: 'Over', price: 1.8 * mul, point: 2.5 }, { name: 'Under', price: 2 * mul, point: 2.5 }]
        : [{ name: 'Benfica', price: 2.1 * mul, point: -1.5 }, { name: 'Arouca', price: 1.7 * mul, point: 1.5 }],
  })),
});

let calls = [];
let throttleOnce = true;
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  calls.push(u.pathname + u.search);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('x-requests-remaining', '480');
  res.setHeader('x-requests-used', '20');
  if (u.searchParams.get('apiKey') !== 'k') { res.statusCode = 401; return res.end(JSON.stringify({ message: 'API key is not valid', error_code: 'INVALID_KEY' })); }
  assert.ok(!/\.\d{3}Z/.test(u.search), 'datas sem milissegundos');
  if (u.pathname === '/sports') return res.end(JSON.stringify(sports));
  let m = u.pathname.match(/^\/sports\/([a-z_]+)\/events$/);
  if (m && m[1] === 'soccer_epl' && throttleOnce) { throttleOnce = false; res.statusCode = 429; return res.end(JSON.stringify({ message: 'Too many requests' })); }
  if (m) return res.end(JSON.stringify(events[m[1]] || []));
  m = u.pathname.match(/^\/sports\/([a-z_]+)\/odds$/);
  if (m) {
    const mk = u.searchParams.get('markets').split(',');
    return res.end(JSON.stringify((events[m[1]] || []).slice(0, 1).map((e) => ({
      ...e, home_team: 'Benfica', away_team: 'Arouca',
      bookmakers: [book('pinnacle', 'Pinnacle', 1.05, mk), book('betclic', 'Betclic', 1, mk.filter((x) => x !== 'spreads'))],
    }))));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ message: 'Unknown sport' }));
});
await new Promise((r) => mock.listen(0, r));
process.env.ODDS_API_BASE = `http://127.0.0.1:${mock.address().port}`;
process.env.ODDS_API_KEY = 'k';

const call = async (name, qs) => {
  const mod = await import(`../api/${name}.js`);
  const headers = {};
  let body = '';
  const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: (b) => { body = b; } };
  await mod.default({ url: `/api/${name}?${qs}` }, res);
  return { status: res.statusCode, headers, json: JSON.parse(body) };
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());

// eventos: só ligas em destaque, só futebol sem outrights, com um 429 a meio que deve ser repetido
calls = [];
let r = await call('events', `date=${today}`);
assert.equal(r.status, 200, JSON.stringify(r.json));
const idsToday = r.json.fixtures.map((f) => f.id);
// Perto da meia-noite os jogos "daqui a 2-3 h" podem cair no dia seguinte; o teste aceita isso.
assert.equal(throttleOnce, false, 'o 429 aconteceu');
assert.ok(calls.filter((c) => c.includes('soccer_epl/events')).length === 2, 'repetiu depois do 429');
assert.ok(idsToday.every((id) => ['e1', 'e2', 'e3'].includes(id)), 'sem ligas fora do destaque');
assert.match(r.headers['cache-control'], /s-maxage=1800/);
r = await call('events', `date=${today}&all=1`);
assert.ok(r.json.fixtures.length >= idsToday.length);

// odds: mercados pedidos, casa preferida, conversão Home/Away/Draw
calls = [];
r = await call('odds', `date=${today}&league=soccer_portugal_primeira_liga&markets=ft,ou,hcp,dc`);
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.match(calls[0], /markets=h2h%2Ctotals%2Cspreads/, 'dc não é pedido (não existe no plano grátis)');
if (r.json.fixtures.length) {
  const m = r.json.fixtures[0].markets;
  const home = m.ft.sel.find((x) => x.v === 'Home');
  assert.deepEqual(m.ft.sel.map((x) => x.v).sort(), ['Away', 'Draw', 'Home']);
  assert.deepEqual(Object.keys(home.odds).sort(), ['Betclic', 'Pinnacle'], 'odds de todas as casas');
  assert.equal(home.src, 'pinnacle');
  assert.equal(home.n, 2);
  const imp = [1.4, 4.5, 7].map((o) => 1 / (o * 1.05));
  assert.ok(Math.abs(home.p - imp[0] / imp.reduce((a, b) => a + b)) < 1e-3, 'probabilidade sem margem da Pinnacle');
  const sum = m.ft.sel.reduce((a, x) => a + x.p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-3, '1X2 soma 100%');
  const over = m.ou.sel.find((x) => x.v === 'Over');
  assert.equal(over.h, 2.5);
  assert.ok(Math.abs(over.p + m.ou.sel.find((x) => x.v === 'Under').p - 1) < 1e-3);
  const hh = m.hcp.sel.find((x) => x.v === 'Home');
  assert.equal(hh.h, -1.5);
  assert.deepEqual(Object.keys(hh.odds), ['Pinnacle'], 'Betclic não tem handicap no mock');
  assert.equal(r.json.quota.remaining, 480);
}

// consenso (sem Pinnacle): mediana das casas
{
  const { analyse } = await import('../api/odds.js');
  const e = { home_team: 'A', away_team: 'B', bookmakers: [
    { key: 'x', title: 'X', markets: [{ key: 'totals', outcomes: [{ name: 'Over', point: 2.5, price: 2 }, { name: 'Under', point: 2.5, price: 1.8 }, { name: 'Over', point: 3.5, price: 3 }] }] },
    { key: 'y', title: 'Y', markets: [{ key: 'totals', outcomes: [{ name: 'Over', point: 2.5, price: 1.9 }, { name: 'Under', point: 2.5, price: 1.9 }] }] },
  ] };
  const mk = analyse(e).ou.sel;
  assert.equal(mk.length, 2, 'linha 3.5 incompleta fica de fora');
  const o = mk.find((x) => x.v === 'Over');
  assert.equal(o.src, 'consenso');
  const px = (1 / 2) / (1 / 2 + 1 / 1.8), py = 0.5;
  assert.ok(Math.abs(o.p - (px + py) / 2) < 1e-3);
}

// status
r = await call('status', '');
assert.deepEqual(r.json, { remaining: 480, used: 20, total: 500 });
assert.equal(r.headers['cache-control'], 'no-store');

// erros
r = await call('odds', 'date=ontem&league=soccer_epl');
assert.equal(r.status, 400);
r = await call('odds', `date=${today}&league=../x`);
assert.equal(r.status, 400);
process.env.ODDS_API_KEY = 'errada';
r = await call('odds', `date=${today}&league=soccer_epl&markets=ft`);
assert.equal(r.status, 401);
assert.equal(r.json.code, 'bad_key');
assert.equal(r.headers['cache-control'], 'no-store', 'erros não ficam em cache');
delete process.env.ODDS_API_KEY;
r = await call('status', '');
assert.equal(r.json.code, 'missing_key');

mock.close();

// ---------- estatísticas (football-data.org falsa) ----------
{
  const { ratings } = await import('../lib/ratings.js');
  const day = 864e5, now = Date.parse('2026-11-01T00:00:00Z');
  const T = (n) => ({ name: n, short: n, tla: n.slice(0, 3).toUpperCase() });
  const ms = [];
  // A ganha sempre em casa por 3-0; B e C empatam 1-1
  for (let i = 0; i < 6; i++) ms.push({ t: now - i * 7 * day, home: T('A'), away: T(i % 2 ? 'B' : 'C'), hg: 3, ag: 0 });
  for (let i = 0; i < 6; i++) ms.push({ t: now - i * 7 * day, home: T(i % 2 ? 'B' : 'C'), away: T(i % 2 ? 'C' : 'B'), hg: 1, ag: 1 });
  ms.push({ t: now, home: T('A'), away: T('B'), hg: null, ag: null }); // por jogar: ignorado
  const r = ratings(ms, now);
  assert.equal(r.matches, 12);
  const A = r.teams.find((t) => t.name === 'A');
  assert.ok(A.attH > 1.2 && A.defH < 0.6, 'A forte em casa');
  assert.ok(A.attA === 1 && A.defA === 1, 'sem jogos fora: fica na média');
  assert.equal(A.form, 'VVVVV');
  const old = ratings([{ t: now - 400 * day, home: T('X'), away: T('Y'), hg: 5, ag: 0 }, { t: now, home: T('Y'), away: T('X'), hg: 0, ag: 0 }], now);
  assert.ok(old.avgHome < 2.5, 'jogos antigos pesam menos');
}

const fd = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.headers['x-auth-token'] !== 'fd') { res.statusCode = 400; return res.end(JSON.stringify({ message: 'Your API token is invalid.' })); }
  assert.match(req.url, /^\/competitions\/PPL\/matches\?status=FINISHED$/);
  res.end(JSON.stringify({ filters: { season: '2026' }, matches: [
    { utcDate: '2026-10-20T19:00:00Z', homeTeam: { name: 'Sport Lisboa e Benfica', shortName: 'Benfica', tla: 'SLB' }, awayTeam: { name: 'FC Porto', shortName: 'Porto', tla: 'FCP' }, score: { fullTime: { home: 2, away: 1 } } },
    { utcDate: '2026-10-27T19:00:00Z', homeTeam: { name: 'FC Porto', shortName: 'Porto', tla: 'FCP' }, awayTeam: { name: 'Sport Lisboa e Benfica', shortName: 'Benfica', tla: 'SLB' }, score: { fullTime: { home: 0, away: 0 } } },
  ] }));
});
await new Promise((r) => fd.listen(0, r));
process.env.FOOTBALL_DATA_BASE = `http://127.0.0.1:${fd.address().port}`;
r = await call('stats', 'league=soccer_epl');
assert.equal(r.json.code, 'missing_key');
process.env.FOOTBALL_DATA_KEY = 'fd';
r = await call('stats', 'league=soccer_portugal_primeira_liga');
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.equal(r.json.code, 'PPL');
assert.equal(r.json.season, '2026');
assert.equal(r.json.matches, 2);
assert.equal(r.json.teams.find((t) => t.short === 'Benfica').form, 'EV');
assert.match(r.headers['cache-control'], /s-maxage=21600/);
r = await call('stats', 'league=soccer_turkey_super_league');
assert.equal(r.json.code, 'no_stats');
process.env.FOOTBALL_DATA_KEY = 'errada';
r = await call('stats', 'league=soccer_portugal_primeira_liga');
assert.equal(r.json.code, 'bad_key');
fd.close();
console.log('Tudo certo.');
