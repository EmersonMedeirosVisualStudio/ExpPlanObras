const impactRank: Record<string, number> = { BAIXO: 1, MEDIO: 2, ALTO: 4, CRITICO: 5 };
const probRank: Record<string, number> = { RARO: 1, IMPROVAVEL: 2, POSSIVEL: 3, PROVAVEL: 4, QUASE_CERTO: 5 };

export function scoreFromImpactProbability(args: { impacto: string; probabilidade: string }) {
  const i = impactRank[String(args.impacto || '').toUpperCase()] || 1;
  const p = probRank[String(args.probabilidade || '').toUpperCase()] || 1;
  return i * p;
}

export function classificarScore(score: number) {
  if (score <= 4) return 'BAIXO';
  if (score <= 9) return 'MEDIO';
  if (score <= 16) return 'ALTO';
  return 'CRITICO';
}

export function reduzirScorePorControles(args: { scoreInerente: number; efetividadePonderada: number }) {
  const eff = Math.max(0, Math.min(args.efetividadePonderada, 100));
  const reduction = Math.round((args.scoreInerente * eff) / 100);
  const residual = Math.max(1, args.scoreInerente - reduction);
  return { residual, reduction };
}
