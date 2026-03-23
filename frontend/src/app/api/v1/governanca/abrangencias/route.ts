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
    const idUsuario = searchParams.get('idUsuario');

    let sql = `SELECT ua.* FROM usuario_abrangencias ua JOIN usuarios u ON u.id_usuario = ua.id_usuario WHERE u.tenant_id = ?`;
    const params: any[] = [user.tenantId];

    if (idUsuario) {
      sql += ` AND ua.id_usuario = ?`;
      params.push(idUsuario);
    }

    const [rows]: any = await db.query(sql, params);
    return ok(rows);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  const conn = await db.getConnection();
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.GOVERNANCA_ABRANGENCIA_CRUD);
    const body = await req.json();

    if (!body.idUsuario || !body.tipoAbrangencia) {
      throw new ApiError(400, 'idUsuario e tipoAbrangencia são obrigatórios.');
    }

    if (body.tipoAbrangencia === 'DIRETORIA' && !body.idSetorDiretoria) {
      throw new ApiError(400, 'idSetorDiretoria é obrigatório para abrangência DIRETORIA.');
    }
    if (body.tipoAbrangencia === 'OBRA' && !body.idObra) {
      throw new ApiError(400, 'idObra é obrigatório para abrangência OBRA.');
    }
    if (body.tipoAbrangencia === 'UNIDADE' && !body.idUnidade) {
      throw new ApiError(400, 'idUnidade é obrigatório para abrangência UNIDADE.');
    }

    const [[usuario]]: any = await conn.query(
      `SELECT id_usuario
       FROM usuarios
       WHERE tenant_id = ? AND id_usuario = ?
       LIMIT 1`,
      [user.tenantId, body.idUsuario]
    );
    if (!usuario) throw new ApiError(404, 'Usuário não encontrado.');

    await conn.beginTransaction();
    const [result]: any = await conn.execute(
      `INSERT INTO usuario_abrangencias (id_usuario, tipo_abrangencia, id_obra, id_unidade, id_setor_diretoria, ativo)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [body.idUsuario, body.tipoAbrangencia, body.idObra ?? null, body.idUnidade ?? null, body.idSetorDiretoria ?? null]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'usuario_abrangencias',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: body,
    });

    await conn.commit();
    return created({ id: result.insertId }, 'Abrangência criada com sucesso.');
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
