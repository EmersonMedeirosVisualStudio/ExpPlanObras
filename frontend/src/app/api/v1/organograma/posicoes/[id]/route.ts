import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ORGANOGRAMA_CRUD);
    const { id } = await context.params;
    const posicaoId = Number(id);
    if (!Number.isFinite(posicaoId)) throw new ApiError(400, 'ID inválido');

    const body = await req.json();
    if (!body.idSetor || !body.idCargo || !body.tituloExibicao?.trim()) {
      throw new ApiError(422, 'Setor, cargo e título da posição são obrigatórios');
    }

    const idSetor = Number(body.idSetor);
    const idCargo = Number(body.idCargo);
    const tituloExibicao = String(body.tituloExibicao).trim();
    const ordemExibicao = Number(body.ordemExibicao || 0);
    const ativo = Boolean(body.ativo);

    const [[before]]: any = await db.query(`SELECT * FROM organograma_posicoes WHERE id_posicao = ? AND tenant_id = ?`, [posicaoId, current.tenantId]);
    if (!before) throw new ApiError(404, 'Posição não encontrada');

    try {
      await db.query(
        `
        UPDATE organograma_posicoes
        SET id_setor = ?, id_cargo = ?, titulo_exibicao = ?, ordem_exibicao = ?, ativo = ?
        WHERE id_posicao = ? AND tenant_id = ?
        `,
        [idSetor, idCargo, tituloExibicao, ordemExibicao, ativo ? 1 : 0, posicaoId, current.tenantId]
      );
    } catch {
      await db.query(
        `
        UPDATE organograma_posicoes
        SET id_setor = ?, id_cargo = ?, titulo_exibicao = ?, ativo = ?
        WHERE id_posicao = ? AND tenant_id = ?
        `,
        [idSetor, idCargo, tituloExibicao, ativo ? 1 : 0, posicaoId, current.tenantId]
      );
    }

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'organograma_posicoes',
      idRegistro: String(posicaoId),
      acao: 'UPDATE',
      dadosAnteriores: before,
      dadosNovos: { idSetor, idCargo, tituloExibicao, ordemExibicao, ativo },
    });

    return ok({ id: posicaoId, idSetor, idCargo, tituloExibicao, ordemExibicao, ativo });
  } catch (error) {
    return handleApiError(error);
  }
}
