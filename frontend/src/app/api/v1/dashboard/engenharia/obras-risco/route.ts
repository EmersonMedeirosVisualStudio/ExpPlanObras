import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

function buildOnlyFilter(ids: number[] | null, alias: string) {
  if (ids === null) return { sql: '', params: [] as number[] };
  if (!ids.length) return { sql: ' AND 1 = 0', params: [] as number[] };
  const c = inClause(ids);
  return { sql: ` AND ${alias} IN ${c.sql}`, params: c.params };
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const idUnidade = Number(req.nextUrl.searchParams.get('idUnidade') || 0);

    if (!scope.empresaTotal) {
      if (idObra && !scope.obras.includes(idObra)) return fail(403, 'Obra fora da abrangência');
      if (idUnidade && !scope.unidades.includes(idUnidade)) return fail(403, 'Unidade fora da abrangência');
    }

    const obrasSelecionadas = idObra ? [idObra] : scope.empresaTotal && !idUnidade ? null : scope.obras;
    const fObra = buildOnlyFilter(obrasSelecionadas, 'o.id_obra');

    try {
      const [rows]: any = await db.query(
        `
        SELECT
          o.id_obra AS idObra,
          CONCAT('Obra #', o.id_obra) AS nomeObra,
          COALESCE(o.status_obra, '-') AS statusObra,
          COALESCE(med.total, 0) AS medicoesPendentes,
          COALESCE(sol.total, 0) AS solicitacoesUrgentes,
          COALESCE(nc.total, 0) AS ncsCriticas,
          COALESCE(ac.total, 0) AS acidentes90d,
          COALESCE(ch.total, 0) AS checklistsAtrasados,
          (COALESCE(med.total, 0) * 2
           + COALESCE(sol.total, 0) * 2
           + COALESCE(nc.total, 0) * 4
           + COALESCE(ac.total, 0) * 5
           + COALESCE(ch.total, 0) * 2) AS scoreRisco
        FROM obras o
        INNER JOIN contratos c ON c.id_contrato = o.id_contrato
        LEFT JOIN (
          SELECT o2.id_obra, COUNT(DISTINCT m.id_medicao) AS total
          FROM contratos_medicoes m
          INNER JOIN contratos c2 ON c2.id_contrato = m.id_contrato
          INNER JOIN obras o2 ON o2.id_contrato = c2.id_contrato
          WHERE c2.tenant_id = ?
            AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
          GROUP BY o2.id_obra
        ) med ON med.id_obra = o.id_obra
        LEFT JOIN (
          SELECT s.id_obra_origem AS id_obra, COUNT(*) AS total
          FROM solicitacao_material s
          WHERE s.tenant_id = ?
            AND s.id_obra_origem IS NOT NULL
            AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
            AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
          GROUP BY s.id_obra_origem
        ) sol ON sol.id_obra = o.id_obra
        LEFT JOIN (
          SELECT nc.id_obra, COUNT(*) AS total
          FROM sst_nao_conformidades nc
          WHERE nc.tenant_id = ?
            AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
            AND nc.severidade IN ('ALTA','CRITICA')
          GROUP BY nc.id_obra
        ) nc ON nc.id_obra = o.id_obra
        LEFT JOIN (
          SELECT a.id_obra, COUNT(*) AS total
          FROM sst_acidentes a
          WHERE a.tenant_id = ?
            AND a.data_hora_ocorrencia >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
          GROUP BY a.id_obra
        ) ac ON ac.id_obra = o.id_obra
        LEFT JOIN (
          SELECT COALESCE(p.id_obra, 0) AS id_obra, COUNT(*) AS total
          FROM sst_checklists_programacoes p
          INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
          LEFT JOIN (
            SELECT
              e.tenant_id,
              e.id_modelo_checklist,
              e.tipo_local,
              COALESCE(e.id_obra, 0) AS id_obra_ref,
              COALESCE(e.id_unidade, 0) AS id_unidade_ref,
              MAX(CASE WHEN e.status_execucao = 'FINALIZADA' THEN e.data_referencia END) AS ultima_execucao
            FROM sst_checklists_execucoes e
            WHERE e.tenant_id = ?
            GROUP BY e.tenant_id, e.id_modelo_checklist, e.tipo_local, COALESCE(e.id_obra, 0), COALESCE(e.id_unidade, 0)
          ) u
            ON u.tenant_id = p.tenant_id
           AND u.id_modelo_checklist = p.id_modelo_checklist
           AND u.tipo_local = p.tipo_local
           AND u.id_obra_ref = COALESCE(p.id_obra, 0)
           AND u.id_unidade_ref = COALESCE(p.id_unidade, 0)
          WHERE p.tenant_id = ?
            AND (
              (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO' AND COALESCE(u.ultima_execucao, '1900-01-01') < CURDATE())
              OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL' AND COALESCE(u.ultima_execucao, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 14 DAY))
              OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL' AND COALESCE(u.ultima_execucao, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 60 DAY))
            )
          GROUP BY COALESCE(p.id_obra, 0)
        ) ch ON ch.id_obra = o.id_obra
        WHERE c.tenant_id = ?
          ${fObra.sql}
        ORDER BY scoreRisco DESC, o.id_obra DESC
        LIMIT 20
        `,
        [current.tenantId, current.tenantId, current.tenantId, current.tenantId, current.tenantId, current.tenantId, current.tenantId, ...fObra.params]
      );
      return ok(rows as any[]);
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}
