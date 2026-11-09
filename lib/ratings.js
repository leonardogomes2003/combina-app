// Forças das equipas a partir dos resultados da época (modelo de Poisson simples).
//
// Para cada equipa calcula quatro números relativos à média da liga:
//   attH  golos marcados em casa        defH  golos sofridos em casa
//   attA  golos marcados fora           defA  golos sofridos fora
// Golos esperados num jogo:  casa = mediaCasa × attH(casa) × defA(fora)
//                            fora = mediaFora × attA(fora) × defH(casa)
// Jogos recentes pesam mais (meia-vida HALF_LIFE dias) e cada equipa começa com SHRINK
// "jogos fictícios" na média da liga, para não exagerar no início da época.

export const HALF_LIFE = 120;
export const SHRINK = 4;

export function ratings(matches, now = Date.now()) {
  const done = matches.filter((m) => Number.isFinite(m.hg) && Number.isFinite(m.ag));
  const w = (m) => Math.pow(0.5, Math.max(0, (now - m.t) / 864e5) / HALF_LIFE);
  let W = 0, HG = 0, AG = 0;
  for (const m of done) { const k = w(m); W += k; HG += k * m.hg; AG += k * m.ag; }
  const avgHome = W ? HG / W : 1.45;
  const avgAway = W ? AG / W : 1.15;

  const teams = new Map();
  const team = (t) => {
    if (!teams.has(t.name)) teams.set(t.name, { name: t.name, short: t.short || '', tla: t.tla || '', h: { w: 0, gf: 0, ga: 0 }, a: { w: 0, gf: 0, ga: 0 }, games: [] });
    return teams.get(t.name);
  };
  for (const m of done) {
    const k = w(m), H = team(m.home), A = team(m.away);
    H.h.w += k; H.h.gf += k * m.hg; H.h.ga += k * m.ag;
    A.a.w += k; A.a.gf += k * m.ag; A.a.ga += k * m.hg;
    H.games.push({ t: m.t, gf: m.hg, ga: m.ag });
    A.games.push({ t: m.t, gf: m.ag, ga: m.hg });
  }

  const shrink = (sum, n, avg) => (sum + SHRINK * avg) / (n + SHRINK) / avg;
  const r = (x) => Math.round(x * 1000) / 1000;
  const out = [...teams.values()].map((T) => {
    const last = T.games.sort((x, y) => y.t - x.t);
    return {
      name: T.name, short: T.short, tla: T.tla,
      attH: r(shrink(T.h.gf, T.h.w, avgHome)), defH: r(shrink(T.h.ga, T.h.w, avgAway)),
      attA: r(shrink(T.a.gf, T.a.w, avgAway)), defA: r(shrink(T.a.ga, T.a.w, avgHome)),
      played: T.games.length,
      gf: last.reduce((s, g) => s + g.gf, 0),
      ga: last.reduce((s, g) => s + g.ga, 0),
      // V/E/D dos últimos 5 jogos, do mais recente para o mais antigo
      form: last.slice(0, 5).map((g) => (g.gf > g.ga ? 'V' : g.gf < g.ga ? 'D' : 'E')).join(''),
    };
  });
  return { matches: done.length, avgHome: r(avgHome), avgAway: r(avgAway), teams: out };
}
