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
    return tx.contrato.findMany({ where: { tenantId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] });
  });
}

export async function createContrato(tenantId: number, input: CreateContratoInput) {
  return withRLS(tenantId, async (tx) => {
    const numeroContrato = String(input.numeroContrato).trim();
    const created = await tx.contrato.create({
      data: {
        tenantId,
        numeroContrato,
        descricao: input.descricao ?? null,
        status: input.status ? String(input.status).trim().toUpperCase() : 'ATIVO',
        dataInicio: input.dataInicio ? parseDateOnly(input.dataInicio) : null,
        dataFim: input.dataFim ? parseDateOnly(input.dataFim) : null,
        valorContratado: input.valorContratado ?? null,
      },
    });
    return created;
  });
}

export async function updateContrato(tenantId: number, id: number, input: UpdateContratoInput) {
  return withRLS(tenantId, async (tx) => {
    const current = await tx.contrato.findFirst({ where: { tenantId, id } }).catch(() => null);
    if (!current) throw new Error('Contrato não encontrado');
    const updated = await tx.contrato.update({
      where: { id },
      data: {
        numeroContrato: input.numeroContrato != null ? String(input.numeroContrato).trim() : undefined,
        descricao: input.descricao ?? undefined,
        status: input.status != null ? String(input.status).trim().toUpperCase() : undefined,
        dataInicio: input.dataInicio != null ? parseDateOnly(input.dataInicio) : undefined,
        dataFim: input.dataFim != null ? parseDateOnly(input.dataFim) : undefined,
        valorContratado: input.valorContratado ?? undefined,
      },
    });
    return updated;
  });
}

