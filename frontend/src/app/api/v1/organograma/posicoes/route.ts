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

    if (!body.idSetor || !body.idCargo || !body.tituloExibicao?.trim()) {
      throw new ApiError(422, 'Setor, cargo e título da posição são obrigatórios');
    }

    const idSetor = Number(body.idSetor);
    const idCargo = Number(body.idCargo);
    const tituloExibicao = String(body.tituloExibicao).trim();
    const ordemExibicao = Number(body.ordemExibicao || 0);

    const [[setor]]: any = await db.query(`SELECT id_setor FROM organizacao_setores WHERE id_setor = ? AND tenant_id = ?`, [idSetor, current.tenantId]);
    if (!setor) throw new ApiError(404, 'Setor não encontrado');
    const [[cargo]]: any = await db.query(`SELECT id_cargo FROM organizacao_cargos WHERE id_cargo = ? AND tenant_id = ?`, [idCargo, current.tenantId]);
    if (!cargo) throw new ApiError(404, 'Cargo não encontrado');

    let result: any;
    try {
      [result] = await db.query(
        `
        INSERT INTO organograma_posicoes (tenant_id, id_setor, id_cargo, titulo_exibicao, ordem_exibicao, ativo)
        VALUES (?, ?, ?, ?, ?, 1)
        `,
        [current.tenantId, idSetor, idCargo, tituloExibicao, ordemExibicao]
      );
    } catch {
      [result] = await db.query(
        `
        INSERT INTO organograma_posicoes (tenant_id, id_setor, id_cargo, titulo_exibicao, ativo)
        VALUES (?, ?, ?, ?, 1)
        `,
        [current.tenantId, idSetor, idCargo, tituloExibicao]
      );
    }

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'organograma_posicoes',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { idSetor, idCargo, tituloExibicao, ordemExibicao },
    });

    return created({ id: result.insertId, idSetor, idCargo, tituloExibicao, ordemExibicao, ativo: true });
  } catch (error) {
    return handleApiError(error);
  }
}
