// GET /api/status — créditos da The Odds API. Usa a lista de desportos, que é grátis.
import { oa, handler } from '../lib/oddsApi.js';

export default handler(async () => {
  const { quota } = await oa('sports');
  const total = quota.remaining != null && quota.used != null ? quota.remaining + quota.used : null;
  return { body: { remaining: quota.remaining, used: quota.used, total } };
});
