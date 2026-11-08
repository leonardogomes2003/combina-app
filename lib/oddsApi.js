// Cliente mínimo da The Odds API (v4). A chave fica só no servidor.
const BASE = process.env.ODDS_API_BASE || 'https://api.the-odds-api.com/v4';
export const TZ = 'Europe/Lisbon';

export class ApiError extends Error {
  constructor(message, status = 502, code = 'api_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Devolve { data, quota } — quota vem dos cabeçalhos x-requests-*.
// A The Odds API limita pedidos seguidos (429): espera e tenta outra vez antes de desistir.
export async function oa(path, params = {}, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      return await oaOnce(path, params);
    } catch (err) {
      if (err.code !== 'rate_limited' || i >= tries - 1) throw err;
      await sleep(err.retryAfter ?? 700 * (i + 1));
    }
  }
}

async function oaOnce(path, params) {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new ApiError('Falta a variável ODDS_API_KEY nas definições do Vercel.', 500, 'missing_key');
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set('apiKey', key);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);

  let r;
  try {
    r = await fetch(url);
  } catch {
    throw new ApiError('Não consegui contactar a The Odds API.', 502);
  }
  let j = null;
  try { j = await r.json(); } catch {}
  const quota = {
    remaining: num(r.headers.get('x-requests-remaining')),
    used: num(r.headers.get('x-requests-used')),
  };
  if (!r.ok) {
    const msg = j?.message || `A The Odds API respondeu com erro ${r.status}.`;
    if (r.status === 401) throw new ApiError(msg, 401, j?.error_code === 'OUT_OF_USAGE_CREDITS' ? 'no_credits' : 'bad_key');
    if (r.status === 429) {
      const e = new ApiError('A The Odds API pediu para abrandar. Tenta daqui a um minuto.', 429, 'rate_limited');
      const ra = Number(r.headers.get('retry-after'));
      if (ra > 0) e.retryAfter = Math.min(ra * 1000, 3000);
      throw e;
    }
    throw new ApiError(msg, r.status === 404 ? 404 : 502, r.status === 404 ? 'not_found' : 'api_error');
  }
  return { data: j, quota };
}
const num = (v) => (v == null || v === '' ? null : Number(v));

export const todayLisbon = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

// Offset de Lisboa (em minutos) num dado instante.
function offsetMin(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}
const iso = (ms) => new Date(ms).toISOString().slice(0, 19) + 'Z';

// Início e fim (UTC, sem milissegundos) de um dia de calendário em Lisboa.
// Para hoje, começa agora: só interessam jogos por começar.
export function dayRange(date) {
  const [y, m, d] = date.split('-').map(Number);
  const startGuess = Date.UTC(y, m - 1, d);
  const start = startGuess - offsetMin(new Date(startGuess)) * 60000;
  const endGuess = Date.UTC(y, m - 1, d + 1);
  const end = endGuess - offsetMin(new Date(endGuess)) * 60000 - 1000;
  return { from: iso(Math.max(start, Date.now())), to: iso(end), empty: end < Date.now() };
}

function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // s-maxage faz o CDN do Vercel guardar a resposta: pedidos repetidos não gastam créditos.
  res.setHeader('Cache-Control', maxAge ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}` : 'no-store');
  res.end(JSON.stringify(body));
}

export function handler(fn) {
  return async (req, res) => {
    try {
      const q = new URL(req.url, 'http://localhost').searchParams;
      const { body, maxAge = 0 } = await fn(q);
      send(res, 200, body, maxAge);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 400;
      send(res, status, { error: err.message, code: err.code || 'bad_request' });
    }
  };
}

export function needDate(q) {
  const d = q.get('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) throw new Error('Parâmetro "date" em falta ou inválido (AAAA-MM-DD).');
  return d;
}

export function needKey(q, name) {
  const v = q.get(name);
  if (!/^[a-z0-9_]+$/.test(v || '')) throw new Error(`Parâmetro "${name}" em falta ou inválido.`);
  return v;
}

// Ligas em destaque (chaves da The Odds API). As que não existirem são ignoradas.
export const CURATED = [
  'soccer_portugal_primeira_liga', 'soccer_uefa_champs_league', 'soccer_uefa_europa_league', 'soccer_uefa_europa_conference_league',
  'soccer_epl', 'soccer_fa_cup', 'soccer_spain_la_liga', 'soccer_italy_serie_a', 'soccer_germany_bundesliga', 'soccer_germany_bundesliga2',
  'soccer_france_ligue_one', 'soccer_netherlands_eredivisie', 'soccer_belgium_first_div', 'soccer_turkey_super_league',
  'soccer_denmark_superliga', 'soccer_sweden_allsvenskan', 'soccer_switzerland_superleague', 'soccer_austria_bundesliga',
  'soccer_norway_eliteserien', 'soccer_spl', 'soccer_brazil_campeonato',
];

// Lista de ligas de futebol ativas (grátis). Guardada em memória enquanto a função estiver quente.
let sportsCache = null;
export async function soccerLeagues() {
  if (sportsCache && Date.now() - sportsCache.at < 6 * 3600e3) return sportsCache.list;
  const { data } = await oa('sports');
  const list = (data || [])
    .filter((s) => s.group === 'Soccer' && s.active && !s.has_outrights)
    .map((s) => ({ key: s.key, title: s.title, description: s.description }));
  sportsCache = { at: Date.now(), list };
  return list;
}

// Corre fn sobre items com no máximo `n` pedidos em simultâneo.
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
