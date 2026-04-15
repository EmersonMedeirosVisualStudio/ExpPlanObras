import { db } from '@/lib/db';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const { id } = await context.params;
    const idFuncionario = Number(id);
    if (!Number.isFinite(idFuncionario)) throw new ApiError(400, 'ID inválido.');

    const [rows]: any = await db.query(
      `
      SELECT
        a.id_auditoria id,
        a.created_at createdAt,
        a.entidade entidade,
        a.id_registro idRegistro,
        a.acao acao,
        a.id_usuario idUsuario,
        a.dados_anteriores dadosAnteriores,
        a.dados_novos dadosNovos
      FROM auditoria_eventos a
      WHERE a.tenant_id = ?
        AND (
          (a.entidade = 'funcionarios' AND a.id_registro = ?)
          OR
          (a.entidade = 'usuarios' AND JSON_EXTRACT(a.dados_novos, '$.idFuncionario') = ?)
          OR
          (a.entidade = 'usuarios' AND JSON_EXTRACT(a.dados_anteriores, '$.idFuncionario') = ?)
        )
      ORDER BY a.created_at DESC, a.id_auditoria DESC
      LIMIT 200
      `,
      [user.tenantId, String(idFuncionario), idFuncionario, idFuncionario]
    );

    const normalized = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: Number(r.id),
      createdAt: String(r.createdAt),
      entidade: String(r.entidade),
      idRegistro: String(r.idRegistro),
      acao: String(r.acao),
      idUsuario: r.idUsuario === null || r.idUsuario === undefined ? null : Number(r.idUsuario),
      dadosAnteriores: r.dadosAnteriores,
      dadosNovos: r.dadosNovos,
    }));

    return ok(normalized);
  } catch (error) {
    return handleApiError(error);
  }
}

