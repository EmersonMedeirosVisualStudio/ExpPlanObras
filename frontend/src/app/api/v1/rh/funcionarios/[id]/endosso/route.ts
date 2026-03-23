import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_ENDOSSAR);
    const { id } = await context.params;
    const idFuncionario = Number(id);
    if (!Number.isFinite(idFuncionario)) throw new ApiError(400, 'ID inválido.');

    const body = await req.json();
    const acao = String(body?.acao || '').toUpperCase();
    const motivo = body?.motivo ? String(body.motivo).trim() : null;
    if (!['APROVAR', 'REJEITAR'].includes(acao)) throw new ApiError(422, 'Ação inválida');
    if (acao === 'REJEITAR' && !motivo) throw new ApiError(422, 'Informe o motivo da rejeição');

    const [[before]]: any = await conn.query(
      `SELECT id_funcionario, status_cadastro_rh
       FROM funcionarios
       WHERE tenant_id = ? AND id_funcionario = ?
       LIMIT 1`,
      [user.tenantId, idFuncionario]
    );
    if (!before) throw new ApiError(404, 'Funcionário não encontrado.');

    await conn.beginTransaction();
    if (acao === 'APROVAR') {
      await conn.execute(
        `
        UPDATE funcionarios
        SET
          status_cadastro_rh = 'ENDOSSADO',
          id_usuario_endosso_rh = ?,
          data_endosso_rh = NOW(),
          motivo_rejeicao_endosso = NULL
        WHERE tenant_id = ? AND id_funcionario = ?
        `,
        [user.id, user.tenantId, idFuncionario]
      );
    } else {
      await conn.execute(
        `
        UPDATE funcionarios
        SET
          status_cadastro_rh = 'REJEITADO',
          id_usuario_endosso_rh = ?,
          data_endosso_rh = NOW(),
          motivo_rejeicao_endosso = ?
        WHERE tenant_id = ? AND id_funcionario = ?
        `,
        [user.id, motivo, user.tenantId, idFuncionario]
      );
    }

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'funcionarios',
      idRegistro: String(idFuncionario),
      acao: 'ENDOSSO_RH',
      dadosAnteriores: before,
      dadosNovos: { acao, motivo },
    });

    await conn.commit();
    return ok({ id: idFuncionario, acao: acao === 'APROVAR' ? 'APROVAR' : 'REJEITAR' });
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => ({}));
  const aprovado = Boolean((body as any)?.aprovado);
  const motivoRejeicao = (body as any)?.motivoRejeicao ? String((body as any).motivoRejeicao).trim() : undefined;
  const mapped = aprovado ? { acao: 'APROVAR' } : { acao: 'REJEITAR', motivo: motivoRejeicao };
  return POST(new Request(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(mapped) }), context);
}
