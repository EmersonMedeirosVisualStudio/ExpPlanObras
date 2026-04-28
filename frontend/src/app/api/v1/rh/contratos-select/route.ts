import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const [rows]: any = await db.query(
      `
      SELECT id_contrato AS id, numero_contrato AS numeroContrato
      FROM contratos
      WHERE tenant_id = ?
      ORDER BY numero_contrato ASC, id_contrato DESC
      `,
      [current.tenantId]
    );
    return ok((rows as any[]) || []);
  } catch (e) {
    return handleApiError(e);
  }
}
