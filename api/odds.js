// GET /api/odds?date=AAAA-MM-DD&league=soccer_epl&markets=ft,ou,hcp
// Odds de uma liga num dia, com a leitura do mercado para cada seleção:
//   p     probabilidade estimada (odds sem a margem da casa; Pinnacle se existir, senão mediana das casas)
//   src   'pinnacle' ou 'consenso'
//   n     nº de casas que oferecem a seleção
//   odds  { "Betclic (FR)": 2.10, ... } odd de cada casa
// Custa (nº de mercados × nº de regiões) créditos da The Odds API, por isso só se pedem os mercados usados.
import { oa, handler, needDate, needKey, dayRange } from '../lib/oddsApi.js';

// Mercado da app -> mercado da The Odds API (os que o plano grátis dá no pedido por liga).
export const MARKETS = { ft: 'h2h', ou: 'totals', hcp: 'spreads' };
const BACK = Object.fromEntries(Object.entries(MARKETS).map(([a, b]) => [b, a]));
const REGIONS = process.env.ODDS_REGIONS || 'eu';
const SHARP = 'pinnacle';

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

// Converte resultados para { v: 'Home'|'Away'|'Draw'|'Over'|'Under', h: linha, o: odd }.
function outcomes(market, e) {
  return (market.outcomes || []).map((o) => {
    let v = o.name;
    if (o.name === e.home_team) v = 'Home';
    else if (o.name === e.away_team) v = 'Away';
    return { v, h: o.point ?? null, o: Number(o.price) };
  }).filter((s) => s.o > 1);
}

// Separa os resultados de uma casa em conjuntos completos (que somam 100% sem margem):
// 1X2 inteiro; Over/Under da mesma linha; Casa/Fora com handicaps simétricos.
function completeSets(key, outs) {
  if (key === 'h2h') return outs.length === 3 ? [outs] : [];
  const groups = new Map();
  for (const o of outs) {
    const line = key === 'totals' ? o.h : (o.v === 'Home' ? o.h : -o.h);
    if (line == null) continue;
    if (!groups.has(line)) groups.set(line, []);
    groups.get(line).push(o);
  }
  return [...groups.values()].filter((g) => g.length === 2 && g[0].v !== g[1].v);
}

export function analyse(e) {
  const acc = {}; // mid -> chave do resultado -> { v, h, odds: {}, probs: {} }
  for (const bm of e.bookmakers || []) {
    for (const mk of bm.markets || []) {
      const mid = BACK[mk.key];
      if (!mid) continue;
      for (const set of completeSets(mk.key, outcomes(mk, e))) {
        const sum = set.reduce((a, s) => a + 1 / s.o, 0);
        for (const s of set) {
          const k = `${s.v}|${s.h}`;
          acc[mid] ??= {};
          const slot = (acc[mid][k] ??= { v: s.v, h: s.h, odds: {}, probs: {}, sharp: null });
          slot.odds[bm.title] = s.o;
          slot.probs[bm.title] = (1 / s.o) / sum;
          if (bm.key === SHARP) slot.sharp = (1 / s.o) / sum;
        }
      }
    }
  }
  const markets = {};
  for (const [mid, slots] of Object.entries(acc)) {
    markets[mid] = {
      sel: Object.values(slots).map((s) => {
        const ps = Object.values(s.probs);
        const p = s.sharp ?? median(ps);
        return { v: s.v, h: s.h, p: round(p), src: s.sharp != null ? 'pinnacle' : 'consenso', n: ps.length, odds: s.odds };
      }),
    };
  }
  return markets;
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

  const fixtures = (data || []).map((e) => ({ id: e.id, markets: analyse(e) }));
  return { body: { date, league, fixtures, quota }, maxAge: 3600 };
});
