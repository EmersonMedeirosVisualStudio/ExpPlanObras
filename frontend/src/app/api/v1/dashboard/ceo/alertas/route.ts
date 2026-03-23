import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_CEO_VIEW);

    const [contratos]: any = await db.query(
      `SELECT
          'CONTRATO_VENCENDO' AS tipo,
          CONCAT('Contrato vencendo: ', numero_contrato) AS titulo,
          CONCAT('Fim previsto em ', DATE_FORMAT(data_fim_previsto, '%d/%m/%Y')) AS subtitulo,
          id_contrato AS referenciaId,
          '/dashboard/contratos' AS rota
       FROM contratos
       WHERE tenant_id = ?
         AND data_fim_previsto IS NOT NULL
         AND data_fim_previsto BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       ORDER BY data_fim_previsto
       LIMIT 5`,
      [current.tenantId]
    );

    const [medicoes]: any = await db.query(
      `SELECT
          'MEDICAO_PENDENTE' AS tipo,
          CONCAT('Medição pendente do contrato ', c.numero_contrato) AS titulo,
          CONCAT('Status ', m.status_medicao) AS subtitulo,
          m.id_medicao AS referenciaId,
          '/dashboard/execucao/medicoes' AS rota
       FROM contratos_medicoes m
       INNER JOIN contratos c ON c.id_contrato = m.id_contrato
       WHERE c.tenant_id = ?
         AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
       ORDER BY m.id_medicao DESC
       LIMIT 5`,
      [current.tenantId]
    );

    const [suprimentos]: any = await db.query(
      `SELECT
          'SUPRIMENTO_URGENTE' AS tipo,
          CONCAT('Solicitação urgente #', id_solicitacao_material) AS titulo,
          CONCAT('Regime ', regime_urgencia, ' / status ', status_solicitacao) AS subtitulo,
          id_solicitacao_material AS referenciaId,
          '/dashboard/suprimentos/solicitacoes' AS rota
       FROM solicitacao_material
       WHERE tenant_id = ?
         AND regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
         AND status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
       ORDER BY created_at DESC
       LIMIT 5`,
      [current.tenantId]
    );

    const [sst]: any = await db.query(
      `SELECT
          'NC_CRITICA' AS tipo,
          CONCAT('NC crítica: ', titulo) AS titulo,
          CONCAT('Severidade ', severidade, ' / prazo ', COALESCE(DATE_FORMAT(prazo_correcao, '%d/%m/%Y'), '-')) AS subtitulo,
          id_nc AS referenciaId,
          '/dashboard/sst/nao-conformidades' AS rota
       FROM sst_nao_conformidades
       WHERE tenant_id = ?
         AND status_nc IN ('ABERTA', 'EM_TRATAMENTO', 'AGUARDANDO_VALIDACAO')
         AND severidade IN ('ALTA', 'CRITICA')
       ORDER BY created_at DESC
       LIMIT 5`,
      [current.tenantId]
    );

    return ok([...(contratos as any[]), ...(medicoes as any[]), ...(suprimentos as any[]), ...(sst as any[])].slice(0, 20));
  } catch (e) {
    return handleApiError(e);
  }
}

