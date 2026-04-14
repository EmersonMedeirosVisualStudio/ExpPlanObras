import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTable(conn: any) {
  await conn.execute(
    `
    CREATE TABLE IF NOT EXISTS empresa_titulares (
      id_empresa_titular INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      role_code VARCHAR(50) NOT NULL,
      id_funcionario INT NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      data_inicio DATE NOT NULL,
      data_fim DATE NULL,
      KEY idx_empresa_titulares_tenant_role (tenant_id, role_code),
      KEY idx_empresa_titulares_funcionario (id_funcionario)
    )
    `
  );
}

export async function GET() {
  try {
    const user = await requireApiPermission(PERMISSIONS.REPRESENTANTE_VIEW);
    const conn = await db.getConnection();
    try {
      await ensureTable(conn);
      const [rows]: any = await conn.query(
        `
        SELECT et.role_code roleCode,
               et.id_funcionario idFuncionario,
               f.nome_completo nome
        FROM empresa_titulares et
        JOIN funcionarios f ON f.id_funcionario = et.id_funcionario
        WHERE et.tenant_id = ? AND et.ativo = 1
        `,
        [user.tenantId]
      );
      return ok(Array.isArray(rows) ? rows : []);
    } finally {
      conn.release();
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request) {
  const conn = await db.getConnection();
  try {
    const user = await requireApiPermission(PERMISSIONS.REPRESENTANTE_EDIT);
    const body = (await req.json().catch(() => null)) as any;
    const roleCode = String(body?.roleCode || '').trim().toUpperCase();
    const idFuncionario = typeof body?.idFuncionario === 'number' ? Number(body.idFuncionario) : null;
    if (!['CEO', 'GERENTE_RH'].includes(roleCode)) throw new ApiError(422, 'roleCode inválido.');
    if (!idFuncionario) throw new ApiError(422, 'idFuncionario é obrigatório.');

    const [[funcionario]]: any = await conn.query(
      `SELECT id_funcionario, nome_completo FROM funcionarios WHERE id_funcionario = ? AND tenant_id = ? AND ativo = 1`,
      [idFuncionario, user.tenantId]
    );
    if (!funcionario) throw new ApiError(404, 'Funcionário não encontrado.');

    await conn.beginTransaction();
    await ensureTable(conn);

    await conn.execute(
      `UPDATE empresa_titulares SET ativo = 0, data_fim = CURDATE() WHERE tenant_id = ? AND role_code = ? AND ativo = 1`,
      [user.tenantId, roleCode]
    );
    const [result]: any = await conn.execute(
      `INSERT INTO empresa_titulares (tenant_id, role_code, id_funcionario, ativo, data_inicio) VALUES (?, ?, ?, 1, CURDATE())`,
      [user.tenantId, roleCode, idFuncionario]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'empresa_titulares',
      idRegistro: String(result.insertId),
      acao: 'DEFINIR_TITULAR',
      dadosNovos: { roleCode, idFuncionario },
    });

    await conn.commit();
    return created({ id: result.insertId }, 'Titular definido com sucesso.');
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}

