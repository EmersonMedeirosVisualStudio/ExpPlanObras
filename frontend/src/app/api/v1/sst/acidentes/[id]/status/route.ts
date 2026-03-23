import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const idAcidente = Number(params.id);
    const body = await req.json();

    if (!body.acao) return fail(422, 'Ação obrigatória');

    if (body.acao === 'ENVIAR_VALIDACAO') {
      const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_INVESTIGAR);

      const [rows]: any = await db.query(
        `
        SELECT
          a.id_acidente idAcidente,
          a.cat_aplicavel catAplicavel,
          a.cat_registrada catRegistrada,
          a.justificativa_sem_cat justificativaSemCat,
          i.id_investigacao idInvestigacao
        FROM sst_acidentes a
        LEFT JOIN sst_acidentes_investigacoes i ON i.id_acidente = a.id_acidente
        WHERE a.id_acidente = ? AND a.tenant_id = ?
        `,
        [idAcidente, current.tenantId]
      );
      if (!rows.length) return fail(404, 'Acidente não encontrado');
      if (!rows[0].idInvestigacao) return fail(422, 'Investigação não preenchida');

      const catAplicavel = Number(rows[0].catAplicavel) === 1;
      const catRegistrada = Number(rows[0].catRegistrada) === 1;
      const justificativaNova = String(body.justificativaSemCat || '').trim();
      const justificativaAtual = String(rows[0].justificativaSemCat || '').trim();

      if (catAplicavel && !catRegistrada && !justificativaNova && !justificativaAtual) {
        return fail(422, 'CAT pendente. Informe justificativa formal ou registre a CAT.');
      }

      await db.query(
        `
        UPDATE sst_acidentes
        SET status_acidente = 'AGUARDANDO_VALIDACAO',
            data_conclusao_investigacao = COALESCE(data_conclusao_investigacao, NOW()),
            justificativa_sem_cat = COALESCE(?, justificativa_sem_cat)
        WHERE id_acidente = ? AND tenant_id = ?
        `,
        [justificativaNova || null, idAcidente, current.tenantId]
      );

      return ok({ id: idAcidente, statusAcidente: 'AGUARDANDO_VALIDACAO' });
    }

    if (body.acao === 'VALIDAR_CONCLUSAO') {
      const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_VALIDAR);
      await db.query(
        `
        UPDATE sst_acidentes
        SET status_acidente = 'CONCLUIDO',
            data_validacao = NOW(),
            id_usuario_validacao = ?,
            parecer_validacao = ?
        WHERE id_acidente = ? AND tenant_id = ?
        `,
        [current.id, body.parecerValidacao || null, idAcidente, current.tenantId]
      );

      return ok({ id: idAcidente, statusAcidente: 'CONCLUIDO' });
    }

    if (body.acao === 'REABRIR') {
      const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_VALIDAR);

      await db.query(
        `
        UPDATE sst_acidentes
        SET status_acidente = 'EM_INVESTIGACAO',
            parecer_validacao = ?
        WHERE id_acidente = ? AND tenant_id = ?
        `,
        [body.parecerValidacao || 'Retornado para complementação', idAcidente, current.tenantId]
      );

      return ok({ id: idAcidente, statusAcidente: 'EM_INVESTIGACAO' });
    }

    if (body.acao === 'CANCELAR') {
      const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_ENCERRAR);
      await db.query(
        `
        UPDATE sst_acidentes
        SET status_acidente = 'CANCELADO',
            observacao = CONCAT(COALESCE(observacao, ''), '\nCancelamento: ', ?)
        WHERE id_acidente = ? AND tenant_id = ?
        `,
        [body.motivo || 'Sem motivo informado', idAcidente, current.tenantId]
      );
      return ok({ id: idAcidente, statusAcidente: 'CANCELADO' });
    }

    return fail(422, 'Ação inválida');
  } catch (e) {
    return handleApiError(e);
  }
}
