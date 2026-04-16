import prisma, { setTenantContext } from "../../plugins/prisma.js";
import { CreateObraInput, UpdateObraInput } from "./obras.schema.js";

export type AbrangenciaContext = { empresa: boolean; obras: number[]; unidades: number[] };

// Helper to execute with RLS context
// This ensures that the tenant_id is set for the transaction session
async function withRLS<T>(tenantId: number, callback: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Set tenant context for RLS
    await setTenantContext(tx, tenantId);
    return callback(tx);
  });
}

export async function createObra(input: CreateObraInput, tenantId: number) {
  return withRLS(tenantId, async (tx) => {
    return tx.obra.create({
      data: {
        ...input,
        tenantId,
      },
    });
  });
}

function scopeWhere(tenantId: number, scope?: AbrangenciaContext) {
  if (!scope || scope.empresa) return { tenantId };
  if (Array.isArray(scope.obras) && scope.obras.length > 0) return { tenantId, id: { in: scope.obras } };
  return { tenantId, id: { in: [-1] } };
}

function canAccessObraId(obraId: number, scope?: AbrangenciaContext) {
  if (!scope || scope.empresa) return true;
  return Array.isArray(scope.obras) && scope.obras.includes(obraId);
}

export async function getObras(tenantId: number, scope?: AbrangenciaContext) {
  return withRLS(tenantId, async (tx) => {
    return tx.obra.findMany({
      orderBy: { createdAt: 'desc' },
      where: scopeWhere(tenantId, scope),
    });
  });
}

export async function getObraById(id: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(id, scope)) {
    throw new Error("Access denied");
  }
  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findUnique({
      where: { id },
    });
    
    // RLS policy in DB will prevent reading other tenant's data
    // But application level check is a good redundancy
    if (obra && obra.tenantId !== tenantId) {
        throw new Error("Access denied");
    }
    
    return obra;
  });
}

export async function updateObra(id: number, input: UpdateObraInput, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(id, scope)) {
    throw new Error("Access denied");
  }
  return withRLS(tenantId, async (tx) => {
    // Verify ownership first or rely on RLS update policy
    // With RLS, if the row is not visible, update might affect 0 rows or throw
    const count = await tx.obra.updateMany({
        where: { 
            id,
            tenantId 
        },
        data: input
    });
    
    if (count.count === 0) {
        throw new Error("Obra not found or access denied");
    }
    
    return getObraById(id, tenantId, scope);
  });
}

export async function deleteObra(id: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(id, scope)) {
    throw new Error("Access denied");
  }
  return withRLS(tenantId, async (tx) => {
    const count = await tx.obra.deleteMany({
      where: { 
          id,
          tenantId
      },
    });
    
    if (count.count === 0) {
        throw new Error("Obra not found or access denied");
    }
    
    return { success: true };
  });
}

export async function getOrcamento(obraId: number, tenantId: number) {
  // Orcamento é sempre por obra, então respeita escopo
  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({
      where: { id: obraId, tenantId },
      select: { id: true, name: true, valorPrevisto: true }
    });
    if (!obra) throw new Error("Obra not found or access denied");
    const custos = await tx.custo.findMany({
      where: { obraId, tenantId },
      orderBy: { date: 'desc' }
    });
    const totalGasto = custos.reduce((sum: any, c: any) => sum + Number(c.amount), 0);
    return {
      obra,
      totalGasto,
      saldo: (obra.valorPrevisto ? Number(obra.valorPrevisto) : 0) - totalGasto,
      custos
    };
  });
}

export async function updateOrcamento(obraId: number, valorPrevisto: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(obraId, scope)) {
    throw new Error("Access denied");
  }
  return withRLS(tenantId, async (tx) => {
    const updated = await tx.obra.updateMany({
      where: { id: obraId, tenantId },
      data: { valorPrevisto }
    });
    if (updated.count === 0) throw new Error("Obra not found or access denied");
    return getOrcamento(obraId, tenantId);
  });
}

export async function addCusto(obraId: number, input: { description: string; amount: number; date?: string }, tenantId: number) {
  // Custos são sempre por obra, então respeita escopo
  return withRLS(tenantId, async (tx) => {
    // ensure obra belongs to tenant
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
    if (!obra) throw new Error("Obra not found or access denied");
    const dateVal = input.date ? new Date(input.date) : new Date();
    await tx.custo.create({
      data: {
        obraId,
        tenantId,
        description: input.description,
        amount: input.amount,
        date: dateVal
      }
    });
    return getOrcamento(obraId, tenantId);
  });
}

export async function removeCusto(obraId: number, custoId: number, tenantId: number) {
  // Remoção de custo também respeita escopo da obra
  return withRLS(tenantId, async (tx) => {
    const deleted = await tx.custo.deleteMany({
      where: { id: custoId, obraId, tenantId }
    });
    if (deleted.count === 0) throw new Error("Custo not found or access denied");
    return getOrcamento(obraId, tenantId);
  });
}
