// GET /api/odds?date=AAAA-MM-DD&league=94&season=2026[&debug=1]
// Odds pré-jogo de uma liga num dia, já reduzidas aos mercados que a app usa.
import { af, handler, needDate, needInt, TZ } from '../lib/apiFootball.js';

// Nome do mercado na API-Football (normalizado) -> id do mercado na app.
// Se algum mercado não aparecer, abre /api/odds?...&debug=1 e vê os nomes em "betsSeen".
const BET_NAMES = {
  ft: ['matchwinner', 'fulltimeresult'],
  ht: ['firsthalfwinner'],
  dc: ['doublechance'],
  dnb: ['homeaway', 'drawnobet'],
  wbh: ['winbothhalves'],
  btts: ['bothteamsscore', 'bothteamstoscore'],
  btts1: ['bothteamsscorefirsthalf', 'bothteamstoscorefirsthalf'],
  ou: ['goalsoverunder'],
  ou1: ['goalsoverunderfirsthalf'],
  ou2: ['goalsoverundersecondhalf'],
  tgh: ['totalhome', 'hometeamtotalgoals'],
  tga: ['totalaway', 'awayteamtotalgoals'],
  hcp: ['asianhandicap'],
  hcp1: ['asianhandicapfirsthalf'],
  hcp2: ['asianhandicapsecondhalf'],
  cor: ['cornersoverunder', 'totalcorners'],
  sot: ['totalshotongoal', 'totalshotsontarget', 'shotsontarget'],
  soth: ['hometeamshotongoal', 'hometotalshotongoal', 'hometeamshotsontarget'],
  sota: ['awayteamshotongoal', 'awaytotalshotongoal', 'awayteamshotsontarget'],
};
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const LOOKUP = new Map(Object.entries(BET_NAMES).flatMap(([mid, names]) => names.map((n) => [n, mid])));

const PREFERRED = (process.env.PREFERRED_BOOKMAKERS || 'Betano,Betclic,Bet365')
  .split(',').map((s) => norm(s)).filter(Boolean);
const rank = (name) => { const i = PREFERRED.indexOf(norm(name)); return i < 0 ? 99 : i; };

const MAX_PAGES = 5;

export default handler(async (q) => {
  const date = needDate(q);
  const league = needInt(q, 'league');
  const season = needInt(q, 'season');
  const debug = q.get('debug') === '1';

  const entries = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const j = await af('odds', { date, league, season, timezone: TZ, page });
    entries.push(...(j.response || []));
    if (!j.paging || page >= j.paging.total) break;
  }

  const seen = new Set();
  const fixtures = entries.map((e) => {
    const markets = {};
    const books = [...(e.bookmakers || [])].sort((a, b) => rank(a.name) - rank(b.name));
    for (const bm of books) {
      for (const bet of bm.bets || []) {
        seen.add(bet.name);
        const mid = LOOKUP.get(norm(bet.name));
        if (!mid || markets[mid]) continue; // fica a casa de apostas preferida
        const sel = (bet.values || [])
          .filter((v) => !v.suspended && Number(v.odd) > 1)
          .map((v) => ({ v: String(v.value), h: v.handicap ?? null, o: Number(v.odd) }));
        if (sel.length) markets[mid] = { book: bm.name, sel };
      }
    }
    return { id: e.fixture.id, markets };
  });

  const body = { date, league, fixtures };
  if (debug) body.betsSeen = [...seen].sort();
  return { body, maxAge: debug ? 0 : 3600 };
});
