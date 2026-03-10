import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Helper function to set tenant context
export async function setTenantContext(tx: any, tenantId: number) {
  // SQLite does not support RLS like PostgreSQL.
  // In development, we skip this step and rely on application logic.
  if (process.env.DATABASE_URL?.startsWith('file:')) {
    return;
  }
  // Using raw SQL to set the session variable for RLS
  // In a transaction, this applies to subsequent queries in the same transaction
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`;
}

export default prisma;
