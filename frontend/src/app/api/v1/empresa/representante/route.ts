import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function PUT(req: Request) {
  const conn = await db.getConnection();
  try {
    const user = await requireApiPermission(PERMISSIONS.REPRESENTANTE_EDIT);
    const body = (await req.json().catch(() => null)) as any;

    const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
    const cpf = typeof body?.cpf === 'string' ? body.cpf.trim() : '';
    const email = body?.email === null || body?.email === undefined ? null : String(body.email).trim();
    const telefone = body?.telefone === null || body?.telefone === undefined ? null : String(body.telefone).trim();
    const idFuncionario = typeof body?.idFuncionario === 'number' ? body.idFuncionario : null;

    if (!nome || !cpf) throw new ApiError(400, 'Nome e CPF são obrigatórios.');

    await conn.beginTransaction();

    if (idFuncionario && telefone) {
      await conn.execute(`UPDATE funcionarios SET telefone = ? WHERE tenant_id = ? AND id_funcionario = ?`, [telefone, user.tenantId, idFuncionario]);
    }

    await conn.execute(
      `UPDATE empresa_representantes
       SET ativo = 0, data_fim = CURDATE()
       WHERE tenant_id = ? AND ativo = 1`,
      [user.tenantId]
    );

    const [result]: any = await conn.execute(
      `INSERT INTO empresa_representantes
       (tenant_id, id_funcionario, nome_representante, cpf, email, ativo, data_inicio)
       VALUES (?, ?, ?, ?, ?, 1, CURDATE())`,
      [user.tenantId, idFuncionario, nome, cpf, email]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'empresa_representantes',
      idRegistro: String(result.insertId),
      acao: 'UPSERT_REPRESENTANTE',
      dadosNovos: { nome, cpf, email, telefone, idFuncionario },
    });

    await conn.commit();
    return created({ id: result.insertId }, 'Representante atualizado com sucesso.');
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
