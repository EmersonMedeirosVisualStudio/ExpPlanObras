import prisma, { setTenantContext } from '../../plugins/prisma.js';
import { Prisma } from '@prisma/client';
import type { CreateContratoInput, UpdateContratoInput } from './contratos.schema.js';
import { publish } from './contratos.realtime.js';

async function withRLS<T>(tenantId: number, callback: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setTenantContext(tx, tenantId);
    return callback(tx);
  });
}

function parseDateOnly(input: any) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumberOrNull(v: any) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function diffDays(start: Date, end: Date) {
  const a = dateOnly(start).getTime();
  const b = dateOnly(end).getTime();
  const d = Math.round((b - a) / (24 * 3600 * 1000));
  return Math.max(0, d);
}

function addDays(date: Date, days: number) {
  const ms = days * 24 * 3600 * 1000;
  return new Date(date.getTime() + ms);
}

function dateOnly(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function computeVigencias(input: { dataOS?: Date | null; dataAssinatura?: Date | null; prazoDias?: number | null; vigenciaInicial?: Date | null; vigenciaAtual?: Date | null }) {
  const prazoDias = input.prazoDias == null ? null : Math.max(1, Math.trunc(input.prazoDias));
  const base = input.dataOS || input.dataAssinatura || null;

  const vigenciaInicial =
    input.vigenciaInicial ||
    (base && prazoDias != null ? addDays(dateOnly(base), prazoDias) : null);

  const vigenciaAtual =
    input.vigenciaAtual ||
    (vigenciaInicial ? vigenciaInicial : null);

  return { prazoDias, vigenciaInicial, vigenciaAtual };
}

function computeValores(input: {
  tipoContratante?: string | null;
  valorConcedenteInicial?: number | null;
  valorProprioInicial?: number | null;
  valorTotalInicial?: number | null;
  valorConcedenteAtual?: number | null;
  valorProprioAtual?: number | null;
  valorTotalAtual?: number | null;
}) {
  const tipo = input.tipoContratante ? String(input.tipoContratante).trim().toUpperCase() : 'PRIVADO';
  const isPublico = tipo === 'PUBLICO';

  const vci = toNumberOrNull(input.valorConcedenteInicial);
  const vpi = toNumberOrNull(input.valorProprioInicial);
  const vti = toNumberOrNull(input.valorTotalInicial);

  const vca = toNumberOrNull(input.valorConcedenteAtual);
  const vpa = toNumberOrNull(input.valorProprioAtual);
  const vta = toNumberOrNull(input.valorTotalAtual);

  if (isPublico) {
    const totalInicial = vti != null ? vti : (vci || 0) + (vpi || 0);
    const concedenteAtual = vca != null ? vca : vci;
    const proprioAtual = vpa != null ? vpa : vpi;
    const totalAtual = vta != null ? vta : (concedenteAtual || 0) + (proprioAtual || 0);
    return {
      tipoContratante: tipo,
      valorConcedenteInicial: vci,
      valorProprioInicial: vpi,
      valorTotalInicial: totalInicial,
      valorConcedenteAtual: concedenteAtual,
      valorProprioAtual: proprioAtual,
      valorTotalAtual: totalAtual,
    };
  }

  const totalInicial = vti != null ? vti : null;
  const totalAtual = vta != null ? vta : totalInicial;
  return {
    tipoContratante: tipo,
    valorConcedenteInicial: null,
    valorProprioInicial: null,
    valorTotalInicial: totalInicial,
    valorConcedenteAtual: null,
    valorProprioAtual: null,
    valorTotalAtual: totalAtual,
  };
}

function computeStatusEAlertas(row: any) {
  const issues: string[] = [];
  const tipo = String(row.tipoContratante || 'PRIVADO').toUpperCase();
  const isPublico = tipo === 'PUBLICO';

  const dataOS = row.dataOS ? new Date(row.dataOS) : null;
  const dataAss = row.dataAssinatura ? new Date(row.dataAssinatura) : null;
  const prazo = typeof row.prazoDias === 'number' ? row.prazoDias : row.prazoDias != null ? Number(row.prazoDias) : null;
  const vigAtual = row.vigenciaAtual ? new Date(row.vigenciaAtual) : null;
  const valorPagoContrato = toNumberOrNull(row.valorPagoContrato) ?? 0;
  const valorExecutadoContrato = toNumberOrNull(row.valorExecutadoContrato) ?? 0;
  const valorTotalAtual = toNumberOrNull(row.valorTotalAtual) ?? 0;
  const temAditivoAberto = Boolean(row.temAditivoAberto);

  if (!dataOS && !dataAss) issues.push('Falta data de OS ou assinatura');
  if (!prazo || prazo <= 0) issues.push('Falta prazo (dias)');
  if (!row.empresaParceiraNome) issues.push('Empresa parceira não vinculada');
  if (temAditivoAberto) issues.push('Aditivo em aberto');

  if (isPublico) {
    const vci = toNumberOrNull(row.valorConcedenteInicial);
    const vpi = toNumberOrNull(row.valorProprioInicial);
    const vti = toNumberOrNull(row.valorTotalInicial);
    if (vci == null && vpi == null && vti == null) issues.push('Valor inicial não informado');
  } else {
    const vti = toNumberOrNull(row.valorTotalInicial);
    if (vti == null) issues.push('Valor inicial não informado');
  }

  const now = new Date();
  const end = vigAtual;
  const statusManual = String(row.status || '').toUpperCase();

  let statusCalc:
    | 'EM_ANDAMENTO'
    | 'A_VENCER'
    | 'VENCIDO'
    | 'CONCLUIDO'
    | 'SEM_RECURSOS'
    | 'NAO_INICIADO'
    | 'CANCELADO' = 'EM_ANDAMENTO';

  if (['CANCELADO', 'RESCINDIDO'].includes(statusManual)) statusCalc = 'CANCELADO';
  else if (['ENCERRADO', 'FINALIZADO', 'CONCLUIDO'].includes(statusManual)) statusCalc = 'CONCLUIDO';
  else if (valorTotalAtual > 0 && valorPagoContrato >= valorTotalAtual) statusCalc = 'SEM_RECURSOS';
  else if (!dataOS && valorExecutadoContrato <= 0) statusCalc = 'NAO_INICIADO';
  else if (end) {
    const diffDays = Math.ceil((dateOnly(end).getTime() - dateOnly(now).getTime()) / (24 * 3600 * 1000));
    if (diffDays < 0) statusCalc = 'VENCIDO';
    else if (diffDays <= 30) statusCalc = 'A_VENCER';
    else statusCalc = 'EM_ANDAMENTO';
  } else {
    statusCalc = 'EM_ANDAMENTO';
  }

  let alerta: 'OK' | 'PENDENTE' | 'CRITICO' = 'OK';
  if (issues.length) {
    const critical = issues.some((m) => m.includes('Falta prazo') || m.includes('Falta data'));
    alerta = critical ? 'CRITICO' : 'PENDENTE';
  }

  return { statusCalc, alerta, issues };
}

async function createContratoEvento(tx: any, input: { tenantId: number; contratoId: number; tipoOrigem: string; origemId?: number | null; tipoEvento: string; descricao: string; observacaoTexto?: string | null; nivelObservacao?: string | null; actorUserId?: number | null }) {
  const created = await tx.contratoEvento.create({
    data: {
      tenantId: input.tenantId,
      contratoId: input.contratoId,
      tipoOrigem: input.tipoOrigem,
      origemId: input.origemId ?? null,
      tipoEvento: input.tipoEvento,
      descricao: input.descricao,
      observacaoTexto: input.observacaoTexto ?? null,
      nivelObservacao: input.nivelObservacao ?? null,
      actorUserId: input.actorUserId ?? null,
    },
  });
  publish(`contrato:${input.contratoId}`, 'evento_criado', { contratoId: input.contratoId, eventoId: created.id });
  publish('contratos', 'evento_criado', { contratoId: input.contratoId, eventoId: created.id });
  return created;
}

export async function ensureContratoPendente(tenantId: number) {
  return withRLS(tenantId, async (tx) => {
    const existing = await tx.contrato.findFirst({ where: { tenantId, numeroContrato: 'PENDENTE' }, select: { id: true } }).catch(() => null);
    if (existing) return existing.id as number;
    const created = await tx.contrato.create({
      data: {
        tenantId,
        numeroContrato: 'PENDENTE',
        descricao: 'Contrato pendente de definição',
        status: 'PENDENTE',
      },
      select: { id: true },
    });
    return created.id as number;
  });
}

export async function listContratos(tenantId: number) {
  return withRLS(tenantId, async (tx) => {
    const rows = await tx.contrato.findMany({ where: { tenantId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] });

    const [pagos, execs] = await Promise.all([
      tx.$queryRaw`
        SELECT o."contratoId" AS "contratoId", COALESCE(SUM(p."amount"), 0) AS "valorPago"
        FROM "Pagamento" p
        JOIN "Obra" o ON o."id" = p."obraId"
        WHERE o."tenantId" = ${tenantId}
        GROUP BY o."contratoId"
      `,
      tx.$queryRaw`
        SELECT o."contratoId" AS "contratoId", COALESCE(SUM(m."amount"), 0) AS "valorExecutado"
        FROM "Medicao" m
        JOIN "Obra" o ON o."id" = m."obraId"
        WHERE o."tenantId" = ${tenantId}
        GROUP BY o."contratoId"
      `,
    ]);

    const aditivosAbertos = await tx.$queryRaw`
      SELECT "contratoId" AS "contratoId", COUNT(*)::int AS "abertos"
      FROM "ContratoAditivo"
      WHERE "tenantId" = ${tenantId} AND "status" = 'RASCUNHO'
      GROUP BY "contratoId"
    `;

    const valorPagoByContratoId = new Map<number, number>();
    for (const r of (pagos as any[])) {
      const id = Number(r.contratoId);
      if (!Number.isFinite(id)) continue;
      valorPagoByContratoId.set(id, toNumberOrNull(r.valorPago) ?? 0);
    }

    const valorExecutadoByContratoId = new Map<number, number>();
    for (const r of (execs as any[])) {
      const id = Number(r.contratoId);
      if (!Number.isFinite(id)) continue;
      valorExecutadoByContratoId.set(id, toNumberOrNull(r.valorExecutado) ?? 0);
    }

    const aditivosAbertosByContratoId = new Map<number, number>();
    for (const r of (aditivosAbertos as any[])) {
      const id = Number(r.contratoId);
      if (!Number.isFinite(id)) continue;
      aditivosAbertosByContratoId.set(id, Number(r.abertos || 0));
    }

    return rows.map((r: any) => {
      const enriched = {
        ...r,
        valorPagoContrato: valorPagoByContratoId.get(Number(r.id)) ?? 0,
        valorExecutadoContrato: valorExecutadoByContratoId.get(Number(r.id)) ?? 0,
        temAditivoAberto: (aditivosAbertosByContratoId.get(Number(r.id)) ?? 0) > 0,
      };
      const extra = computeStatusEAlertas(enriched);
      return { ...r, statusCalculado: extra.statusCalc, alerta: extra.alerta, alertas: extra.issues };
    });
  });
}

function normalizeSubStatus(v: any) {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'PLANEJADO' || s === 'EM_EXECUCAO' || s === 'AGUARDANDO' || s === 'CONCLUIDO' || s === 'BLOQUEADO') return s;
  return 'EM_EXECUCAO';
}

function normalizeMedicaoStatus(v: any) {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'PENDENTE' || s === 'APROVADO' || s === 'REJEITADO') return s;
  return 'PENDENTE';
}

export async function getSubcontratosResumo(tenantId: number, contratoPrincipalId: number) {
  return withRLS(tenantId, async (tx) => {
    const principal = await tx.contrato.findFirst({ where: { tenantId, id: contratoPrincipalId } }).catch(() => null);
    if (!principal) throw new Error('Contrato principal não encontrado');
    const valorPrincipal = toNumberOrNull(principal.valorTotalAtual) ?? 0;

    const sumAgg = await tx.contrato.aggregate({
      _sum: { valorTotalAtual: true },
      where: { tenantId, contratoPrincipalId },
    });
    const totalSub = toNumberOrNull(sumAgg?._sum?.valorTotalAtual) ?? 0;

    const saldo = Math.max(0, valorPrincipal - totalSub);
    const pctComprometido = valorPrincipal > 0 ? Math.min(1, totalSub / valorPrincipal) : 0;

    const alertas: string[] = [];
    if (!valorPrincipal || valorPrincipal <= 0) alertas.push('Contrato principal sem valor total definido.');
    if (valorPrincipal > 0 && totalSub > valorPrincipal) alertas.push('Soma dos subcontratos ultrapassa o valor do contrato principal.');
    if (valorPrincipal > 0 && totalSub >= valorPrincipal * 0.9 && totalSub <= valorPrincipal) alertas.push('Soma dos subcontratos próxima do limite do contrato principal (>= 90%).');

    return {
      contratoPrincipal: {
        id: principal.id,
        numeroContrato: principal.numeroContrato,
        nome: principal.nome ?? null,
        objeto: principal.objeto ?? null,
        empresaParceiraNome: principal.empresaParceiraNome ?? null,
        vigenciaAtual: principal.vigenciaAtual ? principal.vigenciaAtual.toISOString() : null,
        valorTotalAtual: toNumberOrNull(principal.valorTotalAtual),
      },
      financeiro: {
        valorPrincipal,
        totalSubcontratado: totalSub,
        saldoDisponivel: saldo,
        percentualComprometido: pctComprometido,
      },
      alertas,
    };
  });
}

export async function listSubcontratos(tenantId: number, contratoPrincipalId: number) {
  return withRLS(tenantId, async (tx) => {
    const principal = await tx.contrato.findFirst({ where: { tenantId, id: contratoPrincipalId } }).catch(() => null);
    if (!principal) throw new Error('Contrato principal não encontrado');

    const subs = await tx.contrato.findMany({
      where: { tenantId, contratoPrincipalId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    const ids = subs.map((s: any) => Number(s.id)).filter((n: number) => Number.isFinite(n));
    if (!ids.length) return [];

    const medAprovRows: any[] = await tx.$queryRaw`
      SELECT "contratoId" AS "contratoId", COALESCE(SUM("amount"), 0) AS "medAprov"
      FROM "ContratoMedicao"
      WHERE "tenantId" = ${tenantId} AND "contratoId" IN (${Prisma.join(ids)}) AND "status" = 'APROVADO'
      GROUP BY "contratoId"
    `;

    const pagRows: any[] = await tx.$queryRaw`
      SELECT "contratoId" AS "contratoId", COALESCE(SUM("amount"), 0) AS "pago"
      FROM "ContratoPagamento"
      WHERE "tenantId" = ${tenantId} AND "contratoId" IN (${Prisma.join(ids)})
      GROUP BY "contratoId"
    `;

    const medById = new Map<number, number>();
    for (const r of medAprovRows || []) medById.set(Number(r.contratoId), toNumberOrNull(r.medAprov) ?? 0);

    const pagById = new Map<number, number>();
    for (const r of pagRows || []) pagById.set(Number(r.contratoId), toNumberOrNull(r.pago) ?? 0);

    const fimPrincipal = principal.vigenciaAtual ? new Date(principal.vigenciaAtual) : null;

    return subs.map((s: any) => {
      const id = Number(s.id);
      const valor = toNumberOrNull(s.valorTotalAtual) ?? 0;
      const medAprov = medById.get(id) ?? 0;
      const pago = pagById.get(id) ?? 0;
      const aMedir = Math.max(0, valor - medAprov);
      const aPagar = Math.max(0, medAprov - pago);
      const pctExecutado = valor > 0 ? Math.min(1, medAprov / valor) : 0;

      const alertas: string[] = [];
      const fimSub = s.vigenciaAtual ? new Date(s.vigenciaAtual) : null;
      if (fimPrincipal && fimSub && fimSub.getTime() > fimPrincipal.getTime()) alertas.push('Subcontrato ultrapassa a vigência do contrato principal.');
      if (valor > 0 && medAprov > valor) alertas.push('Soma das medições aprovadas ultrapassa o valor do subcontrato.');
      if (pago > medAprov) alertas.push('Total pago ultrapassa total medido aprovado.');

      return {
        id,
        contratoPrincipalId: Number(s.contratoPrincipalId),
        numeroContrato: s.numeroContrato,
        empresaParceiraNome: s.empresaParceiraNome ?? null,
        empresaParceiraDocumento: s.empresaParceiraDocumento ?? null,
        objeto: s.objeto ?? null,
        status: normalizeSubStatus(s.status),
        dataOS: s.dataOS ? s.dataOS.toISOString() : null,
        vigenciaAtual: s.vigenciaAtual ? s.vigenciaAtual.toISOString() : null,
        valorTotalAtual: toNumberOrNull(s.valorTotalAtual),
        indicadores: {
          valorContrato: valor,
          totalMedidoAprovado: medAprov,
          totalPago: pago,
          aMedir,
          aPagar,
          percentualExecutado: pctExecutado,
        },
        alertas,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    });
  });
}

export async function createSubcontrato(
  tenantId: number,
  contratoPrincipalId: number,
  input: {
    numeroContrato?: string | null;
    subcontratadaNome: string;
    subcontratadaDocumento?: string | null;
    objeto: string;
    valorTotal: number;
    dataInicio: string;
    dataFim: string;
    status?: string | null;
  }
) {
  return withRLS(tenantId, async (tx) => {
    const principal = await tx.contrato.findFirst({ where: { tenantId, id: contratoPrincipalId } }).catch(() => null);
    if (!principal) throw new Error('Contrato principal não encontrado');

    const valorPrincipal = toNumberOrNull(principal.valorTotalAtual);
    if (valorPrincipal == null || valorPrincipal <= 0) throw new Error('Defina o valor total atual do contrato principal antes de criar subcontratos.');

    const valorNovo = Math.max(0, Number(input.valorTotal || 0));
    if (!Number.isFinite(valorNovo) || valorNovo <= 0) throw new Error('Valor do subcontrato inválido');

    const agg = await tx.contrato.aggregate({
      _sum: { valorTotalAtual: true },
      where: { tenantId, contratoPrincipalId },
    });
    const totalAtual = toNumberOrNull(agg?._sum?.valorTotalAtual) ?? 0;
    if (totalAtual + valorNovo > valorPrincipal) throw new Error('A soma dos subcontratos ultrapassa o valor do contrato principal.');

    const dataInicio = parseDateOnly(input.dataInicio);
    const dataFim = parseDateOnly(input.dataFim);
    if (!dataInicio || !dataFim) throw new Error('Datas inválidas');
    if (dataFim.getTime() < dataInicio.getTime()) throw new Error('Data fim deve ser maior ou igual à data início');

    const prazoDias = diffDays(dataInicio, dataFim);
    const computedVig = computeVigencias({ dataOS: dataInicio, dataAssinatura: dataInicio, prazoDias, vigenciaInicial: dataFim, vigenciaAtual: dataFim });

    const ano = new Date().getUTCFullYear();
    let numero = String(input.numeroContrato || '').trim();
    if (!numero) {
      const count = await tx.contrato.count({ where: { tenantId, contratoPrincipalId } });
      numero = `SUB-${String(count + 1).padStart(3, '0')}/${ano}`;
    }

    const created = await tx.contrato.create({
      data: {
        tenantId,
        contratoPrincipalId,
        numeroContrato: numero,
        nome: null,
        objeto: String(input.objeto || '').trim(),
        descricao: null,
        tipoContratante: 'PRIVADO',
        empresaParceiraNome: String(input.subcontratadaNome || '').trim(),
        empresaParceiraDocumento: input.subcontratadaDocumento ? String(input.subcontratadaDocumento).trim() : null,
        status: normalizeSubStatus(input.status),
        dataInicio: dataInicio,
        dataFim: dataFim,
        dataAssinatura: dataInicio,
        dataOS: dataInicio,
        prazoDias: computedVig.prazoDias,
        vigenciaInicial: computedVig.vigenciaInicial,
        vigenciaAtual: computedVig.vigenciaAtual,
        valorTotalInicial: valorNovo,
        valorTotalAtual: valorNovo,
        valorContratado: null,
        valorConcedenteInicial: null,
        valorProprioInicial: null,
        valorConcedenteAtual: null,
        valorProprioAtual: null,
      },
    });

    await tx.contratoEvento.create({
      data: {
        tenantId,
        contratoId: contratoPrincipalId,
        tipoOrigem: 'CONTRATO',
        tipoEvento: 'INFO',
        descricao: `Subcontrato criado: ${created.numeroContrato} (${created.empresaParceiraNome || 'Subcontratada'})`,
      },
    });

    publish(`contrato:${contratoPrincipalId}`, 'contrato_atualizado', { contratoId: contratoPrincipalId });
    publish('contratos', 'contrato_atualizado', { contratoId: contratoPrincipalId });

    return created;
  });
}

export async function updateSubcontrato(
  tenantId: number,
  contratoPrincipalId: number,
  subcontratoId: number,
  input: {
    subcontratadaNome?: string | null;
    subcontratadaDocumento?: string | null;
    objeto?: string | null;
    valorTotal?: number | null;
    dataInicio?: string | null;
    dataFim?: string | null;
    status?: string | null;
  }
) {
  return withRLS(tenantId, async (tx) => {
    const principal = await tx.contrato.findFirst({ where: { tenantId, id: contratoPrincipalId } }).catch(() => null);
    if (!principal) throw new Error('Contrato principal não encontrado');

    const sub = await tx.contrato.findFirst({ where: { tenantId, id: subcontratoId, contratoPrincipalId } }).catch(() => null);
    if (!sub) throw new Error('Subcontrato não encontrado');

    const valorPrincipal = toNumberOrNull(principal.valorTotalAtual);
    if (valorPrincipal == null || valorPrincipal <= 0) throw new Error('Defina o valor total atual do contrato principal antes de editar subcontratos.');

    const valorAtualSub = toNumberOrNull(sub.valorTotalAtual) ?? 0;
    const valorNovo = input.valorTotal == null ? valorAtualSub : Math.max(0, Number(input.valorTotal || 0));
    if (!Number.isFinite(valorNovo) || valorNovo <= 0) throw new Error('Valor do subcontrato inválido');

    const agg = await tx.contrato.aggregate({
      _sum: { valorTotalAtual: true },
      where: { tenantId, contratoPrincipalId, id: { not: subcontratoId } },
    });
    const totalOutros = toNumberOrNull(agg?._sum?.valorTotalAtual) ?? 0;
    if (totalOutros + valorNovo > valorPrincipal) throw new Error('A soma dos subcontratos ultrapassa o valor do contrato principal.');

    const inicio = input.dataInicio != null ? parseDateOnly(input.dataInicio) : (sub.dataOS ? new Date(sub.dataOS) : sub.dataAssinatura ? new Date(sub.dataAssinatura) : null);
    const fim = input.dataFim != null ? parseDateOnly(input.dataFim) : (sub.vigenciaAtual ? new Date(sub.vigenciaAtual) : null);
    if ((input.dataInicio != null || input.dataFim != null) && (!inicio || !fim)) throw new Error('Datas inválidas');
    if (inicio && fim && fim.getTime() < inicio.getTime()) throw new Error('Data fim deve ser maior ou igual à data início');

    const prazoDias = inicio && fim ? diffDays(inicio, fim) : (typeof sub.prazoDias === 'number' ? sub.prazoDias : sub.prazoDias != null ? Number(sub.prazoDias) : null);
    const computedVig = computeVigencias({
      dataOS: inicio ?? null,
      dataAssinatura: inicio ?? null,
      prazoDias,
      vigenciaInicial: fim ?? (sub.vigenciaInicial ?? null),
      vigenciaAtual: fim ?? (sub.vigenciaAtual ?? null),
    });

    const updated = await tx.contrato.update({
      where: { id: subcontratoId },
      data: {
        empresaParceiraNome: input.subcontratadaNome != null ? String(input.subcontratadaNome).trim() : undefined,
        empresaParceiraDocumento: input.subcontratadaDocumento != null ? (input.subcontratadaDocumento ? String(input.subcontratadaDocumento).trim() : null) : undefined,
        objeto: input.objeto != null ? String(input.objeto).trim() : undefined,
        status: input.status != null ? normalizeSubStatus(input.status) : undefined,
        dataInicio: inicio ? inicio : undefined,
        dataFim: fim ? fim : undefined,
        dataAssinatura: inicio ? inicio : undefined,
        dataOS: inicio ? inicio : undefined,
        prazoDias: computedVig.prazoDias ?? undefined,
        vigenciaInicial: computedVig.vigenciaInicial ?? undefined,
        vigenciaAtual: computedVig.vigenciaAtual ?? undefined,
        valorTotalInicial: valorNovo,
        valorTotalAtual: valorNovo,
      },
    });

    await tx.contratoEvento.create({
      data: {
        tenantId,
        contratoId: contratoPrincipalId,
        tipoOrigem: 'CONTRATO',
        tipoEvento: 'INFO',
        descricao: `Subcontrato atualizado: ${updated.numeroContrato} (${updated.empresaParceiraNome || 'Subcontratada'})`,
      },
    });

    publish(`contrato:${contratoPrincipalId}`, 'contrato_atualizado', { contratoId: contratoPrincipalId });
    publish('contratos', 'contrato_atualizado', { contratoId: contratoPrincipalId });

    return updated;
  });
}

export async function deleteSubcontrato(tenantId: number, contratoPrincipalId: number, subcontratoId: number) {
  return withRLS(tenantId, async (tx) => {
    const sub = await tx.contrato.findFirst({ where: { tenantId, id: subcontratoId, contratoPrincipalId } }).catch(() => null);
    if (!sub) throw new Error('Subcontrato não encontrado');

    const [mCount, pCount] = await Promise.all([
      tx.contratoMedicao.count({ where: { tenantId, contratoId: subcontratoId } }),
      tx.contratoPagamento.count({ where: { tenantId, contratoId: subcontratoId } }),
    ]);
    if (mCount > 0 || pCount > 0) throw new Error('Não é possível excluir: existe medição ou pagamento vinculado ao subcontrato.');

    await tx.contrato.delete({ where: { id: subcontratoId } });
    publish(`contrato:${contratoPrincipalId}`, 'contrato_atualizado', { contratoId: contratoPrincipalId });
    publish('contratos', 'contrato_atualizado', { contratoId: contratoPrincipalId });
    return { ok: true };
  });
}

export async function listContratoMedicoes(tenantId: number, contratoId: number) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId }, select: { id: true } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');
    const rows = await tx.contratoMedicao.findMany({ where: { tenantId, contratoId }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
    return rows.map((r: any) => ({
      id: r.id,
      contratoId: r.contratoId,
      date: r.date.toISOString(),
      amount: toNumberOrNull(r.amount) ?? 0,
      status: normalizeMedicaoStatus(r.status),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}

export async function createContratoMedicao(tenantId: number, contratoId: number, input: { date: string; amount: number; status?: string | null }) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');
    const valorContrato = toNumberOrNull(contrato.valorTotalAtual) ?? 0;
    const amount = Number(input.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valor inválido');

    const date = parseDateOnly(input.date);
    if (!date) throw new Error('Data inválida');

    const agg = await tx.contratoMedicao.aggregate({
      _sum: { amount: true },
      where: { tenantId, contratoId, status: { in: ['PENDENTE', 'APROVADO'] } },
    });
    const total = toNumberOrNull(agg?._sum?.amount) ?? 0;
    if (valorContrato > 0 && total + amount > valorContrato) throw new Error('Soma das medições não pode ultrapassar o valor do contrato.');

    const created = await tx.contratoMedicao.create({
      data: {
        tenantId,
        contratoId,
        date,
        amount,
        status: normalizeMedicaoStatus(input.status),
      },
    });

    publish(`contrato:${contratoId}`, 'contrato_atualizado', { contratoId });
    publish('contratos', 'contrato_atualizado', { contratoId });
    return {
      id: created.id,
      contratoId: created.contratoId,
      date: created.date.toISOString(),
      amount: toNumberOrNull(created.amount) ?? 0,
      status: normalizeMedicaoStatus(created.status),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  });
}

export async function updateContratoMedicaoStatus(tenantId: number, contratoId: number, medicaoId: number, input: { status: string }) {
  return withRLS(tenantId, async (tx) => {
    const med = await tx.contratoMedicao.findFirst({ where: { tenantId, contratoId, id: medicaoId } }).catch(() => null);
    if (!med) throw new Error('Medição não encontrada');
    const status = normalizeMedicaoStatus(input.status);

    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');
    const valorContrato = toNumberOrNull(contrato.valorTotalAtual) ?? 0;

    if (status !== 'REJEITADO') {
      const agg = await tx.contratoMedicao.aggregate({
        _sum: { amount: true },
        where: { tenantId, contratoId, status: { in: ['PENDENTE', 'APROVADO'] }, id: { not: medicaoId } },
      });
      const total = toNumberOrNull(agg?._sum?.amount) ?? 0;
      if (valorContrato > 0 && total + (toNumberOrNull(med.amount) ?? 0) > valorContrato) throw new Error('Soma das medições não pode ultrapassar o valor do contrato.');
    }

    const updated = await tx.contratoMedicao.update({
      where: { id: medicaoId },
      data: { status },
    });

    publish(`contrato:${contratoId}`, 'contrato_atualizado', { contratoId });
    publish('contratos', 'contrato_atualizado', { contratoId });
    return {
      id: updated.id,
      contratoId: updated.contratoId,
      date: updated.date.toISOString(),
      amount: toNumberOrNull(updated.amount) ?? 0,
      status: normalizeMedicaoStatus(updated.status),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
}

export async function listContratoPagamentos(tenantId: number, contratoId: number) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId }, select: { id: true } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');
    const rows = await tx.contratoPagamento.findMany({ where: { tenantId, contratoId }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
    return rows.map((r: any) => ({
      id: r.id,
      contratoId: r.contratoId,
      medicaoId: r.medicaoId ?? null,
      date: r.date.toISOString(),
      amount: toNumberOrNull(r.amount) ?? 0,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

export async function createContratoPagamento(tenantId: number, contratoId: number, input: { date: string; amount: number; medicaoId?: number | null }) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');

    const amount = Number(input.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valor inválido');
    const date = parseDateOnly(input.date);
    if (!date) throw new Error('Data inválida');

    const medAprovAgg = await tx.contratoMedicao.aggregate({
      _sum: { amount: true },
      where: { tenantId, contratoId, status: 'APROVADO' },
    });
    const totalMedAprov = toNumberOrNull(medAprovAgg?._sum?.amount) ?? 0;

    const pagAgg = await tx.contratoPagamento.aggregate({
      _sum: { amount: true },
      where: { tenantId, contratoId },
    });
    const totalPago = toNumberOrNull(pagAgg?._sum?.amount) ?? 0;
    if (totalPago + amount > totalMedAprov) throw new Error('Não pode pagar mais que o total medido aprovado.');

    const medicaoId = input.medicaoId != null ? Number(input.medicaoId) : null;
    if (medicaoId != null) {
      const med = await tx.contratoMedicao.findFirst({ where: { tenantId, contratoId, id: medicaoId } }).catch(() => null);
      if (!med) throw new Error('Medição não encontrada');
      if (normalizeMedicaoStatus(med.status) !== 'APROVADO') throw new Error('Pagamento só pode vincular a medição aprovada.');
      const sumByMed = await tx.contratoPagamento.aggregate({
        _sum: { amount: true },
        where: { tenantId, contratoId, medicaoId },
      });
      const pagoMed = toNumberOrNull(sumByMed?._sum?.amount) ?? 0;
      const valorMed = toNumberOrNull(med.amount) ?? 0;
      if (pagoMed + amount > valorMed) throw new Error('Não pode pagar mais que o valor da medição vinculada.');
    }

    const created = await tx.contratoPagamento.create({
      data: {
        tenantId,
        contratoId,
        medicaoId,
        date,
        amount,
      },
    });

    publish(`contrato:${contratoId}`, 'contrato_atualizado', { contratoId });
    publish('contratos', 'contrato_atualizado', { contratoId });
    return {
      id: created.id,
      contratoId: created.contratoId,
      medicaoId: created.medicaoId ?? null,
      date: created.date.toISOString(),
      amount: toNumberOrNull(created.amount) ?? 0,
      createdAt: created.createdAt.toISOString(),
    };
  });
}

export async function deleteContratoPagamento(tenantId: number, contratoId: number, pagamentoId: number) {
  return withRLS(tenantId, async (tx) => {
    const row = await tx.contratoPagamento.findFirst({ where: { tenantId, contratoId, id: pagamentoId } }).catch(() => null);
    if (!row) throw new Error('Pagamento não encontrado');
    await tx.contratoPagamento.delete({ where: { id: pagamentoId } });
    publish(`contrato:${contratoId}`, 'contrato_atualizado', { contratoId });
    publish('contratos', 'contrato_atualizado', { contratoId });
    return { ok: true };
  });
}

export async function getContratoById(tenantId: number, id: number) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato
      .findFirst({
        where: { tenantId, id },
        include: {
          obras: {
            select: {
              id: true,
              name: true,
              status: true,
              valorPrevisto: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          },
        },
      })
      .catch(() => null);

    if (!contrato) return null;

    const obraIds = (contrato.obras || []).map((o: any) => Number(o.id)).filter((n: number) => Number.isFinite(n));

    const [execAgg, pagoAgg] = await Promise.all([
      tx.medicao.aggregate({
        _sum: { amount: true },
        where: { obraId: { in: obraIds } },
      }),
      tx.pagamento.aggregate({
        _sum: { amount: true },
        where: { obraId: { in: obraIds } },
      }),
    ]);

    const valorExecutado = execAgg?._sum?.amount ?? null;
    const valorPago = pagoAgg?._sum?.amount ?? null;

    const abertos: any[] = await tx.$queryRaw`
      SELECT COUNT(*)::int AS "abertos"
      FROM "ContratoAditivo"
      WHERE "tenantId" = ${tenantId} AND "contratoId" = ${id} AND "status" = 'RASCUNHO'
    `;
    const temAditivoAberto = (abertos?.[0]?.abertos ?? 0) > 0;

    const extra = computeStatusEAlertas({
      ...contrato,
      valorExecutadoContrato: valorExecutado,
      valorPagoContrato: valorPago,
      temAditivoAberto,
    });

    return {
      ...contrato,
      statusCalculado: extra.statusCalc,
      alerta: extra.alerta,
      alertas: extra.issues,
      indicadores: {
        valorExecutado,
        valorPago,
      },
    };
  });
}

export async function listContratoAditivos(tenantId: number, contratoId: number) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId }, select: { id: true } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');
    return tx.contratoAditivo.findMany({
      where: { tenantId, contratoId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });
}

export async function createContratoAditivo(
  tenantId: number,
  contratoId: number,
  input: {
    numeroAditivo: string;
    tipo: 'PRAZO' | 'VALOR' | 'AMBOS';
    dataAssinatura?: string | null;
    justificativa?: string | null;
    descricao?: string | null;
    prazoAdicionadoDias?: number | null;
    valorTotalAdicionado?: number | null;
    valorConcedenteAdicionado?: number | null;
    valorProprioAdicionado?: number | null;
  }
) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');

    const numeroAditivo = String(input.numeroAditivo || '').trim();
    if (!numeroAditivo) throw new Error('numeroAditivo é obrigatório');
    const tipo = String(input.tipo || 'PRAZO').trim().toUpperCase() as any;

    const prazoAdicionadoDias = input.prazoAdicionadoDias == null ? null : Math.trunc(Number(input.prazoAdicionadoDias));
    const valorTotalAdicionado = toNumberOrNull(input.valorTotalAdicionado);
    const valorConcedenteAdicionado = toNumberOrNull(input.valorConcedenteAdicionado);
    const valorProprioAdicionado = toNumberOrNull(input.valorProprioAdicionado);

    if ((tipo === 'PRAZO' || tipo === 'AMBOS') && (!prazoAdicionadoDias || prazoAdicionadoDias <= 0)) throw new Error('prazoAdicionadoDias deve ser > 0');
    if (tipo === 'VALOR' || tipo === 'AMBOS') {
      const isPublico = String(contrato.tipoContratante || '').toUpperCase() === 'PUBLICO';
      if (isPublico) {
        const c = valorConcedenteAdicionado ?? 0;
        const p = valorProprioAdicionado ?? 0;
        if (c <= 0 && p <= 0) throw new Error('Informe valor concedente e/ou próprio adicionados');
      } else {
        if (!valorTotalAdicionado || valorTotalAdicionado <= 0) throw new Error('valorTotalAdicionado deve ser > 0');
      }
    }

    const created = await tx.contratoAditivo.create({
      data: {
        tenantId,
        contratoId,
        numeroAditivo,
        tipo,
        status: 'RASCUNHO',
        dataAssinatura: input.dataAssinatura ? parseDateOnly(input.dataAssinatura) : null,
        justificativa: input.justificativa ?? null,
        descricao: input.descricao ?? null,
        prazoAdicionadoDias,
        valorTotalAdicionado: valorTotalAdicionado == null ? null : valorTotalAdicionado,
        valorConcedenteAdicionado: valorConcedenteAdicionado == null ? null : valorConcedenteAdicionado,
        valorProprioAdicionado: valorProprioAdicionado == null ? null : valorProprioAdicionado,
      },
    });

    await createContratoEvento(tx, {
      tenantId,
      contratoId,
      tipoOrigem: 'ADITIVO',
      origemId: created.id,
      tipoEvento: 'CRIACAO',
      descricao: `Aditivo ${numeroAditivo} criado (${tipo})`,
      observacaoTexto: null,
      nivelObservacao: null,
      actorUserId: null,
    });

    publish(`contrato:${contratoId}`, 'contrato_atualizado', { contratoId });
    publish('contratos', 'contrato_atualizado', { contratoId });
    return created;
  });
}

export async function updateContratoAditivo(
  tenantId: number,
  contratoId: number,
  aditivoId: number,
  input: Partial<{
    tipo: 'PRAZO' | 'VALOR' | 'AMBOS';
    dataAssinatura: string | null;
    justificativa: string | null;
    descricao: string | null;
    prazoAdicionadoDias: number | null;
    valorTotalAdicionado: number | null;
    valorConcedenteAdicionado: number | null;
    valorProprioAdicionado: number | null;
  }>
) {
  return withRLS(tenantId, async (tx) => {
    const current = await tx.contratoAditivo.findFirst({ where: { tenantId, contratoId, id: aditivoId } }).catch(() => null);
    if (!current) throw new Error('Aditivo não encontrado');
    if (String(current.status).toUpperCase() !== 'RASCUNHO') throw new Error('Somente aditivos em rascunho podem ser alterados');

    const updated = await tx.contratoAditivo.update({
      where: { id: aditivoId },
      data: {
        tipo: input.tipo != null ? String(input.tipo).trim().toUpperCase() : undefined,
        dataAssinatura: input.dataAssinatura != null ? parseDateOnly(input.dataAssinatura) : undefined,
        justificativa: input.justificativa ?? undefined,
        descricao: input.descricao ?? undefined,
        prazoAdicionadoDias: input.prazoAdicionadoDias != null ? Math.trunc(Number(input.prazoAdicionadoDias)) : undefined,
        valorTotalAdicionado: input.valorTotalAdicionado != null ? toNumberOrNull(input.valorTotalAdicionado) : undefined,
        valorConcedenteAdicionado: input.valorConcedenteAdicionado != null ? toNumberOrNull(input.valorConcedenteAdicionado) : undefined,
        valorProprioAdicionado: input.valorProprioAdicionado != null ? toNumberOrNull(input.valorProprioAdicionado) : undefined,
      },
    });
    return updated;
  });
}

export async function cancelarContratoAditivo(tenantId: number, contratoId: number, aditivoId: number) {
  return withRLS(tenantId, async (tx) => {
    const current = await tx.contratoAditivo.findFirst({ where: { tenantId, contratoId, id: aditivoId } }).catch(() => null);
    if (!current) throw new Error('Aditivo não encontrado');
    if (String(current.status).toUpperCase() === 'APROVADO') throw new Error('Aditivo aprovado não pode ser cancelado');
    const updated = await tx.contratoAditivo.update({ where: { id: aditivoId }, data: { status: 'CANCELADO' } });

    await createContratoEvento(tx, {
      tenantId,
      contratoId,
      tipoOrigem: 'ADITIVO',
      origemId: aditivoId,
      tipoEvento: 'CANCELAMENTO',
      descricao: `Aditivo ${String(current.numeroAditivo)} cancelado`,
      observacaoTexto: null,
      nivelObservacao: null,
      actorUserId: null,
    });

    publish(`contrato:${contratoId}`, 'contrato_atualizado', { contratoId });
    publish('contratos', 'contrato_atualizado', { contratoId });
    return updated;
  });
}

export async function aprovarContratoAditivo(tenantId: number, contratoId: number, aditivoId: number) {
  return withRLS(tenantId, async (tx) => {
    const ad = await tx.contratoAditivo.findFirst({ where: { tenantId, contratoId, id: aditivoId } }).catch(() => null);
    if (!ad) throw new Error('Aditivo não encontrado');
    if (String(ad.status).toUpperCase() !== 'RASCUNHO') throw new Error('Aditivo já foi processado');

    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');

    const tipo = String(ad.tipo || 'PRAZO').toUpperCase();
    const isPublico = String(contrato.tipoContratante || '').toUpperCase() === 'PUBLICO';

    const prazoAtual = contrato.prazoDias == null ? null : Number(contrato.prazoDias);
    const vigAtual = contrato.vigenciaAtual ? new Date(contrato.vigenciaAtual) : null;
    const baseForPrazo = vigAtual || (contrato.dataOS ? new Date(contrato.dataOS) : contrato.dataAssinatura ? new Date(contrato.dataAssinatura) : null);

    const prazoAdd = ad.prazoAdicionadoDias == null ? 0 : Number(ad.prazoAdicionadoDias);
    const novoPrazo = prazoAtual != null ? prazoAtual + prazoAdd : prazoAdd > 0 ? prazoAdd : null;

    let novaVigenciaAtual: Date | null = vigAtual;
    if (tipo === 'PRAZO' || tipo === 'AMBOS') {
      if (!prazoAdd || prazoAdd <= 0) throw new Error('prazoAdicionadoDias deve ser > 0');
      if (vigAtual) novaVigenciaAtual = addDays(dateOnly(vigAtual), prazoAdd);
      else if (baseForPrazo && novoPrazo != null) {
        const computed = computeVigencias({ dataOS: contrato.dataOS ? new Date(contrato.dataOS) : null, dataAssinatura: contrato.dataAssinatura ? new Date(contrato.dataAssinatura) : null, prazoDias: novoPrazo, vigenciaInicial: contrato.vigenciaInicial ?? null, vigenciaAtual: null });
        novaVigenciaAtual = computed.vigenciaAtual;
      }
    }

    let nextValores: any = {};
    if (tipo === 'VALOR' || tipo === 'AMBOS') {
      if (isPublico) {
        const ca = (toNumberOrNull(contrato.valorConcedenteAtual) ?? 0) + (toNumberOrNull(ad.valorConcedenteAdicionado) ?? 0);
        const pa = (toNumberOrNull(contrato.valorProprioAtual) ?? 0) + (toNumberOrNull(ad.valorProprioAdicionado) ?? 0);
        const ta = ca + pa;
        nextValores = { valorConcedenteAtual: ca, valorProprioAtual: pa, valorTotalAtual: ta };
      } else {
        const add = toNumberOrNull(ad.valorTotalAdicionado) ?? 0;
        if (add <= 0) throw new Error('valorTotalAdicionado deve ser > 0');
        const ta = (toNumberOrNull(contrato.valorTotalAtual) ?? 0) + add;
        nextValores = { valorTotalAtual: ta };
      }
    }

    const updatedContrato = await tx.contrato.update({
      where: { id: contratoId },
      data: {
        prazoDias: novoPrazo != null ? Math.trunc(novoPrazo) : undefined,
        vigenciaAtual: novaVigenciaAtual ?? undefined,
        ...nextValores,
      },
    });

    const updatedAditivo = await tx.contratoAditivo.update({
      where: { id: aditivoId },
      data: {
        status: 'APROVADO',
        aplicadoEm: new Date(),
        snapshotPrazoDias: prazoAtual != null ? Math.trunc(prazoAtual) : null,
        snapshotVigenciaAtual: vigAtual,
        snapshotValorTotalAtual: contrato.valorTotalAtual ?? null,
        snapshotValorConcedenteAtual: contrato.valorConcedenteAtual ?? null,
        snapshotValorProprioAtual: contrato.valorProprioAtual ?? null,
      },
    });

    await createContratoEvento(tx, {
      tenantId,
      contratoId,
      tipoOrigem: 'ADITIVO',
      origemId: aditivoId,
      tipoEvento: 'APROVACAO',
      descricao: `Aditivo ${String(updatedAditivo.numeroAditivo)} aprovado e aplicado no contrato`,
      observacaoTexto: null,
      nivelObservacao: null,
      actorUserId: null,
    });

    publish(`contrato:${contratoId}`, 'contrato_atualizado', { contratoId });
    publish('contratos', 'contrato_atualizado', { contratoId });

    return { aditivo: updatedAditivo, contrato: updatedContrato };
  });
}

export async function getContratoConsolidado(tenantId: number, contratoId: number) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');

    const obraIds = await tx.obra.findMany({ where: { tenantId, contratoId }, select: { id: true } });
    const ids = obraIds.map((o: any) => o.id);

    const [execAgg, pagoAgg, abertos] = await Promise.all([
      tx.medicao.aggregate({ _sum: { amount: true }, where: { obraId: { in: ids } } }),
      tx.pagamento.aggregate({ _sum: { amount: true }, where: { obraId: { in: ids } } }),
      tx.contratoAditivo.count({ where: { tenantId, contratoId, status: 'RASCUNHO' } }),
    ]);

    const valorExecutado = execAgg?._sum?.amount ?? 0;
    const valorPago = pagoAgg?._sum?.amount ?? 0;

    const prazoTotal = contrato.prazoDias == null ? null : Number(contrato.prazoDias);
    const vigInicio = contrato.vigenciaInicial ? new Date(contrato.vigenciaInicial) : null;
    const vigAtual = contrato.vigenciaAtual ? new Date(contrato.vigenciaAtual) : null;
    const now = new Date();

    const diasRestantes = vigAtual ? Math.ceil((dateOnly(vigAtual).getTime() - dateOnly(now).getTime()) / (24 * 3600 * 1000)) : null;
    const diasDecorridos = vigInicio ? Math.max(0, Math.floor((dateOnly(now).getTime() - dateOnly(vigInicio).getTime()) / (24 * 3600 * 1000))) : null;
    const percentualPrazo = prazoTotal && diasDecorridos != null ? Math.min(1, diasDecorridos / prazoTotal) : null;

    const valorTotalAtual = toNumberOrNull(contrato.valorTotalAtual) ?? 0;
    const percentualFinanceiro = valorTotalAtual > 0 ? Math.min(1, (toNumberOrNull(valorExecutado) ?? 0) / valorTotalAtual) : null;
    const desvio = percentualFinanceiro != null && percentualPrazo != null ? Number((percentualFinanceiro - percentualPrazo).toFixed(4)) : null;

    const extra = computeStatusEAlertas({
      ...contrato,
      valorExecutadoContrato: valorExecutado,
      valorPagoContrato: valorPago,
      temAditivoAberto: abertos > 0,
    });

    return {
      contrato: {
        ...contrato,
        statusCalculado: extra.statusCalc,
        alerta: extra.alerta,
        alertas: extra.issues,
      },
      kpis: {
        prazoTotal,
        diasDecorridos,
        diasRestantes,
        percentualPrazo,
        valorTotalAtual,
        valorExecutado: toNumberOrNull(valorExecutado) ?? 0,
        valorPago: toNumberOrNull(valorPago) ?? 0,
        percentualFinanceiro,
        desvio,
        aditivosEmAberto: abertos,
      },
    };
  });
}

export async function listContratoEventos(
  tenantId: number,
  contratoId: number,
  input?: { tiposOrigem?: string[]; incluirObservacoes?: boolean; limit?: number }
) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId }, select: { id: true } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');

    const tiposOrigem = (input?.tiposOrigem || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
    const incluirObservacoes = input?.incluirObservacoes !== false;
    const limit = Math.min(200, Math.max(1, Number(input?.limit || 100)));

    const where: any = { tenantId, contratoId };
    if (tiposOrigem.length) where.tipoOrigem = { in: tiposOrigem };
    if (!incluirObservacoes) where.tipoEvento = { not: 'OBSERVACAO' };

    const eventos = await tx.contratoEvento.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    const eventoIds = eventos.map((e: any) => e.id);
    const anexos = eventoIds.length
      ? await tx.contratoEventoAnexo.findMany({
          where: { tenantId, contratoId, eventoId: { in: eventoIds } },
          select: { id: true, eventoId: true, nomeArquivo: true, mimeType: true, tamanhoBytes: true, createdAt: true },
          orderBy: [{ id: 'asc' }],
        })
      : [];

    const anexosByEventoId = new Map<number, any[]>();
    for (const a of anexos) {
      const list = anexosByEventoId.get(Number(a.eventoId)) || [];
      list.push({
        id: a.id,
        nomeArquivo: a.nomeArquivo,
        mimeType: a.mimeType,
        tamanhoBytes: a.tamanhoBytes,
        criadoEm: a.createdAt,
        downloadUrl: `/api/contratos/${contratoId}/eventos/${a.eventoId}/anexos/${a.id}`,
      });
      anexosByEventoId.set(Number(a.eventoId), list);
    }

    return eventos.map((e: any) => ({
      id: e.id,
      tipoOrigem: e.tipoOrigem,
      origemId: e.origemId,
      tipoEvento: e.tipoEvento,
      descricao: e.descricao,
      observacaoTexto: e.observacaoTexto,
      nivelObservacao: e.nivelObservacao,
      actorUserId: e.actorUserId,
      criadoEm: e.createdAt,
      anexos: anexosByEventoId.get(Number(e.id)) || [],
    }));
  });
}

export async function createContratoObservacao(
  tenantId: number,
  contratoId: number,
  input: { texto: string; nivel?: string | null; tipoOrigem?: string | null; origemId?: number | null; actorUserId?: number | null }
) {
  return withRLS(tenantId, async (tx) => {
    const texto = String(input.texto || '').trim();
    if (!texto) throw new Error('Observação é obrigatória');

    const tipoOrigem = input.tipoOrigem ? String(input.tipoOrigem).trim().toUpperCase() : 'CONTRATO';
    const nivel = input.nivel ? String(input.nivel).trim().toUpperCase() : 'NORMAL';

    const created = await createContratoEvento(tx, {
      tenantId,
      contratoId,
      tipoOrigem,
      origemId: input.origemId ?? null,
      tipoEvento: 'OBSERVACAO',
      descricao: 'Observação registrada',
      observacaoTexto: texto,
      nivelObservacao: nivel,
      actorUserId: input.actorUserId ?? null,
    });

    return created;
  });
}

export async function addContratoEventoAnexo(
  tenantId: number,
  contratoId: number,
  eventoId: number,
  input: { nomeArquivo: string; mimeType: string; conteudoBase64: string; actorUserId?: number | null }
) {
  return withRLS(tenantId, async (tx) => {
    const evento = await tx.contratoEvento.findFirst({ where: { tenantId, contratoId, id: eventoId }, select: { id: true } }).catch(() => null);
    if (!evento) throw new Error('Evento não encontrado');

    const nomeArquivo = String(input.nomeArquivo || '').trim();
    const mimeType = String(input.mimeType || '').trim().toLowerCase();
    if (!nomeArquivo) throw new Error('nomeArquivo é obrigatório');
    if (!mimeType) throw new Error('mimeType é obrigatório');

    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(mimeType)) throw new Error('Tipo de arquivo não permitido');

    const bytes = Buffer.from(String(input.conteudoBase64 || ''), 'base64');
    if (!bytes.length) throw new Error('Arquivo vazio');
    const maxBytes = 10 * 1024 * 1024;
    if (bytes.length > maxBytes) throw new Error('Arquivo excede 10MB');

    const created = await tx.contratoEventoAnexo.create({
      data: {
        tenantId,
        contratoId,
        eventoId,
        nomeArquivo,
        mimeType,
        tamanhoBytes: bytes.length,
        conteudo: bytes,
        actorUserId: input.actorUserId ?? null,
      },
      select: { id: true, eventoId: true, nomeArquivo: true, mimeType: true, tamanhoBytes: true, createdAt: true },
    });

    publish(`contrato:${contratoId}`, 'anexo_criado', { contratoId, eventoId, anexoId: created.id });
    publish('contratos', 'anexo_criado', { contratoId, eventoId, anexoId: created.id });

    return {
      id: created.id,
      nomeArquivo: created.nomeArquivo,
      mimeType: created.mimeType,
      tamanhoBytes: created.tamanhoBytes,
      criadoEm: created.createdAt,
      downloadUrl: `/api/contratos/${contratoId}/eventos/${eventoId}/anexos/${created.id}`,
    };
  });
}

export async function downloadContratoEventoAnexo(tenantId: number, contratoId: number, eventoId: number, anexoId: number) {
  return withRLS(tenantId, async (tx) => {
    const anexo = await tx.contratoEventoAnexo
      .findFirst({
        where: { tenantId, contratoId, eventoId, id: anexoId },
        select: { nomeArquivo: true, mimeType: true, tamanhoBytes: true, conteudo: true },
      })
      .catch(() => null);
    if (!anexo) throw new Error('Anexo não encontrado');
    return anexo;
  });
}

export async function getContratosDashboard(tenantId: number, input?: { status?: string | null }) {
  return withRLS(tenantId, async (tx) => {
    const status = input?.status ? String(input.status).trim().toUpperCase() : null;
    const whereContrato: any = { tenantId };
    if (status) whereContrato.status = status;

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

    const [totalContratos, somaContratado, vencendo, atrasados] = await Promise.all([
      tx.contrato.count({ where: whereContrato }),
      tx.contrato.aggregate({ _sum: { valorTotalAtual: true }, where: whereContrato }),
      tx.contrato.count({
        where: {
          ...whereContrato,
          vigenciaAtual: { gte: now, lte: in30 },
        },
      }),
      tx.contrato.count({
        where: {
          ...whereContrato,
          vigenciaAtual: { lt: now },
          status: { notIn: ['ENCERRADO', 'FINALIZADO', 'CANCELADO', 'RESCINDIDO'] },
        },
      }),
    ]);

    const [valorExecutadoAgg, valorPagoAgg] = await Promise.all([
      tx.medicao.aggregate({
        _sum: { amount: true },
        where: {
          obra: {
            tenantId,
            contrato: status ? { status } : undefined,
          },
        },
      }),
      tx.pagamento.aggregate({
        _sum: { amount: true },
        where: {
          obra: {
            tenantId,
            contrato: status ? { status } : undefined,
          },
        },
      }),
    ]);

    const valorContratado = somaContratado?._sum?.valorTotalAtual ?? null;
    const valorExecutado = valorExecutadoAgg?._sum?.amount ?? null;
    const valorPago = valorPagoAgg?._sum?.amount ?? null;

    const vc = typeof valorContratado === 'number' ? valorContratado : valorContratado ? Number(valorContratado) : 0;
    const ve = typeof valorExecutado === 'number' ? valorExecutado : valorExecutado ? Number(valorExecutado) : 0;
    const vp = typeof valorPago === 'number' ? valorPago : valorPago ? Number(valorPago) : 0;

    const contratos = await tx.contrato.findMany({
      where: whereContrato,
      select: {
        id: true,
        numeroContrato: true,
        nome: true,
        objeto: true,
        tipoContratante: true,
        status: true,
        dataAssinatura: true,
        dataOS: true,
        prazoDias: true,
        vigenciaAtual: true,
        valorTotalAtual: true,
      },
    });

    const pagoRows: Array<{ contratoId: number; valorPago: any }> = status
      ? await tx.$queryRaw`
          SELECT o."contratoId"::int AS "contratoId", COALESCE(SUM(p."amount"), 0) AS "valorPago"
          FROM "Pagamento" p
          JOIN "Obra" o ON o."id" = p."obraId"
          JOIN "Contrato" c ON c."id" = o."contratoId"
          WHERE o."tenantId" = ${tenantId} AND c."tenantId" = ${tenantId} AND c."status" = ${status} AND o."contratoId" IS NOT NULL
          GROUP BY o."contratoId"
        `
      : await tx.$queryRaw`
          SELECT o."contratoId"::int AS "contratoId", COALESCE(SUM(p."amount"), 0) AS "valorPago"
          FROM "Pagamento" p
          JOIN "Obra" o ON o."id" = p."obraId"
          WHERE o."tenantId" = ${tenantId} AND o."contratoId" IS NOT NULL
          GROUP BY o."contratoId"
        `;

    const valorPagoByContratoId = new Map<number, number>();
    for (const r of pagoRows || []) {
      const id = Number((r as any).contratoId);
      const v = (r as any).valorPago;
      const n = typeof v === 'number' ? v : v ? Number(v) : 0;
      if (Number.isFinite(id)) valorPagoByContratoId.set(id, Number.isFinite(n) ? n : 0);
    }

    const closedStatuses = new Set(['ENCERRADO', 'FINALIZADO', 'CANCELADO', 'RESCINDIDO']);
    let concluidos = 0;
    let vencidos = 0;
    let aVencer = 0;
    let semRecursos = 0;
    let ativosElegiveis = 0;

    for (const c of contratos) {
      const st = String((c as any).status || '').toUpperCase();
      if (st === 'ENCERRADO' || st === 'FINALIZADO') concluidos += 1;
      const isClosed = closedStatuses.has(st);
      if (!isClosed) ativosElegiveis += 1;

      const vig = (c as any).vigenciaAtual as Date | null;
      if (!isClosed && vig && vig.getTime() < now.getTime()) vencidos += 1;
      if (!isClosed && vig && vig.getTime() >= now.getTime() && vig.getTime() <= in30.getTime()) aVencer += 1;

      const total = (c as any).valorTotalAtual;
      const totalN = typeof total === 'number' ? total : total ? Number(total) : 0;
      const pagoN = valorPagoByContratoId.get(Number(c.id)) ?? 0;
      if (!isClosed && totalN > 0 && pagoN >= totalN) semRecursos += 1;
    }

    const emAndamento = Math.max(0, ativosElegiveis - vencidos - aVencer - semRecursos);

    const aditivosAgg = await tx.contratoAditivo.groupBy({
      by: ['status'],
      where: status ? { tenantId, contrato: { status } } : { tenantId },
      _count: { _all: true },
    });
    const aditivosPorStatus: Record<string, number> = {};
    for (const a of aditivosAgg) {
      aditivosPorStatus[String(a.status || '').toUpperCase()] = Number((a as any)?._count?._all ?? 0);
    }
    const aditivosPendentes = aditivosPorStatus['RASCUNHO'] ?? 0;

    const recentes = await tx.contratoEvento.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: {
        id: true,
        contratoId: true,
        tipoOrigem: true,
        tipoEvento: true,
        descricao: true,
        createdAt: true,
        contrato: { select: { numeroContrato: true } },
      },
    });

    const prazoCriticoRows = contratos
      .filter((c) => {
        const st = String((c as any).status || '').toUpperCase();
        if (closedStatuses.has(st)) return false;
        return !!(c as any).vigenciaAtual;
      })
      .map((c) => {
        const vig = (c as any).vigenciaAtual as Date;
        const diff = Math.ceil((vig.getTime() - now.getTime()) / (24 * 3600 * 1000));
        const st = diff < 0 ? 'VENCIDO' : diff <= 30 ? 'A_VENCER' : 'EM_ANDAMENTO';
        return {
          contratoId: Number(c.id),
          numeroContrato: String((c as any).numeroContrato || ''),
          objeto: (c as any).objeto ?? (c as any).nome ?? null,
          vigenciaAtual: vig.toISOString(),
          diasRestantes: diff,
          situacao: st,
        };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 12);

    const porTipo: Array<{ tipo: string; quantidade: number }> = [];
    const tipoCount = new Map<string, number>();
    for (const c of contratos) {
      const t = String((c as any).tipoContratante || 'PRIVADO').toUpperCase();
      tipoCount.set(t, (tipoCount.get(t) ?? 0) + 1);
    }
    for (const [tipo, quantidade] of tipoCount.entries()) porTipo.push({ tipo, quantidade });
    porTipo.sort((a, b) => b.quantidade - a.quantidade);

    const start6m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1, 0, 0, 0, 0));
    const endNext = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

    const executadoMesRows: Array<{ mes: string; total: any }> = status
      ? await tx.$queryRaw`
          SELECT to_char(date_trunc('month', m."date"), 'YYYY-MM') AS "mes", COALESCE(SUM(m."amount"), 0) AS "total"
          FROM "Medicao" m
          JOIN "Obra" o ON o."id" = m."obraId"
          JOIN "Contrato" c ON c."id" = o."contratoId"
          WHERE o."tenantId" = ${tenantId} AND c."tenantId" = ${tenantId} AND c."status" = ${status}
            AND m."date" >= ${start6m} AND m."date" < ${endNext}
          GROUP BY 1
          ORDER BY 1 ASC
        `
      : await tx.$queryRaw`
          SELECT to_char(date_trunc('month', m."date"), 'YYYY-MM') AS "mes", COALESCE(SUM(m."amount"), 0) AS "total"
          FROM "Medicao" m
          JOIN "Obra" o ON o."id" = m."obraId"
          WHERE o."tenantId" = ${tenantId}
            AND m."date" >= ${start6m} AND m."date" < ${endNext}
          GROUP BY 1
          ORDER BY 1 ASC
        `;

    const contratadoMesRows: Array<{ mes: string; total: any }> = await tx.$queryRaw`
      SELECT to_char(date_trunc('month', COALESCE(c."dataOS", c."dataAssinatura", c."createdAt")), 'YYYY-MM') AS "mes",
             COALESCE(SUM(c."valorTotalAtual"), 0) AS "total"
      FROM "Contrato" c
      WHERE c."tenantId" = ${tenantId}
        AND (${status}::text IS NULL OR c."status" = ${status})
        AND COALESCE(c."dataOS", c."dataAssinatura", c."createdAt") >= ${start6m}
        AND COALESCE(c."dataOS", c."dataAssinatura", c."createdAt") < ${endNext}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const execByMes = new Map<string, number>();
    for (const r of executadoMesRows || []) {
      const mes = String((r as any).mes || '');
      const v = (r as any).total;
      execByMes.set(mes, typeof v === 'number' ? v : v ? Number(v) : 0);
    }
    const contByMes = new Map<string, number>();
    for (const r of contratadoMesRows || []) {
      const mes = String((r as any).mes || '');
      const v = (r as any).total;
      contByMes.set(mes, typeof v === 'number' ? v : v ? Number(v) : 0);
    }

    const meses: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1, 0, 0, 0, 0));
      const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      meses.push(m);
    }
    const serie = meses.map((m) => ({
      mes: m,
      valorContratado: contByMes.get(m) ?? 0,
      valorExecutado: execByMes.get(m) ?? 0,
    }));

    return {
      kpis: {
        totalContratos,
        valorContratado: vc,
        valorExecutado: ve,
        valorPago: vp,
        saldoAReceber: vc - vp,
        saldoAExecutar: vc - ve,
        percentualExecucaoFinanceira: vc > 0 ? Number(((ve / vc) * 100).toFixed(2)) : null,
        vencendoEm30Dias: vencendo,
        atrasados,
      },
      cards: {
        total: totalContratos,
        emAndamento,
        aVencer,
        vencidos,
        concluidos,
        semRecursos,
      },
      alertas: [
        { codigo: 'CONTRATOS_VENCIDOS', titulo: 'Contratos vencidos', severidade: 'CRITICO', quantidade: vencidos },
        { codigo: 'CONTRATOS_A_VENCER', titulo: 'Contratos a vencer (30 dias)', severidade: 'ALERTA', quantidade: aVencer },
        { codigo: 'SEM_RECURSOS', titulo: 'Sem recursos', severidade: 'ALERTA', quantidade: semRecursos },
        { codigo: 'ADITIVOS_PENDENTES', titulo: 'Aditivos pendentes de aprovação', severidade: 'ALERTA', quantidade: aditivosPendentes },
      ].filter((a) => (a as any).quantidade > 0),
      prazoCritico: prazoCriticoRows,
      aditivosPorSituacao: {
        aprovados: aditivosPorStatus['APROVADO'] ?? 0,
        pendentes: aditivosPorStatus['RASCUNHO'] ?? 0,
        cancelados: aditivosPorStatus['CANCELADO'] ?? 0,
      },
      atividadesRecentes: (recentes || []).map((e) => ({
        id: e.id,
        contratoId: e.contratoId,
        numeroContrato: e.contrato?.numeroContrato || null,
        tipoOrigem: e.tipoOrigem,
        tipoEvento: e.tipoEvento,
        descricao: e.descricao,
        criadoEm: e.createdAt.toISOString(),
      })),
      contratosPorTipo: porTipo,
      serieContratadoExecutado: serie,
    };
  });
}

export async function createContrato(tenantId: number, input: CreateContratoInput) {
  return withRLS(tenantId, async (tx) => {
    const numeroContrato = String(input.numeroContrato).trim();
    const tipoContratante = input.tipoContratante ? String(input.tipoContratante).trim().toUpperCase() : 'PRIVADO';

    const dataAssinatura = input.dataAssinatura ? parseDateOnly(input.dataAssinatura) : input.dataInicio ? parseDateOnly(input.dataInicio) : null;
    const dataOS = input.dataOS ? parseDateOnly(input.dataOS) : null;
    const prazoDias = input.prazoDias == null ? null : Math.max(1, Math.trunc(Number(input.prazoDias)));
    const computedVig = computeVigencias({
      dataOS,
      dataAssinatura,
      prazoDias,
      vigenciaInicial: input.vigenciaInicial ? parseDateOnly(input.vigenciaInicial) : null,
      vigenciaAtual: input.vigenciaAtual ? parseDateOnly(input.vigenciaAtual) : null,
    });

    const computedValores = computeValores({
      tipoContratante,
      valorConcedenteInicial: input.valorConcedenteInicial ?? null,
      valorProprioInicial: input.valorProprioInicial ?? null,
      valorTotalInicial: input.valorTotalInicial ?? null,
      valorConcedenteAtual: input.valorConcedenteAtual ?? null,
      valorProprioAtual: input.valorProprioAtual ?? null,
      valorTotalAtual: input.valorTotalAtual ?? null,
    });

    const created = await tx.contrato.create({
      data: {
        tenantId,
        numeroContrato,
        nome: input.nome ?? null,
        objeto: input.objeto ?? null,
        descricao: input.descricao ?? null,
        tipoContratante,
        empresaParceiraNome: input.empresaParceiraNome ?? null,
        empresaParceiraDocumento: input.empresaParceiraDocumento ?? null,
        status: input.status ? String(input.status).trim().toUpperCase() : 'ATIVO',
        dataInicio: input.dataInicio ? parseDateOnly(input.dataInicio) : null,
        dataFim: input.dataFim ? parseDateOnly(input.dataFim) : null,
        dataAssinatura,
        dataOS,
        prazoDias: computedVig.prazoDias,
        vigenciaInicial: computedVig.vigenciaInicial,
        vigenciaAtual: computedVig.vigenciaAtual,
        valorContratado: input.valorContratado ?? null,
        valorConcedenteInicial: computedValores.valorConcedenteInicial,
        valorProprioInicial: computedValores.valorProprioInicial,
        valorTotalInicial: computedValores.valorTotalInicial,
        valorConcedenteAtual: computedValores.valorConcedenteAtual,
        valorProprioAtual: computedValores.valorProprioAtual,
        valorTotalAtual: computedValores.valorTotalAtual,
      },
    });
    return created;
  });
}

export async function updateContrato(tenantId: number, id: number, input: UpdateContratoInput) {
  return withRLS(tenantId, async (tx) => {
    const current = await tx.contrato.findFirst({ where: { tenantId, id } }).catch(() => null);
    if (!current) throw new Error('Contrato não encontrado');

    const tipoContratante = input.tipoContratante != null ? String(input.tipoContratante).trim().toUpperCase() : String(current.tipoContratante || 'PRIVADO').toUpperCase();
    const dataAssinatura = input.dataAssinatura != null ? parseDateOnly(input.dataAssinatura) : current.dataAssinatura ?? null;
    const dataOS = input.dataOS != null ? parseDateOnly(input.dataOS) : current.dataOS ?? null;
    const prazoDias = input.prazoDias != null ? Math.max(1, Math.trunc(Number(input.prazoDias))) : (typeof current.prazoDias === 'number' ? current.prazoDias : current.prazoDias != null ? Number(current.prazoDias) : null);
    const computedVig = computeVigencias({
      dataOS,
      dataAssinatura,
      prazoDias,
      vigenciaInicial: current.vigenciaInicial ?? null,
      vigenciaAtual: input.vigenciaAtual != null ? parseDateOnly(input.vigenciaAtual) : current.vigenciaAtual ?? null,
    });

    const computedValores = computeValores({
      tipoContratante,
      valorConcedenteInicial: input.valorConcedenteInicial != null ? input.valorConcedenteInicial : current.valorConcedenteInicial ?? null,
      valorProprioInicial: input.valorProprioInicial != null ? input.valorProprioInicial : current.valorProprioInicial ?? null,
      valorTotalInicial: input.valorTotalInicial != null ? input.valorTotalInicial : current.valorTotalInicial ?? null,
      valorConcedenteAtual: input.valorConcedenteAtual != null ? input.valorConcedenteAtual : current.valorConcedenteAtual ?? null,
      valorProprioAtual: input.valorProprioAtual != null ? input.valorProprioAtual : current.valorProprioAtual ?? null,
      valorTotalAtual: input.valorTotalAtual != null ? input.valorTotalAtual : current.valorTotalAtual ?? null,
    });

    const updated = await tx.contrato.update({
      where: { id },
      data: {
        numeroContrato: input.numeroContrato != null ? String(input.numeroContrato).trim() : undefined,
        nome: input.nome ?? undefined,
        objeto: input.objeto ?? undefined,
        descricao: input.descricao ?? undefined,
        tipoContratante: input.tipoContratante != null ? tipoContratante : undefined,
        empresaParceiraNome: input.empresaParceiraNome ?? undefined,
        empresaParceiraDocumento: input.empresaParceiraDocumento ?? undefined,
        status: input.status != null ? String(input.status).trim().toUpperCase() : undefined,
        dataInicio: input.dataInicio != null ? parseDateOnly(input.dataInicio) : undefined,
        dataFim: input.dataFim != null ? parseDateOnly(input.dataFim) : undefined,
        dataAssinatura: input.dataAssinatura != null ? dataAssinatura : undefined,
        dataOS: input.dataOS != null ? dataOS : undefined,
        prazoDias: input.prazoDias != null ? computedVig.prazoDias : undefined,
        vigenciaInicial: computedVig.vigenciaInicial ?? undefined,
        vigenciaAtual: computedVig.vigenciaAtual ?? undefined,
        valorContratado: input.valorContratado ?? undefined,
        valorConcedenteInicial: computedValores.valorConcedenteInicial ?? undefined,
        valorProprioInicial: computedValores.valorProprioInicial ?? undefined,
        valorTotalInicial: computedValores.valorTotalInicial ?? undefined,
        valorConcedenteAtual: computedValores.valorConcedenteAtual ?? undefined,
        valorProprioAtual: computedValores.valorProprioAtual ?? undefined,
        valorTotalAtual: computedValores.valorTotalAtual ?? undefined,
      },
    });
    return updated;
  });
}

export async function listContratoServicos(tenantId: number, contratoId: number) {
  return withRLS(tenantId, async (tx) => {
    return tx.contratoServico.findMany({
      where: { tenantId, contratoId },
      orderBy: [{ codigo: 'asc' }, { id: 'asc' }],
    });
  });
}

export async function createContratoServico(
  tenantId: number,
  contratoId: number,
  input: { codigo: string; nome: string; unidade?: string | null; quantidade?: number | null; valorUnitario?: number | null; percentualPeso?: number | null }
) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId }, select: { id: true } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');

    const codigo = String(input.codigo || '').trim();
    const nome = String(input.nome || '').trim();
    if (!codigo) throw new Error('codigo é obrigatório');
    if (!nome) throw new Error('nome é obrigatório');

    const quantidade = input.quantidade == null ? null : Number(input.quantidade);
    const valorUnitario = input.valorUnitario == null ? null : Number(input.valorUnitario);
    const percentualPeso = input.percentualPeso == null ? null : Number(input.percentualPeso);

    const valorTotal =
      quantidade != null && Number.isFinite(quantidade) && valorUnitario != null && Number.isFinite(valorUnitario)
        ? quantidade * valorUnitario
        : null;

    const created = await tx.contratoServico.create({
      data: {
        tenantId,
        contratoId,
        codigo,
        nome,
        unidade: input.unidade ?? null,
        quantidade: quantidade == null || !Number.isFinite(quantidade) ? null : quantidade,
        valorUnitario: valorUnitario == null || !Number.isFinite(valorUnitario) ? null : valorUnitario,
        valorTotal: valorTotal == null || !Number.isFinite(valorTotal) ? null : valorTotal,
        percentualPeso: percentualPeso == null || !Number.isFinite(percentualPeso) ? null : percentualPeso,
      },
    });
    return created;
  });
}

export async function seedCronogramaFromServicos(tenantId: number, contratoId: number, input?: { duracaoDiasPadrao?: number | null }) {
  return withRLS(tenantId, async (tx) => {
    const duracao = Math.max(1, Number(input?.duracaoDiasPadrao || 7));
    const servicos = await tx.contratoServico.findMany({ where: { tenantId, contratoId }, orderBy: [{ codigo: 'asc' }, { id: 'asc' }] });
    if (!servicos.length) return { created: 0 };

    const existing = await tx.contratoCronogramaItem.findMany({ where: { tenantId, contratoId }, select: { servicoId: true } });
    const existingSet = new Set<number>(existing.map((e: any) => Number(e.servicoId)));

    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    let cursor = start;
    let createdCount = 0;

    for (const s of servicos) {
      if (existingSet.has(s.id)) continue;
      const dataInicio = cursor;
      const dataFim = new Date(cursor.getTime() + duracao * 24 * 3600 * 1000);
      await tx.contratoCronogramaItem.create({
        data: {
          tenantId,
          contratoId,
          servicoId: s.id,
          dataInicio,
          dataFim,
          duracaoDias: duracao,
          progresso: 0,
        },
      });
      createdCount += 1;
      cursor = dataFim;
    }

    return { created: createdCount };
  });
}

export async function getContratoCronograma(tenantId: number, contratoId: number) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: contratoId }, select: { id: true } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');

    const items = await tx.contratoCronogramaItem.findMany({
      where: { tenantId, contratoId },
      include: {
        servico: { select: { id: true, codigo: true, nome: true } },
      },
      orderBy: [{ dataInicio: 'asc' }, { id: 'asc' }],
    });

    const deps = await tx.contratoCronogramaDependencia.findMany({
      where: { tenantId, contratoId },
      orderBy: [{ id: 'asc' }],
    });

    return {
      items: items.map((i: any) => ({
        id: i.id,
        servicoId: i.servicoId,
        codigo: i.servico?.codigo || '',
        nome: i.servico?.nome || '',
        dataInicio: i.dataInicio,
        dataFim: i.dataFim,
        duracaoDias: i.duracaoDias,
        progresso: i.progresso == null ? null : Number(i.progresso),
      })),
      dependencias: deps.map((d: any) => ({
        id: d.id,
        origemItemId: d.origemItemId,
        destinoItemId: d.destinoItemId,
        tipo: d.tipo,
      })),
    };
  });
}

export async function updateCronogramaItemDatas(
  tenantId: number,
  contratoId: number,
  itemId: number,
  input: { dataInicio: string; dataFim: string }
) {
  return withRLS(tenantId, async (tx) => {
    const current = await tx.contratoCronogramaItem.findFirst({ where: { tenantId, contratoId, id: itemId } }).catch(() => null);
    if (!current) throw new Error('Item não encontrado');

    const ini = parseDateOnly(input.dataInicio);
    const fim = parseDateOnly(input.dataFim);
    if (!ini || !fim) throw new Error('datas inválidas');
    const dur = Math.max(1, Math.round((fim.getTime() - ini.getTime()) / (24 * 3600 * 1000)));

    const updated = await tx.contratoCronogramaItem.update({
      where: { id: itemId },
      data: { dataInicio: ini, dataFim: fim, duracaoDias: dur },
    });
    return updated;
  });
}

export async function createCronogramaDependencia(
  tenantId: number,
  contratoId: number,
  input: { origemItemId: number; destinoItemId: number; tipo?: string | null }
) {
  return withRLS(tenantId, async (tx) => {
    const tipo = input.tipo ? String(input.tipo).trim().toUpperCase() : 'FS';
    const origem = await tx.contratoCronogramaItem.findFirst({ where: { tenantId, contratoId, id: input.origemItemId }, select: { id: true } }).catch(() => null);
    const destino = await tx.contratoCronogramaItem.findFirst({ where: { tenantId, contratoId, id: input.destinoItemId }, select: { id: true } }).catch(() => null);
    if (!origem || !destino) throw new Error('Dependência inválida');
    if (input.origemItemId === input.destinoItemId) throw new Error('Origem e destino devem ser diferentes');
    const created = await tx.contratoCronogramaDependencia.create({
      data: { tenantId, contratoId, origemItemId: input.origemItemId, destinoItemId: input.destinoItemId, tipo },
    });
    return created;
  });
}

export async function deleteCronogramaDependencia(tenantId: number, contratoId: number, depId: number) {
  return withRLS(tenantId, async (tx) => {
    const current = await tx.contratoCronogramaDependencia.findFirst({ where: { tenantId, contratoId, id: depId }, select: { id: true } }).catch(() => null);
    if (!current) throw new Error('Dependência não encontrada');
    await tx.contratoCronogramaDependencia.delete({ where: { id: depId } });
    return { ok: true };
  });
}
