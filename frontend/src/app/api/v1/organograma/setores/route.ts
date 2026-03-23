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

    if (!body.nomeSetor?.trim()) throw new ApiError(422, 'Nome do setor é obrigatório');

    const nomeSetor = String(body.nomeSetor).trim();
    const tipoSetor = body.tipoSetor === null || body.tipoSetor === undefined ? null : String(body.tipoSetor).trim() || null;
    const idSetorPai = body.idSetorPai ? Number(body.idSetorPai) : null;

    const [result]: any = await db.query(
      `
      INSERT INTO organizacao_setores (tenant_id, nome_setor, tipo_setor, id_setor_pai, ativo)
      VALUES (?, ?, ?, ?, 1)
      `,
      [current.tenantId, nomeSetor, tipoSetor ?? 'GERAL', idSetorPai]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'organizacao_setores',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { nomeSetor, tipoSetor, idSetorPai },
    });

    return created({ id: result.insertId, nomeSetor, tipoSetor, idSetorPai, ativo: true });
  } catch (error) {
    return handleApiError(error);
  }
}
