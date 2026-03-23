import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const idPresenca = Number(params.id);
    const body = await req.json();
    const acao = body.acao;

    if (!acao) return fail(422, 'Ação obrigatória');

    if (acao === 'FECHAR') {
      const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_FECHAR);
      const [heads]: any = await db.query(`SELECT * FROM presencas_cabecalho WHERE id_presenca = ? AND tenant_id = ?`, [
        idPresenca,
        current.tenantId,
      ]);
      if (!heads.length) return fail(404, 'Ficha não encontrada');
      const head = heads[0];
      if (Number(head.id_supervisor_lancamento) !== Number(current.idFuncionario)) return fail(403, 'Somente o supervisor responsável pode fechar');

      const [pendencias]: any = await db.query(
        `
        SELECT COUNT(*) AS total
        FROM presencas_itens
        WHERE id_presenca = ?
          AND (
            situacao_presenca IS NULL
            OR (
              requer_assinatura_funcionario = 1
              AND assinado_funcionario = 0
              AND (motivo_sem_assinatura IS NULL OR motivo_sem_assinatura = '')
            )
          )
        `,
        [idPresenca]
      );
      if (pendencias[0].total > 0) return fail(422, 'Existem itens pendentes de assinatura ou justificativa');

      await db.query(
        `UPDATE presencas_cabecalho SET status_presenca = 'FECHADA', data_fechamento = NOW(), id_usuario_fechamento = ? WHERE id_presenca = ? AND tenant_id = ?`,
        [current.id, idPresenca, current.tenantId]
      );
      return ok({ id: idPresenca, status: 'FECHADA' });
    }

    if (acao === 'ENVIAR_RH') {
      const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_ENVIAR);
      await db.query(
        `UPDATE presencas_cabecalho SET status_presenca = 'ENVIADA_RH', data_envio_rh = NOW(), id_usuario_envio_rh = ? WHERE id_presenca = ? AND tenant_id = ? AND status_presenca = 'FECHADA'`,
        [current.id, idPresenca, current.tenantId]
      );
      return ok({ id: idPresenca, status: 'ENVIADA_RH' });
    }

    if (acao === 'RECEBER_RH') {
      const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_RECEBER);
      await db.query(
        `UPDATE presencas_cabecalho SET status_presenca = 'RECEBIDA_RH', data_recebimento_rh = NOW(), id_usuario_recebimento_rh = ?, motivo_rejeicao_rh = NULL WHERE id_presenca = ? AND tenant_id = ? AND status_presenca = 'ENVIADA_RH'`,
        [current.id, idPresenca, current.tenantId]
      );
      return ok({ id: idPresenca, status: 'RECEBIDA_RH' });
    }

    if (acao === 'REJEITAR_RH') {
      const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_RECEBER);
      if (!body.motivo?.trim()) return fail(422, 'Motivo obrigatório');

      await db.query(
        `UPDATE presencas_cabecalho SET status_presenca = 'REJEITADA_RH', motivo_rejeicao_rh = ? WHERE id_presenca = ? AND tenant_id = ? AND status_presenca = 'ENVIADA_RH'`,
        [body.motivo.trim(), idPresenca, current.tenantId]
      );
      return ok({ id: idPresenca, status: 'REJEITADA_RH' });
    }

    return fail(422, 'Ação inválida');
  } catch (e) {
    return handleApiError(e);
  }
}
