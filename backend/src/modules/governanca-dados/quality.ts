import prisma from '../../plugins/prisma.js';

type QualityStatus = 'OK' | 'ALERTA' | 'FALHA' | 'ERRO';

function normSeveridade(v: unknown) {
  const s = String(v || '').toUpperCase();
  if (s === 'CRITICA') return 'CRITICA';
  if (s === 'ALTA') return 'ALTA';
  if (s === 'BAIXA') return 'BAIXA';
  return 'MEDIA';
}

export async function calcularScoreQualidadePorAtivo(args: { tenantId: number; ativoId: number }) {
  const regras = await prisma.governancaDadoQualidadeRegra.findMany({
    where: { tenantId: args.tenantId, ativoId: args.ativoId, ativo: true },
    select: { id: true, severidade: true, thresholdOk: true, thresholdAlerta: true },
  });
  if (!regras.length) return { score: 100, status: 'SAUDAVEL' as const };

  const execs = await prisma.governancaDadoQualidadeExecucao.findMany({
    where: { tenantId: args.tenantId, regraId: { in: regras.map((r) => r.id) } },
    orderBy: [{ executadoEm: 'desc' }, { id: 'desc' }],
    take: 500,
    select: { regraId: true, statusExecucao: true },
  });

  const latestByRule = new Map<number, QualityStatus>();
  for (const e of execs) {
    if (latestByRule.has(e.regraId)) continue;
    const st = String(e.statusExecucao || '').toUpperCase();
    if (st === 'OK' || st === 'ALERTA' || st === 'FALHA' || st === 'ERRO') latestByRule.set(e.regraId, st as QualityStatus);
  }

  let score = 100;
  for (const r of regras) {
    const severidade = normSeveridade(r.severidade);
    const st = latestByRule.get(r.id) || 'OK';
    if (st === 'OK') continue;
    if (st === 'ALERTA') {
      score -= severidade === 'CRITICA' ? 15 : severidade === 'ALTA' ? 10 : severidade === 'MEDIA' ? 5 : 3;
      continue;
    }
    if (st === 'FALHA') {
      score -= severidade === 'CRITICA' ? 30 : severidade === 'ALTA' ? 20 : severidade === 'MEDIA' ? 12 : 8;
      continue;
    }
    if (st === 'ERRO') {
      score -= severidade === 'CRITICA' ? 20 : severidade === 'ALTA' ? 15 : severidade === 'MEDIA' ? 10 : 5;
    }
  }

  if (score < 0) score = 0;
  const status = score >= 90 ? 'SAUDAVEL' : score >= 70 ? 'ATENCAO' : score >= 50 ? 'RISCO' : 'CRITICO';
  return { score, status };
}

