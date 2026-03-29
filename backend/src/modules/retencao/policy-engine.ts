import prisma from '../../plugins/prisma.js';
import { Prisma } from '@prisma/client';
import { getRetentionHandler } from './registry.js';

function addPeriod(base: Date, valor: number, unidade: string) {
  const d = new Date(base.getTime());
  const u = String(unidade || '').toUpperCase();
  if (u === 'ANOS') {
    d.setFullYear(d.getFullYear() + valor);
    return d;
  }
  if (u === 'MESES') {
    d.setMonth(d.getMonth() + valor);
    return d;
  }
  d.setDate(d.getDate() + valor);
  return d;
}

export async function escolherPoliticaAtiva(args: { tenantId: number; recurso: string }) {
  const rows = await prisma.governancaRetencaoPolitica.findMany({
    where: { tenantId: args.tenantId, recurso: String(args.recurso).toUpperCase(), ativo: true },
    orderBy: [{ prioridade: 'desc' }, { id: 'desc' }],
    take: 20,
  });
  return rows[0] || null;
}

export async function sincronizarItemRetencao(args: { tenantId: number; recurso: string; entidadeId: number }) {
  const recurso = String(args.recurso || '').toUpperCase();
  const handler = getRetentionHandler(recurso);
  if (!handler) return { ok: false as const, reason: 'RECURSO_NAO_SUPORTADO' };
  const base = await handler.resolveBaseDate(args.tenantId, args.entidadeId);
  if (!base) return { ok: false as const, reason: 'ENTIDADE_NAO_ENCONTRADA' };

  const policy = await escolherPoliticaAtiva({ tenantId: args.tenantId, recurso });
  const storageRefs = handler.resolveStorageRefs ? await handler.resolveStorageRefs(args.tenantId, args.entidadeId) : {};
  const categoria = handler.resolveCategory ? await handler.resolveCategory(args.tenantId, args.entidadeId) : null;

  const now = new Date();
  let elegivelDescarteEm: Date | null = null;
  let elegivelArquivamentoEm: Date | null = null;
  let statusRetencao = 'ATIVO';

  if (policy) {
    const elig = addPeriod(base, Number(policy.periodoValor || 0), String(policy.periodoUnidade));
    elegivelDescarteEm = elig;
    if (String(policy.acaoFinal || '').toUpperCase().includes('ARQUIVAR')) elegivelArquivamentoEm = elig;
  }

  const existing = await prisma.governancaRetencaoItem.findFirst({
    where: { tenantId: args.tenantId, recurso, entidadeId: args.entidadeId },
  });

  const holdCount = existing
    ? await prisma.governancaLegalHoldItem.count({ where: { tenantId: args.tenantId, retencaoItemId: existing.id, ativo: true } })
    : 0;
  const holdAtivo = holdCount > 0;

  if (holdAtivo) statusRetencao = 'EM_HOLD';
  else if (elegivelDescarteEm && elegivelDescarteEm <= now) statusRetencao = 'ELEGIVEL_DESCARTE';

  const saved = await prisma.governancaRetencaoItem.upsert({
    where: { tenantId_recurso_entidadeId: { tenantId: args.tenantId, recurso, entidadeId: args.entidadeId } },
    create: {
      tenantId: args.tenantId,
      recurso,
      entidadeId: args.entidadeId,
      categoriaRecurso: categoria,
      politicaAplicadaId: policy?.id ?? null,
      statusRetencao,
      dataEventoBase: base,
      elegivelArquivamentoEm,
      elegivelDescarteEm,
      backupTtlAteEm: null,
      holdAtivo,
      totalHoldsAtivos: holdCount,
      storagePathPrincipal: storageRefs.path ?? null,
      hashReferencia: storageRefs.hash ?? null,
      tamanhoBytes: storageRefs.sizeBytes ?? null,
      confidencialidade: null,
      metadataJson: Prisma.DbNull,
      ultimoProcessamentoEm: now,
      descartadoEm: null,
      expurgadoEm: null,
      atualizadoEmOrigem: null,
    },
    update: {
      categoriaRecurso: categoria,
      politicaAplicadaId: policy?.id ?? null,
      statusRetencao,
      dataEventoBase: base,
      elegivelArquivamentoEm,
      elegivelDescarteEm,
      holdAtivo,
      totalHoldsAtivos: holdCount,
      storagePathPrincipal: storageRefs.path ?? null,
      hashReferencia: storageRefs.hash ?? null,
      tamanhoBytes: storageRefs.sizeBytes ?? null,
      ultimoProcessamentoEm: now,
    },
  });

  return { ok: true as const, itemId: saved.id, statusRetencao };
}

