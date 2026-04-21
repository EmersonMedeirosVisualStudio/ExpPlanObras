import prisma, { setTenantContext } from '../../plugins/prisma.js';
import type { CreateContratoInput, UpdateContratoInput } from './contratos.schema.js';

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
