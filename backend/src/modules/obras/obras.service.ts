import prisma, { setTenantContext } from "../../plugins/prisma.js";
import { CreateObraInput, UpdateObraInput } from "./obras.schema.js";

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

export async function getObras(tenantId: number) {
  return withRLS(tenantId, async (tx) => {
    return tx.obra.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        // Even with RLS, it's safer to include tenantId in the query
        tenantId: tenantId
      }
    });
  });
}

export async function getObraById(id: number, tenantId: number) {
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

export async function updateObra(id: number, input: UpdateObraInput, tenantId: number) {
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
    
    return getObraById(id, tenantId);
  });
}

export async function deleteObra(id: number, tenantId: number) {
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
