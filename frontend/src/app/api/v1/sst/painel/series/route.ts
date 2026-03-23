import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { buildLocalFilter } from '@/lib/api/local-filter';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_PAINEL_VIEW);
    const local = buildLocalFilter(req.nextUrl.searchParams);
    const localTurma = buildLocalFilter(req.nextUrl.searchParams, 't');

    const [acidentes]: any = await db.query(
      `
      SELECT DATE_FORMAT(data_hora_ocorrencia, '%Y-%m') AS periodo, COUNT(*) AS total
      FROM sst_acidentes
      WHERE tenant_id = ?
        AND data_hora_ocorrencia >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        ${local.sql}
      GROUP BY DATE_FORMAT(data_hora_ocorrencia, '%Y-%m')
      ORDER BY periodo
      `,
      [current.tenantId, ...local.params]
    );

    const [ncs]: any = await db.query(
      `
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS periodo, COUNT(*) AS total
      FROM sst_nao_conformidades
      WHERE tenant_id = ?
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        ${local.sql}
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY periodo
      `,
      [current.tenantId, ...local.params]
    );

    const [treinamentosVencidos]: any = await db.query(
      `
      SELECT DATE_FORMAT(validade_ate, '%Y-%m') AS periodo, COUNT(*) AS total
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        ${localTurma.sql}
      GROUP BY DATE_FORMAT(validade_ate, '%Y-%m')
      ORDER BY periodo
      `,
      [current.tenantId, ...localTurma.params]
    );

    return ok({ acidentes, ncs, treinamentosVencidos });
  } catch (e) {
    return handleApiError(e);
  }
}

