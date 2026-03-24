import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW);
    const scope = await getDashboardScope(current);

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const idUnidade = Number(req.nextUrl.searchParams.get('idUnidade') || 0);
    const _idAlmoxarifado = Number(req.nextUrl.searchParams.get('idAlmoxarifado') || 0);

    if (!scope.empresaTotal) {
      if (idObra && !scope.obras.includes(idObra)) return fail(403, 'Obra fora da abrangência');
      if (idUnidade && !scope.unidades.includes(idUnidade)) return fail(403, 'Unidade fora da abrangência');
    }

    try {
      const [rows]: any = await db.query(
        `
        SELECT
          p.id_pedido AS idPedido,
          COALESCE(p.numero_pedido, CONCAT('#', p.id_pedido)) AS numeroPedido,
          COALESCE(f.nome, p.fornecedor_nome, '-') AS fornecedorNome,
          COALESCE(p.status, '-') AS status,
          p.data_prevista_entrega AS dataPrevistaEntrega,
          COALESCE(p.valor_total, 0) AS valorTotal,
          CASE
            WHEN p.data_prevista_entrega IS NULL THEN 0
            WHEN p.data_prevista_entrega >= CURDATE() THEN 0
            ELSE DATEDIFF(CURDATE(), p.data_prevista_entrega)
          END AS atrasoDias
        FROM compras_pedidos p
        LEFT JOIN fornecedores f ON f.id_fornecedor = p.id_fornecedor
        WHERE p.tenant_id = ?
          AND COALESCE(p.status, '') NOT IN ('RECEBIDO', 'CANCELADO', 'CONCLUIDO')
        ORDER BY atrasoDias DESC, p.id_pedido DESC
        LIMIT 50
        `,
        [current.tenantId]
      );
      return ok(rows as any[]);
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

