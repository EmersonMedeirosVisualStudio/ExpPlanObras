import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['warn', 'error'],
})

export type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export async function setTenantContext(tx: PrismaTx, tenantId: number): Promise<void> {
  if (process.env.DATABASE_URL?.startsWith('file:')) return
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${String(tenantId)}, TRUE)`
}

export async function withRLS<T>(
  tenantId: number,
  callback: (tx: PrismaTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setTenantContext(tx, tenantId)
    return callback(tx)
  })
}

export default prisma
