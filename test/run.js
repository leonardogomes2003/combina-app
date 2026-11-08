// Testa as funções /api contra uma API-Football falsa (sem gastar pedidos). Uso: npm test
import http from 'node:http';
import assert from 'node:assert/strict';

const teams = [['Benfica', 'Arouca'], ['FC Porto', 'Estoril'], ['Arsenal', 'Fulham']];
const fixtures = teams.map(([h, a], i) => ({
  fixture: { id: 100 + i, timestamp: 1794160800 + i * 3600, date: '', status: { short: 'NS' } },
  league: i < 2 ? { id: 94, name: 'Liga Portugal', country: 'Portugal', season: 2026 } : { id: 39, name: 'Premier League', country: 'England', season: 2026 },
  teams: { home: { name: h }, away: { name: a } },
}));
fixtures.push({ ...fixtures[0], fixture: { ...fixtures[0].fixture, id: 999, status: { short: 'FT' } } });

const bets = [
  { id: 1, name: 'Match Winner', values: [{ value: 'Home', odd: '1.45' }, { value: 'Draw', odd: '4.50' }, { value: 'Away', odd: '7.00' }] },
  { id: 12, name: 'Double Chance', values: [{ value: 'Home/Draw', odd: '1.10' }, { value: 'Home/Away', odd: '1.20' }, { value: 'Draw/Away', odd: '2.60' }] },
  { id: 5, name: 'Goals Over/Under', values: [{ value: 'Over 2.5', odd: '1.80' }, { value: 'Under 2.5', odd: '2.00', suspended: true }] },
  { id: 4, name: 'Asian Handicap', values: [{ value: 'Home', handicap: '-1.5', odd: '2.10' }, { value: 'Away', handicap: '+1.5', odd: '1.70' }] },
  { id: 99, name: 'Something Exotic', values: [{ value: 'X', odd: '3' }] },
];
let calls = [];
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  calls.push(u.pathname + u.search);
  res.setHeader('Content-Type', 'application/json');
  if (req.headers['x-apisports-key'] !== 'k') return res.end(JSON.stringify({ errors: { token: 'Invalid key' }, response: [] }));
  if (u.pathname === '/fixtures') return res.end(JSON.stringify({ errors: [], response: fixtures }));
  if (u.pathname === '/status') return res.end(JSON.stringify({ errors: [], response: { subscription: { plan: 'Free' }, requests: { current: 7, limit_day: 100 } } }));
  if (u.pathname === '/odds') {
    const league = Number(u.searchParams.get('league')), page = Number(u.searchParams.get('page'));
    const mine = fixtures.filter((f) => f.league.id === league && f.fixture.status.short === 'NS');
    const resp = mine.slice(page - 1, page).map((f) => ({
      fixture: { id: f.fixture.id },
      bookmakers: [
        { id: 8, name: 'Bet365', bets: bets.map((b) => ({ ...b, values: b.values.map((v) => ({ ...v, odd: String(Number(v.odd) + 0.05) })) })) },
        { id: 32, name: 'Betano', bets: bets.slice(0, 2) },
      ],
    }));
    return res.end(JSON.stringify({ errors: [], paging: { current: page, total: mine.length }, response: resp }));
  }
  res.end(JSON.stringify({ errors: ['unknown'], response: [] }));
});
await new Promise((r) => mock.listen(0, r));
process.env.API_FOOTBALL_BASE = `http://127.0.0.1:${mock.address().port}`;
process.env.API_FOOTBALL_KEY = 'k';

const call = async (name, qs) => {
  const mod = await import(`../api/${name}.js`);
  const headers = {};
  let body = '';
  const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: (b) => { body = b; } };
  await mod.default({ url: `/api/${name}?${qs}` }, res);
  return { status: res.statusCode, headers, json: JSON.parse(body) };
};

// fixtures
let r = await call('fixtures', 'date=2030-01-05');
assert.equal(r.status, 200);
assert.equal(r.json.fixtures.length, 3, 'só jogos por começar');
assert.match(r.headers['cache-control'], /s-maxage=21600/);
assert.deepEqual(r.json.fixtures[0].league, { id: 94, name: 'Liga Portugal', country: 'Portugal', season: 2026 });

// odds: paginação, casa preferida, mercados mapeados, suspensas fora
calls = [];
r = await call('odds', 'date=2030-01-05&league=94&season=2026&debug=1');
assert.equal(r.status, 200);
assert.equal(calls.length, 2, 'percorre as 2 páginas');
assert.equal(r.json.fixtures.length, 2);
const m = r.json.fixtures[0].markets;
assert.equal(m.ft.book, 'Betano', 'Betano tem prioridade');
assert.equal(m.ft.sel[0].o, 1.45);
assert.equal(m.ou.book, 'Bet365', 'cai para a seguinte quando a preferida não tem o mercado');
assert.equal(m.ou.sel.length, 1, 'odd suspensa removida');
assert.deepEqual(m.hcp.sel[0], { v: 'Home', h: '-1.5', o: 2.15 });
assert.ok(!('Something Exotic' in m));
assert.ok(r.json.betsSeen.includes('Something Exotic'));

// status
r = await call('status', '');
assert.deepEqual(r.json, { plan: 'Free', used: 7, limit: 100 });
assert.equal(r.headers['cache-control'], 'no-store');

// erros
r = await call('odds', 'date=ontem&league=94&season=2026');
assert.equal(r.status, 400);
process.env.API_FOOTBALL_KEY = 'errada';
r = await call('fixtures', 'date=2030-01-05');
assert.equal(r.status, 502);
assert.equal(r.json.code, 'api_error');
assert.equal(r.json.error, 'Invalid key');
assert.equal(r.headers['cache-control'], 'no-store', 'erros não ficam em cache');
delete process.env.API_FOOTBALL_KEY;
r = await call('fixtures', 'date=2030-01-05');
assert.equal(r.json.code, 'missing_key');

mock.close();
console.log('Tudo certo.');
