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
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_ASSINAR);
    const body = await req.json();
    const { id } = await params;
    const idFicha = Number(id);

    const [rows]: any = await conn.query(`SELECT * FROM sst_epi_fichas WHERE id_ficha_epi = ? AND tenant_id = ?`, [idFicha, current.tenantId]);
    if (!rows.length) return fail(404, 'Ficha não encontrada');

    const ficha = rows[0];
    if (!ficha.assinatura_destinatario_obrigatoria) {
      return fail(422, 'Esta ficha não requer assinatura');
    }

    if (body.tipoAssinatura === 'PIN') {
      if (!body.pin) return fail(422, 'PIN obrigatório');

      if (String(ficha.tipo_destinatario || '').toUpperCase() === 'FUNCIONARIO') {
        const [pins]: any = await conn.query(
          `
          SELECT pin_hash
          FROM funcionarios_assinatura_habilitacoes
          WHERE tenant_id = ? AND id_funcionario = ? AND tipo_assinatura = 'PIN' AND ativo = 1
          `,
          [current.tenantId, ficha.id_funcionario]
        );
        if (!pins.length || !(await bcrypt.compare(String(body.pin), pins[0].pin_hash))) {
          return fail(422, 'PIN inválido');
        }
      } else {
        const [pins]: any = await conn.query(
          `
          SELECT pin_hash
          FROM terceirizados_assinatura_habilitacoes
          WHERE tenant_id = ? AND id_terceirizado_trabalhador = ? AND tipo_assinatura = 'PIN' AND ativo = 1
          `,
          [current.tenantId, ficha.id_terceirizado_trabalhador]
        );
        if (!pins.length || !(await bcrypt.compare(String(body.pin), pins[0].pin_hash))) {
          return fail(422, 'PIN inválido');
        }
      }
    }

    await conn.beginTransaction();

    const [result]: any = await conn.query(
      `
      INSERT INTO assinaturas_registros
      (tenant_id, entidade_tipo, entidade_id, tipo_signatario, id_funcionario_signatario, id_terceirizado_trabalhador,
       id_usuario_captura, tipo_assinatura, ip_origem, user_agent, latitude, longitude, arquivo_assinatura_url, observacao)
      VALUES (?, 'FICHA_EPI', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        current.tenantId,
        idFicha,
        ficha.tipo_destinatario,
        String(ficha.tipo_destinatario || '').toUpperCase() === 'FUNCIONARIO' ? ficha.id_funcionario : null,
        String(ficha.tipo_destinatario || '').toUpperCase() === 'TERCEIRIZADO' ? ficha.id_terceirizado_trabalhador : null,
        current.id,
        body.tipoAssinatura,
        req.headers.get('x-forwarded-for') || null,
        req.headers.get('user-agent') || null,
        body.latitude || null,
        body.longitude || null,
        body.arquivoAssinaturaUrl || null,
        body.observacao || null,
      ]
    );

    await conn.query(`UPDATE sst_epi_fichas SET id_assinatura_destinatario = ? WHERE id_ficha_epi = ? AND tenant_id = ?`, [
      result.insertId,
      idFicha,
      current.tenantId,
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
