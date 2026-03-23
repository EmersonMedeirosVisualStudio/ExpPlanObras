import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_VIEW);

    const [rows]: any = await db.query(
      `
      SELECT
        p.id_treinamento_participante AS id,
        m.nome_treinamento AS nomeTreinamento,
        p.tipo_participante AS tipoParticipante,
        COALESCE(f.nome_completo, tt.nome_completo) AS participanteNome,
        p.data_conclusao AS dataConclusao,
        p.validade_ate AS validadeAte,
        p.data_alerta_reciclagem AS dataAlertaReciclagem,
        CASE
          WHEN p.validade_ate IS NULL THEN 'SEM_VALIDADE'
          WHEN p.validade_ate < CURDATE() THEN 'VENCIDO'
          WHEN p.data_alerta_reciclagem <= CURDATE() THEN 'ALERTA'
          ELSE 'VIGENTE'
        END AS situacao
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      INNER JOIN sst_treinamentos_modelos m ON m.id_treinamento_modelo = t.id_treinamento_modelo
      LEFT JOIN funcionarios f ON f.id_funcionario = p.id_funcionario
      LEFT JOIN terceirizados_trabalhadores tt ON tt.id_terceirizado_trabalhador = p.id_terceirizado_trabalhador
      WHERE t.tenant_id = ?
      ORDER BY situacao DESC, p.validade_ate ASC
      `,
      [current.tenantId]
    );

    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}
