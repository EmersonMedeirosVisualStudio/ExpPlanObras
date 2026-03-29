import prisma from '../../plugins/prisma.js';
import { Prisma } from '@prisma/client';
import { auditRetencao } from './audit.js';

export async function aplicarLegalHoldEmItem(args: { tenantId: number; userId: number; legalHoldId: number; retencaoItemId: number }) {
  const item = await prisma.governancaRetencaoItem.findUnique({ where: { id: args.retencaoItemId } }).catch(() => null);
  if (!item || item.tenantId !== args.tenantId) return { ok: false as const, reason: 'ITEM_INVALIDO' };

  await prisma.governancaLegalHoldItem.upsert({
    where: { legalHoldId_retencaoItemId: { legalHoldId: args.legalHoldId, retencaoItemId: item.id } },
    create: {
      tenantId: args.tenantId,
      legalHoldId: args.legalHoldId,
      retencaoItemId: item.id,
      recurso: item.recurso,
      entidadeId: item.entidadeId,
      ativo: true,
      metadataJson: Prisma.DbNull,
    },
    update: { ativo: true, removidoEm: null },
  });

  const total = await prisma.governancaLegalHoldItem.count({ where: { tenantId: args.tenantId, retencaoItemId: item.id, ativo: true } });
  await prisma.governancaRetencaoItem.update({
    where: { id: item.id },
    data: { holdAtivo: total > 0, totalHoldsAtivos: total, statusRetencao: total > 0 ? 'EM_HOLD' : item.statusRetencao },
  });

  await auditRetencao({
    tenantId: args.tenantId,
    userId: args.userId,
    recurso: item.recurso,
    entidadeId: item.entidadeId,
    retencaoItemId: item.id,
    tipoEvento: 'HOLD_APLICADO',
    descricaoEvento: `Legal hold aplicado (H${args.legalHoldId})`,
  });

  return { ok: true as const };
}

export async function liberarLegalHold(args: { tenantId: number; userId: number; legalHoldId: number }) {
  const hold = await prisma.governancaLegalHold.findUnique({ where: { id: args.legalHoldId } }).catch(() => null);
  if (!hold || hold.tenantId !== args.tenantId) return { ok: false as const, reason: 'HOLD_INVALIDO' };

  await prisma.$transaction(async (tx) => {
    await tx.governancaLegalHold.update({
      where: { id: hold.id },
      data: { statusHold: 'LIBERADO', liberadorUserId: args.userId, liberadoEm: new Date() },
    });
    await tx.governancaLegalHoldItem.updateMany({
      where: { tenantId: args.tenantId, legalHoldId: hold.id, ativo: true },
      data: { ativo: false, removidoEm: new Date() },
    });
  });

  const impacted = await prisma.governancaRetencaoItem.findMany({
    where: { tenantId: args.tenantId, holds: { some: { legalHoldId: hold.id } } },
    select: { id: true },
  });
  for (const it of impacted) {
    const total = await prisma.governancaLegalHoldItem.count({ where: { tenantId: args.tenantId, retencaoItemId: it.id, ativo: true } });
    await prisma.governancaRetencaoItem.update({ where: { id: it.id }, data: { holdAtivo: total > 0, totalHoldsAtivos: total } });
  }

  await auditRetencao({
    tenantId: args.tenantId,
    userId: args.userId,
    recurso: 'RETENCAO',
    entidadeId: null,
    retencaoItemId: null,
    tipoEvento: 'HOLD_LIBERADO',
    descricaoEvento: `Legal hold liberado (${hold.codigoHold})`,
    metadataJson: { legalHoldId: hold.id },
  });

  return { ok: true as const };
}

export async function aplicarLegalHoldPorCriteria(args: { tenantId: number; userId: number; legalHoldId: number; criteriaJson: any }) {
  const recurso = args.criteriaJson?.recurso ? String(args.criteriaJson.recurso).toUpperCase() : null;
  const entidadeIds = Array.isArray(args.criteriaJson?.entidadeIds) ? args.criteriaJson.entidadeIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : null;
  const statusRetencao = args.criteriaJson?.statusRetencao ? String(args.criteriaJson.statusRetencao).toUpperCase() : null;

  const where: any = { tenantId: args.tenantId };
  if (recurso) where.recurso = recurso;
  if (entidadeIds && entidadeIds.length) where.entidadeId = { in: entidadeIds };
  if (statusRetencao) where.statusRetencao = statusRetencao;

  const items = await prisma.governancaRetencaoItem.findMany({ where, select: { id: true } });
  let applied = 0;
  for (const it of items) {
    const r = await aplicarLegalHoldEmItem({ tenantId: args.tenantId, userId: args.userId, legalHoldId: args.legalHoldId, retencaoItemId: it.id });
    if (r.ok) applied++;
  }
  return { ok: true as const, applied };
}

