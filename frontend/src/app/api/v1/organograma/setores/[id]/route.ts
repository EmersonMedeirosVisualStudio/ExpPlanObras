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
    const setorId = Number(id);
    if (!Number.isFinite(setorId)) throw new ApiError(400, 'ID inválido');

    const body = await req.json();
    if (!body.nomeSetor?.trim()) throw new ApiError(422, 'Nome do setor é obrigatório');

    const nomeSetor = String(body.nomeSetor).trim();
    const tipoSetor = body.tipoSetor === null || body.tipoSetor === undefined ? null : String(body.tipoSetor).trim() || null;
    const idSetorPai = body.idSetorPai ? Number(body.idSetorPai) : null;
    if (idSetorPai === setorId) throw new ApiError(422, 'Um setor não pode ser pai dele mesmo');

    const ativo = Boolean(body.ativo);

    const [[before]]: any = await db.query(`SELECT * FROM organizacao_setores WHERE id_setor = ? AND tenant_id = ?`, [setorId, current.tenantId]);
    if (!before) throw new ApiError(404, 'Setor não encontrado');

    await db.query(
      `
      UPDATE organizacao_setores
      SET nome_setor = ?, tipo_setor = ?, id_setor_pai = ?, ativo = ?
      WHERE id_setor = ? AND tenant_id = ?
      `,
      [nomeSetor, tipoSetor ?? 'GERAL', idSetorPai, ativo ? 1 : 0, setorId, current.tenantId]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'organizacao_setores',
      idRegistro: String(setorId),
      acao: 'UPDATE',
      dadosAnteriores: before,
      dadosNovos: { nomeSetor, tipoSetor, idSetorPai, ativo },
    });

    return ok({ id: setorId, nomeSetor, tipoSetor, idSetorPai, ativo });
  } catch (error) {
    return handleApiError(error);
  }
}
