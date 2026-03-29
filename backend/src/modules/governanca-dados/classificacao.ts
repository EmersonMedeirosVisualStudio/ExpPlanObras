import prisma from '../../plugins/prisma.js';

export async function aceitarSugestaoClassificacao(args: { tenantId: number; userId: number; sugestaoId: number }) {
  const s = await prisma.governancaClassificacaoSugestao.findUnique({ where: { id: args.sugestaoId } }).catch(() => null);
  if (!s || s.tenantId !== args.tenantId) return { ok: false as const, reason: 'SUGESTAO_INVALIDA' };
  if (s.statusSugestao !== 'PENDENTE') return { ok: false as const, reason: 'STATUS_INVALIDO' };

  await prisma.$transaction(async (tx) => {
    await tx.governancaClassificacaoSugestao.update({
      where: { id: s.id },
      data: { statusSugestao: 'ACEITA', avaliadoPorUserId: args.userId, avaliadoEm: new Date() },
    });

    if (s.campoId) {
      await tx.governancaDadoAtivoCampo.update({
        where: { id: s.campoId },
        data: {
          classificacaoCampo: s.classificacaoSugerida,
          pii: String(s.categoriaSugerida || '').startsWith('PII_'),
          campoMascaravel: true,
          estrategiaMascaraPadrao: String(s.categoriaSugerida || '').replace(/^PII_/, '') || null,
        },
      });
    } else {
      await tx.governancaDadoAtivo.update({ where: { id: s.ativoId }, data: { classificacaoGlobal: s.classificacaoSugerida } });
    }

    await tx.governancaClassificacaoSugestao.updateMany({
      where: { tenantId: args.tenantId, ativoId: s.ativoId, campoId: s.campoId ?? null, statusSugestao: 'PENDENTE', id: { not: s.id } },
      data: { statusSugestao: 'SUBSTITUIDA', avaliadoPorUserId: args.userId, avaliadoEm: new Date() },
    });
  });

  return { ok: true as const };
}

export async function rejeitarSugestaoClassificacao(args: { tenantId: number; userId: number; sugestaoId: number; motivo?: string | null }) {
  const s = await prisma.governancaClassificacaoSugestao.findUnique({ where: { id: args.sugestaoId } }).catch(() => null);
  if (!s || s.tenantId !== args.tenantId) return { ok: false as const, reason: 'SUGESTAO_INVALIDA' };
  if (s.statusSugestao !== 'PENDENTE') return { ok: false as const, reason: 'STATUS_INVALIDO' };
  await prisma.governancaClassificacaoSugestao.update({
    where: { id: s.id },
    data: { statusSugestao: 'REJEITADA', avaliadoPorUserId: args.userId, avaliadoEm: new Date(), categoriaSugerida: s.categoriaSugerida, origemSugestao: s.origemSugestao },
  });
  return { ok: true as const };
}

