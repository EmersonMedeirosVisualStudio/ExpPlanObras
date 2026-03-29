import prisma from '../../plugins/prisma.js';
import { auditRetencao } from './audit.js';
import { getRetentionHandler } from './registry.js';

export async function simularDescarte(args: { tenantId: number; filtro?: { recurso?: string; elegivelAte?: Date; incluirHold?: boolean } }) {
  const where: any = { tenantId: args.tenantId };
  if (args.filtro?.recurso) where.recurso = String(args.filtro.recurso).toUpperCase();
  if (args.filtro?.elegivelAte) where.elegivelDescarteEm = { lte: args.filtro.elegivelAte };
  if (!args.filtro?.incluirHold) where.holdAtivo = false;

  const items = await prisma.governancaRetencaoItem.findMany({
    where,
    include: { politicaAplicada: true },
    take: 5000,
  });

  const porRecurso: Record<string, number> = {};
  const porAcao: Record<string, number> = {};
  let bloqueadosPorHold = 0;

  for (const it of items) {
    if (it.holdAtivo) {
      bloqueadosPorHold++;
      continue;
    }
    const r = String(it.recurso);
    porRecurso[r] = (porRecurso[r] || 0) + 1;
    const acao = it.politicaAplicada ? String(it.politicaAplicada.acaoFinal) : 'RETER_SEM_ACAO';
    porAcao[acao] = (porAcao[acao] || 0) + 1;
  }

  return { totalItens: items.length, porRecurso, porAcao, bloqueadosPorHold };
}

export async function criarLoteDescarte(args: {
  tenantId: number;
  userId: number;
  nomeLote: string;
  tipoExecucao: 'SIMULACAO' | 'REAL';
  filtro?: { recurso?: string; elegivelAte?: Date; incluirHold?: boolean };
}) {
  const where: any = { tenantId: args.tenantId };
  if (args.filtro?.recurso) where.recurso = String(args.filtro.recurso).toUpperCase();
  if (args.filtro?.elegivelAte) where.elegivelDescarteEm = { lte: args.filtro.elegivelAte };
  if (!args.filtro?.incluirHold) where.holdAtivo = false;

  const items = await prisma.governancaRetencaoItem.findMany({
    where,
    include: { politicaAplicada: true },
    orderBy: [{ elegivelDescarteEm: 'asc' }, { id: 'asc' }],
    take: 2000,
  });

  const lote = await prisma.governancaDescarteLote.create({
    data: {
      tenantId: args.tenantId,
      nomeLote: args.nomeLote,
      tipoExecucao: args.tipoExecucao,
      statusLote: args.tipoExecucao === 'REAL' ? 'AGUARDANDO_APROVACAO' : 'RASCUNHO',
      criadorUserId: args.userId,
      totalItens: items.length,
    },
  });

  if (items.length) {
    await prisma.governancaDescarteLoteItem.createMany({
      data: items.map((it) => ({
        tenantId: args.tenantId,
        loteId: lote.id,
        retencaoItemId: it.id,
        recurso: it.recurso,
        entidadeId: it.entidadeId,
        acaoPlanejada: it.politicaAplicada ? String(it.politicaAplicada.acaoFinal) : 'RETER_SEM_ACAO',
        statusItem: it.holdAtivo ? 'BLOQUEADO_HOLD' : 'PENDENTE',
        hashAntes: it.hashReferencia || null,
        storagePathAntes: it.storagePathPrincipal || null,
      })),
    });
  }

  await auditRetencao({
    tenantId: args.tenantId,
    userId: args.userId,
    recurso: 'RETENCAO',
    tipoEvento: 'LOTE_CRIADO',
    descricaoEvento: `Lote criado (${args.nomeLote})`,
    metadataJson: { loteId: lote.id, totalItens: items.length, tipoExecucao: args.tipoExecucao },
  });

  return lote.id;
}

export async function aprovarLote(args: { tenantId: number; userId: number; loteId: number }) {
  const lote = await prisma.governancaDescarteLote.findUnique({ where: { id: args.loteId } }).catch(() => null);
  if (!lote || lote.tenantId !== args.tenantId) return { ok: false as const, reason: 'LOTE_INVALIDO' };
  if (String(lote.tipoExecucao) !== 'REAL') return { ok: false as const, reason: 'LOTE_NAO_REAL' };
  if (String(lote.statusLote) !== 'AGUARDANDO_APROVACAO') return { ok: false as const, reason: 'STATUS_INVALIDO' };

  await prisma.governancaDescarteLote.update({ where: { id: lote.id }, data: { statusLote: 'APROVADO', aprovadorUserId: args.userId, aprovadoEm: new Date() } });
  await auditRetencao({
    tenantId: args.tenantId,
    userId: args.userId,
    recurso: 'RETENCAO',
    tipoEvento: 'APROVADO',
    descricaoEvento: `Lote aprovado (L${lote.id})`,
    metadataJson: { loteId: lote.id },
  });
  return { ok: true as const };
}

export async function executarLote(args: { tenantId: number; userId: number; loteId: number }) {
  const lote = await prisma.governancaDescarteLote.findUnique({ where: { id: args.loteId } }).catch(() => null);
  if (!lote || lote.tenantId !== args.tenantId) return { ok: false as const, reason: 'LOTE_INVALIDO' };
  if (String(lote.tipoExecucao) !== 'REAL') return { ok: false as const, reason: 'LOTE_NAO_REAL' };
  if (String(lote.statusLote) !== 'APROVADO') return { ok: false as const, reason: 'LOTE_NAO_APROVADO' };

  await prisma.governancaDescarteLote.update({ where: { id: lote.id }, data: { statusLote: 'PROCESSANDO', executorUserId: args.userId, iniciadoEm: new Date() } });

  const loteItems = await prisma.governancaDescarteLoteItem.findMany({
    where: { tenantId: args.tenantId, loteId: lote.id },
    orderBy: [{ id: 'asc' }],
  });

  let totalAnonimizados = 0;
  let totalDescartados = 0;
  let totalExpurgados = 0;
  let totalErros = 0;

  for (const li of loteItems) {
    if (li.statusItem === 'BLOQUEADO_HOLD') continue;
    await prisma.governancaDescarteLoteItem.update({ where: { id: li.id }, data: { statusItem: 'PROCESSANDO' } });
    const now = new Date();
    try {
      const handler = getRetentionHandler(li.recurso);
      const action = String(li.acaoPlanejada || '').toUpperCase();
      if (!handler) throw new Error('RECURSO_NAO_SUPORTADO');

      if (action === 'DELETE_HARD') {
        if (!handler.deleteHard) throw new Error('DELETE_HARD_NAO_SUPORTADO');
        await handler.deleteHard(args.tenantId, li.entidadeId);
        await prisma.governancaRetencaoItem.update({
          where: { id: li.retencaoItemId },
          data: { statusRetencao: 'EXPURGADO', expurgadoEm: now, ultimoProcessamentoEm: now },
        });
        totalExpurgados++;
      } else if (action === 'DELETE_SOFT') {
        if (!handler.deleteSoft) throw new Error('DELETE_SOFT_NAO_SUPORTADO');
        await handler.deleteSoft(args.tenantId, li.entidadeId);
        await prisma.governancaRetencaoItem.update({
          where: { id: li.retencaoItemId },
          data: { statusRetencao: 'DESCARTADO_LOGICO', descartadoEm: now, ultimoProcessamentoEm: now },
        });
        totalDescartados++;
      } else if (action === 'ANONIMIZAR') {
        if (!handler.anonymize) throw new Error('ANONIMIZAR_NAO_SUPORTADO');
        await handler.anonymize(args.tenantId, li.entidadeId, []);
        await prisma.governancaRetencaoItem.update({
          where: { id: li.retencaoItemId },
          data: { statusRetencao: 'ANONIMIZADO', ultimoProcessamentoEm: now },
        });
        totalAnonimizados++;
      } else if (action === 'ARQUIVAR_FRIO' || action === 'ARQUIVAR_E_EXPURGAR_DEPOIS') {
        if (handler.archiveCold) await handler.archiveCold(args.tenantId, li.entidadeId);
        await prisma.governancaRetencaoItem.update({
          where: { id: li.retencaoItemId },
          data: { statusRetencao: 'ARQUIVADO', ultimoProcessamentoEm: now },
        });
      } else if (action === 'RETER_SEM_ACAO') {
        await prisma.governancaRetencaoItem.update({
          where: { id: li.retencaoItemId },
          data: { statusRetencao: 'ATIVO', ultimoProcessamentoEm: now },
        });
      } else {
        throw new Error('ACAO_INVALIDA');
      }

      await prisma.governancaDescarteLoteItem.update({
        where: { id: li.id },
        data: { statusItem: 'SUCESSO', processadoEm: now, hashDepois: null, mensagemResultado: 'OK' },
      });
    } catch (e: any) {
      totalErros++;
      await prisma.governancaDescarteLoteItem.update({
        where: { id: li.id },
        data: { statusItem: 'ERRO', processadoEm: now, mensagemResultado: String(e?.message || 'ERRO') },
      });
      await prisma.governancaRetencaoItem.update({ where: { id: li.retencaoItemId }, data: { statusRetencao: 'ERRO', ultimoProcessamentoEm: now } }).catch(() => null);
    }
  }

  await prisma.governancaDescarteLote.update({
    where: { id: lote.id },
    data: {
      statusLote: 'CONCLUIDO',
      finalizadoEm: new Date(),
      totalAnonimizados,
      totalDescartados,
      totalExpurgados,
      totalErros,
    },
  });

  await auditRetencao({
    tenantId: args.tenantId,
    userId: args.userId,
    recurso: 'RETENCAO',
    tipoEvento: 'CONCLUIDO',
    descricaoEvento: `Lote concluído (L${lote.id})`,
    metadataJson: { loteId: lote.id, totalAnonimizados, totalDescartados, totalExpurgados, totalErros },
  });

  return { ok: true as const, totalAnonimizados, totalDescartados, totalExpurgados, totalErros };
}

