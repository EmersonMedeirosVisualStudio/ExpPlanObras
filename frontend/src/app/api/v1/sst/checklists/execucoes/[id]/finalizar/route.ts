import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ApiError, ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_FINALIZAR);
    const { id } = await params;
    const idExecucao = Number(id);
    const body = await req.json();
    if (!Number.isFinite(idExecucao)) throw new ApiError(400, 'ID inválido');

    const [execRows]: any = await conn.query(
      `
      SELECT
        e.*, sp.id_funcionario
      FROM sst_checklists_execucoes e
      INNER JOIN sst_profissionais sp ON sp.id_sst_profissional = e.id_sst_profissional_executor
      WHERE e.tenant_id = ? AND e.id_execucao_checklist = ?
      `,
      [current.tenantId, idExecucao]
    );
    if (!execRows.length) return fail(404, 'Execução não encontrada');

    const exec = execRows[0];
    if (exec.status_execucao !== 'EM_PREENCHIMENTO') return fail(422, 'Execução já finalizada');

    const [pendencias]: any = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_checklists_modelos_itens mi
      LEFT JOIN sst_checklists_execucoes_itens ei
        ON ei.id_modelo_item = mi.id_modelo_item
       AND ei.id_execucao_checklist = ?
      WHERE mi.id_modelo_checklist = ?
        AND mi.ativo = 1
        AND mi.obrigatorio = 1
        AND ei.id_execucao_item IS NULL
      `,
      [idExecucao, exec.id_modelo_checklist]
    );
    if (pendencias[0].total > 0) return fail(422, 'Existem itens obrigatórios sem resposta');

    const [itensNc]: any = await conn.query(
      `
      SELECT ei.id_execucao_item,
             mi.descricao_item,
             e.tipo_local,
             e.id_obra,
             e.id_unidade,
             e.data_referencia,
             e.id_sst_profissional_executor
      FROM sst_checklists_execucoes_itens ei
      INNER JOIN sst_checklists_execucoes e ON e.id_execucao_checklist = ei.id_execucao_checklist
      INNER JOIN sst_checklists_modelos_itens mi ON mi.id_modelo_item = ei.id_modelo_item
      WHERE ei.id_execucao_checklist = ?
        AND ei.gera_nc = 1
      `,
      [idExecucao]
    );

    for (const item of itensNc) {
      await conn.query(
        `
        INSERT IGNORE INTO sst_nao_conformidades
        (tenant_id, tipo_local, id_obra, id_unidade, origem_tipo,
         id_execucao_checklist_origem, id_execucao_item_origem,
         titulo, descricao, severidade, status_nc, data_identificacao,
         id_sst_profissional_abertura, id_usuario_abertura)
        VALUES (?, ?, ?, ?, 'CHECKLIST_SST', ?, ?, ?, ?, 'MEDIA', 'ABERTA', ?, ?, ?)
        `,
        [
          current.tenantId,
          item.tipo_local,
          item.id_obra || null,
          item.id_unidade || null,
          idExecucao,
          item.id_execucao_item,
          `NC automática - Checklist SST`,
          item.descricao_item,
          item.data_referencia,
          item.id_sst_profissional_executor,
          current.id,
        ]
      );
    }

    let idAssinatura: number | null = null;

    if (body.tipoAssinatura) {
      if (body.tipoAssinatura === 'PIN') {
        if (!body.pin) return fail(422, 'PIN obrigatório');

        const [pinRows]: any = await conn.query(
          `
          SELECT pin_hash
          FROM funcionarios_assinatura_habilitacoes
          WHERE tenant_id = ? AND id_funcionario = ? AND tipo_assinatura = 'PIN' AND ativo = 1
          `,
          [current.tenantId, exec.id_funcionario]
        );
        if (!pinRows.length) return fail(422, 'Executor sem PIN habilitado');

        const okPin = await bcrypt.compare(body.pin, pinRows[0].pin_hash);
        if (!okPin) return fail(422, 'PIN inválido');
      }

      const [ass]: any = await conn.query(
        `
        INSERT INTO assinaturas_registros
        (tenant_id, entidade_tipo, entidade_id, tipo_signatario, id_funcionario_signatario,
         id_usuario_captura, tipo_assinatura, ip_origem, user_agent, latitude, longitude, arquivo_assinatura_url, observacao)
        VALUES (?, 'CHECKLIST_SST', ?, 'FUNCIONARIO', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          current.tenantId,
          idExecucao,
          exec.id_funcionario,
          current.id,
          body.tipoAssinatura,
          req.headers.get('x-forwarded-for') || null,
          req.headers.get('user-agent') || null,
          body.latitude || null,
          body.longitude || null,
          body.arquivoAssinaturaUrl || null,
          body.observacaoAssinatura || null,
        ]
      );
      idAssinatura = ass.insertId;
    }

    await conn.query(
      `
      UPDATE sst_checklists_execucoes
      SET status_execucao = 'FINALIZADA',
          id_assinatura_executor = ?,
          updated_at = NOW()
      WHERE id_execucao_checklist = ? AND tenant_id = ?
      `,
      [idAssinatura, idExecucao, current.tenantId]
    );

    return ok({ id: idExecucao, status: 'FINALIZADA', idAssinatura });
  } catch (e) {
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
