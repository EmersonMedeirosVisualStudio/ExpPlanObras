import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_VIEW);
    const [rows]: any = await db.query(
      `
      SELECT
        id_treinamento_modelo id,
        codigo,
        nome_treinamento nomeTreinamento,
        tipo_treinamento tipoTreinamento,
        norma_referencia normaReferencia,
        carga_horaria_horas cargaHorariaHoras,
        validade_meses validadeMeses,
        antecedencia_alerta_dias antecedenciaAlertaDias,
        exige_assinatura_participante exigeAssinaturaParticipante,
        exige_assinatura_instrutor exigeAssinaturaInstrutor,
        exige_aprovacao exigeAprovacao,
        ativo
      FROM sst_treinamentos_modelos
      WHERE tenant_id = ?
      ORDER BY nome_treinamento
      `,
      [current.tenantId]
    );
    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_CRUD);
    const body = await req.json();

    if (!body.nomeTreinamento || !body.tipoTreinamento) return fail(422, 'Nome e tipo são obrigatórios');

    const [result]: any = await db.query(
      `
      INSERT INTO sst_treinamentos_modelos
      (tenant_id, codigo, nome_treinamento, tipo_treinamento, norma_referencia, carga_horaria_horas, validade_meses,
       antecedencia_alerta_dias, exige_assinatura_participante, exige_assinatura_instrutor, exige_aprovacao, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        current.tenantId,
        body.codigo || null,
        body.nomeTreinamento,
        body.tipoTreinamento,
        body.normaReferencia || null,
        body.cargaHorariaHoras || 0,
        body.validadeMeses || null,
        body.antecedenciaAlertaDias ?? 30,
        body.exigeAssinaturaParticipante ? 1 : 0,
        body.exigeAssinaturaInstrutor ? 1 : 0,
        body.exigeAprovacao ? 1 : 0,
      ]
    );

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}

