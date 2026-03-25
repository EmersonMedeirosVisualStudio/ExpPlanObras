function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function scoreSaudeExecutiva(input: {
  medicoesPendentes: number;
  solicitacoesUrgentes: number;
  ncsCriticas: number;
  acidentes90d: number;
  treinamentosVencidos: number;
  estoqueCritico: number;
}) {
  const base =
    100 -
    input.medicoesPendentes * 2 -
    input.solicitacoesUrgentes * 2 -
    input.ncsCriticas * 5 -
    input.acidentes90d * 8 -
    input.treinamentosVencidos * 2 -
    input.estoqueCritico * 2;
  return clamp(Math.round(base), 0, 100);
}

export function scoreRiscoObra(input: {
  medicoesPendentes: number;
  solicitacoesUrgentes: number;
  ncsCriticas: number;
  acidentes90d: number;
  treinamentosVencidos: number;
  estoqueCritico: number;
}) {
  const v =
    input.medicoesPendentes * 2 +
    input.solicitacoesUrgentes * 2 +
    input.ncsCriticas * 4 +
    input.acidentes90d * 5 +
    input.treinamentosVencidos * 2 +
    input.estoqueCritico * 2;
  return clamp(Math.round(v), 0, 9999);
}

export function scoreDimensao(input: { pendencias: number; criticidade: number }) {
  const base = 100 - input.pendencias * 3 - input.criticidade * 6;
  return clamp(Math.round(base), 0, 100);
}

export function scoreGlobal(linhas: { rhScore: number; sstScore: number; suprimentosScore: number; engenhariaScore: number; financeiroScore: number }) {
  const v = (linhas.rhScore + linhas.sstScore + linhas.suprimentosScore + linhas.engenhariaScore + linhas.financeiroScore) / 5;
  return clamp(Math.round(v), 0, 100);
}

