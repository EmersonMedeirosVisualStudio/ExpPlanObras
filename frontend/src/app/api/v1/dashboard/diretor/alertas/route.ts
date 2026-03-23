import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_DIRETOR_VIEW);
    const scope = await getDashboardScope(current);

    if (!scope.empresaTotal && !scope.diretorias.length) return ok([]);

    const dir = inClause(scope.diretorias);
    const filtroDiretoria = scope.empresaTotal ? '' : ` AND c.id_setor_diretoria IN ${dir.sql}`;
    const params = scope.empresaTotal ? [current.tenantId] : [current.tenantId, ...dir.params];

    const [contratos]: any = await db.query(
      `SELECT
          'CONTRATO_VENCENDO' AS tipo,
          CONCAT('Contrato vencendo: ', c.numero_contrato) AS titulo,
          CONCAT('Fim previsto em ', DATE_FORMAT(c.data_fim_previsto, '%d/%m/%Y')) AS subtitulo,
          c.id_contrato AS referenciaId,
          '/dashboard/contratos' AS rota
       FROM contratos c
       WHERE c.tenant_id = ?
         AND c.data_fim_previsto BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
         ${filtroDiretoria}
       ORDER BY c.data_fim_previsto
       LIMIT 5`,
      params
    );

    const [sst]: any = await db.query(
      `SELECT
          'NC_CRITICA' AS tipo,
          CONCAT('NC crítica: ', nc.titulo) AS titulo,
          CONCAT('Severidade ', nc.severidade, ' / prazo ', COALESCE(DATE_FORMAT(nc.prazo_correcao, '%d/%m/%Y'), '-')) AS subtitulo,
          nc.id_nc AS referenciaId,
          '/dashboard/sst/nao-conformidades' AS rota
       FROM sst_nao_conformidades nc
       LEFT JOIN contratos c ON c.id_contrato = (
         SELECT o.id_contrato FROM obras o WHERE o.id_obra = nc.id_obra LIMIT 1
       )
       WHERE nc.tenant_id = ?
         AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
         AND nc.severidade IN ('ALTA','CRITICA')
         ${scope.empresaTotal ? '' : ` AND c.id_setor_diretoria IN ${dir.sql}`}
       ORDER BY nc.created_at DESC
       LIMIT 5`,
      scope.empresaTotal ? [current.tenantId] : [current.tenantId, ...dir.params]
    );

    return ok([...(contratos as any[]), ...(sst as any[])]);
  } catch (e) {
    return handleApiError(e);
  }
}
