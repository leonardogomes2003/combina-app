// GET /api/status — pedidos gastos hoje. Esta chamada não conta para a quota da API-Football.
import { af, handler } from '../lib/apiFootball.js';

export default handler(async () => {
  const j = await af('status');
  const r = Array.isArray(j.response) ? j.response[0] : j.response;
  return {
    body: {
      plan: r?.subscription?.plan ?? null,
      used: r?.requests?.current ?? null,
      limit: r?.requests?.limit_day ?? null,
    },
  };
});
