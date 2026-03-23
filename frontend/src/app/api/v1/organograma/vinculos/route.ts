import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ORGANOGRAMA_CRUD);
    const body = await req.json();

    if (!body.idPosicaoSuperior || !body.idPosicaoSubordinada) throw new ApiError(422, 'Informe as posições do vínculo');
    if (body.idPosicaoSuperior === body.idPosicaoSubordinada) throw new ApiError(422, 'Uma posição não pode ser subordinada a ela mesma');

    const idPosicaoSuperior = Number(body.idPosicaoSuperior);
    const idPosicaoSubordinada = Number(body.idPosicaoSubordinada);

    const [posRows]: any = await db.query(
      `SELECT id_posicao FROM organograma_posicoes WHERE tenant_id = ? AND id_posicao IN (?, ?)`,
      [current.tenantId, idPosicaoSuperior, idPosicaoSubordinada]
    );
    if (!Array.isArray(posRows) || posRows.length !== 2) throw new ApiError(403, 'Acesso negado');

    const [[exists]]: any = await db.query(
      `SELECT id_vinculo FROM organograma_vinculos WHERE id_posicao_superior = ? AND id_posicao_subordinada = ? AND ativo = 1 LIMIT 1`,
      [idPosicaoSuperior, idPosicaoSubordinada]
    );
    if (exists) throw new ApiError(409, 'Vínculo já existe');

    const [result]: any = await db.query(
      `INSERT INTO organograma_vinculos (id_posicao_superior, id_posicao_subordinada, ativo) VALUES (?, ?, 1)`,
      [idPosicaoSuperior, idPosicaoSubordinada]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'organograma_vinculos',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { idPosicaoSuperior, idPosicaoSubordinada },
    });

    return created({ id: result.insertId, idPosicaoSuperior, idPosicaoSubordinada });
  } catch (error) {
    return handleApiError(error);
  }
}
