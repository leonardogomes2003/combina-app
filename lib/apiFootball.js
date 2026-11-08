// Cliente mínimo da API-Football (v3). A chave fica só no servidor.
const BASE = process.env.API_FOOTBALL_BASE || 'https://v3.football.api-sports.io';
export const TZ = 'Europe/Lisbon';

export class ApiError extends Error {
  constructor(message, status = 502, code = 'api_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function af(path, params = {}) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new ApiError('Falta a variável API_FOOTBALL_KEY nas definições do Vercel.', 500, 'missing_key');
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);

  let r;
  try {
    r = await fetch(url, { headers: { 'x-apisports-key': key } });
  } catch {
    throw new ApiError('Não consegui contactar a API-Football.', 502);
  }
  if (r.status === 429) throw new ApiError('Limite de pedidos da API-Football atingido. Tenta daqui a pouco.', 429, 'rate_limited');
  if (!r.ok) throw new ApiError(`A API-Football respondeu com erro ${r.status}.`, 502);

  const j = await r.json();
  // A API devolve 200 com um campo "errors" quando algo falha (chave, plano, parâmetros).
  const e = j.errors;
  const msgs = Array.isArray(e) ? e : e && typeof e === 'object' ? Object.values(e) : [];
  if (msgs.length) throw new ApiError(msgs.join(' '), 502, 'api_error');
  return j;
}

export const todayLisbon = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // s-maxage faz o CDN do Vercel guardar a resposta: pedidos repetidos não gastam quota.
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

export function needInt(q, name) {
  const v = q.get(name);
  if (!/^\d+$/.test(v || '')) throw new Error(`Parâmetro "${name}" em falta ou inválido.`);
  return Number(v);
}
