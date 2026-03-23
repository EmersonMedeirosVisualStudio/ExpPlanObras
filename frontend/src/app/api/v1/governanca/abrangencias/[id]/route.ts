import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.GOVERNANCA_ABRANGENCIA_CRUD);
    const { id } = await context.params;
    const body = await req.json();

    const [[current]]: any = await db.query(
      `SELECT ua.*
       FROM usuario_abrangencias ua
       JOIN usuarios u ON u.id_usuario = ua.id_usuario
       WHERE u.tenant_id = ? AND ua.id_usuario_abrangencia = ?
       LIMIT 1`,
      [user.tenantId, id]
    );
    if (!current) throw new ApiError(404, 'Abrangência não encontrada.');

    if (body.tipoAbrangencia === 'DIRETORIA' && !body.idSetorDiretoria) throw new ApiError(400, 'idSetorDiretoria é obrigatório para DIRETORIA.');
    if (body.tipoAbrangencia === 'OBRA' && !body.idObra) throw new ApiError(400, 'idObra é obrigatório para OBRA.');
    if (body.tipoAbrangencia === 'UNIDADE' && !body.idUnidade) throw new ApiError(400, 'idUnidade é obrigatório para UNIDADE.');

    await db.execute(
      `UPDATE usuario_abrangencias
       SET tipo_abrangencia = ?, id_obra = ?, id_unidade = ?, id_setor_diretoria = ?, ativo = ?
       WHERE id_usuario_abrangencia = ?`,
      [body.tipoAbrangencia, body.idObra ?? null, body.idUnidade ?? null, body.idSetorDiretoria ?? null, body.ativo, id]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'usuario_abrangencias',
      idRegistro: String(id),
      acao: 'UPDATE',
      dadosNovos: body,
    });

    return ok(null, 'Abrangência atualizada.');
  } catch (error) {
    return handleApiError(error);
  }
}
