import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_ASSINATURAS_EXECUTAR);
    const idItem = Number(params.id);
    const body = await req.json();

    if (!body.idFuncionarioSignatario || !body.tipoAssinatura) {
      return fail(422, 'Funcionário signatário e tipo de assinatura são obrigatórios');
    }

    await conn.beginTransaction();

    const [rows]: any = await conn.query(
      `
      SELECT pi.id_presenca_item, pi.id_funcionario, pi.requer_assinatura_funcionario, pi.assinado_funcionario,
             pc.tenant_id, pc.status_presenca
      FROM presencas_itens pi
      INNER JOIN presencas_cabecalho pc ON pc.id_presenca = pi.id_presenca
      WHERE pi.id_presenca_item = ?
      `,
      [idItem]
    );
    if (!rows.length) return fail(404, 'Item não encontrado');

    const item = rows[0];
    if (item.tenant_id !== current.tenantId) return fail(403, 'Acesso negado');
    if (Number(item.id_funcionario) !== Number(body.idFuncionarioSignatario)) {
      return fail(422, 'Assinatura deve ser do próprio funcionário do item');
    }
    if (!item.requer_assinatura_funcionario) return fail(422, 'Este item não requer assinatura');
    if (item.status_presenca !== 'EM_PREENCHIMENTO' && item.status_presenca !== 'REJEITADA_RH') {
      return fail(422, 'Ficha não aceita assinatura neste status');
    }

    if (body.tipoAssinatura === 'PIN') {
      if (!body.pin) return fail(422, 'PIN obrigatório');

      const [pinRows]: any = await conn.query(
        `
        SELECT pin_hash
        FROM funcionarios_assinatura_habilitacoes
        WHERE tenant_id = ? AND id_funcionario = ? AND tipo_assinatura = 'PIN' AND ativo = 1
        `,
        [current.tenantId, body.idFuncionarioSignatario]
      );
      if (!pinRows.length) return fail(422, 'Funcionário sem PIN habilitado');

      const okPin = await bcrypt.compare(body.pin, pinRows[0].pin_hash);
      if (!okPin) return fail(422, 'PIN inválido');
    }

    const [result]: any = await conn.query(
      `
      INSERT INTO assinaturas_registros
      (tenant_id, entidade_tipo, entidade_id, id_funcionario_signatario, id_usuario_captura,
       tipo_assinatura, ip_origem, user_agent, latitude, longitude, hash_documento, arquivo_assinatura_url, observacao, metadata_json)
      VALUES
      (?, 'PRESENCA_ITEM', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        current.tenantId,
        idItem,
        body.idFuncionarioSignatario,
        current.id,
        body.tipoAssinatura,
        req.headers.get('x-forwarded-for') || null,
        req.headers.get('user-agent') || null,
        body.latitude || null,
        body.longitude || null,
        body.hashDocumento || null,
        body.arquivoAssinaturaUrl || null,
        body.observacao || null,
        body.metadataJson ? JSON.stringify(body.metadataJson) : null,
      ]
    );

    await conn.query(
      `
      UPDATE presencas_itens
      SET assinado_funcionario = 1, id_assinatura_registro = ?, motivo_sem_assinatura = NULL
      WHERE id_presenca_item = ?
      `,
      [result.insertId, idItem]
    );

    await conn.commit();
    return ok({ idAssinatura: result.insertId });
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
