import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_FINALIZAR);
    const { id } = await params;
    const idTurma = Number(id);
    const body = await req.json();

    const [rows]: any = await conn.query(
      `
      SELECT
        t.*,
        m.validade_meses,
        m.antecedencia_alerta_dias,
        m.exige_assinatura_instrutor,
        m.exige_aprovacao,
        m.exige_assinatura_participante
      FROM sst_treinamentos_turmas t
      INNER JOIN sst_treinamentos_modelos m ON m.id_treinamento_modelo = t.id_treinamento_modelo
      WHERE t.id_treinamento_turma = ? AND t.tenant_id = ?
      `,
      [idTurma, current.tenantId]
    );
    if (!rows.length) return fail(404, 'Turma não encontrada');
    const turma = rows[0];
    if (['FINALIZADA', 'CANCELADA'].includes(String(turma.status_turma || ''))) return fail(422, 'Turma não pode ser finalizada');

    const tipoAssinatura = String(body?.tipoAssinatura || '').toUpperCase();
    if (!tipoAssinatura) return fail(422, 'tipoAssinatura obrigatório');

    if (Number(turma.exige_assinatura_instrutor) === 1) {
      if (String(turma.tipo_instrutor || '').toUpperCase() === 'FUNCIONARIO') {
        if (!current.idFuncionario) return fail(403, 'Usuário sem vínculo com funcionário');
        if (Number(current.idFuncionario) !== Number(turma.id_instrutor_funcionario)) return fail(403, 'Somente o instrutor pode finalizar');
      }
      if (tipoAssinatura === 'PIN') {
        if (!body.pin) return fail(422, 'PIN obrigatório');
        if (!current.idFuncionario) return fail(403, 'Usuário sem vínculo com funcionário');
        const [pinRows]: any = await conn.query(
          `
          SELECT pin_hash
          FROM funcionarios_assinatura_habilitacoes
          WHERE tenant_id = ? AND id_funcionario = ? AND tipo_assinatura = 'PIN' AND ativo = 1
          `,
          [current.tenantId, current.idFuncionario]
        );
        if (!pinRows.length) return fail(422, 'Instrutor sem PIN habilitado');
        const okPin = await bcrypt.compare(String(body.pin), pinRows[0].pin_hash);
        if (!okPin) return fail(422, 'PIN inválido');
      }
    }

    await conn.beginTransaction();

    let idAssinaturaInstrutor: number | null = null;
    if (Number(turma.exige_assinatura_instrutor) === 1) {
      const [sig]: any = await conn.query(
        `
        INSERT INTO assinaturas_registros
        (tenant_id, entidade_tipo, entidade_id, tipo_signatario, id_funcionario_signatario, id_usuario_captura,
         tipo_assinatura, ip_origem, user_agent, latitude, longitude, arquivo_assinatura_url, observacao)
        VALUES (?, 'TREINAMENTO_TURMA', ?, 'FUNCIONARIO', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          current.tenantId,
          idTurma,
          current.idFuncionario || null,
          current.id,
          tipoAssinatura,
          req.headers.get('x-forwarded-for') || null,
          req.headers.get('user-agent') || null,
          body.latitude || null,
          body.longitude || null,
          body.arquivoAssinaturaUrl || null,
          body.observacao || null,
        ]
      );
      idAssinaturaInstrutor = Number(sig.insertId);

      await conn.query(`UPDATE sst_treinamentos_turmas SET id_assinatura_instrutor = ? WHERE id_treinamento_turma = ? AND tenant_id = ?`, [
        idAssinaturaInstrutor,
        idTurma,
        current.tenantId,
      ]);
    }

    const validadeMeses = turma.validade_meses ? Number(turma.validade_meses) : null;
    const antecedenciaAlertaDias = turma.antecedencia_alerta_dias ? Number(turma.antecedencia_alerta_dias) : 30;
    const exigeAprovacao = Number(turma.exige_aprovacao) === 1;

    if (validadeMeses && validadeMeses > 0) {
      await conn.query(
        `
        UPDATE sst_treinamentos_participantes p
        SET
          data_conclusao = COALESCE(p.data_conclusao, DATE(turma.data_inicio)),
          validade_ate = CASE
            WHEN ${exigeAprovacao ? "p.status_participacao = 'APROVADO'" : "p.status_participacao IN ('PRESENTE','APROVADO')"} THEN DATE_ADD(DATE(turma.data_inicio), INTERVAL ? MONTH)
            ELSE NULL
          END,
          data_alerta_reciclagem = CASE
            WHEN ${exigeAprovacao ? "p.status_participacao = 'APROVADO'" : "p.status_participacao IN ('PRESENTE','APROVADO')"} THEN DATE_SUB(DATE_ADD(DATE(turma.data_inicio), INTERVAL ? MONTH), INTERVAL ? DAY)
            ELSE NULL
          END,
          codigo_certificado = CASE
            WHEN ${exigeAprovacao ? "p.status_participacao = 'APROVADO'" : "p.status_participacao IN ('PRESENTE','APROVADO')"} THEN CONCAT('TR-', turma.id_treinamento_turma, '-', p.id_treinamento_participante)
            ELSE NULL
          END,
          certificado_emitido_em = CASE
            WHEN ${exigeAprovacao ? "p.status_participacao = 'APROVADO'" : "p.status_participacao IN ('PRESENTE','APROVADO')"} THEN NOW()
            ELSE NULL
          END
        FROM sst_treinamentos_turmas turma
        WHERE p.id_treinamento_turma = turma.id_treinamento_turma
          AND turma.id_treinamento_turma = ?
          AND turma.tenant_id = ?
        `,
        [validadeMeses, validadeMeses, antecedenciaAlertaDias, idTurma, current.tenantId]
      );
    }

    await conn.query(
      `
      UPDATE sst_treinamentos_turmas
      SET status_turma = 'FINALIZADA',
          data_fim = COALESCE(data_fim, NOW()),
          updated_at = NOW()
      WHERE id_treinamento_turma = ? AND tenant_id = ?
      `,
      [idTurma, current.tenantId]
    );

    await conn.commit();
    return ok({ id: idTurma, statusTurma: 'FINALIZADA', idAssinaturaInstrutor });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
