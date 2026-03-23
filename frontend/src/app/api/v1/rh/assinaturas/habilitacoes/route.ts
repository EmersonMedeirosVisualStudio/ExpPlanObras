import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_ASSINATURAS_EXECUTAR);
    const body = await req.json();

    const idFuncionario = Number(body?.idFuncionario);
    const tipoAssinatura = String(body?.tipoAssinatura || '').toUpperCase();
    const pin = body?.pin ? String(body.pin) : null;

    if (!Number.isFinite(idFuncionario)) throw new ApiError(422, 'Funcionário obrigatório');
    if (!tipoAssinatura) throw new ApiError(422, 'Tipo de assinatura obrigatório');
    if (tipoAssinatura === 'PIN' && (!pin || pin.length < 4)) throw new ApiError(422, 'PIN inválido');

    const [[funcionario]]: any = await db.query(`SELECT id_funcionario FROM funcionarios WHERE tenant_id = ? AND id_funcionario = ? LIMIT 1`, [
      current.tenantId,
      idFuncionario,
    ]);
    if (!funcionario) throw new ApiError(404, 'Funcionário não encontrado');

    const pinHash = tipoAssinatura === 'PIN' ? await bcrypt.hash(pin as string, 10) : null;

    const [result]: any = await db.query(
      `
      INSERT INTO funcionarios_assinatura_habilitacoes (tenant_id, id_funcionario, tipo_assinatura, pin_hash, ativo)
      VALUES (?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), ativo = 1, updated_at = CURRENT_TIMESTAMP
      `,
      [current.tenantId, idFuncionario, tipoAssinatura, pinHash]
    );

    const id = result.insertId && result.insertId !== 0 ? Number(result.insertId) : 0;

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'funcionarios_assinatura_habilitacoes',
      idRegistro: id ? String(id) : `${current.tenantId}:${idFuncionario}:${tipoAssinatura}`,
      acao: 'UPSERT',
      dadosNovos: { idFuncionario, tipoAssinatura, ativo: true },
    });

    return created({ id });
  } catch (error) {
    return handleApiError(error);
  }
}

