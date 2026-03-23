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

    if (!body.nomeCargo?.trim()) throw new ApiError(422, 'Nome do cargo é obrigatório');

    const nomeCargo = String(body.nomeCargo).trim();
    const [result]: any = await db.query(
      `INSERT INTO organizacao_cargos (tenant_id, nome_cargo, ativo) VALUES (?, ?, 1)`,
      [current.tenantId, nomeCargo]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'organizacao_cargos',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { nomeCargo },
    });

    return created({ id: result.insertId, nomeCargo, ativo: true });
  } catch (error) {
    return handleApiError(error);
  }
}
