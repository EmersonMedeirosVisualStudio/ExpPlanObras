import prisma from '../../plugins/prisma.js';

function grade(score: number): 'SAUDAVEL' | 'ATENCAO' | 'RISCO' | 'CRITICO' {
  if (score >= 85) return 'SAUDAVEL';
  if (score >= 70) return 'ATENCAO';
  if (score >= 50) return 'RISCO';
  return 'CRITICO';
}

export async function calcularReadinessPlano(args: { tenantId: number; planoId: number }) {
  const plano = await prisma.bcpPlano.findUnique({ where: { id: args.planoId } }).catch(() => null);
  if (!plano || plano.tenantId !== args.tenantId) return { ok: false as const, reason: 'PLANO_INVALIDO' };
  const ativos = await prisma.bcpPlanoAtivoCritico.count({ where: { tenantId: args.tenantId, planoId: args.planoId } });
  const runbooks = await prisma.bcpPlanoRunbook.count({ where: { tenantId: args.tenantId, planoId: args.planoId } });
  const ultTeste = await prisma.bcpTeste.findFirst({
    where: { tenantId: args.tenantId, planoId: args.planoId, statusTeste: 'CONCLUIDO' },
    orderBy: { executadoEm: 'desc' },
  });
  const drOk = await prisma.drExecucaoRecuperacao.count({ where: { tenantId: args.tenantId, planoId: args.planoId, statusExecucao: 'CONCLUIDO' } });

  let score = 0;
  if (ativos > 0) score += 15;
  if (runbooks > 0) score += 15;
  if (plano.ownerUserId) score += 10;
  if (plano.rtoMinutos > 0 && plano.rpoMinutos > 0) score += 10;
  if (ultTeste?.scoreProntidao && ultTeste.scoreProntidao >= 70) score += 20;
  if (drOk > 0) score += 20;
  if (plano.aprovadoPor && plano.aprovadoEm) score += 10;

  const comp = {
    ativosCadastrados: ativos > 0,
    runbooksVinculados: runbooks > 0,
    ownerDefinido: Boolean(plano.ownerUserId),
    rtoRpoDefinidos: plano.rtoMinutos > 0 && plano.rpoMinutos > 0,
    ultimoTesteScore: ultTeste?.scoreProntidao ?? null,
    possuiDrConcluido: drOk > 0,
    aprovado: Boolean(plano.aprovadoPor && plano.aprovadoEm),
  };

  return { ok: true as const, score, class: grade(score), componentes: comp };
}
