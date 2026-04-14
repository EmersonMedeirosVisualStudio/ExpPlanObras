import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const conn = await db.getConnection();
  try {
    const user = await requireApiPermission(PERMISSIONS.REPRESENTANTE_EDIT);
    const body = (await req.json().catch(() => null)) as any;

    const nomeCompleto = String(body?.nomeCompleto || '').trim();
    const email = String(body?.email || '').trim();
    const cargo = String(body?.cargo || '').trim();

    if (nomeCompleto.length < 2) throw new ApiError(422, 'Nome é obrigatório.');

    await conn.beginTransaction();

    let result: any;
    try {
      [result] = await conn.execute(
        `INSERT INTO funcionarios (tenant_id, nome_completo, email, cargo, ativo) VALUES (?, ?, ?, ?, 1)`,
        [user.tenantId, nomeCompleto, email || null, cargo || null]
      );
    } catch (e) {
      throw new ApiError(422, 'Não foi possível cadastrar funcionário com dados mínimos. Use RH > Funcionários > Novo funcionário.');
    }

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'funcionarios',
      idRegistro: String(result.insertId),
      acao: 'CREATE_MINIMO',
      dadosNovos: { nomeCompleto, email: email || null, cargo: cargo || null },
    });

    const [[row]]: any = await conn.query(
      `SELECT id_funcionario id, nome_completo nome, cargo FROM funcionarios WHERE id_funcionario = ? AND tenant_id = ?`,
      [result.insertId, user.tenantId]
    );

    await conn.commit();
    return created(row, 'Funcionário cadastrado com sucesso.');
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}

