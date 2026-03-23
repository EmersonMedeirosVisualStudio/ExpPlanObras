import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_CEO_VIEW);

    const [[rows]]: any = await db.query(
      `SELECT
          COALESCE(SUM(valor_atualizado), 0) AS valorContratado,
          COALESCE(SUM(valor_executado), 0) AS valorExecutado,
          COALESCE(SUM(valor_pago), 0) AS valorPago
       FROM contratos
       WHERE tenant_id = ?
         AND status_contrato NOT IN ('RESCINDIDO', 'CANCELADO')`,
      [current.tenantId]
    );

    const valorContratado = Number(rows.valorContratado || 0);
    const valorExecutado = Number(rows.valorExecutado || 0);
    const valorPago = Number(rows.valorPago || 0);

    return ok({
      valorContratado,
      valorExecutado,
      valorPago,
      saldoContrato: valorContratado - valorPago,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

