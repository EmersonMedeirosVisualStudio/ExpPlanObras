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

    const idFuncionario = typeof body?.idFuncionario === 'number' ? body.idFuncionario : null;
    if (!idFuncionario) throw new ApiError(400, 'idFuncionario é obrigatório.');

    const [[funcionario]]: any = await conn.query(
      `SELECT id_funcionario, nome_completo
       FROM funcionarios
       WHERE id_funcionario = ? AND tenant_id = ? AND ativo = 1`,
      [idFuncionario, user.tenantId]
    );
    if (!funcionario) throw new ApiError(404, 'Funcionário não encontrado.');

    const [[representante]]: any = await conn.query(
      `SELECT id_empresa_representante
       FROM empresa_representantes
       WHERE tenant_id = ? AND ativo = 1
       ORDER BY data_inicio DESC
       LIMIT 1`,
      [user.tenantId]
    );
    if (!representante) throw new ApiError(400, 'Defina primeiro o representante da empresa.');

    const [[usuarioVinculado]]: any = await conn.query(
      `SELECT id_usuario
       FROM usuarios
       WHERE tenant_id = ? AND id_funcionario = ?
       LIMIT 1`,
      [user.tenantId, idFuncionario]
    );

    await conn.beginTransaction();

    await conn.execute(
      `UPDATE empresa_encarregado_sistema
       SET ativo = 0, data_fim = CURDATE()
       WHERE tenant_id = ? AND ativo = 1`,
      [user.tenantId]
    );

    const [result]: any = await conn.execute(
      `INSERT INTO empresa_encarregado_sistema
       (tenant_id, id_funcionario, id_usuario, id_empresa_representante, ativo, data_inicio, solicitou_saida)
       VALUES (?, ?, ?, ?, 1, CURDATE(), 0)`,
      [user.tenantId, idFuncionario, usuarioVinculado?.id_usuario ?? null, representante.id_empresa_representante]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'empresa_encarregado_sistema',
      idRegistro: String(result.insertId),
      acao: 'DEFINIR_ENCARREGADO',
      dadosNovos: { idFuncionario, idUsuario: usuarioVinculado?.id_usuario ?? null },
    });

    await conn.commit();
    return created({ id: result.insertId }, 'Encarregado do sistema definido com sucesso.');
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
