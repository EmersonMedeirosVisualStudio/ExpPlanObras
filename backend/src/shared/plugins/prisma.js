import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['warn', 'error'],
});
export async function setTenantContext(tx, tenantId) {
    if (process.env.DATABASE_URL?.startsWith('file:'))
        return;
    await tx.$executeRaw `SELECT set_config('app.tenant_id', ${String(tenantId)}, TRUE)`;
}
export async function withRLS(tenantId, callback) {
    return prisma.$transaction(async (tx) => {
        await setTenantContext(tx, tenantId);
        return callback(tx);
    });
}
export default prisma;
