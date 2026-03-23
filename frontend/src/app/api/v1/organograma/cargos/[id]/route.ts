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
    const cargoId = Number(id);
    if (!Number.isFinite(cargoId)) throw new ApiError(400, 'ID inválido');

    const body = await req.json();
    if (!body.nomeCargo?.trim()) throw new ApiError(422, 'Nome do cargo é obrigatório');

    const nomeCargo = String(body.nomeCargo).trim();
    const ativo = Boolean(body.ativo);

    const [[before]]: any = await db.query(`SELECT * FROM organizacao_cargos WHERE id_cargo = ? AND tenant_id = ?`, [cargoId, current.tenantId]);
    if (!before) throw new ApiError(404, 'Cargo não encontrado');

    await db.query(
      `UPDATE organizacao_cargos SET nome_cargo = ?, ativo = ? WHERE id_cargo = ? AND tenant_id = ?`,
      [nomeCargo, ativo ? 1 : 0, cargoId, current.tenantId]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'organizacao_cargos',
      idRegistro: String(cargoId),
      acao: 'UPDATE',
      dadosAnteriores: before,
      dadosNovos: { nomeCargo, ativo },
    });

    return ok({ id: cargoId, nomeCargo, ativo });
  } catch (error) {
    return handleApiError(error);
  }
}
