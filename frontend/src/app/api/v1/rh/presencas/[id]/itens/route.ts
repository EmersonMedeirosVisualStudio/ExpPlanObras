import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_CRUD);
    const body = await req.json();
    const idPresenca = Number(params.id);

    if (!current.idFuncionario) return fail(403, 'Usuário sem vínculo com funcionário');
    if (!body.idFuncionario || !body.situacaoPresenca) return fail(422, 'Funcionário e situação são obrigatórios');

    const [headRows]: any = await db.query(`SELECT * FROM presencas_cabecalho WHERE id_presenca = ? AND tenant_id = ?`, [
      idPresenca,
      current.tenantId,
    ]);
    if (!headRows.length) return fail(404, 'Ficha não encontrada');

    const head = headRows[0];
    if (!['EM_PREENCHIMENTO', 'REJEITADA_RH'].includes(head.status_presenca)) {
      return fail(422, 'Ficha não pode mais ser alterada');
    }
    if (Number(head.id_supervisor_lancamento) !== Number(current.idFuncionario)) {
      return fail(403, 'Somente o supervisor responsável pode lançar esta ficha');
    }

    const [valRows]: any = await db.query(
      `
      SELECT f.id_funcionario
      FROM funcionarios f
      INNER JOIN funcionarios_supervisao fs ON fs.id_funcionario = f.id_funcionario AND fs.atual = 1
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.id_funcionario = ?
        AND f.tenant_id = ?
        AND fs.id_supervisor_funcionario = ?
        AND (
          ( ? = 'OBRA' AND fl.tipo_lotacao = 'OBRA' AND fl.id_obra = ? )
          OR
          ( ? = 'UNIDADE' AND fl.tipo_lotacao = 'UNIDADE' AND fl.id_unidade = ? )
        )
      `,
      [
        body.idFuncionario,
        current.tenantId,
        current.idFuncionario,
        head.tipo_local,
        head.id_obra || 0,
        head.tipo_local,
        head.id_unidade || 0,
      ]
    );
    if (!valRows.length) return fail(422, 'Funcionário não pertence à equipe/local do supervisor');

    const [exists]: any = await db.query(`SELECT id_presenca_item FROM presencas_itens WHERE id_presenca = ? AND id_funcionario = ?`, [
      idPresenca,
      body.idFuncionario,
    ]);

    if (exists.length) {
      await db.query(
        `
        UPDATE presencas_itens
        SET situacao_presenca = ?, hora_entrada = ?, hora_saida = ?, minutos_atraso = ?, minutos_hora_extra = ?,
            id_tarefa_planejamento = ?, id_subitem_orcamentario = ?, descricao_tarefa_dia = ?,
            requer_assinatura_funcionario = ?, motivo_sem_assinatura = ?, observacao = ?,
            assinado_funcionario = CASE WHEN assinado_funcionario = 1 THEN 1 ELSE 0 END
        WHERE id_presenca_item = ?
        `,
        [
          body.situacaoPresenca,
          body.horaEntrada || null,
          body.horaSaida || null,
          body.minutosAtraso || 0,
          body.minutosHoraExtra || 0,
          body.idTarefaPlanejamento || null,
          body.idSubitemOrcamentario || null,
          body.descricaoTarefaDia || null,
          body.requerAssinaturaFuncionario ? 1 : 0,
          body.motivoSemAssinatura || null,
          body.observacao || null,
          exists[0].id_presenca_item,
        ]
      );
      return ok({ id: exists[0].id_presenca_item });
    }

    const [result]: any = await db.query(
      `
      INSERT INTO presencas_itens
      (id_presenca, id_funcionario, situacao_presenca, hora_entrada, hora_saida, minutos_atraso, minutos_hora_extra,
       id_tarefa_planejamento, id_subitem_orcamentario, descricao_tarefa_dia,
       requer_assinatura_funcionario, motivo_sem_assinatura, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        idPresenca,
        body.idFuncionario,
        body.situacaoPresenca,
        body.horaEntrada || null,
        body.horaSaida || null,
        body.minutosAtraso || 0,
        body.minutosHoraExtra || 0,
        body.idTarefaPlanejamento || null,
        body.idSubitemOrcamentario || null,
        body.descricaoTarefaDia || null,
        body.requerAssinaturaFuncionario ? 1 : 0,
        body.motivoSemAssinatura || null,
        body.observacao || null,
      ]
    );

    return ok({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}
