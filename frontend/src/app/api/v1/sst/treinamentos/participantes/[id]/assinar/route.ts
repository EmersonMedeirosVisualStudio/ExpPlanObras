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
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_ASSINAR);
    const { id } = await params;
    const idParticipante = Number(id);
    const body = await req.json();

    const tipoAssinatura = String(body?.tipoAssinatura || '').toUpperCase();
    if (!tipoAssinatura) return fail(422, 'tipoAssinatura obrigatório');

    const [rows]: any = await conn.query(
      `
      SELECT
        p.*,
        t.tenant_id,
        t.status_turma
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      WHERE p.id_treinamento_participante = ?
      `,
      [idParticipante]
    );
    if (!rows.length) return fail(404, 'Participante não encontrado');

    const p = rows[0];
    if (Number(p.tenant_id) !== Number(current.tenantId)) return fail(403, 'Acesso negado');
    if (!['EM_ELABORACAO', 'EM_EXECUCAO'].includes(String(p.status_turma || ''))) return fail(422, 'Turma não aceita assinatura');
    if (!p.assinatura_obrigatoria) return fail(422, 'Assinatura não obrigatória');

    if (tipoAssinatura === 'PIN') {
      if (!body.pin) return fail(422, 'PIN obrigatório');

      if (String(p.tipo_participante || '').toUpperCase() === 'FUNCIONARIO') {
        const [pinRows]: any = await conn.query(
          `
          SELECT pin_hash
          FROM funcionarios_assinatura_habilitacoes
          WHERE tenant_id = ? AND id_funcionario = ? AND tipo_assinatura = 'PIN' AND ativo = 1
          `,
          [current.tenantId, p.id_funcionario]
        );
        if (!pinRows.length) return fail(422, 'Funcionário sem PIN habilitado');
        const okPin = await bcrypt.compare(String(body.pin), pinRows[0].pin_hash);
        if (!okPin) return fail(422, 'PIN inválido');
      } else {
        const [pinRows]: any = await conn.query(
          `
          SELECT pin_hash
          FROM terceirizados_assinatura_habilitacoes
          WHERE tenant_id = ? AND id_terceirizado_trabalhador = ? AND tipo_assinatura = 'PIN' AND ativo = 1
          `,
          [current.tenantId, p.id_terceirizado_trabalhador]
        );
        if (!pinRows.length) return fail(422, 'Terceirizado sem PIN habilitado');
        const okPin = await bcrypt.compare(String(body.pin), pinRows[0].pin_hash);
        if (!okPin) return fail(422, 'PIN inválido');
      }
    }

    await conn.beginTransaction();

    const tipoSignatario = String(p.tipo_participante || '').toUpperCase();

    const [result]: any = await conn.query(
      `
      INSERT INTO assinaturas_registros
      (tenant_id, entidade_tipo, entidade_id, tipo_signatario, id_funcionario_signatario, id_terceirizado_trabalhador, id_usuario_captura,
       tipo_assinatura, ip_origem, user_agent, latitude, longitude, arquivo_assinatura_url, observacao)
      VALUES (?, 'TREINAMENTO_PARTICIPANTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        current.tenantId,
        idParticipante,
        tipoSignatario,
        tipoSignatario === 'FUNCIONARIO' ? p.id_funcionario : null,
        tipoSignatario === 'TERCEIRIZADO' ? p.id_terceirizado_trabalhador : null,
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

    await conn.query(
      `
      UPDATE sst_treinamentos_participantes
      SET id_assinatura_participante = ?,
          status_participacao = CASE WHEN status_participacao = 'INSCRITO' THEN 'PRESENTE' ELSE status_participacao END
      WHERE id_treinamento_participante = ?
      `,
      [result.insertId, idParticipante]
    );

    await conn.commit();
    return ok({ idAssinatura: result.insertId });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
