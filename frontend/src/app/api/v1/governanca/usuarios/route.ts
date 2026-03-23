import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.GOVERNANCA_VIEW);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');

    let sql = `
      SELECT
        u.id_usuario id,
        f.nome_completo nome,
        u.id_funcionario idFuncionario,
        u.login,
        u.email_login emailLogin,
        u.ativo,
        u.bloqueado,
        u.ultimo_acesso ultimoAcesso,
        COALESCE((
          SELECT JSON_ARRAYAGG(p.codigo)
          FROM usuario_perfis up
          JOIN perfis p ON p.id_perfil = up.id_perfil
          WHERE up.id_usuario = u.id_usuario AND up.ativo = 1
        ), JSON_ARRAY()) AS perfis,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            CASE
              WHEN ua.tipo_abrangencia = 'EMPRESA' THEN 'EMPRESA'
              WHEN ua.tipo_abrangencia = 'DIRETORIA' THEN CONCAT('DIRETORIA:', ua.id_setor_diretoria)
              WHEN ua.tipo_abrangencia = 'OBRA' THEN CONCAT('OBRA:', ua.id_obra)
              WHEN ua.tipo_abrangencia = 'UNIDADE' THEN CONCAT('UNIDADE:', ua.id_unidade)
            END
          )
          FROM usuario_abrangencias ua
          WHERE ua.id_usuario = u.id_usuario AND ua.ativo = 1
        ), JSON_ARRAY()) AS abrangencias
      FROM usuarios u
      JOIN funcionarios f ON f.id_funcionario = u.id_funcionario
      WHERE u.tenant_id = ?`;
    const params: any[] = [user.tenantId];

    if (q) {
      sql += ` AND (f.nome_completo LIKE ? OR u.login LIKE ? OR u.email_login LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    sql += ` ORDER BY f.nome_completo`;
    const [rows]: any[] = await db.query(sql, params);

    return ok(
      (Array.isArray(rows) ? rows : []).map((r: any) => ({
        ...r,
        perfis: typeof r.perfis === 'string' ? JSON.parse(r.perfis) : r.perfis,
        abrangencias: typeof r.abrangencias === 'string' ? JSON.parse(r.abrangencias) : r.abrangencias,
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.GOVERNANCA_USUARIOS_CRUD);
    const body = (await req.json().catch(() => null)) as any;

    if (!body?.idFuncionario || !body?.login || !body?.emailLogin) {
      throw new ApiError(400, 'idFuncionario, login e emailLogin são obrigatórios.');
    }

    const [[funcionario]]: any = await db.query(
      `SELECT id_funcionario
       FROM funcionarios
       WHERE id_funcionario = ? AND tenant_id = ?`,
      [body.idFuncionario, user.tenantId]
    );
    if (!funcionario) throw new ApiError(404, 'Funcionário não encontrado.');

    const [[jaExiste]]: any = await db.query(
      `SELECT id_usuario
       FROM usuarios
       WHERE tenant_id = ? AND id_funcionario = ?`,
      [user.tenantId, body.idFuncionario]
    );
    if (jaExiste) throw new ApiError(409, 'Já existe usuário para este funcionário.');

    const senhaTemporaria = body.senhaTemporaria || 'Trocar@123';
    const senhaHash = await bcrypt.hash(String(senhaTemporaria), 10);

    const [result]: any = await db.execute(
      `INSERT INTO usuarios
       (tenant_id, id_funcionario, login, email_login, senha_hash, ativo, bloqueado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.tenantId, body.idFuncionario, body.login, body.emailLogin, senhaHash, body.ativo ?? true, body.bloqueado ?? false]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'usuarios',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { ...body, senhaTemporaria: undefined },
    });

    return created({ id: result.insertId }, 'Usuário criado com sucesso.');
  } catch (error) {
    return handleApiError(error);
  }
}
