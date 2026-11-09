// GET /api/stats?league=soccer_portugal_primeira_liga
// Forças das equipas na época atual, a partir dos resultados da football-data.org (plano grátis).
// 1 pedido por liga, guardado 6 h no CDN.
import { handler, needKey, ApiError } from '../lib/oddsApi.js';
import { ratings } from '../lib/ratings.js';

const BASE = process.env.FOOTBALL_DATA_BASE || 'https://api.football-data.org/v4';

// Liga na The Odds API -> competição na football-data.org (as do plano grátis).
export const COMPETITIONS = {
  soccer_epl: 'PL',
  soccer_efl_champ: 'ELC',
  soccer_spain_la_liga: 'PD',
  soccer_italy_serie_a: 'SA',
  soccer_germany_bundesliga: 'BL1',
  soccer_france_ligue_one: 'FL1',
  soccer_netherlands_eredivisie: 'DED',
  soccer_portugal_primeira_liga: 'PPL',
  soccer_brazil_campeonato: 'BSA',
};

export default handler(async (q) => {
  const league = needKey(q, 'league');
  const code = COMPETITIONS[league];
  if (!code) throw new ApiError('Não há estatísticas grátis para esta liga.', 404, 'no_stats');
  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) throw new ApiError('Falta a variável FOOTBALL_DATA_KEY nas definições do Vercel.', 500, 'missing_key');

  let r;
  try {
    r = await fetch(`${BASE}/competitions/${code}/matches?status=FINISHED`, { headers: { 'X-Auth-Token': key } });
  } catch {
    throw new ApiError('Não consegui contactar a football-data.org.', 502);
  }
  let j = null;
  try { j = await r.json(); } catch {}
  if (r.status === 429) throw new ApiError('A football-data.org pediu para abrandar. Tenta daqui a um minuto.', 429, 'rate_limited');
  if (r.status === 400 || r.status === 403) throw new ApiError(j?.message || 'A football-data.org recusou o pedido (chave ou plano).', 502, 'bad_key');
  if (!r.ok) throw new ApiError(j?.message || `A football-data.org respondeu com erro ${r.status}.`, 502);

  const matches = (j?.matches || []).map((m) => ({
    t: Date.parse(m.utcDate),
    home: { name: m.homeTeam?.name, short: m.homeTeam?.shortName, tla: m.homeTeam?.tla },
    away: { name: m.awayTeam?.name, short: m.awayTeam?.shortName, tla: m.awayTeam?.tla },
    hg: m.score?.fullTime?.home,
    ag: m.score?.fullTime?.away,
  })).filter((m) => m.home.name && m.away.name);

  const body = { league, code, season: j?.filters?.season ?? j?.resultSet?.first?.slice(0, 4) ?? null, ...ratings(matches) };
  return { body, maxAge: 6 * 3600 };
});
