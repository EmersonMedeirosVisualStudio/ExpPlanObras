import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.GOVERNANCA_VIEW);

    const [rows]: any[] = await db.query(
      `SELECT
        p.id_perfil id,
        p.tenant_id tenantId,
        p.tipo_perfil tipo,
        p.codigo,
        p.nome,
        p.ativo,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'modulo', pp.modulo,
              'janela', pp.janela,
              'acao', pp.acao
            )
          )
          FROM perfil_permissoes pp
          WHERE pp.id_perfil = p.id_perfil AND pp.permitido = 1
        ), JSON_ARRAY()) AS permissoes
       FROM perfis p
       WHERE p.tenant_id IS NULL OR p.tenant_id = ?
       ORDER BY p.tipo_perfil, p.nome`,
      [user.tenantId]
    );

    return ok(
      (Array.isArray(rows) ? rows : []).map((r) => ({
        ...r,
        permissoes: typeof r.permissoes === 'string' ? JSON.parse(r.permissoes) : r.permissoes,
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  const conn = await db.getConnection();
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.GOVERNANCA_PERFIS_CRUD);
    const body = await req.json();

    if (!body.nome || !body.codigo) throw new ApiError(400, 'Nome e código são obrigatórios.');

    await conn.beginTransaction();
    const [result]: any = await conn.execute(
      `INSERT INTO perfis (tenant_id, tipo_perfil, codigo, nome, ativo)
       VALUES (?, 'EMPRESA', ?, ?, 1)`,
      [user.tenantId, body.codigo, body.nome]
    );

    if (Array.isArray(body.permissoes)) {
      for (const permissao of body.permissoes) {
        if (typeof permissao === 'string') {
          const janela = permissao;
          const modulo = janela.split('.')[0] || 'modulo';
          await conn.execute(
            `INSERT INTO perfil_permissoes (id_perfil, modulo, janela, acao, permitido)
             VALUES (?, ?, ?, ?, 1)`,
            [result.insertId, modulo, janela, 'ALLOW']
          );
          continue;
        }
        await conn.execute(
          `INSERT INTO perfil_permissoes (id_perfil, modulo, janela, acao, permitido)
           VALUES (?, ?, ?, ?, 1)`,
          [result.insertId, permissao.modulo, permissao.janela, permissao.acao]
        );
      }
    }

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'perfis',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: body,
    });

    await conn.commit();
    return created({ id: result.insertId }, 'Perfil criado com sucesso.');
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
