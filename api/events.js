// GET /api/events?date=AAAA-MM-DD[&all=1]
// Jogos por começar nesse dia. A lista de jogos é grátis na The Odds API (não gasta créditos).
import { oa, handler, needDate, todayLisbon, dayRange, soccerLeagues, pool, CURATED, ApiError } from '../lib/oddsApi.js';

export default handler(async (q) => {
  const date = needDate(q);
  const all = q.get('all') === '1';
  const { from, to, empty } = dayRange(date);
  const leagues = await soccerLeagues();
  const chosen = all ? leagues : leagues.filter((l) => CURATED.includes(l.key));

  const fixtures = [];
  if (!empty) {
    await pool(chosen, 6, async (l) => {
      try {
        const { data } = await oa(`sports/${l.key}/events`, { commenceTimeFrom: from, commenceTimeTo: to, dateFormat: 'iso' });
        for (const e of data || []) {
          fixtures.push({
            id: e.id,
            ts: Math.floor(Date.parse(e.commence_time) / 1000),
            league: { id: l.key, name: l.title, country: l.description || '' },
            home: e.home_team,
            away: e.away_team,
          });
        }
      } catch (err) {
        // Uma liga sem jogos/inativa não deve estragar o dia; chave errada ou limite, sim.
        if (err instanceof ApiError && ['bad_key', 'no_credits', 'rate_limited', 'missing_key'].includes(err.code)) throw err;
      }
    });
  }
  fixtures.sort((a, b) => a.ts - b.ts);
  const maxAge = date === todayLisbon() ? 1800 : 6 * 3600;
  return { body: { date, all, fixtures }, maxAge };
});
