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
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_ASSINAR);
    const idFicha = Number(params.id);
    const body = await req.json();

    const tipoSignatario = String(body?.tipoSignatario || '').toUpperCase();
    const tipoAssinatura = String(body?.tipoAssinatura || '').toUpperCase();
    const idFuncionarioSignatario = body?.idFuncionarioSignatario ? Number(body.idFuncionarioSignatario) : null;
    const idTerceirizadoTrabalhador = body?.idTerceirizadoTrabalhador ? Number(body.idTerceirizadoTrabalhador) : null;

    if (!['FUNCIONARIO', 'TERCEIRIZADO'].includes(tipoSignatario)) return fail(422, 'tipoSignatario inválido');
    if (!tipoAssinatura) return fail(422, 'tipoAssinatura é obrigatório');

    await conn.beginTransaction();

    const [[ficha]]: any = await conn.query(`SELECT * FROM sst_epi_fichas WHERE tenant_id = ? AND id_ficha_epi = ? LIMIT 1`, [current.tenantId, idFicha]);
    if (!ficha) return fail(404, 'Ficha não encontrada');

    const statusFicha = String(ficha.status_ficha || '');
    if (!['EM_PREENCHIMENTO', 'ATIVA'].includes(statusFicha)) return fail(422, 'Ficha não aceita assinatura neste status');
    if (Number(ficha.assinatura_destinatario_obrigatoria) !== 1) return fail(422, 'Ficha não requer assinatura do destinatário');
    if (ficha.id_assinatura_destinatario) return fail(422, 'Ficha já assinada');

    if (tipoSignatario === 'FUNCIONARIO') {
      if (!Number.isFinite(idFuncionarioSignatario || NaN)) return fail(422, 'idFuncionarioSignatario é obrigatório');
      if (String(ficha.tipo_destinatario || '').toUpperCase() !== 'FUNCIONARIO' || Number(ficha.id_funcionario) !== Number(idFuncionarioSignatario)) {
        return fail(422, 'Assinatura deve ser do próprio destinatário');
      }
    } else {
      if (!Number.isFinite(idTerceirizadoTrabalhador || NaN)) return fail(422, 'idTerceirizadoTrabalhador é obrigatório');
      if (String(ficha.tipo_destinatario || '').toUpperCase() !== 'TERCEIRIZADO' || Number(ficha.id_terceirizado_trabalhador) !== Number(idTerceirizadoTrabalhador)) {
        return fail(422, 'Assinatura deve ser do próprio destinatário');
      }
    }

    if (tipoAssinatura === 'PIN') {
      if (!body?.pin) return fail(422, 'PIN obrigatório');
      if (tipoSignatario === 'FUNCIONARIO') {
        const [pinRows]: any = await conn.query(
          `
          SELECT pin_hash
          FROM funcionarios_assinatura_habilitacoes
          WHERE tenant_id = ? AND id_funcionario = ? AND tipo_assinatura = 'PIN' AND ativo = 1
          `,
          [current.tenantId, idFuncionarioSignatario]
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
          [current.tenantId, idTerceirizadoTrabalhador]
        );
        if (!pinRows.length) return fail(422, 'Terceirizado sem PIN habilitado');
        const okPin = await bcrypt.compare(String(body.pin), pinRows[0].pin_hash);
        if (!okPin) return fail(422, 'PIN inválido');
      }
    }

    const [result]: any = await conn.query(
      `
      INSERT INTO assinaturas_registros
        (tenant_id, entidade_tipo, entidade_id, tipo_signatario, id_funcionario_signatario, id_terceirizado_trabalhador, id_usuario_captura,
         tipo_assinatura, ip_origem, user_agent, latitude, longitude, hash_documento, arquivo_assinatura_url, observacao, metadata_json)
      VALUES
        (?, 'EPI_FICHA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        current.tenantId,
        idFicha,
        tipoSignatario,
        tipoSignatario === 'FUNCIONARIO' ? idFuncionarioSignatario : null,
        tipoSignatario === 'TERCEIRIZADO' ? idTerceirizadoTrabalhador : null,
        current.id,
        tipoAssinatura,
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

    await conn.query(`UPDATE sst_epi_fichas SET id_assinatura_destinatario = ?, status_ficha = 'ATIVA' WHERE tenant_id = ? AND id_ficha_epi = ?`, [
      result.insertId,
      current.tenantId,
      idFicha,
    ]);

    await conn.commit();
    return ok({ idAssinatura: result.insertId });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

