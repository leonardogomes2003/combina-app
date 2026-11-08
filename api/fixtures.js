// GET /api/fixtures?date=AAAA-MM-DD
// Jogos por começar nesse dia, em todas as ligas. Gasta 1 pedido por dia por janela de cache.
import { af, handler, needDate, todayLisbon, TZ } from '../lib/apiFootball.js';

export default handler(async (q) => {
  const date = needDate(q);
  const j = await af('fixtures', { date, timezone: TZ });
  const fixtures = (j.response || [])
    .filter((x) => ['NS', 'TBD'].includes(x.fixture?.status?.short))
    .map((x) => ({
      id: x.fixture.id,
      ts: x.fixture.timestamp,
      league: { id: x.league.id, name: x.league.name, country: x.league.country, season: x.league.season },
      home: x.teams.home.name,
      away: x.teams.away.name,
    }));
  // Hoje muda mais (jogos a começar); dias futuros ficam em cache mais tempo.
  const maxAge = date === todayLisbon() ? 1800 : 6 * 3600;
  return { body: { date, fixtures }, maxAge };
});
