// GET /api/odds?date=AAAA-MM-DD&league=soccer_epl&markets=ft,ou,hcp
// Odds de uma liga num dia. Custa (nº de mercados × nº de regiões) créditos da The Odds API,
// por isso só se pedem os mercados que a app vai usar.
import { oa, handler, needDate, needKey, dayRange } from '../lib/oddsApi.js';

// Mercado da app -> mercado da The Odds API (os que o plano grátis dá no pedido por liga).
export const MARKETS = { ft: 'h2h', ou: 'totals', hcp: 'spreads' };
const BACK = Object.fromEntries(Object.entries(MARKETS).map(([a, b]) => [b, a]));

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const PREFERRED = (process.env.PREFERRED_BOOKMAKERS || 'Betclic,Unibet,Pinnacle,Bet365')
  .split(',').map(norm).filter(Boolean);
const rank = (b) => { const i = Math.min(...[norm(b.title), norm(b.key)].map((n) => { const k = PREFERRED.indexOf(n); return k < 0 ? 99 : k; })); return i; };
const REGIONS = process.env.ODDS_REGIONS || 'eu';

// Converte os resultados da The Odds API para { v: 'Home'|'Away'|'Draw'|'Over'|'Under', h: linha, o: odd }.
function outcomes(market, e) {
  return (market.outcomes || []).map((o) => {
    let v = o.name;
    if (o.name === e.home_team) v = 'Home';
    else if (o.name === e.away_team) v = 'Away';
    return { v, h: o.point ?? null, o: Number(o.price) };
  }).filter((s) => s.o > 1);
}

export default handler(async (q) => {
  const date = needDate(q);
  const league = needKey(q, 'league');
  const wanted = (q.get('markets') || 'ft').split(',').filter((m) => MARKETS[m]);
  if (!wanted.length) throw new Error('Nenhum mercado suportado pedido.');
  const { from, to, empty } = dayRange(date);
  if (empty) return { body: { date, league, fixtures: [] }, maxAge: 3600 };

  const { data, quota } = await oa(`sports/${league}/odds`, {
    regions: REGIONS,
    markets: [...new Set(wanted.map((m) => MARKETS[m]))].join(','),
    oddsFormat: 'decimal',
    dateFormat: 'iso',
    commenceTimeFrom: from,
    commenceTimeTo: to,
  });

  const fixtures = (data || []).map((e) => {
    const markets = {};
    const books = [...(e.bookmakers || [])].sort((a, b) => rank(a) - rank(b));
    for (const bm of books) {
      for (const mk of bm.markets || []) {
        const mid = BACK[mk.key];
        if (!mid || markets[mid]) continue; // fica a casa de apostas preferida
        const sel = outcomes(mk, e);
        if (sel.length) markets[mid] = { book: bm.title, sel };
      }
    }
    return { id: e.id, markets };
  });

  return { body: { date, league, fixtures, quota }, maxAge: 3600 };
});
